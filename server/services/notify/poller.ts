/** T67 - getUpdates long-poll worker: the user links a chat by sending `/start <linkCode>` to the bot. Only started when the token is set. */
import { isValidChatId, type Messenger, type TelegramUpdate } from './telegram.ts';
import type { NotifyStore } from './store.ts';

export const MSG_LINKED = 'Đã liên kết. Bạn sẽ nhận thông báo vùng giá bạn đặt và sự kiện Radar. Chỉ để theo dõi, không phải khuyến nghị. Gửi /stop để hủy liên kết.';
export const MSG_BAD_CODE = 'Mã liên kết không hợp lệ hoặc đã hết hạn. Hãy lấy mã mới trong ứng dụng (mục Danh sách theo dõi) rồi gửi: /start <mã>.';
export const MSG_UNLINKED = 'Đã hủy liên kết và xóa dữ liệu đồng bộ.';

/** Handles one update; returns true when it was a recognised command. Pure apart from store/messenger. */
export async function handleUpdate(u: TelegramUpdate, store: NotifyStore, messenger: Messenger, now: number): Promise<boolean> {
  const msg = u.message;
  const text = typeof msg?.text === 'string' ? msg.text.trim() : '';
  const chat = msg?.chat;
  if (!chat || chat.type !== 'private' || typeof chat.id !== 'number') return false;
  const chatId = String(chat.id);
  if (!isValidChatId(chatId)) return false;
  const m = /^\/(start|stop)(?:@\w+)?(?:\s+(\S+))?$/i.exec(text);
  if (!m) return false;
  if (m[1].toLowerCase() === 'stop') {
    store.unlinkChat(chatId);
    await messenger.sendMessage(chatId, MSG_UNLINKED);
    return true;
  }
  const ok = !!m[2] && store.claim(m[2].toUpperCase(), chatId, now);
  await messenger.sendMessage(chatId, ok ? MSG_LINKED : MSG_BAD_CODE);
  return true;
}

export interface PollerDeps {
  getUpdates: (offset: number, timeoutS: number) => Promise<TelegramUpdate[]>;
  store: NotifyStore;
  messenger: Messenger;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export class TelegramPoller {
  private running = false;
  private offset = 0;
  constructor(private readonly d: PollerDeps) {}

  /** One poll iteration (exposed for tests). */
  async pollOnce(timeoutS = 25): Promise<void> {
    const updates = await this.d.getUpdates(this.offset, timeoutS);
    for (const u of updates) {
      this.offset = Math.max(this.offset, u.update_id + 1);
      try {
        await handleUpdate(u, this.d.store, this.d.messenger, (this.d.now ?? Date.now)());
      } catch {
        // one bad update must never stop the loop
      }
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const sleep = this.d.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms).unref()));
    void (async () => {
      let backoff = 2000;
      while (this.running) {
        try {
          await this.pollOnce();
          backoff = 2000;
        } catch {
          // never log details: the underlying error text could include request context
          await sleep(backoff);
          backoff = Math.min(60_000, backoff * 2);
        }
      }
    })();
  }

  stop(): void {
    this.running = false;
  }
}
