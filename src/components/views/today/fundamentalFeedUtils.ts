import type { FundamentalMacroRecord, MarketDirection } from '../../../shared/types/analysis';
import type { DataQualityStatus } from '../../../shared/types/market';

export interface FundamentalNewsRecord {
  id: string;
  headline: string;
  source: string;
  publicationTimestamp: string;
  category: string;
  relatedSymbols: string[];
  classification: MarketDirection;
  summary: string;
}

export type FundamentalFeedKindFilter = 'ALL' | 'NEWS' | 'MACRO';
export type FundamentalFeedDirectionFilter = 'ALL' | MarketDirection;

export interface FundamentalFeedEntry {
  key: string;
  id: string;
  entryType: 'NEWS' | 'MACRO';
  title: string;
  summary: string | null;
  source: string;
  publicationTimestamp: string;
  category: string;
  direction: MarketDirection;
  relatedSymbols: string[];
  freshnessStatus?: DataQualityStatus;
  macroRecord?: FundamentalMacroRecord;
}

export interface FundamentalFeedFilterOptions {
  kindFilter?: FundamentalFeedKindFilter;
  directionFilter?: FundamentalFeedDirectionFilter;
  /** Case-insensitive symbol code (e.g. 'RC', 'CL'). When set, keeps only items tagging this symbol. */
  symbolFilter?: string | null;
  query?: string;
  limit?: number;
}

export interface FundamentalFeedSummary {
  total: number;
  newsCount: number;
  macroCount: number;
  bullishCount: number;
  bearishCount: number;
  latestTimestamp: string | null;
}

export interface FundamentalStreamPayload {
  status: DataQualityStatus;
  asOf: string | null;
  records: FundamentalMacroRecord[];
  news: FundamentalNewsRecord[];
  serverTime?: string;
  changeKind?: string;
}

function timestampMs(iso: string): number {
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeSymbols(list?: string[]): string[] {
  if (!list || list.length === 0) return [];
  const seen = new Set<string>();
  for (const item of list) {
    const clean = item.trim().toUpperCase();
    if (clean) seen.add(clean);
  }
  return [...seen];
}

/**
 * Converts sourced `news` and `records` from fundamentalStore into a unified,
 * deduplicated, newest-first list for dashboard rendering.
 * Never fabricates missing records or directions.
 */
export function buildFundamentalFeedEntries(
  records: FundamentalMacroRecord[],
  news: FundamentalNewsRecord[],
  options: FundamentalFeedFilterOptions = {}
): FundamentalFeedEntry[] {
  const deduped = new Map<string, FundamentalFeedEntry>();

  for (const item of news) {
    const key = `NEWS:${item.id}`;
    deduped.set(key, {
      key,
      id: item.id,
      entryType: 'NEWS',
      title: item.headline,
      summary: item.summary ? item.summary : null,
      source: item.source,
      publicationTimestamp: item.publicationTimestamp,
      category: item.category,
      direction: item.classification,
      relatedSymbols: normalizeSymbols(item.relatedSymbols),
    });
  }

  for (const rec of records) {
    const key = `MACRO:${rec.id}`;
    deduped.set(key, {
      key,
      id: rec.id,
      entryType: 'MACRO',
      title: rec.dataset,
      summary: null,
      source: rec.source,
      publicationTimestamp: rec.publicationTimestamp,
      category: rec.category ?? 'MACRO',
      direction: rec.impactAssessment,
      relatedSymbols: normalizeSymbols(rec.relatedSymbols),
      freshnessStatus: rec.freshnessStatus,
      macroRecord: rec,
    });
  }

  const kind = options.kindFilter ?? 'ALL';
  const dir = options.directionFilter ?? 'ALL';
  const sym = options.symbolFilter?.trim().toUpperCase() || null;
  const query = options.query?.trim().toLowerCase() || '';

  const filtered = [...deduped.values()].filter((entry) => {
    if (kind !== 'ALL' && entry.entryType !== kind) return false;
    if (dir !== 'ALL' && entry.direction !== dir) return false;
    if (sym && !entry.relatedSymbols.includes(sym)) return false;
    if (query) {
      const hay = [
        entry.title,
        entry.summary ?? '',
        entry.source,
        entry.category,
        entry.relatedSymbols.join(' '),
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    const diff = timestampMs(b.publicationTimestamp) - timestampMs(a.publicationTimestamp);
    if (diff !== 0) return diff;
    const isoCmp = b.publicationTimestamp.localeCompare(a.publicationTimestamp);
    if (isoCmp !== 0) return isoCmp;
    return a.key.localeCompare(b.key);
  });

  if (typeof options.limit === 'number' && options.limit >= 0) {
    return filtered.slice(0, options.limit);
  }
  return filtered;
}

export function summarizeFundamentalFeed(
  records: FundamentalMacroRecord[],
  news: FundamentalNewsRecord[]
): FundamentalFeedSummary {
  const all = buildFundamentalFeedEntries(records, news);
  let bullishCount = 0;
  let bearishCount = 0;
  for (const item of all) {
    if (item.direction === 'BULLISH') bullishCount += 1;
    else if (item.direction === 'BEARISH') bearishCount += 1;
  }
  return {
    total: all.length,
    newsCount: news.length,
    macroCount: records.length,
    bullishCount,
    bearishCount,
    latestTimestamp: all[0]?.publicationTimestamp ?? null,
  };
}

export function parseFundamentalStreamPayload(rawJson: string): FundamentalStreamPayload | null {
  try {
    const parsed = JSON.parse(rawJson) as Partial<FundamentalStreamPayload> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.records) || !Array.isArray(parsed.news)) return null;
    return {
      status: parsed.status ?? (parsed.records.length > 0 || parsed.news.length > 0 ? 'HISTORICAL' : 'UNAVAILABLE'),
      asOf: parsed.asOf ?? null,
      records: parsed.records,
      news: parsed.news,
      serverTime: typeof parsed.serverTime === 'string' ? parsed.serverTime : undefined,
      changeKind: typeof parsed.changeKind === 'string' ? parsed.changeKind : undefined,
    };
  } catch {
    return null;
  }
}
