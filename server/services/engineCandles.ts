import type { InstrumentDefinition, Timeframe } from '../../src/shared/types/instrument.ts';
import type { DataQualityStatus, MarketCandle } from '../../src/shared/types/market.ts';
import { resampleDailyToWeeklyAndMonthly } from '../engines/historicalDataEngine.ts';
import { CONTINUOUS_CONTRACT_CODE, type DatasetRecord, type ICandleRepository } from '../storage/candleRepository.ts';
import { resampleCandles } from './csvImporter.ts';
import { YAHOO_HISTORY_CONTRACT_CODE } from './yahooHistory.ts';
import { historicalCandleStore, type CandleDatasetMeta } from './candleStore.ts';

/**
 * Candle source for the owner's engines (technical, strategy, AI analyst, scanner, backtest).
 *
 * Primary: the persistent SQLite data layer (server/storage) — CONTINUOUS first, then persisted VENDOR_YAHOO
 * history, checking the exact requested timeframe first and otherwise deterministically resampling upward
 * from a finer stored series (e.g. D1 → W1, H1 → H4) with provenance & no look-ahead bias.
 * Fallback: the owner's in-memory HistoricalCandleStore. Neither path fabricates bars; when both are empty
 * the result is UNAVAILABLE.
 */
export interface EngineCandleResult {
  candles: MarketCandle[];
  status: DataQualityStatus;
  meta: CandleDatasetMeta | null;
  reason?: string;
  origin: 'SQLITE' | 'MEMORY' | 'NONE';
}

/** Most recent bars handed to the engines (indicator warm-up needs at most a few hundred). */
export const ENGINE_CANDLE_LIMIT = 5000;

const RESAMPLE_SOURCES: Partial<Record<Timeframe, Timeframe[]>> = {
  W1: ['D1', 'H4', 'H1', 'M30', 'M15', 'M5'],
  H4: ['H1', 'M30', 'M15', 'M5'],
  H1: ['M30', 'M15', 'M5'],
  M30: ['M15', 'M5'],
  M15: ['M5', 'M1'],
  M5: ['M1'],
};

async function readSqliteExactSeries(
  repository: ICandleRepository,
  instrument: InstrumentDefinition,
  timeframe: Timeframe
): Promise<{ candles: MarketCandle[]; contractCode: string; datasets: DatasetRecord[] } | null> {
  const key = { instrumentId: instrument.id, contractCode: CONTINUOUS_CONTRACT_CODE, timeframe };
  let contractCode: string = CONTINUOUS_CONTRACT_CODE;
  let { rows } = await repository.queryCandles(key, { limit: ENGINE_CANDLE_LIMIT });
  if (rows.length === 0) {
    // CSV (CONTINUOUS) is canonical; only when none exists fall back to persisted Yahoo UNOFFICIAL history.
    contractCode = YAHOO_HISTORY_CONTRACT_CODE;
    ({ rows } = await repository.queryCandles({ ...key, contractCode }, { limit: ENGINE_CANDLE_LIMIT }));
  }
  if (rows.length === 0) return null;

  const datasets = (await repository.listDatasets({ instrumentId: instrument.id })).filter(
    (d) => d.contractCode === contractCode && d.timeframe === timeframe
  );
  const byId = new Map(datasets.map((d) => [d.id, d]));
  const candles: MarketCandle[] = rows.map((row) => {
    const ds = byId.get(row.datasetId);
    return {
      symbol: instrument.exchangeSymbol,
      exchange: instrument.exchange,
      timeframe,
      timestamp: new Date(row.timestampMs).toISOString(),
      retrievedAt: ds?.importedAt ?? new Date(row.timestampMs).toISOString(),
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
      openInterest: row.openInterest,
      isComplete: true,
      source: ds ? `${ds.sourceLabel} (${ds.sourceQuality})` : 'CSV_HISTORICAL',
      status: 'HISTORICAL',
    };
  });
  return { candles, contractCode, datasets };
}

function buildSqliteResult(
  instrument: InstrumentDefinition,
  timeframe: Timeframe,
  candles: MarketCandle[],
  contractCode: string,
  datasets: DatasetRecord[],
  extraWarnings: string[] = []
): EngineCandleResult {
  const latestImport = datasets.map((d) => d.importedAt).sort().at(-1) ?? candles[candles.length - 1].retrievedAt;
  const warnings = [
    ...(contractCode === YAHOO_HISTORY_CONTRACT_CODE
      ? [
          'UNOFFICIAL Yahoo continuous front-month history, NOT roll-adjusted (roll gaps present), not a specific contract month; import CSV for canonical data.',
        ]
      : datasets.some((d) => d.continuousAdjustment === 'UNADJUSTED')
        ? ['CONTINUOUS series is UNADJUSTED: roll gaps are present in the price history.']
        : []),
    ...extraWarnings,
  ];
  return {
    candles,
    status: 'HISTORICAL',
    origin: 'SQLITE',
    meta: {
      symbol: instrument.exchangeSymbol,
      exchange: instrument.exchange,
      timeframe,
      barCount: candles.length,
      earliestTimestamp: candles[0].timestamp,
      latestTimestamp: candles[candles.length - 1].timestamp,
      importedAt: latestImport,
      source: [...new Set(candles.map((c) => c.source))].join(', '),
      status: 'HISTORICAL',
      warnings,
    },
  };
}

export async function loadEngineCandles(
  repository: ICandleRepository | null,
  instrument: InstrumentDefinition,
  timeframe: Timeframe
): Promise<EngineCandleResult> {
  if (repository) {
    const exact = await readSqliteExactSeries(repository, instrument, timeframe);
    if (exact) {
      return buildSqliteResult(instrument, timeframe, exact.candles, exact.contractCode, exact.datasets);
    }

    const candidates = RESAMPLE_SOURCES[timeframe] ?? [];
    for (const srcTf of candidates) {
      const finer = await readSqliteExactSeries(repository, instrument, srcTf);
      if (!finer || finer.candles.length === 0) continue;

      let resampled: MarketCandle[];
      if (timeframe === 'W1' && srcTf === 'D1') {
        const retrievedAt = finer.candles[finer.candles.length - 1].retrievedAt;
        resampled = resampleDailyToWeeklyAndMonthly(finer.candles).weekly.map((w) => ({
          symbol: instrument.exchangeSymbol,
          exchange: instrument.exchange,
          timeframe: 'W1',
          timestamp: w.timestamp,
          retrievedAt,
          open: w.open,
          high: w.high,
          low: w.low,
          close: w.close,
          volume: w.volume,
          openInterest: w.openInterest,
          isComplete: true,
          source: w.source,
          status: 'HISTORICAL',
        }));
      } else {
        resampled = resampleCandles(finer.candles, srcTf, timeframe);
      }

      if (resampled.length > 0) {
        return buildSqliteResult(instrument, timeframe, resampled, finer.contractCode, finer.datasets, [
          `Resampled deterministically from stored ${srcTf} candles without look-ahead bias.`,
        ]);
      }
    }
  }

  const memory = historicalCandleStore.getCandles(instrument.exchangeSymbol, timeframe);
  return { ...memory, origin: memory.candles.length > 0 ? 'MEMORY' : 'NONE' };
}
