import type { Timeframe } from '../../src/shared/types/instrument.ts';
import type { DataQualityStatus, MarketCandle, MarketQuote } from '../../src/shared/types/market.ts';
import { createUnavailableQuote } from '../../src/shared/utils/validation.ts';
import { resampleCandles } from './csvImporter.ts';

export interface CandleDatasetMeta {
  symbol: string;
  exchange: string;
  timeframe: Timeframe;
  barCount: number;
  earliestTimestamp: string;
  latestTimestamp: string;
  importedAt: string;
  source: string;
  status: DataQualityStatus;
  warnings: string[];
}

const TIMEFRAME_ORDER: Timeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'];

export class HistoricalCandleStore {
  private readonly datasets = new Map<string, { meta: CandleDatasetMeta; candles: MarketCandle[] }>();

  private key(symbol: string, timeframe: Timeframe): string {
    return `${symbol.trim().toUpperCase()}::${timeframe}`;
  }

  save(symbol: string, timeframe: Timeframe, candles: MarketCandle[], warnings: string[] = []): CandleDatasetMeta {
    const first = candles[0];
    const last = candles[candles.length - 1];
    const meta: CandleDatasetMeta = {
      symbol: symbol.trim().toUpperCase(),
      exchange: first.exchange,
      timeframe,
      barCount: candles.length,
      earliestTimestamp: first.timestamp,
      latestTimestamp: last.timestamp,
      importedAt: new Date().toISOString(),
      source: first.source,
      status: first.status,
      warnings,
    };
    this.datasets.set(this.key(symbol, timeframe), { meta, candles });
    return meta;
  }

  getCandles(symbol: string, timeframe: Timeframe): {
    candles: MarketCandle[];
    status: DataQualityStatus;
    meta: CandleDatasetMeta | null;
    reason?: string;
  } {
    const upper = symbol.trim().toUpperCase();
    const direct = this.datasets.get(this.key(upper, timeframe));
    if (direct) {
      return {
        candles: direct.candles,
        status: direct.meta.status,
        meta: direct.meta,
      };
    }

    // Attempt deterministic upward resampling from a finer imported timeframe
    const targetIdx = TIMEFRAME_ORDER.indexOf(timeframe);
    for (let i = targetIdx - 1; i >= 0; i--) {
      const finerTf = TIMEFRAME_ORDER[i];
      const finer = this.datasets.get(this.key(upper, finerTf));
      if (finer && finer.candles.length > 0) {
        const resampled = resampleCandles(finer.candles, finerTf, timeframe);
        if (resampled.length > 0) {
          return {
            candles: resampled,
            status: finer.meta.status,
            meta: {
              ...finer.meta,
              timeframe,
              barCount: resampled.length,
              earliestTimestamp: resampled[0].timestamp,
              latestTimestamp: resampled[resampled.length - 1].timestamp,
            },
          };
        }
      }
    }

    return {
      candles: [],
      status: 'UNAVAILABLE',
      meta: null,
      reason: `DATA_UNAVAILABLE — No validated OHLCV candles imported for ${upper} (${timeframe}).`,
    };
  }

  getLatestHistoricalQuote(symbol: string, currency: string, unit: string, exchange: string): MarketQuote {
    const upper = symbol.trim().toUpperCase();
    // Pick the finest available timeframe for the symbol
    for (const tf of TIMEFRAME_ORDER) {
      const entry = this.datasets.get(this.key(upper, tf));
      if (entry && entry.candles.length > 0) {
        const last = entry.candles[entry.candles.length - 1];
        return {
          symbol: upper,
          exchange,
          contractMonth: null,
          price: last.close,
          bid: null,
          ask: null,
          volume: last.volume,
          openInterest: last.openInterest,
          currency,
          unit,
          source: last.source,
          timestamp: last.timestamp,
          retrievedAt: last.retrievedAt,
          status: 'HISTORICAL',
          statusReason: `Last close from imported ${tf} CSV dataset (not a live feed).`,
        };
      }
    }

    return createUnavailableQuote({
      symbol: upper,
      exchange,
      contractMonth: null,
      currency,
      unit,
      source: 'NONE',
      reason: 'DATA_UNAVAILABLE — No live provider or imported historical CSV data.',
    });
  }

  listSummaries(): CandleDatasetMeta[] {
    return Array.from(this.datasets.values()).map((d) => d.meta);
  }

  clearAll(): void {
    this.datasets.clear();
  }
}

export const historicalCandleStore = new HistoricalCandleStore();
