/**
 * Yahoo UNOFFICIAL daily history persistence (T33).
 *
 * Backfills ~10y of D1 bars (first run) then refreshes only the recent window (incremental) into the
 * SQLite candle repository as the VENDOR_YAHOO series (continuous front-month, NOT roll-adjusted, not a
 * specific contract month). Active only with YAHOO_ENABLED=true. All fetches go through the adapter's
 * 1 req/s queue; bars are validated by the adapter (validateCandleSeries). CSV imports (CONTINUOUS) keep
 * priority: engineCandles only falls back to this series when no CSV series exists.
 */
import type { InstrumentDefinition, Timeframe } from '../../src/shared/types/instrument.ts';
import type { MarketCandle } from '../../src/shared/types/market.ts';
import type { ICandleRepository } from '../storage/candleRepository.ts';
import { PROVIDER_CONTRACT_CODE, type PersistProviderCandles } from '../providers/syncPersistence.ts';
import { YAHOO_PROVIDER_ID, isYahooEnabled, type YahooHistoryRange } from '../providers/yahooAdapter.ts';

export const YAHOO_HISTORY_CONTRACT_CODE = PROVIDER_CONTRACT_CODE.YAHOO_UNOFFICIAL ?? 'VENDOR_YAHOO';
const DAY_MS = 86_400_000;
/** Symbols whose 10y backfill was already tried in this process (avoids refetching 10y every run). */
const backfillAttempted = new Set<string>();

/** Smallest Yahoo range covering the gap since the last stored bar (plus margin); 10y when no history. */
export function pickYahooRange(
  lastTimestampMs: number | null,
  nowMs: number,
  /** Earliest stored bar; when it is newer than ~9y and 10y was not yet attempted, backfill 10y. */
  opts: { firstTimestampMs?: number | null; backfillAttempted?: boolean } = {}
): YahooHistoryRange {
  if (lastTimestampMs === null) return '10y';
  if (
    !opts.backfillAttempted &&
    typeof opts.firstTimestampMs === 'number' &&
    nowMs - opts.firstTimestampMs < 9 * 365 * DAY_MS
  ) {
    return '10y'; // e.g. a 2y provider sync stored the series first; extend it back once per process
  }
  const gapDays = (nowMs - lastTimestampMs) / DAY_MS;
  if (gapDays <= 20) return '1mo';
  if (gapDays <= 80) return '3mo';
  if (gapDays <= 170) return '6mo';
  if (gapDays <= 350) return '1y';
  if (gapDays <= 700) return '2y';
  return '10y';
}

/** Range for intraday (H1) history sync: 3mo initial backfill (Yahoo max ~730d / ~1800+ H1 bars cleanly via 3mo), 1mo incremental. */
export function pickYahooIntradayRange(lastTimestampMs: number | null, nowMs: number): YahooHistoryRange {
  if (lastTimestampMs === null) return '3mo';
  const gapDays = (nowMs - lastTimestampMs) / DAY_MS;
  return gapDays <= 25 ? '1mo' : '3mo';
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
  timeframe?: Timeframe;
  status: 'PERSISTED' | 'UP_TO_DATE' | 'UNAVAILABLE' | 'FAILED' | 'SKIPPED';
  range: YahooHistoryRange | null;
  barsFetched: number;
  rowsWritten: number;
  message: string;
}

export async function syncYahooHistory(
  deps: {
    adapter: YahooHistoryAdapterLike;
    repository: ICandleRepository;
    persist: PersistProviderCandles;
    providerName: string;
    instruments: InstrumentDefinition[];
    now?: () => number;
  },
  options: { timeframes?: Array<'D1' | 'H1'> } = {}
): Promise<{ enabled: boolean; results: YahooHistoryResult[]; note: string }> {
  const note =
    'Yahoo Finance history is UNOFFICIAL (continuous front-month, NOT roll-adjusted, not a specific contract month); CSV imports take priority.';
  if (!isYahooEnabled()) {
    return { enabled: false, results: [], note: `Yahoo disabled (set YAHOO_ENABLED=true). ${note}` };
  }
  const timeframes: Array<'D1' | 'H1'> = options.timeframes && options.timeframes.length > 0 ? options.timeframes : ['D1'];
  const now = deps.now ?? Date.now;
  const results: YahooHistoryResult[] = [];
  for (const tf of timeframes) {
    for (const inst of deps.instruments) {
      if (!deps.adapter.supports(inst)) continue;
      try {
        const datasets = await deps.repository.listDatasets({ instrumentId: inst.id });
        const matching = datasets.filter((d) => d.contractCode === YAHOO_HISTORY_CONTRACT_CODE && d.timeframe === tf);
        const lastMs = matching
          .map((d) => Date.parse(d.lastTimestamp))
          .filter((t) => Number.isFinite(t))
          .reduce<number | null>((m, t) => (m === null || t > m ? t : m), null);
        const firstMs = matching
          .map((d) => Date.parse(d.firstTimestamp))
          .filter((t) => Number.isFinite(t))
          .reduce<number | null>((m, t) => (m === null || t < m ? t : m), null);

        const range =
          tf === 'D1'
            ? pickYahooRange(lastMs, now(), { firstTimestampMs: firstMs, backfillAttempted: backfillAttempted.has(inst.id) })
            : pickYahooIntradayRange(lastMs, now());
        if (tf === 'D1' && range === '10y') backfillAttempted.add(inst.id);

        const res = await deps.adapter.getCandles(inst.exchangeSymbol, tf, undefined, undefined, { range });
        if (res.candles.length === 0) {
          results.push({
            symbol: inst.exchangeSymbol,
            timeframe: tf,
            status: 'UNAVAILABLE',
            range,
            barsFetched: 0,
            rowsWritten: 0,
            message: res.reason ?? 'No bars returned.',
          });
          continue;
        }
        const out = await deps.persist({
          providerId: YAHOO_PROVIDER_ID,
          providerName: deps.providerName,
          instrument: inst,
          timeframe: tf,
          candles: res.candles,
          verifiedPriceUnit: inst.specification.quotationUnit,
        });
        results.push({
          symbol: inst.exchangeSymbol,
          timeframe: tf,
          status:
            out.status === 'PERSISTED'
              ? 'PERSISTED'
              : out.status === 'NO_NEW_ROWS'
                ? 'UP_TO_DATE'
                : out.status === 'SKIPPED'
                  ? 'SKIPPED'
                  : 'FAILED',
          range,
          barsFetched: res.candles.length,
          rowsWritten: out.rowsWritten,
          message: out.message,
        });
      } catch (err) {
        results.push({
          symbol: inst.exchangeSymbol,
          timeframe: tf,
          status: 'FAILED',
          range: null,
          barsFetched: 0,
          rowsWritten: 0,
          message: err instanceof Error ? err.message : 'Unexpected error.',
        });
      }
    }
  }
  return { enabled: true, results, note };
}
