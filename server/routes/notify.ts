/**
 * T67 - /api/notify/*: optional Telegram notifications. Off unless TELEGRAM_BOT_TOKEN is set.
 * Every mutating route needs the secret `linkCode` of an already linked chat (linked by sending /start <code> to the bot),
 * so the API cannot be used to message arbitrary chats.
 */
import type { Express, Request, Response } from 'express';
import { sanitizeZone, type WatchZone } from '../../src/shared/watchlist/watchlist.ts';
import { createRateLimiter } from '../middleware/rateLimit.ts';
import type { Channels } from '../services/notify/channels.ts';
import { NotifyStore, PENDING_TTL_MS } from '../services/notify/store.ts';
import { registerChannelRoutes } from './notifyChannels.ts';
import { clampText, getBotToken, isValidChatId, TelegramClient, type Messenger, type TelegramUpdate } from '../services/notify/telegram.ts';

const MAX_SYNC_ITEMS = 60;
const MAX_ALERT_TEXT = 500;
const SYMBOL_RE = /^[A-Za-z0-9._=\-]{1,20}$/;

export interface NotifyService {
  store: NotifyStore;
  messenger: Messenger;
  botUsername: () => Promise<string | null>;
  /** Long-poll source for the link worker (absent in test fakes). */
  getUpdates?: (offset: number, timeoutS: number) => Promise<TelegramUpdate[]>;
}

export interface NotifyRouteOptions {
  env?: Record<string, string | undefined>;
  /** Tests inject a fake service; production builds one from the token. */
  service?: NotifyService | null;
  now?: () => number;
  /** T101: Web Push / email channels (tests inject; null = unconfigured; undefined = build from env). */
  channels?: Channels | null;
}

function createNotifyService(env: Record<string, string | undefined> = process.env): NotifyService | null {
  const token = getBotToken(env);
  if (!token) return null;
  const client = new TelegramClient({ token });
  return { store: new NotifyStore(), messenger: client, botUsername: () => client.botUsername(), getUpdates: (o, t) => client.getUpdates(o, t) };
}

export function registerNotifyRoutes(app: Express, options: NotifyRouteOptions = {}): NotifyService | null {
  const env = options.env ?? process.env;
  const now = options.now ?? Date.now;
  const configured = options.service !== undefined ? options.service !== null : !!getBotToken(env);
  let service: NotifyService | null = options.service ?? null;
  const svc = (): NotifyService | null => {
    if (!configured) return null;
    return (service ??= createNotifyService(env));
  };
  if (configured) svc(); // fail early (and let server.ts pick it up from app.locals)
  app.locals.notify = service;
  registerChannelRoutes(app, { env, now, channels: options.channels }); // T101: push + email (own env gates)

  const lim = (max: number) => createRateLimiter({ windowMs: 60_000, max });
  const off = (res: Response) => res.status(503).json({ error: 'TELEGRAM_DISABLED', message: 'Telegram notifications are not configured on this server.' });

  // Failed link-code attempts per IP (fixed window); blocks guessing on status/authenticated routes.
  const FAIL_MAX = 20;
  const FAIL_WINDOW_MS = 60_000;
  const fails = new Map<string, { start: number; n: number }>();
  const failKey = (req: Request) => req.ip ?? req.socket.remoteAddress ?? 'unknown';
  const failBlocked = (req: Request, res: Response): boolean => {
    const t = now();
    if (fails.size > 5000) for (const [k, v] of fails) if (t - v.start >= FAIL_WINDOW_MS) fails.delete(k);
    const e = fails.get(failKey(req));
    if (!e || t - e.start >= FAIL_WINDOW_MS || e.n < FAIL_MAX) return false;
    const retryAfterSeconds = Math.max(1, Math.ceil((e.start + FAIL_WINDOW_MS - t) / 1000));
    res.setHeader('Retry-After', String(retryAfterSeconds));
    res.status(429).json({ error: 'RATE_LIMITED', message: 'Too many failed attempts. Please retry later.', retryAfterSeconds });
    return true;
  };
  const noteFail = (req: Request) => {
    const t = now();
    const k = failKey(req);
    const e = fails.get(k);
    if (!e || t - e.start >= FAIL_WINDOW_MS) fails.set(k, { start: t, n: 1 });
    else e.n += 1;
  };

  /** Resolves the chat for a request or answers 4xx. */
  const authChat = (req: Request, res: Response): { s: NotifyService; chatId: string } | null => {
    const s = svc();
    if (!s) {
      off(res);
      return null;
    }
    if (failBlocked(req, res)) return null;
    const body = (req.body ?? {}) as { linkCode?: unknown; chatId?: unknown };
    const chatId = s.store.chatIdFor(body.linkCode);
    if (!chatId) {
      noteFail(req);
      res.status(403).json({ error: 'NOT_LINKED', message: 'Chat is not linked.' });
      return null;
    }
    if (body.chatId !== undefined && (!isValidChatId(body.chatId) || body.chatId !== chatId)) {
      res.status(403).json({ error: 'CHAT_MISMATCH', message: 'chatId does not match the linked chat.' });
      return null;
    }
    return { s, chatId };
  };

  app.get('/api/notify/telegram/status', async (req: Request, res: Response) => {
    const s = svc();
    if (!s) {
      res.json({ configured: false, bot: null, linked: false, enabled: false, radar: false });
      return;
    }
    if (failBlocked(req, res)) return;
    const code = req.header('x-link-code');
    const chatId = s.store.chatIdFor(code);
    if (code && !chatId) noteFail(req);
    const prefs = chatId ? s.store.getPrefs(chatId) : { enabled: false, radar: false };
    res.json({ configured: true, bot: await s.botUsername(), linked: !!chatId, enabled: prefs.enabled, radar: prefs.radar });
  });

  app.post('/api/notify/telegram/link-code', lim(10), (_req: Request, res: Response) => {
    const s = svc();
    if (!s) return off(res);
    const code = s.store.createPending(now());
    if (!code) return res.status(429).json({ error: 'TOO_MANY_PENDING', message: 'Too many pending link codes.' });
    res.json({ linkCode: code, expiresInMinutes: PENDING_TTL_MS / 60_000 });
  });

  app.post('/api/notify/telegram/test', lim(5), async (req: Request, res: Response) => {
    const a = authChat(req, res);
    if (!a) return;
    const r = await a.s.messenger.sendMessage(a.chatId, 'Tin nhắn thử từ Commodity Trading AI Pro. Thông báo chỉ để theo dõi, không phải khuyến nghị.');
    res.status(r.ok ? 200 : r.reason === 'rate_limited' ? 429 : 502).json(r);
  });

  app.post('/api/notify/telegram/alert', lim(20), async (req: Request, res: Response) => {
    const a = authChat(req, res);
    if (!a) return;
    const text = (req.body as { text?: unknown }).text;
    if (typeof text !== 'string' || !text.trim() || text.length > MAX_ALERT_TEXT) {
      res.status(400).json({ error: 'BAD_TEXT', message: `text required, max ${MAX_ALERT_TEXT} chars.` });
      return;
    }
    const r = await a.s.messenger.sendMessage(a.chatId, clampText(`${text.trim()}\nChỉ để theo dõi, không phải khuyến nghị.`));
    res.status(r.ok ? 200 : r.reason === 'rate_limited' ? 429 : 502).json(r);
  });

  app.post('/api/notify/telegram/unlink', lim(10), (req: Request, res: Response) => {
    const a = authChat(req, res);
    if (!a) return;
    a.s.store.unlinkChat(a.chatId);
    res.json({ ok: true });
  });

  app.post('/api/notify/watchlist', lim(30), (req: Request, res: Response) => {
    const a = authChat(req, res);
    if (!a) return;
    const b = req.body as { enabled?: unknown; radar?: unknown; items?: unknown };
    if (!Array.isArray(b.items) || b.items.length > MAX_SYNC_ITEMS) {
      res.status(400).json({ error: 'BAD_ITEMS', message: `items must be an array of at most ${MAX_SYNC_ITEMS}.` });
      return;
    }
    const zones: Array<{ symbol: string; zone: WatchZone }> = [];
    const seen = new Set<string>();
    for (const raw of b.items) {
      const r = (raw ?? {}) as { instrumentId?: unknown; zone?: unknown };
      const symbol = typeof r.instrumentId === 'string' ? r.instrumentId.trim() : '';
      if (!SYMBOL_RE.test(symbol)) {
        res.status(400).json({ error: 'BAD_SYMBOL', message: 'Invalid instrumentId.' });
        return;
      }
      const zone = sanitizeZone(r.zone);
      if (!zone || seen.has(symbol)) continue; // items without a valid zone are not synced
      seen.add(symbol);
      zones.push({ symbol, zone });
    }
    a.s.store.setSync(a.chatId, { enabled: b.enabled === true, radar: b.radar === true }, zones);
    res.json({ ok: true, synced: zones.length });
  });

  return service;
}
