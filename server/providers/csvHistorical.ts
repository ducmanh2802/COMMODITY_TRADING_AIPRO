import type {
  DataQualityStatus,
  MarketCandle,
  MarketDataProvider,
  MarketQuote,
  ProviderHealth,
  ProviderId,
} from '../../src/shared/types/market.ts';
import { createUnavailableQuote } from '../../src/shared/utils/validation.ts';
import type { ICandleRepository, StoredCandleRow } from '../storage/candleRepository.ts';
import type { UnconfiguredProviderConfig } from './base.ts';

const CSV_SERIES_SYMBOL_SEPARATOR = '@';

/**
 * Historical CSV provider backed by the candle repository.
 * - Health is CONNECTED / HISTORICAL only when at least one dataset has been imported.
 * - Never produces live quotes: a historical close is not a live price (getQuote fails closed).
 * - getCandles symbol format: `<instrumentId>@<contractCode>` (e.g. `CBOT:ZC@ZCH27`, `CBOT:ZC@CONTINUOUS`).
 */
export class CsvHistoricalProvider implements MarketDataProvider {
  public readonly providerId: ProviderId;
  public readonly providerName: string;
  private readonly exchanges: string[];

  constructor(
    config: UnconfiguredProviderConfig,
    private readonly repository: ICandleRepository
  ) {
    this.providerId = config.providerId;
    this.providerName = config.providerName;
    this.exchanges = [...config.exchanges];
  }

  async getInstruments(): Promise<string[]> {
    const datasets = await this.repository.listDatasets();
    return [...new Set(datasets.map((d) => d.instrumentId))].sort();
  }

  async getQuote(symbol: string): Promise<MarketQuote> {
    return createUnavailableQuote({
      symbol,
      exchange: 'UNKNOWN',
      contractMonth: null,
      currency: 'USD',
      unit: 'UNSPECIFIED',
      source: this.providerId,
      reason: 'DATA_UNAVAILABLE — CSV_HISTORICAL serves historical bars only; a historical close is not a live quote.',
    });
  }

  async getCandles(
    symbol: string,
    timeframe: string,
    fromIso: string,
    toIso: string
  ): Promise<{ candles: MarketCandle[]; status: DataQualityStatus; reason?: string }> {
    const sep = symbol.indexOf(CSV_SERIES_SYMBOL_SEPARATOR);
    if (sep <= 0 || sep === symbol.length - 1) {
      return {
        candles: [],
        status: 'UNAVAILABLE',
        reason: `DATA_UNAVAILABLE — symbol must be "<instrumentId>${CSV_SERIES_SYMBOL_SEPARATOR}<contractCode>".`,
      };
    }
    const instrumentId = symbol.slice(0, sep);
    const contractCode = symbol.slice(sep + 1).toUpperCase();
    const fromMs = fromIso ? Date.parse(fromIso) : undefined;
    const toMs = toIso ? Date.parse(toIso) : undefined;
    if ((fromMs !== undefined && Number.isNaN(fromMs)) || (toMs !== undefined && Number.isNaN(toMs))) {
      return { candles: [], status: 'UNAVAILABLE', reason: 'DATA_UNAVAILABLE — invalid from/to timestamp.' };
    }
    const { rows } = await this.repository.queryCandles({ instrumentId, contractCode, timeframe }, { fromMs, toMs });
    if (rows.length === 0) {
      return {
        candles: [],
        status: 'UNAVAILABLE',
        reason: 'DATA_UNAVAILABLE — no imported candles for this series and range.',
      };
    }
    const datasets = new Map<string, string>();
    for (const id of new Set(rows.map((r) => r.datasetId))) {
      const d = await this.repository.getDataset(id);
      if (d) datasets.set(id, d.importedAt);
    }
    const exchange = instrumentId.includes(':') ? instrumentId.split(':')[0] : 'UNKNOWN';
    return {
      candles: rows.map((r) =>
        storedRowToMarketCandle(r, {
          symbol: `${instrumentId}${CSV_SERIES_SYMBOL_SEPARATOR}${contractCode}`,
          exchange,
          timeframe,
          retrievedAt: datasets.get(r.datasetId) ?? '',
        })
      ),
      status: 'HISTORICAL',
    };
  }

  async getVolume(): Promise<{ volume: number | null; timestamp: string | null; status: DataQualityStatus }> {
    return { volume: null, timestamp: null, status: 'UNAVAILABLE' };
  }

  async getOpenInterest(): Promise<{ openInterest: number | null; timestamp: string | null; status: DataQualityStatus }> {
    return { openInterest: null, timestamp: null, status: 'UNAVAILABLE' };
  }

  async getContractSpecification(): Promise<Record<string, unknown> | null> {
    return null;
  }

  async getProviderStatus(): Promise<ProviderHealth> {
    const base = {
      providerId: this.providerId,
      name: this.providerName,
      exchanges: [...this.exchanges],
      credentialsConfigured: false,
      supportsRealtime: false,
      supportsHistorical: true,
      lastCheckedAt: new Date().toISOString(),
    };
    try {
      const summary = await this.repository.getSummary();
      if (summary.datasetCount === 0) {
        return {
          ...base,
          connectionState: 'UNCONFIGURED',
          dataStatus: 'UNAVAILABLE',
          lastSuccessfulSyncAt: null,
          message: 'No historical CSV datasets imported yet. Use POST /api/data/import.',
        };
      }
      return {
        ...base,
        connectionState: 'CONNECTED',
        dataStatus: 'HISTORICAL',
        lastSuccessfulSyncAt: summary.lastImportedAt,
        message: `${summary.datasetCount} dataset(s), ${summary.candleCount} candle(s) imported; latest bar ${summary.lastCandleTimestamp ?? 'n/a'}. Historical data only — not a live feed.`,
      };
    } catch {
      return {
        ...base,
        connectionState: 'ERROR',
        dataStatus: 'UNAVAILABLE',
        lastSuccessfulSyncAt: null,
        message: 'Historical data store could not be read.',
      };
    }
  }
}

export function storedRowToMarketCandle(
  row: StoredCandleRow,
  ctx: { symbol: string; exchange: string; timeframe: string; retrievedAt: string }
): MarketCandle {
  return {
    symbol: ctx.symbol,
    exchange: ctx.exchange,
    timeframe: ctx.timeframe,
    timestamp: new Date(row.timestampMs).toISOString(),
    retrievedAt: ctx.retrievedAt,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume,
    openInterest: row.openInterest,
    isComplete: true,
    source: 'CSV_HISTORICAL',
    status: 'HISTORICAL',
  };
}
