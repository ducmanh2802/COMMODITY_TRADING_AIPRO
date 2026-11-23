/**
 * Yahoo UNOFFICIAL intraday history persistence: M15 (15m/1mo) and H1 (60m/3mo) per mapped instrument, stored as
 * their own VENDOR_YAHOO datasets (timeframe M15 / H1), plus retention so at least the 20 most recent trading
 * sessions always survive. Opt-in (YAHOO_ENABLED), strictly sequential through the adapter's 1 req/s queue:
 * one request per instrument per timeframe.
 */
import type { InstrumentDefinition } from '../../src/shared/types/instrument.ts';
import type { MarketCandle } from '../../src/shared/types/market.ts';
import type { ICandleRepository } from '../storage/candleRepository.ts';
import { type PersistProviderCandles } from '../providers/syncPersistence.ts';
import { YAHOO_PROVIDER_ID, isYahooEnabled, type YahooIntradayTimeframe } from '../providers/yahooAdapter.ts';
import { YAHOO_HISTORY_CONTRACT_CODE } from './yahooHistory.ts';
import { MIN_RETAINED_SESSIONS, retentionCutoffMs } from './sessions/sessionOf.ts';

/** Calendar retention per intraday timeframe (never below MIN_RETAINED_SESSIONS distinct sessions). */
export const INTRADAY_RETENTION_DAYS: Readonly<Record<YahooIntradayTimeframe, number>> = { M15: 30, H1: 120 };
export const YAHOO_INTRADAY_TIMEFRAMES: readonly YahooIntradayTimeframe[] = ['M15', 'H1'];

export interface YahooIntradayAdapterLike {
  supports(instrument: InstrumentDefinition): boolean;
  getIntradayCandles(
    symbol: string,
    timeframe: YahooIntradayTimeframe
  ): Promise<{ candles: MarketCandle[]; status: string; reason?: string }>;
}

export interface YahooIntradayResult {
  symbol: string;
  timeframe: YahooIntradayTimeframe;
  status: 'PERSISTED' | 'UP_TO_DATE' | 'UNAVAILABLE' | 'FAILED' | 'SKIPPED';
  barsFetched: number;
  rowsWritten: number;
  pruned: number;
  message: string;
}

export async function syncYahooIntraday(deps: {
  adapter: YahooIntradayAdapterLike;
  repository: ICandleRepository;
  persist: PersistProviderCandles;
  providerName: string;
  instruments: InstrumentDefinition[];
  timeframes?: readonly YahooIntradayTimeframe[];
  now?: () => number;
}): Promise<{ enabled: boolean; results: YahooIntradayResult[]; requests: number; note: string }> {
  const note = `Yahoo Finance intraday history (M15 last ~1 month, H1 last ~3 months) is UNOFFICIAL, delayed, continuous front-month, NOT roll-adjusted; retention keeps >= ${MIN_RETAINED_SESSIONS} trading sessions.`;
  if (!isYahooEnabled()) {
    return { enabled: false, results: [], requests: 0, note: `Yahoo disabled (set YAHOO_ENABLED=true). ${note}` };
  }
  const now = deps.now ?? Date.now;
  const timeframes = deps.timeframes ?? YAHOO_INTRADAY_TIMEFRAMES;
  const results: YahooIntradayResult[] = [];
  let requests = 0;
  for (const inst of deps.instruments) {
    if (!deps.adapter.supports(inst)) continue;
    for (const timeframe of timeframes) {
      const base = { symbol: inst.exchangeSymbol, timeframe };
      try {
        requests += 1;
        const res = await deps.adapter.getIntradayCandles(inst.exchangeSymbol, timeframe);
        if (res.candles.length === 0) {
          results.push({ ...base, status: 'UNAVAILABLE', barsFetched: 0, rowsWritten: 0, pruned: 0, message: res.reason ?? 'No bars returned.' });
          continue;
        }
        // Do not re-insert bars that retention would delete right after (Yahoo ranges overshoot the window).
        const cutoff = retentionCutoffMs({
          barTimestampsMs: res.candles.map((c) => Date.parse(c.timestamp)),
          instrument: inst,
          nowMs: now(),
          keepDays: INTRADAY_RETENTION_DAYS[timeframe],
        });
        const toStore = cutoff === null ? res.candles : res.candles.filter((c) => Date.parse(c.timestamp) >= cutoff);
        const out = await deps.persist({
          providerId: YAHOO_PROVIDER_ID,
          providerName: deps.providerName,
          instrument: inst,
          timeframe,
          candles: toStore,
          verifiedPriceUnit: inst.specification.quotationUnit,
        });
        const pruned = await pruneIntraday(deps.repository, inst, timeframe, now());
        results.push({
          ...base,
          status: out.status === 'PERSISTED' ? 'PERSISTED' : out.status === 'NO_NEW_ROWS' ? 'UP_TO_DATE' : out.status === 'SKIPPED' ? 'SKIPPED' : 'FAILED',
          barsFetched: res.candles.length,
          rowsWritten: out.rowsWritten,
          pruned,
          message: out.message,
        });
      } catch (err) {
        results.push({ ...base, status: 'FAILED', barsFetched: 0, rowsWritten: 0, pruned: 0, message: err instanceof Error ? err.message : 'Unexpected error.' });
      }
    }
  }
  return { enabled: true, results, requests, note };
}

/** Applies the retention rule to one stored intraday series; returns the number of bars deleted. */
export async function pruneIntraday(
  repository: ICandleRepository,
  instrument: InstrumentDefinition,
  timeframe: YahooIntradayTimeframe,
  nowMs: number
): Promise<number> {
  const key = { instrumentId: instrument.id, contractCode: YAHOO_HISTORY_CONTRACT_CODE, timeframe };
  const { rows } = await repository.queryCandles(key);
  const cutoff = retentionCutoffMs({
    barTimestampsMs: rows.map((r) => r.timestampMs),
    instrument,
    nowMs,
    keepDays: INTRADAY_RETENTION_DAYS[timeframe],
  });
  return cutoff === null ? 0 : repository.deleteCandlesBefore(key, cutoff);
}
