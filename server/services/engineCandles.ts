import type { InstrumentDefinition, Timeframe } from '../../src/shared/types/instrument.ts';
import type { DataQualityStatus, MarketCandle } from '../../src/shared/types/market.ts';
import { CONTINUOUS_CONTRACT_CODE, type ICandleRepository } from '../storage/candleRepository.ts';
import { YAHOO_HISTORY_CONTRACT_CODE } from './yahooHistory.ts';
import { historicalCandleStore, type CandleDatasetMeta } from './candleStore.ts';

/**
 * Candle source for the owner's engines (technical, strategy, AI analyst, scanner, backtest).
 *
 * Primary: the persistent SQLite data layer (server/storage) — the CONTINUOUS series of the instrument
 * at the exact timeframe, imported via POST /api/data/import with provenance (checksum, source quality).
 * Fallback: the owner's in-memory HistoricalCandleStore (legacy POST /api/market/candles/import and
 * provider API sync), which also resamples from finer timeframes. Neither path fabricates bars; when
 * both are empty the result is UNAVAILABLE.
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

export async function loadEngineCandles(
  repository: ICandleRepository | null,
  instrument: InstrumentDefinition,
  timeframe: Timeframe
): Promise<EngineCandleResult> {
  if (repository) {
    const key = { instrumentId: instrument.id, contractCode: CONTINUOUS_CONTRACT_CODE, timeframe };
    let contractCode: string = CONTINUOUS_CONTRACT_CODE;
    let { rows } = await repository.queryCandles(key, { limit: ENGINE_CANDLE_LIMIT });
    if (rows.length === 0 && timeframe === 'D1') {
      // CSV (CONTINUOUS) is canonical; only when none exists fall back to persisted Yahoo UNOFFICIAL history.
      contractCode = YAHOO_HISTORY_CONTRACT_CODE;
      ({ rows } = await repository.queryCandles({ ...key, contractCode }, { limit: ENGINE_CANDLE_LIMIT }));
    }
    if (rows.length > 0) {
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
      const latestImport = datasets.map((d) => d.importedAt).sort().at(-1) ?? candles[candles.length - 1].retrievedAt;
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
          warnings: contractCode === YAHOO_HISTORY_CONTRACT_CODE
            ? ['UNOFFICIAL Yahoo continuous front-month history, NOT roll-adjusted (roll gaps present), not a specific contract month; import CSV for canonical data.']
            : datasets.some((d) => d.continuousAdjustment === 'UNADJUSTED')
            ? ['CONTINUOUS series is UNADJUSTED: roll gaps are present in the price history.']
            : [],
        },
      };
    }
  }

  const memory = historicalCandleStore.getCandles(instrument.exchangeSymbol, timeframe);
  return { ...memory, origin: memory.candles.length > 0 ? 'MEMORY' : 'NONE' };
}
