/** T67 - SQLite storage for Telegram links (chat <-> secret link code), sync preferences and synced watchlist zones. */
import { randomInt, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { WatchZone } from '../../../src/shared/watchlist/watchlist.ts';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
// 26 chars x 5 bits = 130 bits of CSPRNG entropy (crypto.randomInt). Codes of the legacy length (10) stay
// valid for lookups of already-linked chats but can no longer be claimed.
const LINK_CODE_LENGTH = 26;
export const PENDING_TTL_MS = 15 * 60_000;
const MAX_PENDING = 500;
const LINK_CODE_RE = /^[A-HJ-NP-Z2-9]{26}$/;
const LINKED_CODE_RE = /^[A-HJ-NP-Z2-9]{10}$|^[A-HJ-NP-Z2-9]{26}$/;

export interface SyncedZone {
  symbol: string;
  zone: WatchZone;
  inZone: boolean | null;
}
export interface ChatPrefs {
  enabled: boolean;
  radar: boolean;
}

function newLinkCode(): string {
  let s = '';
  for (let i = 0; i < LINK_CODE_LENGTH; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

export class NotifyStore {
  private readonly db: DatabaseSync;
  constructor(location: string = process.env.MARKET_DB_PATH?.trim() || path.join('data', 'market.db')) {
    if (location !== ':memory:') mkdirSync(path.dirname(path.resolve(location)), { recursive: true });
    this.db = new DatabaseSync(location);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tg_pending (code TEXT PRIMARY KEY, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS tg_links (link_code TEXT PRIMARY KEY, chat_id TEXT NOT NULL UNIQUE, linked_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS tg_prefs (chat_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL, radar INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS tg_zones (chat_id TEXT NOT NULL, symbol TEXT NOT NULL, zone TEXT NOT NULL, in_zone INTEGER, PRIMARY KEY (chat_id, symbol));
      CREATE TABLE IF NOT EXISTS tg_radar (chat_id TEXT PRIMARY KEY, snapshot TEXT NOT NULL);
    `);
  }

  /** Issues an unclaimed code (valid 15 min). Returns null when too many are pending. */
  createPending(now: number): string | null {
    this.db.prepare('DELETE FROM tg_pending WHERE created_at < ?').run(now - PENDING_TTL_MS);
    const n = (this.db.prepare('SELECT COUNT(*) AS n FROM tg_pending').get() as { n: number }).n;
    if (n >= MAX_PENDING) return null;
    const code = newLinkCode();
    this.db.prepare('INSERT INTO tg_pending (code, created_at) VALUES (?, ?)').run(code, now);
    return code;
  }

  /** Bot side: binds chat to a pending code (one chat per code; re-linking a chat replaces its old code). */
  claim(code: string, chatId: string, now: number): boolean {
    if (!LINK_CODE_RE.test(code)) return false;
    const p = this.db.prepare('SELECT created_at FROM tg_pending WHERE code = ?').get(code) as { created_at: number } | undefined;
    if (!p || p.created_at < now - PENDING_TTL_MS) return false;
    this.db.prepare('DELETE FROM tg_pending WHERE code = ?').run(code);
    this.db.prepare('DELETE FROM tg_links WHERE chat_id = ?').run(chatId);
    this.db.prepare('INSERT INTO tg_links (link_code, chat_id, linked_at) VALUES (?, ?, ?)').run(code, chatId, now);
    return true;
  }

  chatIdFor(code: unknown): string | null {
    if (typeof code !== 'string' || !LINKED_CODE_RE.test(code)) return null;
    const r = this.db.prepare('SELECT link_code, chat_id FROM tg_links WHERE link_code = ?').get(code) as { link_code: string; chat_id: string } | undefined;
    if (!r) return null;
    // Constant-time confirmation of the match (the index lookup itself is not).
    return timingSafeEqual(Buffer.from(r.link_code), Buffer.from(code)) ? r.chat_id : null;
  }

  unlinkChat(chatId: string): void {
    for (const t of ['tg_links', 'tg_prefs', 'tg_zones', 'tg_radar']) this.db.prepare(`DELETE FROM ${t} WHERE chat_id = ?`).run(chatId);
  }

  getPrefs(chatId: string): ChatPrefs {
    const r = this.db.prepare('SELECT enabled, radar FROM tg_prefs WHERE chat_id = ?').get(chatId) as { enabled: number; radar: number } | undefined;
    return { enabled: !!r?.enabled, radar: !!r?.radar };
  }

  /** Replaces the synced zones; the in/out state is kept for symbols whose zone did not change (hysteresis continuity). */
  setSync(chatId: string, prefs: ChatPrefs, zones: Array<{ symbol: string; zone: WatchZone }>): void {
    const old = new Map(this.listZones(chatId).map((z) => [z.symbol, z]));
    this.db.exec('BEGIN');
    try {
      this.db.prepare('INSERT OR REPLACE INTO tg_prefs (chat_id, enabled, radar) VALUES (?, ?, ?)').run(chatId, prefs.enabled ? 1 : 0, prefs.radar ? 1 : 0);
      this.db.prepare('DELETE FROM tg_zones WHERE chat_id = ?').run(chatId);
      const ins = this.db.prepare('INSERT INTO tg_zones (chat_id, symbol, zone, in_zone) VALUES (?, ?, ?, ?)');
      for (const z of zones) {
        const prev = old.get(z.symbol);
        const st = prev && JSON.stringify(prev.zone) === JSON.stringify(z.zone) ? prev.inZone : null;
        ins.run(chatId, z.symbol, JSON.stringify(z.zone), st === null ? null : st ? 1 : 0);
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  listZones(chatId: string): SyncedZone[] {
    const rows = this.db.prepare('SELECT symbol, zone, in_zone FROM tg_zones WHERE chat_id = ?').all(chatId) as Array<{ symbol: string; zone: string; in_zone: number | null }>;
    return rows.map((r) => ({ symbol: r.symbol, zone: JSON.parse(r.zone) as WatchZone, inZone: r.in_zone === null ? null : !!r.in_zone }));
  }

  setZoneState(chatId: string, symbol: string, inZone: boolean): void {
    this.db.prepare('UPDATE tg_zones SET in_zone = ? WHERE chat_id = ? AND symbol = ?').run(inZone ? 1 : 0, chatId, symbol);
  }

  /** Linked chats that opted into zone and/or radar notifications. */
  listActiveChats(): Array<{ chatId: string; prefs: ChatPrefs }> {
    const rows = this.db.prepare('SELECT p.chat_id AS chat_id FROM tg_prefs p JOIN tg_links l ON l.chat_id = p.chat_id WHERE p.enabled = 1 OR p.radar = 1').all() as Array<{ chat_id: string }>;
    return rows.map((r) => ({ chatId: r.chat_id, prefs: this.getPrefs(r.chat_id) }));
  }

  getRadarSnapshot(chatId: string): string | null {
    const r = this.db.prepare('SELECT snapshot FROM tg_radar WHERE chat_id = ?').get(chatId) as { snapshot: string } | undefined;
    return r?.snapshot ?? null;
  }
  setRadarSnapshot(chatId: string, snapshot: string): void {
    this.db.prepare('INSERT OR REPLACE INTO tg_radar (chat_id, snapshot) VALUES (?, ?)').run(chatId, snapshot);
  }

  close(): void {
    this.db.close();
  }
}
