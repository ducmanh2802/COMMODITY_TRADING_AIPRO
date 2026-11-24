/**
 * T101 - Web Push + email routes under /api/notify (opt-in, 503 / configured:false when the server env is missing).
 * Email uses double opt-in; links use APP_BASE_URL (never the request Host header). Addresses are never logged in clear.
 */
import express, { type Express, type Request, type Response } from 'express';
import { sanitizeZone, type WatchZone } from '../../src/shared/watchlist/watchlist.ts';
import { createRateLimiter } from '../middleware/rateLimit.ts';
import { ChannelStore, isToken, isValidEmail, isValidPushSubscription, maskEmail, normalizeEmail } from '../services/notify/channelStore.ts';
import { createEmailSender, createPushSender, getSmtp, getVapid, type Channels, type Env } from '../services/notify/channels.ts';

const MAX_ITEMS = 60;
const SYMBOL_RE = /^[A-Za-z0-9._=-]{1,20}$/;

function createChannels(env: Env = process.env): Channels | null {
  const vapid = getVapid(env);
  const smtp = getSmtp(env);
  if (!vapid && !smtp) return null;
  return {
    store: new ChannelStore(),
    vapidPublicKey: vapid?.publicKey ?? null,
    push: vapid ? createPushSender(vapid) : null,
    email: smtp ? createEmailSender(smtp) : null,
    baseUrl: smtp?.baseUrl ?? null,
  };
}

/** Parses [{instrumentId, zone}] -> synced zones; null when malformed. Items without a valid zone are skipped. */
function parseZones(raw: unknown): Array<{ symbol: string; zone: WatchZone }> | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_ITEMS) return null;
  const out: Array<{ symbol: string; zone: WatchZone }> = [];
  const seen = new Set<string>();
  for (const it of raw) {
    const r = (it ?? {}) as { instrumentId?: unknown; zone?: unknown };
    const symbol = typeof r.instrumentId === 'string' ? r.instrumentId.trim() : '';
    if (!SYMBOL_RE.test(symbol)) return null;
    const zone = sanitizeZone(r.zone);
    if (!zone || seen.has(symbol)) continue;
    seen.add(symbol);
    out.push({ symbol, zone });
  }
  return out;
}

const page = (title: string, msg: string): string =>
  `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem"><h1>${title}</h1><p>${msg}</p></body></html>`;

export interface ChannelRouteOptions {
  env?: Env;
  /** Tests inject a fake (or null = unconfigured); production builds from env. */
  channels?: Channels | null;
  now?: () => number;
}

export function registerChannelRoutes(app: Express, options: ChannelRouteOptions = {}): Channels | null {
  const env = options.env ?? process.env;
  const now = options.now ?? Date.now;
  const channels = options.channels !== undefined ? options.channels : createChannels(env);
  app.locals.channels = channels;
  const lim = (max: number) => createRateLimiter({ windowMs: 60_000, max });
  const pushOff = (res: Response) => res.status(503).json({ error: 'PUSH_DISABLED', message: 'Web Push is not configured on this server.' });
  const emailOff = (res: Response) => res.status(503).json({ error: 'EMAIL_DISABLED', message: 'Email notifications are not configured on this server.' });

  app.get('/api/notify/push/key', (_req: Request, res: Response) => {
    if (!channels?.push || !channels.vapidPublicKey) return pushOff(res);
    res.json({ publicKey: channels.vapidPublicKey });
  });

  app.post('/api/notify/push/subscribe', lim(20), (req: Request, res: Response) => {
    if (!channels?.push) return pushOff(res);
    const b = (req.body ?? {}) as { subscription?: unknown; zones?: unknown; radar?: unknown };
    if (!isValidPushSubscription(b.subscription)) return res.status(400).json({ error: 'BAD_SUBSCRIPTION', message: 'Invalid push subscription.' });
    const zones = parseZones(b.zones);
    if (!zones) return res.status(400).json({ error: 'BAD_ITEMS', message: 'Invalid zones.' });
    const ok = channels.store.upsertPush(b.subscription, b.radar === true, zones, now());
    if (!ok) return res.status(429).json({ error: 'TOO_MANY', message: 'Too many subscriptions.' });
    res.json({ ok: true, synced: zones.length });
  });

  app.post('/api/notify/push/unsubscribe', lim(20), (req: Request, res: Response) => {
    if (!channels?.push) return pushOff(res);
    const endpoint = ((req.body ?? {}) as { endpoint?: unknown }).endpoint;
    if (typeof endpoint !== 'string' || endpoint.length > 600) return res.status(400).json({ error: 'BAD_ENDPOINT', message: 'endpoint required.' });
    channels.store.removePush(endpoint);
    res.json({ ok: true });
  });

  app.get('/api/notify/email/status', (_req: Request, res: Response) => {
    res.json({ configured: !!(channels?.email && channels.baseUrl) });
  });

  app.post('/api/notify/email/subscribe', lim(5), async (req: Request, res: Response) => {
    if (!channels?.email || !channels.baseUrl) return emailOff(res);
    const b = (req.body ?? {}) as { email?: unknown; zones?: unknown };
    const raw = typeof b.email === 'string' ? normalizeEmail(b.email) : '';
    if (!isValidEmail(raw)) return res.status(400).json({ error: 'BAD_EMAIL', message: 'Invalid email address.' });
    const zones = parseZones(b.zones);
    if (!zones) return res.status(400).json({ error: 'BAD_ITEMS', message: 'Invalid zones.' });
    const begun = channels.store.beginEmail(raw, zones, now());
    // Same answer whether or not a mail was sent: no way to probe which addresses are subscribed.
    if (begun && channels.store.reserveEmail(raw, now())) {
      const link = `${channels.baseUrl}/api/notify/email/confirm?token=${begun.confirmToken}`;
      // Not awaited: response time must not reveal whether a mail was sent (enumeration) nor block on SMTP.
      void channels.email.send({
        to: raw,
        subject: 'Xác nhận nhận email từ Commodity Trading AI Pro',
        text:
          `Bạn (hoặc ai đó) đã đăng ký nhận email khi giá đóng cửa/giá trễ vào vùng giá đã đặt. Nhấn để xác nhận:\n${link}\n\n` +
          'Nếu không phải bạn, bỏ qua email này. Chỉ để theo dõi, không phải khuyến nghị.',
      }).then((ok) => {
        if (!ok) console.warn(`notify email: confirm mail failed for ${maskEmail(raw)}`);
      }, () => undefined);
    }
    res.json({ ok: true, message: 'pending_confirmation' });
  });

  // GET only renders a button (mail scanners / link prefetchers issue GETs); the state change is a POST.
  const form = (action: string, token: unknown, title: string, msg: string, btn: string): string => {
    const t = isToken(token) ? token : '';
    return page(title, `${msg}</p><form method="post" action="${action}?token=${t}"><button type="submit" style="padding:.6rem 1.2rem;font-size:1rem">${btn}</button></form><p>`);
  };
  const post = express.urlencoded({ extended: false, limit: '2kb' });

  app.get('/api/notify/email/confirm', lim(30), (req: Request, res: Response) => {
    if (!channels?.email) return emailOff(res);
    res.type('html');
    if (!isToken(req.query.token)) return res.status(400).send(page('Liên kết không hợp lệ', 'Liên kết xác nhận không hợp lệ hoặc đã hết hạn.'));
    res.send(form('/api/notify/email/confirm', req.query.token, 'Xác nhận email', 'Nhấn nút để xác nhận nhận email khi giá vào vùng đã đặt.', 'Xác nhận'));
  });

  app.post('/api/notify/email/confirm', lim(30), post, (req: Request, res: Response) => {
    if (!channels?.email) return emailOff(res);
    const email = channels.store.confirmEmail(req.query.token, now());
    res.type('html');
    if (!email) return res.status(400).send(page('Liên kết không hợp lệ', 'Liên kết xác nhận không hợp lệ hoặc đã hết hạn.'));
    res.send(page('Đã xác nhận', 'Bạn sẽ nhận email khi giá đóng cửa/giá trễ vào vùng đã đặt. Chỉ để theo dõi, không phải khuyến nghị.'));
  });

  app.get('/api/notify/email/unsubscribe', lim(30), (req: Request, res: Response) => {
    if (!channels?.email) return emailOff(res);
    res.type('html');
    if (!isToken(req.query.token)) return res.status(400).send(page('Liên kết không hợp lệ', 'Liên kết hủy không hợp lệ hoặc đã dùng.'));
    res.send(form('/api/notify/email/unsubscribe', req.query.token, 'Hủy nhận email', 'Nhấn nút để hủy nhận email và xóa dữ liệu đồng bộ.', 'Hủy nhận email'));
  });

  // Also the RFC 8058 one-click target (List-Unsubscribe-Post: List-Unsubscribe=One-Click).
  app.post('/api/notify/email/unsubscribe', lim(30), post, (req: Request, res: Response) => {
    if (!channels?.email) return emailOff(res);
    const ok = channels.store.unsubscribeEmail(req.query.token);
    res.type('html');
    if (!ok) return res.status(400).send(page('Liên kết không hợp lệ', 'Liên kết hủy không hợp lệ hoặc đã dùng.'));
    res.send(page('Đã hủy', 'Bạn sẽ không nhận email nữa và dữ liệu đồng bộ đã được xóa.'));
  });

  return channels;
}
