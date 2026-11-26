/**
 * T67 - optional Telegram notifications (education app: messages are informational, never advice).
 * Opt-in via TELEGRAM_BOT_TOKEN. The token is only used to build Bot API URLs and is never logged or put in errors.
 * Network and clock are injectable so tests never touch the network.
 */
const TELEGRAM_MAX_LENGTH = 4000; // Bot API hard limit is 4096; keep headroom.
const MIN_GAP_MS = 1000; // <= 1 message/second per chat
const MAX_PER_WINDOW = 20; // <= 20 messages/minute per chat
const WINDOW_MS = 60_000;
const MAX_RETRIES = 2;
const MAX_RETRY_AFTER_S = 60;

const CHAT_ID_RE = /^\d{1,15}$/; // private chats only (positive ids); groups/channels are refused

export function isValidChatId(v: unknown): v is string {
  return typeof v === 'string' && CHAT_ID_RE.test(v);
}

export function getBotToken(env: Record<string, string | undefined> = process.env): string | null {
  const t = env.TELEGRAM_BOT_TOKEN?.trim();
  return t ? t : null;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Truncates by characters so the final text stays below the limit. */
export function clampText(s: string, max = TELEGRAM_MAX_LENGTH): string {
  return s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * Escapes first, then truncates so the *escaped* text (what Telegram counts) stays within `max`.
 * Clamping before escaping let "&" (5 chars once escaped) blow past the 4096 hard limit; cutting at
 * character boundaries of the escaped form also never splits an entity such as "&amp;".
 */
export function escapeAndClamp(s: string, max = TELEGRAM_MAX_LENGTH): string {
  const full = escapeHtml(s);
  if (full.length <= max) return full;
  let out = '';
  for (const ch of s) {
    const e = escapeHtml(ch);
    if (out.length + e.length > max - 1) break;
    out += e;
  }
  return `${out}…`;
}

/** Per-chat limiter: reserves send slots 1s apart and refuses beyond 20 per rolling minute. Pure (clock passed in). */
export class ChatRateLimiter {
  private readonly slots = new Map<string, number[]>();
  /** Returns the ms to wait before sending, or null when the per-minute budget is exhausted. */
  reserve(chatId: string, now: number): number | null {
    const recent = (this.slots.get(chatId) ?? []).filter((t) => t > now - WINDOW_MS);
    if (recent.length >= MAX_PER_WINDOW) {
      this.slots.set(chatId, recent);
      return null;
    }
    const last = recent.length ? recent[recent.length - 1] : -Infinity;
    const slot = Math.max(now, last + MIN_GAP_MS);
    recent.push(slot);
    this.slots.set(chatId, recent);
    return slot - now;
  }
}

export type SendResult = { ok: true } | { ok: false; reason: 'rate_limited' | 'invalid_chat' | 'telegram_error' | 'network' };

export interface TelegramClientOptions {
  token: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  limiter?: ChatRateLimiter;
}

interface ApiReply {
  ok: boolean;
  result?: unknown;
  error_code?: number;
  parameters?: { retry_after?: number };
}

export interface TelegramUpdate {
  update_id: number;
  message?: { text?: string; chat?: { id?: number; type?: string } };
}

/** Minimal surface used by the poller, job and routes (lets tests pass a fake). */
export interface Messenger {
  sendMessage(chatId: string, text: string): Promise<SendResult>;
}

export class TelegramClient implements Messenger {
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly limiter: ChatRateLimiter;
  private botName: string | null | undefined;

  constructor(o: TelegramClientOptions) {
    this.token = o.token;
    this.fetchImpl = o.fetchImpl ?? fetch;
    this.sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = o.now ?? Date.now;
    this.limiter = o.limiter ?? new ChatRateLimiter();
  }

  private async call(method: string, body: unknown, timeoutMs = 15_000): Promise<{ status: number; data: ApiReply | null }> {
    const res = await this.fetchImpl(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    let data: ApiReply | null = null;
    try {
      data = (await res.json()) as ApiReply;
    } catch {
      data = null;
    }
    return { status: res.status, data };
  }

  /** `text` is plain text; it is length-clamped and HTML-escaped here. Retries on 429 honouring retry_after. */
  async sendMessage(chatId: string, text: string): Promise<SendResult> {
    if (!isValidChatId(chatId)) return { ok: false, reason: 'invalid_chat' };
    const wait = this.limiter.reserve(chatId, this.now());
    if (wait === null) return { ok: false, reason: 'rate_limited' };
    if (wait > 0) await this.sleep(wait);
    const payload = { chat_id: chatId, text: escapeAndClamp(text), parse_mode: 'HTML', disable_web_page_preview: true };
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      let r: { status: number; data: ApiReply | null };
      try {
        r = await this.call('sendMessage', payload);
      } catch {
        return { ok: false, reason: 'network' };
      }
      if (r.data?.ok) return { ok: true };
      if (r.status === 429 && attempt < MAX_RETRIES) {
        const s = Math.min(MAX_RETRY_AFTER_S, Math.max(1, Number(r.data?.parameters?.retry_after) || 1));
        await this.sleep(s * 1000);
        continue;
      }
      return { ok: false, reason: r.status === 429 ? 'rate_limited' : 'telegram_error' };
    }
    return { ok: false, reason: 'telegram_error' };
  }

  async getUpdates(offset: number, timeoutS = 25): Promise<TelegramUpdate[]> {
    const r = await this.call('getUpdates', { offset, timeout: timeoutS, allowed_updates: ['message'] }, (timeoutS + 10) * 1000);
    if (!r.data?.ok || !Array.isArray(r.data.result)) throw new Error('getUpdates failed');
    return r.data.result as TelegramUpdate[];
  }

  /** Bot username for the t.me link; null when unavailable. Cached once resolved. */
  async botUsername(): Promise<string | null> {
    if (this.botName !== undefined) return this.botName;
    try {
      const r = await this.call('getMe', {});
      const u = (r.data?.result as { username?: unknown } | undefined)?.username;
      this.botName = r.data?.ok && typeof u === 'string' ? u : null;
    } catch {
      return null; // do not cache transient failures
    }
    return this.botName;
  }
}
