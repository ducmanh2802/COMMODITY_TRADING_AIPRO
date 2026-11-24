/**
 * T95: futures chain rows (price, change, volume) per contract month.
 * Prices come from the cached Yahoo curve (T47); volume and previous close come from one Yahoo chart request
 * per month (daily bars, cached ~15 min). Open interest is NOT served by any free source integrated here, so
 * it is always null (never estimated). UNOFFICIAL, delayed.
 */
import type { InstrumentDefinition } from '../../src/shared/types/instrument.ts';
import {
  YAHOO_CHART_BASE,
  YAHOO_USER_AGENT,
  YahooFinanceAdapter,
  applyUnitFactor,
  yahooUnitConversion,
  type FetchLike,
} from '../providers/yahooAdapter.ts';
import { getYahooCurve, YAHOO_CURVE_LABEL, YAHOO_CURVE_TTL_MS, type YahooCurveDeps } from './yahooCurve.ts';

interface FuturesChainRow {
  contract: string;
  yahooSymbol: string;
  lastTradingDay: string;
  price: number;
  /** price minus previous daily close (same unit), null if no previous bar. */
  change: number | null;
  /** Volume of the bar on the valuation date, null when Yahoo did not report it. */
  volume: number | null;
  openInterest: number | null;
  asOf: string;
  source: string;
}

export type FuturesChainResponse =
  | {
      status: 'OK' | 'PARTIAL';
      instrumentId: string;
      source: string;
      unit: string;
      valuationDate: string | null;
      rows: FuturesChainRow[];
      notes: string[];
      fetchedAt: string;
    }
  | { status: 'UNAVAILABLE'; instrumentId: string; source: string; reason: string; fetchedAt: string };

interface ChartBars {
  timestamps: Array<number | null>;
  closes: Array<number | null>;
  volumes: Array<number | null>;
}

/** Pure: pick change + volume for the bar on `asOf` (ISO) from daily chart arrays. Exported for tests. */
export function pickBarStats(bars: ChartBars, asOfIso: string, factor: number): { change: number | null; volume: number | null } {
  const day = asOfIso.slice(0, 10);
  let idx = -1;
  for (let i = bars.timestamps.length - 1; i >= 0; i--) {
    const t = bars.timestamps[i];
    const c = bars.closes[i];
    if (typeof t === 'number' && typeof c === 'number' && new Date(t * 1000).toISOString().slice(0, 10) === day) {
      idx = i;
      break;
    }
  }
  if (idx < 0) return { change: null, volume: null };
  const v = bars.volumes[idx];
  const volume = typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
  let prev: number | null = null;
  for (let i = idx - 1; i >= 0; i--) {
    const c = bars.closes[i];
    if (typeof c === 'number' && c > 0) {
      prev = c;
      break;
    }
  }
  const cur = bars.closes[idx] as number;
  const change = prev === null ? null : applyUnitFactor(cur, factor) - applyUnitFactor(prev, factor);
  return { change, volume };
}

const cache = new Map<string, { at: number; value: FuturesChainResponse }>();

export async function getFuturesChain(
  instrument: InstrumentDefinition,
  count: number,
  calendarStatus: 'VERIFIED' | 'UNVERIFIED',
  deps: YahooCurveDeps = {}
): Promise<FuturesChainResponse> {
  const now = deps.now ?? Date.now;
  const key = `${instrument.id}|${count}`;
  const hit = cache.get(key);
  if (hit && now() - hit.at < YAHOO_CURVE_TTL_MS) return hit.value;
  const fetchedAt = new Date(now()).toISOString();
  const curve = await getYahooCurve(instrument, count, calendarStatus, deps);
  if (curve.status === 'UNAVAILABLE') {
    return { status: 'UNAVAILABLE', instrumentId: instrument.id, source: curve.source, reason: curve.reason, fetchedAt };
  }
  const mapping = YahooFinanceAdapter.mappingFor(instrument.exchangeSymbol);
  const conv = mapping ? yahooUnitConversion(mapping.expectedCurrency, instrument.specification.quotationUnit) : null;
  const factor = conv && conv.ok ? conv.factor : 1;
  const fetchFn: FetchLike = deps.fetchFn ?? fetch;
  const headers = { 'User-Agent': YAHOO_USER_AGENT, Accept: 'application/json' };

  const rows: FuturesChainRow[] = await Promise.all(
    curve.contracts.map(async (c): Promise<FuturesChainRow> => {
      let change: number | null = null;
      let volume: number | null = null;
      try {
        const res = await fetchFn(`${YAHOO_CHART_BASE}${encodeURIComponent(c.yahooSymbol)}?range=5d&interval=1d`, {
          headers,
          signal: AbortSignal.timeout(deps.timeoutMs ?? 10_000),
        });
        if (res.ok) {
          const body = (await res.json()) as {
            chart?: {
              result?: {
                timestamp?: Array<number | null>;
                indicators?: { quote?: { close?: Array<number | null>; volume?: Array<number | null> }[] };
              }[];
            };
          };
          const r = body.chart?.result?.[0];
          const q = r?.indicators?.quote?.[0];
          ({ change, volume } = pickBarStats(
            { timestamps: r?.timestamp ?? [], closes: q?.close ?? [], volumes: q?.volume ?? [] },
            c.asOf,
            factor
          ));
        }
      } catch {
        /* leave change/volume null: shown as an em dash */
      }
      return {
        contract: c.contract,
        yahooSymbol: c.yahooSymbol,
        lastTradingDay: c.lastTradingDay,
        price: c.price,
        change,
        volume,
        openInterest: null,
        asOf: c.asOf,
        source: YAHOO_CURVE_LABEL,
      };
    })
  );
  const value: FuturesChainResponse = {
    status: curve.status,
    instrumentId: instrument.id,
    source: YAHOO_CURVE_LABEL,
    unit: curve.unit,
    valuationDate: curve.valuationDate,
    rows,
    notes: [
      'Volume = daily volume of the last bar as reported by Yahoo (UNOFFICIAL, delayed); a missing value is shown as an em dash, never estimated.',
      'Open interest is not available from any free source integrated in this app.',
    ],
    fetchedAt,
  };
  cache.set(key, { at: now(), value });
  return value;
}
