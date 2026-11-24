/** T101 - SQLite storage for Web Push subscriptions and double-opt-in email subscriptions (+ their synced zones). */
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { WatchZone } from '../../../src/shared/watchlist/watchlist.ts';
import type { SyncedZone } from './store.ts';

const EMAIL_PENDING_TTL_MS = 48 * 3600_000;
const EMAIL_RESEND_GAP_MS = 10 * 60_000;
export const MAX_EMAILS_PER_DAY = 20;
const MAX_PUSH_SUBS = 5000;
const MAX_EMAIL_SUBS = 5000;
const EMAIL_RE = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
const TOKEN_RE = /^[0-9a-f]{48}$/;

export interface PushSubscriptionJson {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}
/** Known browser push services. The server POSTs to the endpoint, so arbitrary hosts would be an SSRF vector. */
const PUSH_HOST_SUFFIXES = ['.googleapis.com', '.push.services.mozilla.com', '.notify.windows.com', '.push.apple.com', '.push.microsoft.com'];
function isAllowedPushEndpoint(endpoint: string): boolean {
  let u: URL;
  try {
    u = new URL(endpoint);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return false;
  const h = u.hostname.toLowerCase();
  return PUSH_HOST_SUFFIXES.some((suf) => h.endsWith(suf));
}
export function isValidPushSubscription(v: unknown): v is PushSubscriptionJson {
  const s = v as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  if (!s || typeof s.endpoint !== 'string' || s.endpoint.length > 600 || !isAllowedPushEndpoint(s.endpoint)) return false;
  const k = s.keys;
  return !!k && typeof k.p256dh === 'string' && typeof k.auth === 'string' && k.p256dh.length > 0 && k.p256dh.length <= 200 && k.auth.length > 0 && k.auth.length <= 100;
}

export function isValidEmail(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 254 && EMAIL_RE.test(v);
}
export function normalizeEmail(v: string): string {
  return v.trim().toLowerCase();
}
/** a***@d***.com - safe for logs. */
export function maskEmail(e: string): string {
  const [l = '', d = ''] = e.split('@');
  const dot = d.lastIndexOf('.');
  return `${l.slice(0, 1)}***@${d.slice(0, 1)}***${dot >= 0 ? d.slice(dot) : ''}`;
}
const newToken = (): string => randomBytes(24).toString('hex');
export const isToken = (v: unknown): v is string => typeof v === 'string' && TOKEN_RE.test(v);
const dayKey = (now: number): string => new Date(now).toISOString().slice(0, 10);

export interface PushSubRow {
  sub: PushSubscriptionJson;
  radar: boolean;
}
export interface EmailSubRow {
  email: string;
  unsubToken: string;
}

export class ChannelStore {
  private readonly db: DatabaseSync;
  constructor(location: string = process.env.MARKET_DB_PATH?.trim() || path.join('data', 'market.db')) {
    if (location !== ':memory:') mkdirSync(path.dirname(path.resolve(location)), { recursive: true });
    this.db = new DatabaseSync(location);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, p256dh TEXT NOT NULL, auth TEXT NOT NULL, radar INTEGER NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS push_zones (endpoint TEXT NOT NULL, symbol TEXT NOT NULL, zone TEXT NOT NULL, in_zone INTEGER, PRIMARY KEY (endpoint, symbol));
      CREATE TABLE IF NOT EXISTS push_radar (endpoint TEXT PRIMARY KEY, snapshot TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS email_subs (email TEXT PRIMARY KEY, confirm_token TEXT NOT NULL, unsub_token TEXT NOT NULL, confirmed INTEGER NOT NULL, created_at INTEGER NOT NULL, last_confirm_sent INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS email_zones (email TEXT NOT NULL, symbol TEXT NOT NULL, zone TEXT NOT NULL, in_zone INTEGER, PRIMARY KEY (email, symbol));
      CREATE TABLE IF NOT EXISTS email_sent (email TEXT NOT NULL, day TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (email, day));
    `);
  }

  // ---- push ----
  /** Upserts the subscription and replaces its zones (state kept for unchanged zones). Returns false when the table is full. */
  upsertPush(sub: PushSubscriptionJson, radar: boolean, zones: Array<{ symbol: string; zone: WatchZone }>, now: number): boolean {
    if (!this.hasPush(sub.endpoint) && this.pushCount() >= MAX_PUSH_SUBS) return false;
    const old = new Map(this.listPushZones(sub.endpoint).map((z) => [z.symbol, z]));
    this.db.exec('BEGIN');
    try {
      this.db
        .prepare('INSERT INTO push_subs (endpoint, p256dh, auth, radar, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, radar = excluded.radar')
        .run(sub.endpoint, sub.keys.p256dh, sub.keys.auth, radar ? 1 : 0, now);
      this.db.prepare('DELETE FROM push_zones WHERE endpoint = ?').run(sub.endpoint);
      const ins = this.db.prepare('INSERT INTO push_zones (endpoint, symbol, zone, in_zone) VALUES (?, ?, ?, ?)');
      for (const z of zones) {
        const prev = old.get(z.symbol);
        const st = prev && JSON.stringify(prev.zone) === JSON.stringify(z.zone) ? prev.inZone : null;
        ins.run(sub.endpoint, z.symbol, JSON.stringify(z.zone), st === null ? null : st ? 1 : 0);
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    return true;
  }
  pushCount(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM push_subs').get() as { n: number }).n;
  }
  removePush(endpoint: string): void {
    for (const t of ['push_subs', 'push_zones', 'push_radar']) this.db.prepare(`DELETE FROM ${t} WHERE endpoint = ?`).run(endpoint);
  }
  hasPush(endpoint: string): boolean {
    return !!this.db.prepare('SELECT 1 AS x FROM push_subs WHERE endpoint = ?').get(endpoint);
  }
  listPush(): PushSubRow[] {
    const rows = this.db.prepare('SELECT endpoint, p256dh, auth, radar FROM push_subs').all() as Array<{ endpoint: string; p256dh: string; auth: string; radar: number }>;
    return rows.map((r) => ({ sub: { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, radar: !!r.radar }));
  }
  listPushZones(endpoint: string): SyncedZone[] {
    return this.zones('push_zones', 'endpoint', endpoint);
  }
  setPushZoneState(endpoint: string, symbol: string, inZone: boolean): void {
    this.db.prepare('UPDATE push_zones SET in_zone = ? WHERE endpoint = ? AND symbol = ?').run(inZone ? 1 : 0, endpoint, symbol);
  }
  getPushRadar(endpoint: string): string | null {
    const r = this.db.prepare('SELECT snapshot FROM push_radar WHERE endpoint = ?').get(endpoint) as { snapshot: string } | undefined;
    return r?.snapshot ?? null;
  }
  setPushRadar(endpoint: string, snapshot: string): void {
    this.db.prepare('INSERT OR REPLACE INTO push_radar (endpoint, snapshot) VALUES (?, ?)').run(endpoint, snapshot);
  }

  // ---- email ----
  /**
   * Starts (or restarts) double opt-in. Returns the confirm token to mail, or null when nothing must be sent
   * (already confirmed, confirm mail sent < 10 min ago, or table full).
   */
  beginEmail(email: string, zones: Array<{ symbol: string; zone: WatchZone }>, now: number): { confirmToken: string } | null {
    this.db.prepare('DELETE FROM email_subs WHERE confirmed = 0 AND created_at < ?').run(now - EMAIL_PENDING_TTL_MS);
    const cur = this.db.prepare('SELECT confirmed, last_confirm_sent FROM email_subs WHERE email = ?').get(email) as { confirmed: number; last_confirm_sent: number } | undefined;
    if (cur?.confirmed) return null;
    if (cur && now - cur.last_confirm_sent < EMAIL_RESEND_GAP_MS) return null;
    if (!cur && (this.db.prepare('SELECT COUNT(*) AS n FROM email_subs').get() as { n: number }).n >= MAX_EMAIL_SUBS) return null;
    const confirmToken = newToken();
    this.db.exec('BEGIN');
    try {
      this.db
        .prepare('INSERT INTO email_subs (email, confirm_token, unsub_token, confirmed, created_at, last_confirm_sent) VALUES (?, ?, ?, 0, ?, ?) ON CONFLICT(email) DO UPDATE SET confirm_token = excluded.confirm_token, last_confirm_sent = excluded.last_confirm_sent')
        .run(email, confirmToken, newToken(), now, now);
      this.db.prepare('DELETE FROM email_zones WHERE email = ?').run(email);
      const ins = this.db.prepare('INSERT INTO email_zones (email, symbol, zone, in_zone) VALUES (?, ?, ?, NULL)');
      for (const z of zones) ins.run(email, z.symbol, JSON.stringify(z.zone));
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    return { confirmToken };
  }
  /** Marks the subscription confirmed. Returns the email or null for a bad/expired token. */
  confirmEmail(token: unknown, now: number): string | null {
    if (!isToken(token)) return null;
    const r = this.db.prepare('SELECT email, created_at, confirmed FROM email_subs WHERE confirm_token = ?').get(token) as { email: string; created_at: number; confirmed: number } | undefined;
    if (!r || (!r.confirmed && r.created_at < now - EMAIL_PENDING_TTL_MS)) return null;
    this.db.prepare('UPDATE email_subs SET confirmed = 1 WHERE email = ?').run(r.email);
    return r.email;
  }
  unsubscribeEmail(token: unknown): boolean {
    if (!isToken(token)) return false;
    const r = this.db.prepare('SELECT email FROM email_subs WHERE unsub_token = ?').get(token) as { email: string } | undefined;
    if (!r) return false;
    for (const t of ['email_subs', 'email_zones']) this.db.prepare(`DELETE FROM ${t} WHERE email = ?`).run(r.email);
    return true;
  }
  unsubTokenFor(email: string): string | null {
    const r = this.db.prepare('SELECT unsub_token FROM email_subs WHERE email = ?').get(email) as { unsub_token: string } | undefined;
    return r?.unsub_token ?? null;
  }
  listConfirmedEmails(): EmailSubRow[] {
    const rows = this.db.prepare('SELECT email, unsub_token FROM email_subs WHERE confirmed = 1').all() as Array<{ email: string; unsub_token: string }>;
    return rows.map((r) => ({ email: r.email, unsubToken: r.unsub_token }));
  }
  listEmailZones(email: string): SyncedZone[] {
    return this.zones('email_zones', 'email', email);
  }
  setEmailZoneState(email: string, symbol: string, inZone: boolean): void {
    this.db.prepare('UPDATE email_zones SET in_zone = ? WHERE email = ? AND symbol = ?').run(inZone ? 1 : 0, email, symbol);
  }
  /** Reserves one of the 20 daily emails for this address. False when the cap is reached. */
  reserveEmail(email: string, now: number): boolean {
    const day = dayKey(now);
    this.db.prepare('DELETE FROM email_sent WHERE day < ?').run(dayKey(now - 2 * 86400_000));
    const r = this.db.prepare('SELECT n FROM email_sent WHERE email = ? AND day = ?').get(email, day) as { n: number } | undefined;
    if ((r?.n ?? 0) >= MAX_EMAILS_PER_DAY) return false;
    this.db.prepare('INSERT INTO email_sent (email, day, n) VALUES (?, ?, 1) ON CONFLICT(email, day) DO UPDATE SET n = n + 1').run(email, day);
    return true;
  }

  private zones(table: string, col: string, key: string): SyncedZone[] {
    const rows = this.db.prepare(`SELECT symbol, zone, in_zone FROM ${table} WHERE ${col} = ?`).all(key) as Array<{ symbol: string; zone: string; in_zone: number | null }>;
    return rows.map((r) => ({ symbol: r.symbol, zone: JSON.parse(r.zone) as WatchZone, inZone: r.in_zone === null ? null : !!r.in_zone }));
  }

  close(): void {
    this.db.close();
  }
}
