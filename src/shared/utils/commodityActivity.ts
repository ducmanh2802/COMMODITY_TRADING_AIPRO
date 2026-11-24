import type { InstrumentDefinition, ProductCategory } from '../types/instrument';

export const COMMODITY_SEARCH_STORAGE_KEY = 'ctap.commoditySearchStats.v1';
export const COMMODITY_SEARCH_EVENT = 'ctap:commodity-search-updated';

export interface CommoditySearchEntry {
  symbol: string;
  count: number;
  lastAt: number;
}

export type CommoditySearchStats = Record<string, CommoditySearchEntry>;

export interface SearchedCommoditySignal {
  symbol: string;
  instrumentId: string;
  name: string;
  category: ProductCategory | null;
  count: number;
  lastAt: number;
}

export function normalizeActivitySymbol(raw: string): string {
  const trimmed = raw.trim().toUpperCase();
  if (!trimmed) return '';
  const colonIdx = trimmed.lastIndexOf(':');
  return colonIdx >= 0 ? trimmed.slice(colonIdx + 1) : trimmed;
}

function foldSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

export function loadCommoditySearchStats(storage?: Storage): CommoditySearchStats {
  try {
    const store = storage ?? window.localStorage;
    const raw = store.getItem(COMMODITY_SEARCH_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: CommoditySearchStats = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
      const rec = v as Partial<CommoditySearchEntry>;
      const sym = normalizeActivitySymbol(typeof rec.symbol === 'string' ? rec.symbol : k);
      if (!sym) continue;
      const count = typeof rec.count === 'number' && Number.isFinite(rec.count) && rec.count > 0 ? Math.floor(rec.count) : 1;
      const lastAt = typeof rec.lastAt === 'number' && Number.isFinite(rec.lastAt) ? rec.lastAt : 0;
      out[sym] = { symbol: sym, count, lastAt };
    }
    return out;
  } catch {
    return {};
  }
}

export function saveCommoditySearchStats(stats: CommoditySearchStats, storage?: Storage): void {
  try {
    const store = storage ?? window.localStorage;
    store.setItem(COMMODITY_SEARCH_STORAGE_KEY, JSON.stringify(stats));
    if (typeof window !== 'undefined' && !storage) {
      window.dispatchEvent(new CustomEvent(COMMODITY_SEARCH_EVENT));
    }
  } catch {
    // Storage unavailable: skip silently.
  }
}

export function applySearchHit(
  stats: CommoditySearchStats,
  rawSymbol: string,
  now: number = Date.now()
): CommoditySearchStats {
  const sym = normalizeActivitySymbol(rawSymbol);
  if (!sym) return stats;
  const prev = stats[sym];
  return {
    ...stats,
    [sym]: {
      symbol: sym,
      count: (prev?.count ?? 0) + 1,
      lastAt: now,
    },
  };
}

export function recordCommoditySearch(rawSymbol: string, storage?: Storage, now: number = Date.now()): void {
  const sym = normalizeActivitySymbol(rawSymbol);
  if (!sym) return;
  const current = loadCommoditySearchStats(storage);
  const next = applySearchHit(current, sym, now);
  saveCommoditySearchStats(next, storage);
}

/**
 * Resolves a user search query to matching commodity symbol(s) when the query is specific enough
 * (>= 2 chars, either exact symbol/MXV symbol match or matching <= 3 instruments).
 */
export function resolveSearchMatchSymbols(query: string, instruments: readonly InstrumentDefinition[]): string[] {
  const q = foldSearch(query);
  if (q.length < 2 || instruments.length === 0) return [];

  const exact = instruments.filter((inst) => {
    const sym = foldSearch(inst.exchangeSymbol);
    const id = foldSearch(inst.id);
    const mxv = foldSearch(inst.mxvMapping?.mxvSymbol ?? '');
    return sym === q || id === q || (mxv.length > 0 && mxv === q);
  });
  if (exact.length > 0) {
    return Array.from(new Set(exact.map((i) => i.exchangeSymbol)));
  }

  const partial = instruments.filter((inst) => {
    const hay = foldSearch(
      `${inst.exchangeSymbol} ${inst.productName} ${inst.commodityProfile?.vietnameseName ?? ''} ${inst.mxvMapping?.mxvSymbol ?? ''}`
    );
    return hay.includes(q);
  });
  if (partial.length > 0 && partial.length <= 3) {
    return Array.from(new Set(partial.map((i) => i.exchangeSymbol)));
  }
  return [];
}

/**
 * Returns top searched commodities ordered by search count descending, then most recent timestamp.
 */
export function getTopSearchedCommodities(
  stats: CommoditySearchStats,
  instruments: readonly InstrumentDefinition[],
  limit = 6
): SearchedCommoditySignal[] {
  const bySymbol = new Map<string, InstrumentDefinition>();
  for (const inst of instruments) {
    bySymbol.set(inst.exchangeSymbol.toUpperCase(), inst);
    bySymbol.set(inst.id.toUpperCase(), inst);
    if (inst.mxvMapping?.mxvSymbol) {
      bySymbol.set(inst.mxvMapping.mxvSymbol.toUpperCase(), inst);
    }
  }

  return Object.values(stats)
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : b.lastAt - a.lastAt))
    .slice(0, limit)
    .map((entry) => {
      const inst = bySymbol.get(entry.symbol.toUpperCase());
      return {
        symbol: inst?.exchangeSymbol ?? entry.symbol,
        instrumentId: inst?.id ?? entry.symbol,
        name: inst?.commodityProfile?.vietnameseName ?? inst?.productName ?? entry.symbol,
        category: inst?.category ?? null,
        count: entry.count,
        lastAt: entry.lastAt,
      };
    });
}
