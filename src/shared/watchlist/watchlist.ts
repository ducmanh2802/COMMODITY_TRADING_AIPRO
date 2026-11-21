/**
 * Watchlist logic (pure): price zones, distance, enter/leave detection with hysteresis, storage parse/migrate.
 * `instrumentId` holds the exchange symbol (e.g. "RC"), the same key used by TerminalContext.quotesBySymbol.
 * Research aid only: a zone is a reminder, never a buy/sell signal.
 */
export type WatchDirection = 'up' | 'down';
export type WatchZone =
  | { kind: 'range'; low: number; high: number }
  | { kind: 'level'; level: number; direction: WatchDirection };

export interface WatchItem {
  instrumentId: string;
  note: string;
  zone: WatchZone | null;
  createdAt: string;
  lastTriggeredAt: string | null;
  /** null = unknown yet (baseline is taken silently on the next quote, no alert). */
  inZone: boolean | null;
}

export const WATCHLIST_STORAGE_KEY = 'ctap.watchlist';
export const WATCHLIST_VERSION = 1;
export const MAX_NOTE_LENGTH = 140;
/** Price must leave the zone by this percentage of the boundary before it can re-trigger. */
export const DEFAULT_HYSTERESIS_PCT = 0.2;

export function zoneBounds(zone: WatchZone): { low: number; high: number } {
  if (zone.kind === 'range') return { low: Math.min(zone.low, zone.high), high: Math.max(zone.low, zone.high) };
  return zone.direction === 'up' ? { low: zone.level, high: Infinity } : { low: -Infinity, high: zone.level };
}

/** hysteresisPct widens the zone on both finite sides (used to decide "has left the zone"). */
export function isInZone(price: number, zone: WatchZone, hysteresisPct = 0): boolean {
  const { low, high } = zoneBounds(zone);
  const lo = Number.isFinite(low) ? low - Math.abs(low) * (hysteresisPct / 100) : low;
  const hi = Number.isFinite(high) ? high + Math.abs(high) * (hysteresisPct / 100) : high;
  return price >= lo && price <= hi;
}

/** Distance from price to the nearest zone edge as % of price; 0 when inside. null for invalid price. */
export function distancePct(price: number, zone: WatchZone): number | null {
  if (!Number.isFinite(price) || price === 0) return null;
  const { low, high } = zoneBounds(zone);
  if (price >= low && price <= high) return 0;
  const edge = price < low ? low : high;
  return (Math.abs(edge - price) / Math.abs(price)) * 100;
}

/** 0..100 "how close" for a small progress bar (100 = inside, 0 = 25% or more away). */
export function closenessPct(distance: number | null): number {
  if (distance === null) return 0;
  return Math.max(0, Math.min(100, Math.round(100 - distance * 4)));
}

export interface ZoneEval {
  inZone: boolean;
  entered: boolean;
  left: boolean;
}

/** prevInZone null = first observation: take a silent baseline. Enter uses the raw zone, leave needs hysteresis. */
export function evaluateZone(prevInZone: boolean | null, price: number, zone: WatchZone, hysteresisPct = DEFAULT_HYSTERESIS_PCT): ZoneEval {
  if (!Number.isFinite(price)) return { inZone: prevInZone ?? false, entered: false, left: false };
  if (prevInZone === null) return { inZone: isInZone(price, zone, 0), entered: false, left: false };
  if (!prevInZone) {
    const now = isInZone(price, zone, 0);
    return { inZone: now, entered: now, left: false };
  }
  const still = isInZone(price, zone, hysteresisPct);
  return { inZone: still, entered: false, left: !still };
}

export function describeZone(zone: WatchZone, fmt: (n: number) => string = String): { kind: 'range' | 'up' | 'down'; text: string } {
  if (zone.kind === 'range') {
    const b = zoneBounds(zone);
    return { kind: 'range', text: `${fmt(b.low)} – ${fmt(b.high)}` };
  }
  return { kind: zone.direction, text: fmt(zone.level) };
}

function finiteNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function isoOrNull(v: unknown): string | null {
  return typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null;
}

export function sanitizeZone(raw: unknown): WatchZone | null {
  if (!raw || typeof raw !== 'object') return null;
  const z = raw as Record<string, unknown>;
  const low = finiteNum(z.low);
  const high = finiteNum(z.high);
  const level = finiteNum(z.level);
  if (low !== null && high !== null && z.kind !== 'level') return { kind: 'range', low: Math.min(low, high), high: Math.max(low, high) };
  if (level !== null && (z.direction === 'up' || z.direction === 'down')) return { kind: 'level', level, direction: z.direction };
  return null;
}

function sanitizeItem(raw: unknown): WatchItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.instrumentId === 'string' ? r.instrumentId.trim() : '';
  if (!id) return null;
  return {
    instrumentId: id,
    note: typeof r.note === 'string' ? r.note.slice(0, MAX_NOTE_LENGTH) : '',
    zone: sanitizeZone(r.zone),
    createdAt: isoOrNull(r.createdAt) ?? new Date(0).toISOString(),
    lastTriggeredAt: isoOrNull(r.lastTriggeredAt),
    inZone: typeof r.inZone === 'boolean' ? r.inZone : null,
  };
}

/** Accepts the versioned envelope or a legacy bare array; drops invalid rows and duplicates; never throws. */
export function parseWatchlist(raw: string | null | undefined): WatchItem[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  const env = data && typeof data === 'object' ? (data as { items?: unknown }) : null;
  const rows: unknown[] = Array.isArray(data) ? data : env && Array.isArray(env.items) ? env.items : [];
  const seen = new Set<string>();
  const out: WatchItem[] = [];
  for (const row of rows) {
    const item = sanitizeItem(row);
    if (item && !seen.has(item.instrumentId)) {
      seen.add(item.instrumentId);
      out.push(item);
    }
  }
  return out;
}

export function serializeWatchlist(items: WatchItem[]): string {
  return JSON.stringify({ v: WATCHLIST_VERSION, items });
}

export function upsertItem(items: WatchItem[], next: WatchItem): WatchItem[] {
  const i = items.findIndex((x) => x.instrumentId === next.instrumentId);
  if (i < 0) return [...items, next];
  const copy = items.slice();
  copy[i] = next;
  return copy;
}
export function removeItem(items: WatchItem[], instrumentId: string): WatchItem[] {
  return items.filter((x) => x.instrumentId !== instrumentId);
}
