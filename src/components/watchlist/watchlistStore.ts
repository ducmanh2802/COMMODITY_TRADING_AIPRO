/**
 * Client-side watchlist store: items persist in localStorage (key `ctap.watchlist`, all access guarded), zone checks run
 * on every quote refresh, and fresh "entered zone" alerts surface as toasts (+ browser Notification only when the
 * permission was already granted elsewhere; this module never asks for it).
 */
import { useSyncExternalStore } from 'react';
import type { MarketQuote } from '../../shared/types/market';
import {
  WATCHLIST_STORAGE_KEY,
  evaluateZone,
  parseWatchlist,
  removeItem,
  serializeWatchlist,
  upsertItem,
  type WatchItem,
  type WatchZone,
} from '../../shared/watchlist/watchlist';

export interface WatchAlert {
  id: string;
  symbol: string;
  name: string;
  zoneText: string;
  priceText: string;
  /** false when the quote is delayed/historical/stale (never presented as live). */
  live: boolean;
  at: string;
}
interface State {
  items: WatchItem[];
  alerts: WatchAlert[];
}

function load(): WatchItem[] {
  try {
    return parseWatchlist(window.localStorage.getItem(WATCHLIST_STORAGE_KEY));
  } catch {
    return [];
  }
}
function save(items: WatchItem[]): void {
  try {
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, serializeWatchlist(items));
  } catch {
    /* storage blocked or full */
  }
}

let state: State = { items: [], alerts: [] };
let loaded = false;
const listeners = new Set<() => void>();

function ensureLoaded(): void {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  state = { ...state, items: load() };
  window.addEventListener('storage', (e) => {
    if (e.key === WATCHLIST_STORAGE_KEY) set({ items: load() }, false);
  });
}
function set(patch: Partial<State>, persist = true): void {
  state = { ...state, ...patch };
  if (persist && patch.items) save(patch.items);
  listeners.forEach((l) => l());
}

export function saveWatchItem(symbol: string, note: string, zone: WatchZone | null): void {
  ensureLoaded();
  const prev = state.items.find((i) => i.instrumentId === symbol);
  const item: WatchItem = {
    instrumentId: symbol,
    note: note.trim(),
    zone,
    createdAt: prev?.createdAt ?? new Date().toISOString(),
    lastTriggeredAt: prev?.lastTriggeredAt ?? null,
    inZone: null, // zone may have changed: take a fresh silent baseline
  };
  set({ items: upsertItem(state.items, item) });
}
export function deleteWatchItem(symbol: string): void {
  ensureLoaded();
  set({ items: removeItem(state.items, symbol) });
}
export const dismissWatchAlert = (id: string): void => set({ alerts: state.alerts.filter((a) => a.id !== id) }, false);

export interface QuoteCheckContext {
  nameOf: (symbol: string) => string;
  fmtPrice: (n: number) => string;
  fmtZone: (zone: WatchZone) => string;
}

/** Evaluates every zone against the latest quotes; persists state changes and emits alerts on zone entry only. */
export function checkWatchlist(quotes: Record<string, MarketQuote>, ctx: QuoteCheckContext, now: () => string = () => new Date().toISOString()): WatchAlert[] {
  ensureLoaded();
  let changed = false;
  const fresh: WatchAlert[] = [];
  const items = state.items.map((it) => {
    const q = quotes[it.instrumentId];
    if (!it.zone || !q || q.price === null || q.status === 'INVALID' || q.status === 'UNAVAILABLE') return it;
    const ev = evaluateZone(it.inZone, q.price, it.zone);
    if (!ev.entered && !ev.left && ev.inZone === it.inZone) return it;
    changed = true;
    const at = now();
    if (ev.entered) {
      fresh.push({
        id: `${it.instrumentId}-${at}`,
        symbol: it.instrumentId,
        name: ctx.nameOf(it.instrumentId),
        zoneText: ctx.fmtZone(it.zone),
        priceText: ctx.fmtPrice(q.price),
        live: q.status === 'CURRENT',
        at,
      });
    }
    return { ...it, inZone: ev.inZone, lastTriggeredAt: ev.entered ? at : it.lastTriggeredAt };
  });
  if (changed) set({ items, alerts: [...state.alerts, ...fresh].slice(-3) });
  return fresh;
}

/** Browser notification only if the user already granted permission; never prompts. */
export function browserNotifyIfGranted(title: string, body: string, tag: string): void {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    new Notification(title, { body, tag });
  } catch {
    /* unsupported */
  }
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function useWatchlist(): State {
  ensureLoaded();
  return useSyncExternalStore(subscribe, () => state, () => state);
}
