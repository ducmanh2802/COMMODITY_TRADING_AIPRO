/**
 * Yahoo UNOFFICIAL daily history persistence (T33).
 *
 * Backfills ~10y of D1 bars (first run) then refreshes only the recent window (incremental) into the
 * SQLite candle repository as the VENDOR_YAHOO series (continuous front-month, NOT roll-adjusted, not a
 * specific contract month). Active only with YAHOO_ENABLED=true. All fetches go through the adapter's
 * 1 req/s queue; bars are validated by the adapter (validateCandleSeries). CSV imports (CONTINUOUS) keep
 * priority: engineCandles only falls back to this series when no CSV series exists.
 */
import type { InstrumentDefinition } from '../../src/shared/types/instrument.ts';
import type { MarketCandle } from '../../src/shared/types/market.ts';
import type { ICandleRepository } from '../storage/candleRepository.ts';
import { PROVIDER_CONTRACT_CODE, type PersistProviderCandles } from '../providers/syncPersistence.ts';
import { YAHOO_PROVIDER_ID, isYahooEnabled, type YahooHistoryRange } from '../providers/yahooAdapter.ts';

export const YAHOO_HISTORY_CONTRACT_CODE = PROVIDER_CONTRACT_CODE.YAHOO_UNOFFICIAL ?? 'VENDOR_YAHOO';
const DAY_MS = 86_400_000;

/** Smallest Yahoo range covering the gap since the last stored bar (plus margin); 10y when no history. */
export function pickYahooRange(lastTimestampMs: number | null, nowMs: number): YahooHistoryRange {
  if (lastTimestampMs === null) return '10y';
  const gapDays = (nowMs - lastTimestampMs) / DAY_MS;
  if (gapDays <= 20) return '1mo';
  if (gapDays <= 80) return '3mo';
  if (gapDays <= 170) return '6mo';
  if (gapDays <= 350) return '1y';
  if (gapDays <= 700) return '2y';
  return '10y';
}

export interface YahooHistoryAdapterLike {
  supports(instrument: InstrumentDefinition): boolean;
  getCandles(
    symbol: string,
    timeframe?: string,
    fromIso?: string,
    toIso?: string,
    options?: { range?: YahooHistoryRange }
  ): Promise<{ candles: MarketCandle[]; status: string; reason?: string }>;
}

export interface YahooHistoryResult {
  symbol: string;
  status: 'PERSISTED' | 'UP_TO_DATE' | 'UNAVAILABLE' | 'FAILED' | 'SKIPPED';
  range: YahooHistoryRange | null;
  barsFetched: number;
  rowsWritten: number;
  message: string;
}

export async function syncYahooHistory(deps: {
  adapter: YahooHistoryAdapterLike;
  repository: ICandleRepository;
  persist: PersistProviderCandles;
  providerName: string;
  instruments: InstrumentDefinition[];
  now?: () => number;
}): Promise<{ enabled: boolean; results: YahooHistoryResult[]; note: string }> {
  const note =
    'Yahoo Finance daily history is UNOFFICIAL (continuous front-month, NOT roll-adjusted, not a specific contract month); CSV imports take priority.';
  if (!isYahooEnabled()) {
    return { enabled: false, results: [], note: `Yahoo disabled (set YAHOO_ENABLED=true). ${note}` };
  }
  const now = deps.now ?? Date.now;
  const results: YahooHistoryResult[] = [];
  for (const inst of deps.instruments) {
    if (!deps.adapter.supports(inst)) continue;
    try {
      const datasets = await deps.repository.listDatasets({ instrumentId: inst.id });
      const lastMs = datasets
        .filter((d) => d.contractCode === YAHOO_HISTORY_CONTRACT_CODE && d.timeframe === 'D1')
        .map((d) => Date.parse(d.lastTimestamp))
        .filter((t) => Number.isFinite(t))
        .reduce<number | null>((m, t) => (m === null || t > m ? t : m), null);
      const range = pickYahooRange(lastMs, now());
      const res = await deps.adapter.getCandles(inst.exchangeSymbol, 'D1', undefined, undefined, { range });
      if (res.candles.length === 0) {
        results.push({ symbol: inst.exchangeSymbol, status: 'UNAVAILABLE', range, barsFetched: 0, rowsWritten: 0, message: res.reason ?? 'No bars returned.' });
        continue;
      }
      const out = await deps.persist({
        providerId: YAHOO_PROVIDER_ID,
        providerName: deps.providerName,
        instrument: inst,
        timeframe: 'D1',
        candles: res.candles,
        verifiedPriceUnit: inst.specification.quotationUnit,
      });
      results.push({
        symbol: inst.exchangeSymbol,
        status: out.status === 'PERSISTED' ? 'PERSISTED' : out.status === 'NO_NEW_ROWS' ? 'UP_TO_DATE' : out.status === 'SKIPPED' ? 'SKIPPED' : 'FAILED',
        range,
        barsFetched: res.candles.length,
        rowsWritten: out.rowsWritten,
        message: out.message,
      });
    } catch (err) {
      results.push({ symbol: inst.exchangeSymbol, status: 'FAILED', range: null, barsFetched: 0, rowsWritten: 0, message: err instanceof Error ? err.message : 'Unexpected error.' });
    }
  }
  return { enabled: true, results, note };
}
