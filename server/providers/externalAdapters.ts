import type { InstrumentDefinition, Timeframe } from '../../src/shared/types/instrument.ts';
import type {
  DataQualityStatus,
  MarketCandle,
  MarketDataProvider,
  MarketQuote,
  ProviderConnectionState,
  ProviderHealth,
  ProviderId,
} from '../../src/shared/types/market.ts';
import { FRED_BENCHMARK_DEFS, buildBenchmarkQuote, parseFredCsv } from './fredBenchmarks.ts';
import { evaluateDataFreshness } from '../../src/shared/utils/time.ts';
import type { PersistOutcome, PersistProviderCandles } from './syncPersistence.ts';
import {
  createUnavailableQuote,
  validateCandleSeries,
  validateMarketQuote,
} from '../../src/shared/utils/validation.ts';
import { historicalCandleStore } from '../services/candleStore.ts';
import { fundamentalStore, sanitizeExternalText } from '../services/fundamentalService.ts';
import { instrumentRepository } from '../services/instrumentRegistry.ts';
import { isYahooEnabled, type YahooFinanceAdapter, type YahooHistoryRange } from './yahooAdapter.ts';

export type FetchLike = typeof fetch;

function envPresent(name: string): boolean {
  const val = process.env[name];
  return typeof val === 'string' && val.trim().length > 0;
}

/**
 * Strict numeric parse for provider payloads: only finite numbers and non-empty numeric strings.
 * `Number(null)` and `Number('')` are 0 and would silently fabricate a zero value, so they map to null.
 */
function strictNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string' || v.trim() === '') return null;
  const n = Number(v.trim());
  return Number.isFinite(n) ? n : null;
}

function getEnvTrimmed(name: string): string {
  return (process.env[name] ?? '').trim();
}

function normalizeDateToUtcIso(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Date-only format YYYY-MM-DD -> UTC midnight
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T00:00:00.000Z`;
  }
  // Twelve Data style "YYYY-MM-DD HH:mm:ss" -> treat as UTC ISO
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    const withSec = trimmed.length === 16 ? `${trimmed}:00` : trimmed;
    return `${withSec.replace(' ', 'T')}Z`;
  }
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

const TWELVE_DATA_INTERVALS: Record<Timeframe, string> = {
  M1: '1min',
  M5: '5min',
  M15: '15min',
  M30: '30min',
  H1: '1h',
  H4: '4h',
  D1: '1day',
  W1: '1week',
};

export interface SyncProviderOutcome {
  providerId: ProviderId;
  providerName: string;
  status: ProviderConnectionState;
  candlesSynced: number;
  macroSynced: number;
  symbolsUpdated: string[];
  message: string;
  error?: string;
}

/**
 * 1. Twelve Data Real-Time & Intraday Commodity Adapter (TWELVEDATA_API_KEY)
 */
export class TwelveDataAdapter implements MarketDataProvider {
  public readonly providerId: ProviderId = 'TWELVE_DATA';
  public readonly providerName = 'Twelve Data (Real-Time Metals, Energy & Futures)';
  private readonly fetchFn: FetchLike;
  private lastSyncAt: string | null = null;
  private lastError: string | null = null;

  constructor(fetchFn: FetchLike = globalThis.fetch) {
    this.fetchFn = fetchFn;
  }

  private getApiKey(): string {
    return getEnvTrimmed('TWELVEDATA_API_KEY');
  }

  async getInstruments(): Promise<string[]> {
    const all = await instrumentRepository.list();
    return all
      .filter((i) => Boolean(i.providerMappings?.twelveDataSymbol))
      .map((i) => i.exchangeSymbol);
  }

  async getQuote(symbol: string): Promise<MarketQuote> {
    const apiKey = this.getApiKey();
    const inst = await instrumentRepository.findBySymbol(symbol);
    const tdSymbol = inst?.providerMappings?.twelveDataSymbol;
    const exchange = inst?.exchange ?? 'UNKNOWN';
    const currency = inst?.specification.tradingCurrency ?? 'USD';
    const unit = inst?.specification.quotationUnit ?? 'UNSPECIFIED';

    if (!apiKey) {
      return createUnavailableQuote({
        symbol: inst?.exchangeSymbol ?? symbol,
        exchange,
        contractMonth: inst?.contractMonth ?? null,
        currency,
        unit,
        source: this.providerId,
        reason: 'DATA_UNAVAILABLE — TWELVEDATA_API_KEY is not configured in server Secrets.',
      });
    }

    if (!tdSymbol) {
      return createUnavailableQuote({
        symbol: inst?.exchangeSymbol ?? symbol,
        exchange,
        contractMonth: inst?.contractMonth ?? null,
        currency,
        unit,
        source: this.providerId,
        reason: `No Twelve Data ticker mapping defined for ${symbol}.`,
      });
    }

    try {
      const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(
        tdSymbol
      )}&apikey=${encodeURIComponent(apiKey)}`;
      const res = await this.fetchFn(url, { signal: AbortSignal.timeout(10_000) });
      const data = (await res.json()) as Record<string, unknown>;

      if (!res.ok || data.status === 'error' || typeof data.code === 'number') {
        const msg = sanitizeExternalText(String(data.message ?? `HTTP ${res.status}`));
        this.lastError = msg;
        return createUnavailableQuote({
          symbol: inst.exchangeSymbol,
          exchange,
          contractMonth: inst.contractMonth,
          currency,
          unit,
          source: `TWELVE_DATA:${tdSymbol}`,
          reason: `Twelve Data error: ${msg}`,
        });
      }

      const rawPrice = Number(data.close ?? data.price);
      const rawVolume = strictNum(data.volume);
      const rawTs =
        typeof data.datetime === 'string'
          ? normalizeDateToUtcIso(data.datetime)
          : typeof data.timestamp === 'number'
            ? new Date(data.timestamp * 1000).toISOString()
            : null; // merge fix: never stamp provider data with "now" (was new Date())

      if (!Number.isFinite(rawPrice) || rawPrice <= 0 || !rawTs) {
        this.lastError = `Malformed Twelve Data quote for ${tdSymbol}.`;
        return createUnavailableQuote({
          symbol: inst.exchangeSymbol,
          exchange,
          contractMonth: inst.contractMonth,
          currency,
          unit,
          source: `TWELVE_DATA:${tdSymbol}`,
          reason: this.lastError,
        });
      }

      const freshness = evaluateDataFreshness(rawTs);
      const quote: MarketQuote = {
        symbol: inst.exchangeSymbol,
        exchange,
        contractMonth: inst.contractMonth,
        price: rawPrice,
        bid: null,
        ask: null,
        volume: rawVolume !== null && Number.isFinite(rawVolume) && rawVolume >= 0 ? rawVolume : null,
        openInterest: null,
        currency,
        unit,
        source: `TWELVE_DATA:${tdSymbol}`,
        timestamp: rawTs,
        retrievedAt: new Date().toISOString(),
        status: freshness, // merge fix: was relabelling UNAVAILABLE/INVALID freshness as DELAYED
        statusReason: inst.providerMappings?.twelveDataNote,
      };

      const check = validateMarketQuote(quote);
      if (!check.valid) {
        return createUnavailableQuote({
          symbol: inst.exchangeSymbol,
          exchange,
          contractMonth: inst.contractMonth,
          currency,
          unit,
          source: `TWELVE_DATA:${tdSymbol}`,
          reason: check.errors.join('; '),
        });
      }

      this.lastSyncAt = quote.retrievedAt;
      this.lastError = null;
      return quote;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : 'Network error';
      return createUnavailableQuote({
        symbol: inst?.exchangeSymbol ?? symbol,
        exchange,
        contractMonth: inst?.contractMonth ?? null,
        currency,
        unit,
        source: `TWELVE_DATA:${tdSymbol}`,
        reason: `Twelve Data request failed: ${this.lastError}`,
      });
    }
  }

  async getCandles(
    symbol: string,
    timeframe: string
  ): Promise<{ candles: MarketCandle[]; status: DataQualityStatus; reason?: string }> {
    const apiKey = this.getApiKey();
    const inst = await instrumentRepository.findBySymbol(symbol);
    const tdSymbol = inst?.providerMappings?.twelveDataSymbol;
    const tf = (timeframe as Timeframe) in TWELVE_DATA_INTERVALS ? (timeframe as Timeframe) : 'D1';
    const interval = TWELVE_DATA_INTERVALS[tf];

    if (!apiKey) {
      return {
        candles: [],
        status: 'UNAVAILABLE',
        reason: 'DATA_UNAVAILABLE — TWELVEDATA_API_KEY not configured.',
      };
    }
    if (!inst || !tdSymbol) {
      return {
        candles: [],
        status: 'UNAVAILABLE',
        reason: `No Twelve Data symbol mapping for ${symbol}.`,
      };
    }

    try {
      const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(
        tdSymbol
      )}&interval=${encodeURIComponent(interval)}&outputsize=120&apikey=${encodeURIComponent(apiKey)}`;
      const res = await this.fetchFn(url, { signal: AbortSignal.timeout(10_000) });
      const data = (await res.json()) as {
        status?: string;
        message?: string;
        values?: Array<Record<string, string>>;
      };

      if (!res.ok || data.status === 'error' || !Array.isArray(data.values)) {
        const msg = sanitizeExternalText(data.message ?? `HTTP ${res.status}`);
        this.lastError = msg;
        return { candles: [], status: 'UNAVAILABLE', reason: `Twelve Data error: ${msg}` };
      }

      const retrievedAt = new Date().toISOString();
      const rawCandles: MarketCandle[] = [];
      for (const row of data.values) {
        const ts = normalizeDateToUtcIso(row.datetime ?? '');
        const open = Number(row.open);
        const high = Number(row.high);
        const low = Number(row.low);
        const close = Number(row.close);
        const vol = strictNum(row.volume);
        if (
          !ts ||
          !Number.isFinite(open) ||
          !Number.isFinite(high) ||
          !Number.isFinite(low) ||
          !Number.isFinite(close) ||
          open <= 0 ||
          high <= 0 ||
          low <= 0 ||
          close <= 0
        ) {
          continue;
        }
        rawCandles.push({
          symbol: inst.exchangeSymbol,
          exchange: inst.exchange,
          timeframe: tf,
          timestamp: ts,
          retrievedAt,
          open,
          high,
          low,
          close,
          volume: vol !== null && Number.isFinite(vol) && vol >= 0 ? vol : null,
          openInterest: null,
          isComplete: true,
          source: `TWELVE_DATA:${tdSymbol}`,
          status: 'HISTORICAL',
        });
      }

      rawCandles.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      const validation = validateCandleSeries(rawCandles);
      if (!validation.valid) {
        this.lastError = validation.errors.join('; ');
        return { candles: [], status: 'INVALID', reason: this.lastError };
      }

      const latestFresh = evaluateDataFreshness(
        validation.validCandles[validation.validCandles.length - 1].timestamp
      );
      const seriesStatus: DataQualityStatus =
        latestFresh === 'CURRENT' || latestFresh === 'DELAYED' ? latestFresh : 'HISTORICAL';
      const tagged = validation.validCandles.map((c, idx) => ({
        ...c,
        status: idx === validation.validCandles.length - 1 ? seriesStatus : 'HISTORICAL',
      }));

      this.lastSyncAt = retrievedAt;
      this.lastError = null;
      return {
        candles: tagged,
        status: seriesStatus,
        reason: inst.providerMappings?.twelveDataNote,
      };
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : 'Network error';
      return { candles: [], status: 'UNAVAILABLE', reason: this.lastError };
    }
  }

  async fetchUsdVndRate(): Promise<{ rate: number; timestamp: string; source: string } | null> {
    const apiKey = this.getApiKey();
    if (!apiKey) return null;
    try {
      const url = `https://api.twelvedata.com/exchange_rate?symbol=USD/VND&apikey=${encodeURIComponent(
        apiKey
      )}`;
      const res = await this.fetchFn(url, { signal: AbortSignal.timeout(8_000) });
      const data = (await res.json()) as { rate?: number | string; timestamp?: number; status?: string };
      const rate = Number(data.rate);
      // merge fix: an FX rate without a provider timestamp is not reported as CURRENT.
      if (!res.ok || !Number.isFinite(rate) || rate <= 0 || typeof data.timestamp !== 'number') return null;
      return {
        rate,
        timestamp: new Date(data.timestamp * 1000).toISOString(),
        source: 'TWELVE_DATA:USD/VND',
      };
    } catch {
      return null;
    }
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
    const configured = Boolean(this.getApiKey());
    return {
      providerId: this.providerId,
      name: this.providerName,
      exchanges: ['COMEX', 'NYMEX', 'CBOT', 'ICE'],
      connectionState: !configured
        ? 'UNCONFIGURED'
        : this.lastError
          ? 'DEGRADED'
          : 'CONNECTED',
      dataStatus: configured && !this.lastError ? 'DELAYED' : 'UNAVAILABLE',
      credentialsConfigured: configured,
      supportsRealtime: true,
      supportsHistorical: true,
      lastCheckedAt: new Date().toISOString(),
      lastSuccessfulSyncAt: this.lastSyncAt,
      requiredEnvVars: ['TWELVEDATA_API_KEY'],
      supportedScopes: ['Spot Metals (XAU/USD, XAG/USD, XPT/USD)', 'Intraday OHLCV (M1–W1)', 'USD/VND FX'],
      lastError: this.lastError,
      message: !configured
        ? 'Add TWELVEDATA_API_KEY in AI Studio Settings > Secrets to enable live/intraday quotes, OHLCV charts, and USD/VND FX.'
        : this.lastError
          ? `Last sync issue: ${this.lastError}`
          : 'TWELVEDATA_API_KEY configured on server. Click Sync Feeds to fetch latest OHLCV & quotes.',
    };
  }
}

/**
 * 2. Financial Modeling Prep (FMP) Commodity Quote & EOD Adapter (FMP_API_KEY)
 */
export class FmpCommoditiesAdapter implements MarketDataProvider {
  public readonly providerId: ProviderId = 'FMP_COMMODITIES';
  public readonly providerName = 'Financial Modeling Prep (/stable Commodities)';
  private readonly fetchFn: FetchLike;
  private lastSyncAt: string | null = null;
  private lastError: string | null = null;

  constructor(fetchFn: FetchLike = globalThis.fetch) {
    this.fetchFn = fetchFn;
  }

  private getApiKey(): string {
    return getEnvTrimmed('FMP_API_KEY');
  }

  async getInstruments(): Promise<string[]> {
    const all = await instrumentRepository.list();
    return all.filter((i) => Boolean(i.providerMappings?.fmpSymbol)).map((i) => i.exchangeSymbol);
  }

  async getQuote(symbol: string): Promise<MarketQuote> {
    const apiKey = this.getApiKey();
    const inst = await instrumentRepository.findBySymbol(symbol);
    const fmpSymbol = inst?.providerMappings?.fmpSymbol;
    const exchange = inst?.exchange ?? 'UNKNOWN';
    const currency = inst?.specification.tradingCurrency ?? 'USD';
    const unit = inst?.specification.quotationUnit ?? 'UNSPECIFIED';

    if (!apiKey) {
      return createUnavailableQuote({
        symbol: inst?.exchangeSymbol ?? symbol,
        exchange,
        contractMonth: inst?.contractMonth ?? null,
        currency,
        unit,
        source: this.providerId,
        reason: 'DATA_UNAVAILABLE — FMP_API_KEY is not configured in server Secrets.',
      });
    }
    if (!inst || !fmpSymbol) {
      return createUnavailableQuote({
        symbol: inst?.exchangeSymbol ?? symbol,
        exchange,
        contractMonth: inst?.contractMonth ?? null,
        currency,
        unit,
        source: this.providerId,
        reason: `No FMP symbol mapping defined for ${symbol}.`,
      });
    }

    try {
      const url = `https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(
        fmpSymbol
      )}&apikey=${encodeURIComponent(apiKey)}`;
      const res = await this.fetchFn(url, { signal: AbortSignal.timeout(10_000) });
      const payload = (await res.json()) as unknown;

      if (!res.ok || !Array.isArray(payload) || payload.length === 0) {
        const msg =
          typeof (payload as Record<string, unknown>)?.['Error Message'] === 'string'
            ? String((payload as Record<string, unknown>)['Error Message'])
            : `HTTP ${res.status} / empty FMP quote response`;
        this.lastError = sanitizeExternalText(msg);
        return createUnavailableQuote({
          symbol: inst.exchangeSymbol,
          exchange,
          contractMonth: inst.contractMonth,
          currency,
          unit,
          source: `FMP:${fmpSymbol}`,
          reason: this.lastError,
        });
      }

      const row = payload[0] as Record<string, unknown>;
      const price = Number(row.price);
      const vol = strictNum(row.volume);
      const ts =
        typeof row.timestamp === 'number' ? new Date(row.timestamp * 1000).toISOString() : null; // merge fix: no "now" fallback

      if (!Number.isFinite(price) || price <= 0 || !ts) {
        this.lastError = `Invalid FMP price for ${fmpSymbol}.`;
        return createUnavailableQuote({
          symbol: inst.exchangeSymbol,
          exchange,
          contractMonth: inst.contractMonth,
          currency,
          unit,
          source: `FMP:${fmpSymbol}`,
          reason: this.lastError,
        });
      }

      const freshness = evaluateDataFreshness(ts);
      const quote: MarketQuote = {
        symbol: inst.exchangeSymbol,
        exchange,
        contractMonth: inst.contractMonth,
        price,
        bid: null,
        ask: null,
        volume: vol !== null && Number.isFinite(vol) && vol >= 0 ? vol : null,
        openInterest: null,
        currency,
        unit,
        source: `FMP:${fmpSymbol}`,
        timestamp: ts,
        retrievedAt: new Date().toISOString(),
        status: freshness, // merge fix: was relabelling UNAVAILABLE/INVALID freshness as DELAYED
      };
      this.lastSyncAt = quote.retrievedAt;
      this.lastError = null;
      return quote;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : 'FMP network failure';
      return createUnavailableQuote({
        symbol: inst.exchangeSymbol,
        exchange,
        contractMonth: inst.contractMonth,
        currency,
        unit,
        source: `FMP:${fmpSymbol}`,
        reason: this.lastError,
      });
    }
  }

  async getCandles(
    symbol: string
  ): Promise<{ candles: MarketCandle[]; status: DataQualityStatus; reason?: string }> {
    const apiKey = this.getApiKey();
    const inst = await instrumentRepository.findBySymbol(symbol);
    const fmpSymbol = inst?.providerMappings?.fmpSymbol;

    if (!apiKey) {
      return {
        candles: [],
        status: 'UNAVAILABLE',
        reason: 'DATA_UNAVAILABLE — FMP_API_KEY not configured.',
      };
    }
    if (!inst || !fmpSymbol) {
      return { candles: [], status: 'UNAVAILABLE', reason: `No FMP symbol for ${symbol}.` };
    }

    try {
      const url = `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${encodeURIComponent(
        fmpSymbol
      )}&apikey=${encodeURIComponent(apiKey)}`;
      const res = await this.fetchFn(url, { signal: AbortSignal.timeout(10_000) });
      const payload = (await res.json()) as unknown;
      const rows = Array.isArray(payload)
        ? (payload as Array<Record<string, unknown>>)
        : Array.isArray((payload as { historical?: unknown[] })?.historical)
          ? ((payload as { historical: Array<Record<string, unknown>> }).historical)
          : null;

      if (!res.ok || !rows) {
        this.lastError = `FMP EOD request failed (HTTP ${res.status})`;
        return { candles: [], status: 'UNAVAILABLE', reason: this.lastError };
      }

      const retrievedAt = new Date().toISOString();
      const rawCandles: MarketCandle[] = [];
      for (const row of rows.slice(0, 180)) {
        const ts = normalizeDateToUtcIso(String(row.date ?? ''));
        const open = Number(row.open);
        const high = Number(row.high);
        const low = Number(row.low);
        const close = Number(row.close);
        const vol = strictNum(row.volume);
        if (
          !ts ||
          !Number.isFinite(open) ||
          !Number.isFinite(high) ||
          !Number.isFinite(low) ||
          !Number.isFinite(close) ||
          open <= 0 ||
          high <= 0 ||
          low <= 0 ||
          close <= 0
        ) {
          continue;
        }
        rawCandles.push({
          symbol: inst.exchangeSymbol,
          exchange: inst.exchange,
          timeframe: 'D1',
          timestamp: ts,
          retrievedAt,
          open,
          high,
          low,
          close,
          volume: vol !== null && Number.isFinite(vol) && vol >= 0 ? vol : null,
          openInterest: null,
          isComplete: true,
          source: `FMP:${fmpSymbol}`,
          status: 'HISTORICAL',
        });
      }

      rawCandles.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      const validation = validateCandleSeries(rawCandles);
      if (!validation.valid) {
        this.lastError = validation.errors.join('; ');
        return { candles: [], status: 'INVALID', reason: this.lastError };
      }
      this.lastSyncAt = retrievedAt;
      this.lastError = null;
      return { candles: validation.validCandles, status: 'HISTORICAL' };
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : 'FMP EOD network error';
      return { candles: [], status: 'UNAVAILABLE', reason: this.lastError };
    }
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
    const configured = Boolean(this.getApiKey());
    return {
      providerId: this.providerId,
      name: this.providerName,
      exchanges: ['CBOT', 'COMEX', 'NYMEX', 'ICE'],
      connectionState: !configured ? 'UNCONFIGURED' : this.lastError ? 'DEGRADED' : 'CONNECTED',
      dataStatus: configured && !this.lastError ? 'DELAYED' : 'UNAVAILABLE',
      credentialsConfigured: configured,
      supportsRealtime: true,
      supportsHistorical: true,
      lastCheckedAt: new Date().toISOString(),
      lastSuccessfulSyncAt: this.lastSyncAt,
      requiredEnvVars: ['FMP_API_KEY'],
      supportedScopes: ['Futures/Spot Quotes (GCUSD, CLUSD, ZCUSX, KCUSX...)', 'Daily OHLCV (D1)'],
      lastError: this.lastError,
      message: !configured
        ? 'Add FMP_API_KEY in Settings > Secrets for commodity quotes & D1 OHLCV across CBOT, ICE, COMEX, NYMEX.'
        : this.lastError
          ? `Last sync issue: ${this.lastError}`
          : 'FMP_API_KEY configured on server.',
    };
  }
}

/**
 * 3. Commodities-API Real-Time Spot & Futures Adapter (COMMODITIES_API_KEY)
 */
export class CommoditiesApiAdapter implements MarketDataProvider {
  public readonly providerId: ProviderId = 'COMMODITIES_API';
  public readonly providerName = 'Commodities-API (Real-Time Commodity Benchmarks)';
  private readonly fetchFn: FetchLike;
  private lastSyncAt: string | null = null;
  private lastError: string | null = null;

  constructor(fetchFn: FetchLike = globalThis.fetch) {
    this.fetchFn = fetchFn;
  }

  private getApiKey(): string {
    return getEnvTrimmed('COMMODITIES_API_KEY');
  }

  async getInstruments(): Promise<string[]> {
    const all = await instrumentRepository.list();
    return all
      .filter((i) => Boolean(i.providerMappings?.commoditiesApiSymbol))
      .map((i) => i.exchangeSymbol);
  }

  async getQuote(symbol: string): Promise<MarketQuote> {
    const apiKey = this.getApiKey();
    const inst = await instrumentRepository.findBySymbol(symbol);
    const apiSym = inst?.providerMappings?.commoditiesApiSymbol;
    const exchange = inst?.exchange ?? 'UNKNOWN';
    const currency = inst?.specification.tradingCurrency ?? 'USD';
    const unit = inst?.specification.quotationUnit ?? 'UNSPECIFIED';

    if (!apiKey) {
      return createUnavailableQuote({
        symbol: inst?.exchangeSymbol ?? symbol,
        exchange,
        contractMonth: inst?.contractMonth ?? null,
        currency,
        unit,
        source: this.providerId,
        reason: 'DATA_UNAVAILABLE — COMMODITIES_API_KEY not configured.',
      });
    }
    if (!inst || !apiSym) {
      return createUnavailableQuote({
        symbol: inst?.exchangeSymbol ?? symbol,
        exchange,
        contractMonth: inst?.contractMonth ?? null,
        currency,
        unit,
        source: this.providerId,
        reason: `No Commodities-API symbol mapped for ${symbol}.`,
      });
    }

    try {
      // Query base=<COMMODITY>&symbols=USD so response rate unambiguously gives USD per 1 commodity unit
      const url = `https://commodities-api.com/api/latest?access_key=${encodeURIComponent(
        apiKey
      )}&base=${encodeURIComponent(apiSym)}&symbols=USD`;
      const res = await this.fetchFn(url, { signal: AbortSignal.timeout(10_000) });
      const raw = (await res.json()) as {
        data?: {
          success?: boolean;
          timestamp?: number;
          rates?: Record<string, number>;
          unit?: string;
          error?: { info?: string };
        };
        success?: boolean;
        timestamp?: number;
        rates?: Record<string, number>;
        error?: { info?: string };
      };

      const body = raw.data ?? raw;
      if (!res.ok || body.success === false || !body.rates || typeof body.rates.USD !== 'number') {
        const msg = sanitizeExternalText(body.error?.info ?? `HTTP ${res.status}`);
        this.lastError = msg;
        return createUnavailableQuote({
          symbol: inst.exchangeSymbol,
          exchange,
          contractMonth: inst.contractMonth,
          currency,
          unit,
          source: `COMMODITIES_API:${apiSym}`,
          reason: msg,
        });
      }

      const usdPrice = Number(body.rates.USD);
      if (!Number.isFinite(usdPrice) || usdPrice <= 0) {
        this.lastError = `Invalid price returned for ${apiSym}`;
        return createUnavailableQuote({
          symbol: inst.exchangeSymbol,
          exchange,
          contractMonth: inst.contractMonth,
          currency,
          unit,
          source: `COMMODITIES_API:${apiSym}`,
          reason: this.lastError,
        });
      }

      // merge fix: no "now" fallback — a quote without a provider timestamp is UNAVAILABLE.
      const ts = typeof body.timestamp === 'number' ? new Date(body.timestamp * 1000).toISOString() : null;
      if (!ts) {
        this.lastError = `Commodities-API response for ${apiSym} has no timestamp.`;
        return createUnavailableQuote({
          symbol: inst.exchangeSymbol,
          exchange,
          contractMonth: inst.contractMonth,
          currency,
          unit,
          source: `COMMODITIES_API:${apiSym}`,
          reason: this.lastError,
        });
      }
      const freshness = evaluateDataFreshness(ts);
      this.lastSyncAt = new Date().toISOString();
      this.lastError = null;

      return {
        symbol: inst.exchangeSymbol,
        exchange,
        contractMonth: inst.contractMonth,
        price: usdPrice,
        bid: null,
        ask: null,
        volume: null,
        openInterest: null,
        currency: 'USD',
        unit: typeof (raw.data as Record<string, unknown>)?.unit === 'string' ? String((raw.data as Record<string, unknown>).unit) : unit,
        source: `COMMODITIES_API:${apiSym}`,
        timestamp: ts,
        retrievedAt: this.lastSyncAt,
        status: freshness, // merge fix: was relabelling UNAVAILABLE/INVALID freshness as DELAYED
      };
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : 'Commodities-API request error';
      return createUnavailableQuote({
        symbol: inst.exchangeSymbol,
        exchange,
        contractMonth: inst.contractMonth,
        currency,
        unit,
        source: `COMMODITIES_API:${apiSym}`,
        reason: this.lastError,
      });
    }
  }

  async getCandles(): Promise<{ candles: MarketCandle[]; status: DataQualityStatus; reason?: string }> {
    return {
      candles: [],
      status: 'UNAVAILABLE',
      reason: 'Commodities-API quote endpoint does not return multi-bar intraday OHLCV series.',
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
    const configured = Boolean(this.getApiKey());
    return {
      providerId: this.providerId,
      name: this.providerName,
      exchanges: ['CBOT', 'ICE', 'COMEX', 'NYMEX'],
      connectionState: !configured ? 'UNCONFIGURED' : this.lastError ? 'DEGRADED' : 'CONNECTED',
      dataStatus: configured && !this.lastError ? 'DELAYED' : 'UNAVAILABLE',
      credentialsConfigured: configured,
      supportsRealtime: true,
      supportsHistorical: false,
      lastCheckedAt: new Date().toISOString(),
      lastSuccessfulSyncAt: this.lastSyncAt,
      requiredEnvVars: ['COMMODITIES_API_KEY'],
      supportedScopes: ['Real-time Commodity Rates (Brent, WTI, Coffee, Sugar, Corn, Wheat, Cotton, Metals)'],
      lastError: this.lastError,
      message: !configured
        ? 'Add COMMODITIES_API_KEY in Settings > Secrets for multi-commodity spot/futures benchmark quotes.'
        : this.lastError
          ? `Last sync issue: ${this.lastError}`
          : 'COMMODITIES_API_KEY configured on server.',
    };
  }
}

/**
 * 4. Alpha Vantage Daily Commodity Benchmarks & USD/VND FX Adapter (ALPHAVANTAGE_API_KEY)
 */
export class AlphaVantageAdapter implements MarketDataProvider {
  public readonly providerId: ProviderId = 'ALPHA_VANTAGE';
  public readonly providerName = 'Alpha Vantage (Commodity Benchmarks & USD/VND FX)';
  private readonly fetchFn: FetchLike;
  private lastSyncAt: string | null = null;
  private lastError: string | null = null;

  constructor(fetchFn: FetchLike = globalThis.fetch) {
    this.fetchFn = fetchFn;
  }

  private getApiKey(): string {
    return getEnvTrimmed('ALPHAVANTAGE_API_KEY');
  }

  async getInstruments(): Promise<string[]> {
    const all = await instrumentRepository.list();
    return all
      .filter((i) => Boolean(i.providerMappings?.alphaVantageFunction))
      .map((i) => i.exchangeSymbol);
  }

  async getQuote(symbol: string): Promise<MarketQuote> {
    const res = await this.getCandles(symbol);
    const inst = await instrumentRepository.findBySymbol(symbol);
    const currency = inst?.specification.tradingCurrency ?? 'USD';
    const unit = inst?.specification.quotationUnit ?? 'UNSPECIFIED';
    if (res.candles.length === 0) {
      return createUnavailableQuote({
        symbol: inst?.exchangeSymbol ?? symbol,
        exchange: inst?.exchange ?? 'UNKNOWN',
        contractMonth: inst?.contractMonth ?? null,
        currency,
        unit,
        source: this.providerId,
        reason: res.reason ?? 'DATA_UNAVAILABLE',
      });
    }
    const last = res.candles[res.candles.length - 1];
    return {
      symbol: inst?.exchangeSymbol ?? symbol,
      exchange: inst?.exchange ?? 'UNKNOWN',
      contractMonth: inst?.contractMonth ?? null,
      price: last.close,
      bid: null,
      ask: null,
      volume: null,
      openInterest: null,
      currency,
      unit,
      source: last.source,
      timestamp: last.timestamp,
      retrievedAt: last.retrievedAt,
      status: 'HISTORICAL',
      statusReason: res.reason,
    };
  }

  async getCandles(
    symbol: string
  ): Promise<{ candles: MarketCandle[]; status: DataQualityStatus; reason?: string; warnings?: string[] }> {
    const apiKey = this.getApiKey();
    const inst = await instrumentRepository.findBySymbol(symbol);
    const fn = inst?.providerMappings?.alphaVantageFunction;

    if (!apiKey) {
      return {
        candles: [],
        status: 'UNAVAILABLE',
        reason: 'DATA_UNAVAILABLE — ALPHAVANTAGE_API_KEY not configured in server Secrets.',
      };
    }
    if (!inst || !fn) {
      return {
        candles: [],
        status: 'UNAVAILABLE',
        reason: `No Alpha Vantage commodity function mapped for ${symbol}.`,
      };
    }

    try {
      const url = `https://www.alphavantage.co/query?function=${encodeURIComponent(
        fn
      )}&interval=daily&apikey=${encodeURIComponent(apiKey)}`;
      const res = await this.fetchFn(url, { signal: AbortSignal.timeout(10_000) });
      const data = (await res.json()) as {
        Note?: string;
        Information?: string;
        'Error Message'?: string;
        unit?: string;
        data?: Array<{ date?: string; value?: string }>;
      };

      if (data.Note || data.Information || data['Error Message']) {
        const msg = sanitizeExternalText(data.Note || data.Information || data['Error Message'] || 'API Error');
        this.lastError = msg;
        return { candles: [], status: 'UNAVAILABLE', reason: msg };
      }
      if (!res.ok || !Array.isArray(data.data)) {
        this.lastError = `Alpha Vantage returned HTTP ${res.status}`;
        return { candles: [], status: 'UNAVAILABLE', reason: this.lastError };
      }

      const retrievedAt = new Date().toISOString();
      const rawCandles: MarketCandle[] = [];
      for (const pt of data.data.slice(0, 180)) {
        if (!pt.date || !pt.value || pt.value === '.') continue;
        const val = Number(pt.value);
        const ts = normalizeDateToUtcIso(pt.date);
        if (!ts || !Number.isFinite(val) || val <= 0) continue;
        rawCandles.push({
          symbol: inst.exchangeSymbol,
          exchange: inst.exchange,
          timeframe: 'D1',
          timestamp: ts,
          retrievedAt,
          open: val,
          high: val,
          low: val,
          close: val,
          volume: null,
          openInterest: null,
          isComplete: true,
          source: `ALPHA_VANTAGE:${fn}`,
          status: 'HISTORICAL',
        });
      }

      rawCandles.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      const validation = validateCandleSeries(rawCandles);
      if (!validation.valid) {
        this.lastError = validation.errors.join('; ');
        return { candles: [], status: 'INVALID', reason: this.lastError };
      }

      const unitWarn = data.unit ? `Alpha Vantage series unit: ${data.unit}.` : '';
      const proxyWarn =
        inst.providerMappings?.alphaVantageNote ??
        'Alpha Vantage provides daily benchmark spot/reference close values (open=high=low=close); volume/OI unavailable.';
      this.lastSyncAt = retrievedAt;
      this.lastError = null;
      return {
        candles: validation.validCandles,
        status: 'HISTORICAL',
        reason: proxyWarn,
        warnings: [proxyWarn, unitWarn].filter(Boolean),
      };
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : 'Alpha Vantage network error';
      return { candles: [], status: 'UNAVAILABLE', reason: this.lastError };
    }
  }

  async fetchUsdVndRate(): Promise<{ rate: number; timestamp: string; source: string } | null> {
    const apiKey = this.getApiKey();
    if (!apiKey) return null;
    try {
      const url = `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=USD&to_currency=VND&apikey=${encodeURIComponent(
        apiKey
      )}`;
      const res = await this.fetchFn(url, { signal: AbortSignal.timeout(8_000) });
      const data = (await res.json()) as {
        'Realtime Currency Exchange Rate'?: Record<string, string>;
      };
      const block = data['Realtime Currency Exchange Rate'];
      if (!res.ok || !block) return null;
      const rate = Number(block['5. Exchange Rate']);
      const ts = normalizeDateToUtcIso(block['6. Last Refreshed'] ?? ''); // merge fix: no "now" fallback
      if (!Number.isFinite(rate) || rate <= 0 || !ts) return null;
      return { rate, timestamp: ts, source: 'ALPHA_VANTAGE:USD/VND' };
    } catch {
      return null;
    }
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
    const configured = Boolean(this.getApiKey());
    return {
      providerId: this.providerId,
      name: this.providerName,
      exchanges: ['CBOT', 'ICE', 'COMEX', 'NYMEX'],
      connectionState: !configured ? 'UNCONFIGURED' : this.lastError ? 'DEGRADED' : 'CONNECTED',
      dataStatus: configured && !this.lastError ? 'HISTORICAL' : 'UNAVAILABLE',
      credentialsConfigured: configured,
      supportsRealtime: false,
      supportsHistorical: true,
      lastCheckedAt: new Date().toISOString(),
      lastSuccessfulSyncAt: this.lastSyncAt,
      requiredEnvVars: ['ALPHAVANTAGE_API_KEY'],
      supportedScopes: ['D1 Benchmarks (WTI, BRENT, NG, COPPER, CORN, WHEAT, COFFEE, SUGAR, COTTON)', 'USD/VND FX'],
      lastError: this.lastError,
      message: !configured
        ? 'Add ALPHAVANTAGE_API_KEY in Settings > Secrets for free daily commodity benchmarks and USD/VND FX.'
        : this.lastError
          ? `Last sync issue: ${this.lastError}`
          : 'ALPHAVANTAGE_API_KEY configured on server.',
    };
  }
}

/**
 * 5. U.S. EIA Open Data v2 Energy Adapter (EIA_API_KEY)
 */
export class EiaEnergyAdapter implements MarketDataProvider {
  public readonly providerId: ProviderId = 'EIA_ENERGY';
  public readonly providerName = 'U.S. EIA Open Data v2 (Crude, Natural Gas & Inventories)';
  private readonly fetchFn: FetchLike;
  private lastSyncAt: string | null = null;
  private lastError: string | null = null;

  constructor(fetchFn: FetchLike = globalThis.fetch) {
    this.fetchFn = fetchFn;
  }

  private getApiKey(): string {
    return getEnvTrimmed('EIA_API_KEY');
  }

  async getInstruments(): Promise<string[]> {
    return ['CL', 'BRN', 'NG'];
  }

  async getQuote(symbol: string): Promise<MarketQuote> {
    const inst = await instrumentRepository.findBySymbol(symbol);
    return createUnavailableQuote({
      symbol: inst?.exchangeSymbol ?? symbol,
      exchange: inst?.exchange ?? 'NYMEX',
      contractMonth: null,
      currency: 'USD',
      unit: inst?.specification.quotationUnit ?? 'USD',
      source: this.providerId,
      reason: 'Use Sync Feeds to populate EIA daily spot & weekly inventory records.',
    });
  }

  async getCandles(
    symbol: string
  ): Promise<{ candles: MarketCandle[]; status: DataQualityStatus; reason?: string; warnings?: string[] }> {
    const apiKey = this.getApiKey();
    const inst = await instrumentRepository.findBySymbol(symbol);
    const seriesType = inst?.providerMappings?.eiaSeriesType;
    if (!apiKey) {
      return {
        candles: [],
        status: 'UNAVAILABLE',
        reason: 'DATA_UNAVAILABLE — EIA_API_KEY not configured.',
      };
    }
    if (!inst || !seriesType) {
      return { candles: [], status: 'UNAVAILABLE', reason: `No EIA route for ${symbol}.` };
    }

    const url =
      seriesType === 'WTI'
        ? `https://api.eia.gov/v2/petroleum/pri/spt/data/?api_key=${encodeURIComponent(
            apiKey
          )}&frequency=daily&data[0]=value&facets[series][]=RWTC&sort[0][column]=period&sort[0][direction]=desc&length=120`
        : seriesType === 'BRENT'
          ? `https://api.eia.gov/v2/petroleum/pri/spt/data/?api_key=${encodeURIComponent(
              apiKey
            )}&frequency=daily&data[0]=value&facets[series][]=RBRTE&sort[0][column]=period&sort[0][direction]=desc&length=120`
          : `https://api.eia.gov/v2/natural-gas/pri/fut/data/?api_key=${encodeURIComponent(
              apiKey
            )}&frequency=daily&data[0]=value&facets[series][]=RNGC1&sort[0][column]=period&sort[0][direction]=desc&length=120`;

    try {
      const res = await this.fetchFn(url, { signal: AbortSignal.timeout(10_000) });
      const data = (await res.json()) as {
        error?: { message?: string };
        response?: { data?: Array<{ period?: string; value?: number | string }> };
      };
      const rows = data.response?.data;
      if (!res.ok || !Array.isArray(rows)) {
        this.lastError = sanitizeExternalText(data.error?.message ?? `EIA HTTP ${res.status}`);
        return { candles: [], status: 'UNAVAILABLE', reason: this.lastError };
      }

      const retrievedAt = new Date().toISOString();
      const rawCandles: MarketCandle[] = [];
      for (const row of rows) {
        if (!row.period || row.value === null || row.value === undefined) continue;
        const val = Number(row.value);
        const ts = normalizeDateToUtcIso(row.period);
        if (!ts || !Number.isFinite(val) || val <= 0) continue;
        rawCandles.push({
          symbol: inst.exchangeSymbol,
          exchange: inst.exchange,
          timeframe: 'D1',
          timestamp: ts,
          retrievedAt,
          open: val,
          high: val,
          low: val,
          close: val,
          volume: null,
          openInterest: null,
          isComplete: true,
          source: `EIA_V2:${seriesType}`,
          status: 'HISTORICAL',
        });
      }

      rawCandles.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      const validation = validateCandleSeries(rawCandles);
      if (!validation.valid) {
        this.lastError = validation.errors.join('; ');
        return { candles: [], status: 'INVALID', reason: this.lastError };
      }
      this.lastSyncAt = retrievedAt;
      this.lastError = null;
      return {
        candles: validation.validCandles,
        status: 'HISTORICAL',
        warnings: ['EIA official daily settlement/spot price series (open=high=low=close).'],
      };
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : 'EIA network error';
      return { candles: [], status: 'UNAVAILABLE', reason: this.lastError };
    }
  }

  async syncWeeklyInventories(): Promise<{ synced: number; error?: string }> {
    const apiKey = this.getApiKey();
    if (!apiKey) return { synced: 0, error: 'EIA_API_KEY not configured.' };
    let synced = 0;

    try {
      const crudeUrl = `https://api.eia.gov/v2/petroleum/stoc/wstk/data/?api_key=${encodeURIComponent(
        apiKey
      )}&frequency=weekly&data[0]=value&facets[series][]=WCRSTUS1&sort[0][column]=period&sort[0][direction]=desc&length=4`;
      const crudeRes = await this.fetchFn(crudeUrl, { signal: AbortSignal.timeout(10_000) });
      const crudeJson = (await crudeRes.json()) as {
        response?: { data?: Array<{ period?: string; value?: number | string }> };
      };
      const rows = crudeJson.response?.data ?? [];
      if (crudeRes.ok && rows.length >= 2) {
        const curr = strictNum(rows[0].value);
        const prev = strictNum(rows[1].value);
        const ts = normalizeDateToUtcIso(rows[0].period ?? ''); // merge fix: skip record without a period
        if (ts && curr !== null && prev !== null) {
          fundamentalStore.addRecord({
            dataset: `EIA_US_CRUDE_STOCKS (${rows[0].period})`,
            source: 'U.S. EIA Open Data v2 (WCRSTUS1)',
            publicationTimestamp: ts,
            observationDate: String(rows[0].period ?? ts.slice(0, 10)),
            dataPeriod: String(rows[0].period ?? 'WEEKLY'),
            category: 'EIA_INVENTORIES',
            relatedSymbols: ['CL', 'BRN'],
            actualValue: curr,
            previousValue: prev,
            forecastValue: null,
            unit: 'Thousand Barrels',
            revisionStatus: 'FINAL',
            // Raw change stays visible (actual vs previous); direction needs forecast/seasonal context, so no bias is asserted.
            impactAssessment: 'UNCERTAIN',
          });
          synced += 1;
        }
      }

      const ngUrl = `https://api.eia.gov/v2/natural-gas/stor/wkly/data/?api_key=${encodeURIComponent(
        apiKey
      )}&frequency=weekly&data[0]=value&facets[process][]=SWO&sort[0][column]=period&sort[0][direction]=desc&length=4`;
      const ngRes = await this.fetchFn(ngUrl, { signal: AbortSignal.timeout(10_000) });
      const ngJson = (await ngRes.json()) as {
        response?: { data?: Array<{ period?: string; value?: number | string }> };
      };
      const ngRows = ngJson.response?.data ?? [];
      if (ngRes.ok && ngRows.length >= 2) {
        const curr = strictNum(ngRows[0].value);
        const prev = strictNum(ngRows[1].value);
        const ts = normalizeDateToUtcIso(ngRows[0].period ?? ''); // merge fix: skip record without a period
        if (ts && curr !== null && prev !== null) {
          fundamentalStore.addRecord({
            dataset: `EIA_US_NATURAL_GAS_STORAGE (${ngRows[0].period})`,
            source: 'U.S. EIA Open Data v2 (Working Gas)',
            publicationTimestamp: ts,
            observationDate: String(ngRows[0].period ?? ts.slice(0, 10)),
            dataPeriod: String(ngRows[0].period ?? 'WEEKLY'),
            category: 'EIA_INVENTORIES',
            relatedSymbols: ['NG'],
            actualValue: curr,
            previousValue: prev,
            forecastValue: null,
            unit: 'Bcf',
            revisionStatus: 'FINAL',
            // Raw change stays visible (actual vs previous); direction needs forecast/seasonal context, so no bias is asserted.
            impactAssessment: 'UNCERTAIN',
          });
          synced += 1;
        }
      }

      this.lastSyncAt = new Date().toISOString();
      this.lastError = null;
      return { synced };
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : 'EIA inventory sync error';
      return { synced, error: this.lastError };
    }
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
    const configured = Boolean(this.getApiKey());
    return {
      providerId: this.providerId,
      name: this.providerName,
      exchanges: ['NYMEX', 'ICE'],
      connectionState: !configured ? 'UNCONFIGURED' : this.lastError ? 'DEGRADED' : 'CONNECTED',
      dataStatus: configured && !this.lastError ? 'HISTORICAL' : 'UNAVAILABLE',
      credentialsConfigured: configured,
      supportsRealtime: false,
      supportsHistorical: true,
      lastCheckedAt: new Date().toISOString(),
      lastSuccessfulSyncAt: this.lastSyncAt,
      requiredEnvVars: ['EIA_API_KEY'],
      supportedScopes: ['Weekly US Crude & Natural Gas Inventories (Macro)', 'EIA Daily WTI/Brent/NG Spot'],
      lastError: this.lastError,
      message: !configured
        ? 'Register a free EIA_API_KEY at eia.gov/opendata and add to Settings > Secrets for official crude & gas inventories.'
        : this.lastError
          ? `Last sync issue: ${this.lastError}`
          : 'EIA_API_KEY configured on server.',
    };
  }
}

/**
 * 6. USDA NASS QuickStats Agricultural Macro Adapter (USDA_API_KEY)
 */
export class UsdaQuickStatsAdapter implements MarketDataProvider {
  public readonly providerId: ProviderId = 'USDA_QUICKSTATS';
  public readonly providerName = 'USDA NASS QuickStats (US Crop Production & Stocks)';
  private readonly fetchFn: FetchLike;
  private lastSyncAt: string | null = null;
  private lastError: string | null = null;

  constructor(fetchFn: FetchLike = globalThis.fetch) {
    this.fetchFn = fetchFn;
  }

  private getApiKey(): string {
    return getEnvTrimmed('USDA_API_KEY');
  }

  async getInstruments(): Promise<string[]> {
    return ['ZS', 'ZC', 'ZW', 'CT', 'ZR'];
  }
  async getQuote(symbol: string): Promise<MarketQuote> {
    return createUnavailableQuote({
      symbol,
      exchange: 'CBOT',
      contractMonth: null,
      currency: 'USD',
      unit: 'FUNDAMENTAL_ONLY',
      source: this.providerId,
      reason: 'USDA QuickStats supplies agricultural production & stocks macro series.',
    });
  }
  async getCandles(): Promise<{ candles: MarketCandle[]; status: DataQualityStatus; reason?: string }> {
    return { candles: [], status: 'UNAVAILABLE', reason: 'USDA QuickStats provides fundamental macro datasets.' };
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

  async syncProductionMacro(commodity: 'SOYBEANS' | 'CORN' | 'WHEAT' | 'COTTON' | 'RICE'): Promise<number> {
    const apiKey = this.getApiKey();
    if (!apiKey) return 0;
    try {
      const yearMin = new Date().getUTCFullYear() - 2;
      const url = `https://quickstats.nass.usda.gov/api/api_GET/?key=${encodeURIComponent(
        apiKey
      )}&commodity_desc=${encodeURIComponent(
        commodity
      )}&statisticcat_desc=PRODUCTION&agg_level_desc=NATIONAL&year__GE=${yearMin}&format=JSON`;
      const res = await this.fetchFn(url, { signal: AbortSignal.timeout(10_000) });
      const json = (await res.json()) as {
        data?: Array<{ year?: string; Value?: string; unit_desc?: string; short_desc?: string; load_time?: string }>;
        error?: string[];
      };
      if (!res.ok || !Array.isArray(json.data) || json.data.length === 0) {
        if (json.error) this.lastError = sanitizeExternalText(json.error.join('; '));
        return 0;
      }

      const validRows = json.data
        .map((r) => ({
          year: Number(r.year),
          val: Number(String(r.Value ?? '').replace(/,/g, '')),
          unit: r.unit_desc ?? 'UNITS',
          desc: r.short_desc ?? `${commodity} PRODUCTION`,
          // NASS load_time, e.g. "2026-01-12 12:00:00.000" (no timezone): keep the date only.
          loadDate: /^\d{4}-\d{2}-\d{2}/.exec(r.load_time ?? '')?.[0] ?? null,
        }))
        .filter((r) => Number.isFinite(r.year) && Number.isFinite(r.val) && r.val > 0)
        .sort((a, b) => b.year - a.year);

      if (validRows.length === 0) return 0;
      const latest = validRows[0];
      // Never invent a publication date: without NASS load_time the record is not stored.
      if (!latest.loadDate) {
        this.lastError = 'USDA QuickStats row has no load_time; publication date unknown';
        return 0;
      }
      const prev = validRows[1] ?? null;
      // A year-over-year change in production is not a price direction; raw values stay visible.
      const impact = 'UNCERTAIN' as const;

      fundamentalStore.addRecord({
        dataset: `USDA_${commodity}_PRODUCTION (${latest.year})`,
        source: 'USDA NASS QuickStats',
        publicationTimestamp: latest.loadDate,
        observationDate: `${latest.year}-01-01`,
        dataPeriod: String(latest.year),
        category: 'USDA_CROP',
        relatedSymbols:
          commodity === 'SOYBEANS'
            ? ['ZS', 'ZM', 'ZL']
            : commodity === 'CORN'
              ? ['ZC']
              : commodity === 'WHEAT'
                ? ['ZW']
                : commodity === 'COTTON'
                  ? ['CT']
                  : ['ZR'],
        actualValue: latest.val,
        previousValue: prev?.val ?? null,
        forecastValue: null,
        unit: latest.unit,
        revisionStatus: 'FINAL',
        impactAssessment: impact,
      });

      this.lastSyncAt = new Date().toISOString();
      this.lastError = null;
      return 1;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : 'USDA QuickStats error';
      return 0;
    }
  }

  async getProviderStatus(): Promise<ProviderHealth> {
    const configured = Boolean(this.getApiKey());
    return {
      providerId: this.providerId,
      name: this.providerName,
      exchanges: ['CBOT', 'ICE'],
      connectionState: !configured ? 'UNCONFIGURED' : this.lastError ? 'DEGRADED' : 'CONNECTED',
      dataStatus: configured && !this.lastError ? 'HISTORICAL' : 'UNAVAILABLE',
      credentialsConfigured: configured,
      supportsRealtime: false,
      supportsHistorical: true,
      lastCheckedAt: new Date().toISOString(),
      lastSuccessfulSyncAt: this.lastSyncAt,
      requiredEnvVars: ['USDA_API_KEY'],
      supportedScopes: ['Agricultural Crop Production & Macro (Soybeans, Corn, Wheat, Cotton, Rice)'],
      lastError: this.lastError,
      message: !configured
        ? 'Register a free USDA_API_KEY at quickstats.nass.usda.gov and add to Settings > Secrets for official crop data.'
        : this.lastError
          ? `Last sync issue: ${this.lastError}`
          : 'USDA_API_KEY configured on server.',
    };
  }
}

/**
 * 7. Authorized REST Endpoint Adapter (for MXV_API_URL + MXV_API_KEY or MARKET_DATA_PROVIDER_URL + MARKET_DATA_PROVIDER_KEY)
 */
export class ConfigurableRestFeedAdapter implements MarketDataProvider {
  public readonly providerId: ProviderId;
  public readonly providerName: string;
  private readonly urlEnv: string;
  private readonly keyEnv: string;
  private readonly exchanges: string[];
  private readonly unconfiguredMessage: string;
  private readonly fetchFn: FetchLike;
  private readonly freshnessMs: number;
  private readonly nowFn: () => number;
  private lastSyncAt: string | null = null;
  /** Data status of the last successful fetch: quote freshness (CURRENT/DELAYED/STALE) or HISTORICAL for candles. */
  private lastDataStatus: DataQualityStatus | null = null;
  private lastError: string | null = null;

  constructor(params: {
    providerId: ProviderId;
    providerName: string;
    urlEnv: string;
    keyEnv: string;
    exchanges: string[];
    unconfiguredMessage: string;
    fetchFn?: FetchLike;
    /** Health reports CURRENT/DELAYED only within this window after the last successful quote (default 15 min). */
    freshnessMs?: number;
    now?: () => number;
  }) {
    this.providerId = params.providerId;
    this.providerName = params.providerName;
    this.urlEnv = params.urlEnv;
    this.keyEnv = params.keyEnv;
    this.exchanges = params.exchanges;
    this.unconfiguredMessage = params.unconfiguredMessage;
    this.fetchFn = params.fetchFn ?? globalThis.fetch;
    this.freshnessMs = params.freshnessMs ?? 15 * 60_000;
    this.nowFn = params.now ?? Date.now;
  }

  private isConfigured(): boolean {
    return envPresent(this.urlEnv) && envPresent(this.keyEnv);
  }

  async getInstruments(): Promise<string[]> {
    return [];
  }

  async getQuote(symbol: string): Promise<MarketQuote> {
    const inst = await instrumentRepository.findBySymbol(symbol);
    const currency = inst?.specification.tradingCurrency ?? 'USD';
    const unit = inst?.specification.quotationUnit ?? 'UNSPECIFIED';
    if (!this.isConfigured()) {
      return createUnavailableQuote({
        symbol: inst?.exchangeSymbol ?? symbol,
        exchange: inst?.exchange ?? this.exchanges[0] ?? 'MXV',
        contractMonth: inst?.contractMonth ?? null,
        currency,
        unit,
        source: this.providerId,
        reason: `DATA_UNAVAILABLE — ${this.unconfiguredMessage}`,
      });
    }

    const baseUrl = getEnvTrimmed(this.urlEnv).replace(/\/+$/, '');
    const apiKey = getEnvTrimmed(this.keyEnv);
    try {
      const targetSym = inst?.mxvMapping?.mxvSymbol ?? inst?.exchangeSymbol ?? symbol;
      const res = await this.fetchFn(`${baseUrl}/quote?symbol=${encodeURIComponent(targetSym)}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      const data = (await res.json()) as Record<string, unknown>;
      const price = Number(data.price);
      const ts = typeof data.timestamp === 'string' ? normalizeDateToUtcIso(data.timestamp) : null;
      if (!res.ok || !Number.isFinite(price) || price <= 0 || !ts) {
        this.lastError = `REST feed error (${res.status}) or invalid quote payload`;
        return createUnavailableQuote({
          symbol: inst?.exchangeSymbol ?? symbol,
          exchange: inst?.exchange ?? this.exchanges[0] ?? 'MXV',
          contractMonth: inst?.contractMonth ?? null,
          currency,
          unit,
          source: this.providerId,
          reason: this.lastError,
        });
      }

      const quote: MarketQuote = {
        symbol: inst?.exchangeSymbol ?? symbol,
        exchange: inst?.exchange ?? this.exchanges[0] ?? 'MXV',
        contractMonth: inst?.contractMonth ?? null,
        price,
        bid: typeof data.bid === 'number' && data.bid > 0 ? data.bid : null,
        ask: typeof data.ask === 'number' && data.ask > 0 ? data.ask : null,
        volume: typeof data.volume === 'number' && data.volume >= 0 ? data.volume : null,
        openInterest: typeof data.openInterest === 'number' && data.openInterest >= 0 ? data.openInterest : null,
        currency,
        unit,
        source: this.providerId,
        timestamp: ts,
        retrievedAt: new Date().toISOString(),
        status: evaluateDataFreshness(ts),
      };
      this.lastSyncAt = quote.retrievedAt;
      this.lastDataStatus = quote.status;
      this.lastError = null;
      return quote;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : 'Network error';
      return createUnavailableQuote({
        symbol: inst?.exchangeSymbol ?? symbol,
        exchange: inst?.exchange ?? this.exchanges[0] ?? 'MXV',
        contractMonth: inst?.contractMonth ?? null,
        currency,
        unit,
        source: this.providerId,
        reason: this.lastError,
      });
    }
  }

  async getCandles(
    symbol: string,
    timeframe: string
  ): Promise<{ candles: MarketCandle[]; status: DataQualityStatus; reason?: string }> {
    if (!this.isConfigured()) {
      return {
        candles: [],
        status: 'UNAVAILABLE',
        reason: `DATA_UNAVAILABLE — ${this.unconfiguredMessage}`,
      };
    }

    const baseUrl = getEnvTrimmed(this.urlEnv).replace(/\/+$/, '');
    const apiKey = getEnvTrimmed(this.keyEnv);
    const inst = await instrumentRepository.findBySymbol(symbol);
    const targetSym = inst?.mxvMapping?.mxvSymbol ?? inst?.exchangeSymbol ?? symbol;

    try {
      const res = await this.fetchFn(
        `${baseUrl}/candles?symbol=${encodeURIComponent(targetSym)}&timeframe=${encodeURIComponent(timeframe)}`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(10_000),
        }
      );
      const data = (await res.json()) as { candles?: MarketCandle[] };
      if (!res.ok || !Array.isArray(data.candles)) {
        this.lastError = `REST candles endpoint error (${res.status})`;
        return { candles: [], status: 'UNAVAILABLE', reason: this.lastError };
      }

      const retrievedAt = new Date().toISOString();
      const normalized = data.candles
        .map((c) => ({
          ...c,
          symbol: inst?.exchangeSymbol ?? symbol,
          exchange: inst?.exchange ?? this.exchanges[0] ?? 'MXV',
          timeframe,
          retrievedAt,
          source: this.providerId,
          status: 'HISTORICAL' as DataQualityStatus,
          isComplete: c.isComplete ?? true,
        }))
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      const validation = validateCandleSeries(normalized);
      if (!validation.valid) {
        this.lastError = validation.errors.join('; ');
        return { candles: [], status: 'INVALID', reason: this.lastError };
      }
      this.lastSyncAt = retrievedAt;
      this.lastDataStatus = 'HISTORICAL';
      this.lastError = null;
      return { candles: validation.validCandles, status: 'HISTORICAL' };
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : 'REST feed network error';
      return { candles: [], status: 'UNAVAILABLE', reason: this.lastError };
    }
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
    const keySet = envPresent(this.keyEnv);
    const urlSet = envPresent(this.urlEnv);
    const ready = keySet && urlSet;
    // Never report CURRENT from configuration alone: health reflects the last SUCCESSFUL fetch and its age.
    const syncedMs = this.lastSyncAt ? Date.parse(this.lastSyncAt) : NaN;
    const ageMs = Number.isNaN(syncedMs) ? null : this.nowFn() - syncedMs;
    let dataStatus: DataQualityStatus = 'UNAVAILABLE';
    if (ready && !this.lastError && this.lastDataStatus && ageMs !== null) {
      dataStatus =
        (this.lastDataStatus === 'CURRENT' || this.lastDataStatus === 'DELAYED') && ageMs > this.freshnessMs
          ? 'STALE'
          : this.lastDataStatus;
    }
    const connectionState = !ready
      ? 'UNCONFIGURED'
      : this.lastError
        ? 'DEGRADED'
        : this.lastSyncAt
          ? 'CONNECTED'
          : 'UNAVAILABLE';
    return {
      providerId: this.providerId,
      name: this.providerName,
      exchanges: this.exchanges,
      connectionState,
      dataStatus,
      credentialsConfigured: ready,
      supportsRealtime: true,
      supportsHistorical: true,
      lastCheckedAt: new Date().toISOString(),
      lastSuccessfulSyncAt: this.lastSyncAt,
      requiredEnvVars: [this.urlEnv, this.keyEnv],
      lastError: this.lastError,
      message: ready
        ? this.lastError
          ? `Last sync issue: ${this.lastError}`
          : this.lastSyncAt
            ? `Last successful fetch ${this.lastSyncAt} (${dataStatus}; freshness window ${Math.round(this.freshnessMs / 60_000)} min).`
            : `${this.urlEnv} and ${this.keyEnv} configured on server; no successful sync yet.`
        : keySet && !urlSet
          ? `${this.keyEnv} detected, waiting for ${this.urlEnv} endpoint URL in Secrets.`
          : this.unconfiguredMessage,
    };
  }
}

/**
 * 9. Federal Reserve Economic Data (FRED) Macro Cycle Adapter (FRED_API_KEY)
 * Supplies Broad USD Index (DTWEXBGS), Fed Funds Rate (FEDFUNDS), 10Y Treasury Yield (DGS10), and CPI (CPIAUCSL).
 */
export class FredMacroAdapter implements MarketDataProvider {
  public readonly providerId: ProviderId = 'FRED_MACRO';
  public readonly providerName = 'Federal Reserve Economic Data (FRED Macro)';
  private readonly fetchFn: FetchLike;
  private lastSyncAt: string | null = null;
  private lastError: string | null = null;
  private readonly benchmarkQuotes = new Map<string, MarketQuote>();

  constructor(fetchFn: FetchLike = globalThis.fetch) {
    this.fetchFn = fetchFn;
  }

  getBenchmarkQuote(symbol: string): MarketQuote | null {
    return this.benchmarkQuotes.get(symbol.trim().toUpperCase()) ?? null;
  }

  private getApiKey(): string {
    return getEnvTrimmed('FRED_API_KEY');
  }

  async getInstruments(): Promise<string[]> {
    return ['BRN'];
  }

  async getQuote(symbol: string): Promise<MarketQuote> {
    const benchmark = this.getBenchmarkQuote(symbol);
    if (benchmark) return benchmark;
    return createUnavailableQuote({
      symbol,
      exchange: 'MACRO',
      contractMonth: null,
      currency: 'USD',
      unit: 'INDEX',
      source: this.providerId,
      reason: 'FRED_MACRO provides macro cycle series & Brent spot FOB benchmark rather than streaming intraday futures.',
    });
  }

  async getCandles(): Promise<{ candles: MarketCandle[]; status: DataQualityStatus; reason?: string }> {
    return { candles: [], status: 'UNAVAILABLE', reason: 'FRED_MACRO provides macro economic series only.' };
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

  async syncMacroSeries(): Promise<{ synced: number; error?: string }> {
    const apiKey = this.getApiKey();
    if (!apiKey) return { synced: 0, error: 'FRED_API_KEY not configured.' };

    const seriesDefs = [
      { id: 'DTWEXBGS', dataset: 'FRED_DXY_BROAD_USD', unit: 'INDEX_2006=100' },
      { id: 'FEDFUNDS', dataset: 'FRED_FED_FUNDS_RATE', unit: 'PCT' },
      { id: 'DGS10', dataset: 'FRED_US_10Y_YIELD', unit: 'PCT' },
      { id: 'CPIAUCSL', dataset: 'FRED_US_CPI_INDEX', unit: 'INDEX_1982=100' },
    ];

    let synced = 0;
    let lastErr: string | undefined;

    for (const def of seriesDefs) {
      try {
        const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${def.id}&api_key=${encodeURIComponent(
          apiKey
        )}&file_type=json&sort_order=desc&limit=5`;
        const res = await this.fetchFn(url, { signal: AbortSignal.timeout(10_000) });
        const payload = (await res.json()) as {
          observations?: Array<{ date?: string; value?: string }>;
          error_message?: string;
        };
        if (!res.ok || !Array.isArray(payload.observations)) {
          lastErr = sanitizeExternalText(payload.error_message ?? `HTTP ${res.status}`);
          continue;
        }
        const validObs = payload.observations
          .map((o) => ({ date: o.date, val: strictNum(o.value) }))
          .filter((o): o is { date: string; val: number } => Boolean(o.date) && o.val !== null);
        if (validObs.length === 0) continue;

        const latest = validObs[0];
        const prev = validObs[1];
        // Research-only: no auto direction label from an up/down move (T32).
        const impact = 'UNCERTAIN' as const;

        fundamentalStore.addRecord({
          dataset: def.dataset,
          source: `FRED (${def.id})`,
          // FRED observations carry no release time; the observation date is NOT the publication time (look-ahead). Use the moment we fetched it (latest time it was provably public).
          publicationTimestamp: new Date().toISOString(),
          observationDate: latest.date ?? 'LATEST',
          dataPeriod: latest.date ?? 'LATEST',
          category: 'MACRO',
          actualValue: latest.val,
          previousValue: prev ? prev.val : null,
          forecastValue: null,
          unit: def.unit,
          revisionStatus: 'FINAL',
          impactAssessment: impact,
        });
        synced += 1;
      } catch (err) {
        lastErr = sanitizeExternalText(err instanceof Error ? err.message : 'FRED request failed');
      }
    }

    if (synced > 0) {
      this.lastSyncAt = new Date().toISOString();
      this.lastError = null;
    } else if (lastErr) {
      this.lastError = lastErr;
    }

    return { synced, error: lastErr };
  }

  /**
   * Public no-key fallback verified live against fred.stlouisfed.org/graph/fredgraph.csv?id=...
   * Parses official Federal Reserve CSV directly, validates header + numeric rows, fails closed on error.
   */
  async syncPublicCsvMacroSeries(): Promise<{ synced: number; error?: string }> {
    const seriesDefs = [
      { id: 'DTWEXBGS', dataset: 'FRED_DXY_BROAD_USD', unit: 'INDEX_2006=100' },
      { id: 'FEDFUNDS', dataset: 'FRED_FED_FUNDS_RATE', unit: 'PCT' },
      { id: 'DGS10', dataset: 'FRED_US_10Y_YIELD', unit: 'PCT' },
      { id: 'CPIAUCSL', dataset: 'FRED_US_CPI_INDEX', unit: 'INDEX_1982=100' },
    ];

    let synced = 0;
    let lastErr: string | undefined;

    for (const def of seriesDefs) {
      try {
        const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(def.id)}`;
        const res = await this.fetchFn(url, { signal: AbortSignal.timeout(12_000) });
        if (!res.ok) {
          lastErr = `HTTP ${res.status} for FRED public CSV ${def.id}`;
          continue;
        }
        const text = await res.text();
        const lines = text.trim().split(/\r?\n/);
        if (lines.length < 2 || (!lines[0].toUpperCase().includes('DATE') && !lines[0].toUpperCase().includes('OBSERVATION_DATE'))) {
          lastErr = `Unexpected FRED CSV header for ${def.id}`;
          continue;
        }
        const validObs: Array<{ date: string; val: number }> = [];
        for (let i = 1; i < lines.length; i++) {
          const [rawDate, rawVal] = lines[i].split(',');
          const d = rawDate?.trim();
          if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
          if (!rawVal || rawVal.trim() === '.' || rawVal.trim() === '') continue;
          const v = Number(rawVal.trim());
          if (Number.isFinite(v)) validObs.push({ date: d, val: v });
        }
        if (validObs.length === 0) {
          lastErr = `No valid numeric rows in FRED public CSV for ${def.id}`;
          continue;
        }
        const latest = validObs[validObs.length - 1];
        const prev = validObs.length >= 2 ? validObs[validObs.length - 2] : null;
        // Research-only: no auto direction label from an up/down move (T32).
        const impact = 'UNCERTAIN' as const;

        fundamentalStore.addRecord({
          dataset: def.dataset,
          source: `FRED Public CSV (${def.id})`,
          // FRED observations carry no release time; the observation date is NOT the publication time (look-ahead). Use the moment we fetched it (latest time it was provably public).
          publicationTimestamp: new Date().toISOString(),
          observationDate: latest.date,
          dataPeriod: latest.date,
          category: 'MACRO',
          actualValue: latest.val,
          previousValue: prev ? prev.val : null,
          forecastValue: null,
          unit: def.unit,
          revisionStatus: 'FINAL',
          impactAssessment: impact,
        });
        synced += 1;
      } catch (err) {
        lastErr = sanitizeExternalText(err instanceof Error ? err.message : 'FRED public CSV failed');
      }
    }

    if (synced > 0) {
      this.lastSyncAt = new Date().toISOString();
      this.lastError = null;
    } else if (lastErr) {
      this.lastError = lastErr;
    }
    return { synced, error: lastErr };
  }

  /**
   * Syncs official 0-key FRED Public CSV commodity benchmarks verified live:
   * - DCOILBRENTEU: EIA Europe Brent Crude Spot FOB (Daily, USD/barrel) -> maps cleanly to ICE:BRN daily close
   * - IMF monthly benchmarks (PCOFFROBUSDM, PCOTTINDUSDM, PRUBBUSDM, PIORECRUSDM) -> stored as GLOBAL_SD fundamentals only
   */
  async syncPublicCommodityBenchmarks(): Promise<{ synced: number; error?: string }> {
    let synced = 0;
    let lastErr: string | undefined;

    for (const def of FRED_BENCHMARK_DEFS) {
      try {
        const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(def.seriesId)}`;
        const res = await this.fetchFn(url, { signal: AbortSignal.timeout(12_000) });
        if (!res.ok) {
          lastErr = `HTTP ${res.status} for FRED benchmark CSV ${def.seriesId}`;
          continue;
        }
        const validObs = parseFredCsv(await res.text());
        if (validObs.length === 0) {
          lastErr = `No valid numeric rows in FRED benchmark CSV for ${def.seriesId}`;
          continue;
        }
        const latest = validObs[validObs.length - 1];
        const prev = validObs.length >= 2 ? validObs[validObs.length - 2] : null;
        const now = new Date();

        fundamentalStore.addRecord({
          dataset: def.dataset,
          source: `FRED Public CSV (${def.seriesId})`,
          publicationTimestamp: now.toISOString(),
          observationDate: latest.date,
          dataPeriod: latest.date,
          category: 'GLOBAL_SD',
          relatedSymbols: def.symbols,
          actualValue: latest.val,
          previousValue: prev ? prev.val : null,
          forecastValue: null,
          unit: def.nativeUnit,
          revisionStatus: 'FINAL',
          // Research-only: no auto direction label from an up/down move (T32).
          impactAssessment: 'UNCERTAIN',
        });

        for (const symbol of def.symbols) {
          this.benchmarkQuotes.set(symbol, buildBenchmarkQuote(def, symbol, latest, now));
        }
        synced += 1;
      } catch (err) {
        lastErr = sanitizeExternalText(err instanceof Error ? err.message : 'FRED benchmark CSV failed');
      }
    }

    if (synced > 0) {
      this.lastSyncAt = new Date().toISOString();
      this.lastError = null;
    } else if (lastErr) {
      this.lastError = lastErr;
    }
    return { synced, error: lastErr };
  }

  private benchmarkRefresh: Promise<unknown> | null = null;
  private benchmarkNextTryMs = 0;

  /**
   * Fire-and-forget refresh used when a quote is requested but no benchmark is cached yet (the scheduler may
   * be off). Deduplicated; retries at most every 6 h after success / 10 min after failure. Off under tests
   * unless FRED_PUBLIC_CSV_ENABLED=true; FRED_PUBLIC_CSV_ENABLED=false disables it.
   */
  ensureBenchmarksInBackground(): void {
    const flag = getEnvTrimmed('FRED_PUBLIC_CSV_ENABLED').toLowerCase();
    if (flag === 'false' || (flag !== 'true' && process.env.NODE_ENV === 'test')) return;
    if (this.benchmarkRefresh || Date.now() < this.benchmarkNextTryMs) return;
    this.benchmarkRefresh = this.syncPublicCommodityBenchmarks()
      .then((r) => {
        this.benchmarkNextTryMs = Date.now() + (r.synced > 0 ? 6 * 3_600_000 : 600_000);
      })
      .catch(() => {
        this.benchmarkNextTryMs = Date.now() + 600_000;
      })
      .finally(() => {
        this.benchmarkRefresh = null;
      });
  }

  async getProviderStatus(): Promise<ProviderHealth> {
    const configured = Boolean(this.getApiKey()) || Boolean(this.lastSyncAt);
    const hasKey = Boolean(this.getApiKey());
    return {
      providerId: this.providerId,
      name: this.providerName,
      exchanges: ['MACRO', 'ICE'],
      connectionState: !configured ? 'UNCONFIGURED' : this.lastError ? 'DEGRADED' : 'CONNECTED',
      dataStatus: configured && !this.lastError ? 'HISTORICAL' : 'UNAVAILABLE',
      credentialsConfigured: hasKey,
      supportsRealtime: false,
      supportsHistorical: true,
      lastCheckedAt: new Date().toISOString(),
      lastSuccessfulSyncAt: this.lastSyncAt,
      requiredEnvVars: ['FRED_API_KEY (tùy chọn — có Public CSV miễn phí không cần key)'],
      supportedScopes: [
        'DXY Broad USD',
        'Fed Funds Rate',
        'US 10Y Yield',
        'US CPI Inflation',
        'Brent Spot FOB (DCOILBRENTEU)',
        'IMF Monthly Benchmarks (RC/CT/JRU/TIO)',
      ],
      lastError: this.lastError,
      message: hasKey
        ? this.lastError
          ? `Last sync issue: ${this.lastError}`
          : 'FRED_API_KEY configured on server (+ DCOILBRENTEU & IMF CSV benchmarks).'
        : this.lastSyncAt
          ? 'Synced via official FRED Public CSV (fredgraph.csv, no API key required: DXY, Fed Funds, 10Y, CPI, Brent Spot & IMF benchmarks).'
          : 'Supports official FRED Public CSV (0 key) when Sync Public Macro is enabled, or set FRED_API_KEY for JSON API.',
    };
  }
}

/**
 * Coordinates on-demand sync of configured server-side API providers into validated stores.
 * Never fabricates data when keys are missing.
 */
export async function syncConfiguredProviders(options: {
  symbol?: string;
  timeframe?: Timeframe;
  historicalRange?: YahooHistoryRange;
  includePublicMacro?: boolean;
  twelveData: TwelveDataAdapter;
  fmp: FmpCommoditiesAdapter;
  alphaVantage: AlphaVantageAdapter;
  eia: EiaEnergyAdapter;
  usda: UsdaQuickStatsAdapter;
  fred?: FredMacroAdapter;
  mxvRest: ConfigurableRestFeedAdapter;
  thirdPartyRest: ConfigurableRestFeedAdapter;
  /** Yahoo UNOFFICIAL adapter (T30); only syncs when YAHOO_ENABLED=true. */
  yahoo?: YahooFinanceAdapter;
  /** Persist synced candles to the SQLite data layer (server/providers/syncPersistence.ts). */
  persistCandles?: PersistProviderCandles;
}): Promise<{
  syncedAt: string;
  totalCandlesDatasetsAdded: number;
  totalMacroAdded: number;
  outcomes: SyncProviderOutcome[];
  /** One entry per persisted series; empty when no persister is configured. */
  persistence: PersistOutcome[];
  persistenceEnabled: boolean;
}> {
  const tf: Timeframe = options.timeframe ?? 'D1';
  const instruments: InstrumentDefinition[] = options.symbol
    ? [await instrumentRepository.findBySymbol(options.symbol)].filter(
        (i): i is InstrumentDefinition => Boolean(i)
      )
    : await instrumentRepository.list({ marketScope: 'MXV' });

  const outcomes: SyncProviderOutcome[] = [];
  const persistence: PersistOutcome[] = [];
  let totalCandlesDatasetsAdded = 0;
  let totalMacroAdded = 0;
  const providerNames: Partial<Record<ProviderId, string>> = {
    TWELVE_DATA: options.twelveData.providerName,
    FMP_COMMODITIES: options.fmp.providerName,
    ALPHA_VANTAGE: options.alphaVantage.providerName,
    EIA_ENERGY: options.eia.providerName,
    MXV_OFFICIAL: options.mxvRest.providerName,
    THIRD_PARTY_FEED: options.thirdPartyRest.providerName,
    YAHOO_UNOFFICIAL: options.yahoo?.providerName,
  };
  /** Owner's in-memory store (engines' fallback) + persistent SQLite dataset with provenance. */
  const store = async (
    providerId: ProviderId,
    inst: InstrumentDefinition,
    timeframe: Timeframe,
    candles: MarketCandle[],
    warnings: string[] = [],
    verifiedPriceUnit?: string
  ): Promise<void> => {
    historicalCandleStore.save(inst.exchangeSymbol, timeframe, candles, warnings);
    if (options.persistCandles) {
      persistence.push(
        await options.persistCandles({
          providerId,
          providerName: providerNames[providerId] ?? providerId,
          instrument: inst,
          timeframe,
          candles,
          verifiedPriceUnit,
        })
      );
    }
  };

  // 1. Twelve Data sync (priority real-time/intraday OHLCV)
  if (envPresent('TWELVEDATA_API_KEY')) {
    const targets = instruments.filter((i) => Boolean(i.providerMappings?.twelveDataSymbol)).slice(0, 4);
    const updated: string[] = [];
    let lastErr: string | undefined;
    for (const inst of targets) {
      const res = await options.twelveData.getCandles(inst.exchangeSymbol, tf);
      if (res.candles.length > 0) {
        await store('TWELVE_DATA', inst, tf, res.candles, res.reason ? [res.reason] : []);
        updated.push(inst.exchangeSymbol);
        totalCandlesDatasetsAdded += 1;
      } else if (res.reason) {
        lastErr = res.reason;
      }
    }
    outcomes.push({
      providerId: 'TWELVE_DATA',
      providerName: options.twelveData.providerName,
      status: updated.length > 0 ? 'CONNECTED' : 'DEGRADED',
      candlesSynced: updated.length,
      macroSynced: 0,
      symbolsUpdated: updated,
      message:
        updated.length > 0
          ? `Synced ${updated.length} instrument(s) (${tf}) from Twelve Data.`
          : lastErr ?? 'No candles returned for mapped symbols.',
      error: updated.length === 0 ? lastErr : undefined,
    });
  } else {
    outcomes.push({
      providerId: 'TWELVE_DATA',
      providerName: options.twelveData.providerName,
      status: 'UNCONFIGURED',
      candlesSynced: 0,
      macroSynced: 0,
      symbolsUpdated: [],
      message: 'TWELVEDATA_API_KEY not set in server Secrets.',
    });
  }

  // 2. Financial Modeling Prep (FMP) sync (D1 Futures/Spot)
  if (envPresent('FMP_API_KEY')) {
    const targets = instruments.filter((i) => Boolean(i.providerMappings?.fmpSymbol)).slice(0, 5);
    const updated: string[] = [];
    let lastErr: string | undefined;
    for (const inst of targets) {
      const res = await options.fmp.getCandles(inst.exchangeSymbol);
      if (res.candles.length > 0) {
        await store('FMP_COMMODITIES', inst, 'D1', res.candles);
        updated.push(inst.exchangeSymbol);
        totalCandlesDatasetsAdded += 1;
      } else if (res.reason) {
        lastErr = res.reason;
      }
    }
    outcomes.push({
      providerId: 'FMP_COMMODITIES',
      providerName: options.fmp.providerName,
      status: updated.length > 0 ? 'CONNECTED' : 'DEGRADED',
      candlesSynced: updated.length,
      macroSynced: 0,
      symbolsUpdated: updated,
      message:
        updated.length > 0
          ? `Synced ${updated.length} D1 OHLCV series from Financial Modeling Prep.`
          : lastErr ?? 'No FMP candles returned.',
      error: updated.length === 0 ? lastErr : undefined,
    });
  } else {
    outcomes.push({
      providerId: 'FMP_COMMODITIES',
      providerName: options.fmp.providerName,
      status: 'UNCONFIGURED',
      candlesSynced: 0,
      macroSynced: 0,
      symbolsUpdated: [],
      message: 'FMP_API_KEY not set in server Secrets.',
    });
  }

  // 3. Alpha Vantage D1 Benchmark sync
  if (envPresent('ALPHAVANTAGE_API_KEY')) {
    const targets = instruments.filter((i) => Boolean(i.providerMappings?.alphaVantageFunction)).slice(0, 2);
    const updated: string[] = [];
    let lastErr: string | undefined;
    for (const inst of targets) {
      const res = await options.alphaVantage.getCandles(inst.exchangeSymbol);
      if (res.candles.length > 0) {
        await store('ALPHA_VANTAGE', inst, 'D1', res.candles, res.warnings ?? []);
        updated.push(inst.exchangeSymbol);
        totalCandlesDatasetsAdded += 1;
      } else if (res.reason) {
        lastErr = res.reason;
      }
    }
    outcomes.push({
      providerId: 'ALPHA_VANTAGE',
      providerName: options.alphaVantage.providerName,
      status: updated.length > 0 ? 'CONNECTED' : 'DEGRADED',
      candlesSynced: updated.length,
      macroSynced: 0,
      symbolsUpdated: updated,
      message:
        updated.length > 0
          ? `Synced ${updated.length} D1 benchmark series from Alpha Vantage.`
          : lastErr ?? 'No Alpha Vantage candles returned.',
      error: updated.length === 0 ? lastErr : undefined,
    });
  } else {
    outcomes.push({
      providerId: 'ALPHA_VANTAGE',
      providerName: options.alphaVantage.providerName,
      status: 'UNCONFIGURED',
      candlesSynced: 0,
      macroSynced: 0,
      symbolsUpdated: [],
      message: 'ALPHAVANTAGE_API_KEY not set in server Secrets.',
    });
  }

  // 4. U.S. EIA Open Data v2 sync (Energy inventories + daily spot)
  if (envPresent('EIA_API_KEY')) {
    const invRes = await options.eia.syncWeeklyInventories();
    totalMacroAdded += invRes.synced;
    const energyTargets = instruments.filter((i) => Boolean(i.providerMappings?.eiaSeriesType)).slice(0, 3);
    const updated: string[] = [];
    for (const inst of energyTargets) {
      const res = await options.eia.getCandles(inst.exchangeSymbol);
      if (res.candles.length > 0) {
        await store('EIA_ENERGY', inst, 'D1', res.candles, res.warnings ?? []);
        updated.push(inst.exchangeSymbol);
        totalCandlesDatasetsAdded += 1;
      }
    }
    outcomes.push({
      providerId: 'EIA_ENERGY',
      providerName: options.eia.providerName,
      status: invRes.synced > 0 || updated.length > 0 ? 'CONNECTED' : 'DEGRADED',
      candlesSynced: updated.length,
      macroSynced: invRes.synced,
      symbolsUpdated: updated,
      message: `EIA synced ${invRes.synced} weekly inventory release(s) and ${updated.length} D1 spot series.`,
      error: invRes.error,
    });
  } else {
    outcomes.push({
      providerId: 'EIA_ENERGY',
      providerName: options.eia.providerName,
      status: 'UNCONFIGURED',
      candlesSynced: 0,
      macroSynced: 0,
      symbolsUpdated: [],
      message: 'EIA_API_KEY not set in server Secrets.',
    });
  }

  // 5. USDA NASS QuickStats sync
  if (envPresent('USDA_API_KEY')) {
    const usdaCommodities = Array.from(
      new Set(
        instruments
          .map((i) => i.providerMappings?.usdaCommodity)
          .filter((c): c is NonNullable<typeof c> => Boolean(c))
      )
    ).slice(0, 3);
    let macroCount = 0;
    for (const c of usdaCommodities) {
      macroCount += await options.usda.syncProductionMacro(c);
    }
    totalMacroAdded += macroCount;
    outcomes.push({
      providerId: 'USDA_QUICKSTATS',
      providerName: options.usda.providerName,
      status: macroCount > 0 ? 'CONNECTED' : 'DEGRADED',
      candlesSynced: 0,
      macroSynced: macroCount,
      symbolsUpdated: [],
      message: `Synced ${macroCount} official USDA QuickStats production record(s).`,
    });
  } else {
    outcomes.push({
      providerId: 'USDA_QUICKSTATS',
      providerName: options.usda.providerName,
      status: 'UNCONFIGURED',
      candlesSynced: 0,
      macroSynced: 0,
      symbolsUpdated: [],
      message: 'USDA_API_KEY not set in server Secrets.',
    });
  }

  // 6. MXV Official Member REST feed if configured
  if (envPresent('MXV_API_KEY') && envPresent('MXV_API_URL')) {
    const updated: string[] = [];
    for (const inst of instruments.filter((i) => i.isMvxListed).slice(0, 4)) {
      const res = await options.mxvRest.getCandles(inst.exchangeSymbol, tf);
      if (res.candles.length > 0) {
        await store('MXV_OFFICIAL', inst, tf, res.candles);
        updated.push(inst.exchangeSymbol);
        totalCandlesDatasetsAdded += 1;
      }
    }
    outcomes.push({
      providerId: 'MXV_OFFICIAL',
      providerName: options.mxvRest.providerName,
      status: updated.length > 0 ? 'CONNECTED' : 'DEGRADED',
      candlesSynced: updated.length,
      macroSynced: 0,
      symbolsUpdated: updated,
      message: `Synced ${updated.length} MXV-mapped dataset(s).`,
    });
  }

  // 7. Custom 3rd Party REST feed if configured
  if (envPresent('MARKET_DATA_PROVIDER_URL') && envPresent('MARKET_DATA_PROVIDER_KEY')) {
    const updated: string[] = [];
    for (const inst of instruments.slice(0, 4)) {
      const res = await options.thirdPartyRest.getCandles(inst.exchangeSymbol, tf);
      if (res.candles.length > 0) {
        await store('THIRD_PARTY_FEED', inst, tf, res.candles);
        updated.push(inst.exchangeSymbol);
        totalCandlesDatasetsAdded += 1;
      }
    }
    outcomes.push({
      providerId: 'THIRD_PARTY_FEED',
      providerName: options.thirdPartyRest.providerName,
      status: updated.length > 0 ? 'CONNECTED' : 'DEGRADED',
      candlesSynced: updated.length,
      macroSynced: 0,
      symbolsUpdated: updated,
      message: `Synced ${updated.length} dataset(s) from custom REST feed.`,
    });
  }

  // 8. Yahoo Finance UNOFFICIAL daily candles (opt-in, lowest priority; separate VENDOR_YAHOO series)
  if (options.yahoo) {
    if (isYahooEnabled()) {
      const targets = instruments.filter((i) => options.yahoo!.supports(i));
      const updated: string[] = [];
      let lastErr: string | undefined;
      const yahooRange: YahooHistoryRange = options.historicalRange ?? '2y';
      for (const inst of targets) {
        const res = await options.yahoo.getCandles(inst.exchangeSymbol, 'D1', undefined, undefined, { range: yahooRange });
        if (res.candles.length > 0) {
          await store('YAHOO_UNOFFICIAL', inst, 'D1', res.candles, res.reason ? [res.reason] : [], inst.specification.quotationUnit);
          updated.push(inst.exchangeSymbol);
          totalCandlesDatasetsAdded += 1;
        } else if (res.reason) {
          lastErr = `${inst.exchangeSymbol}: ${res.reason}`;
        }
      }
      outcomes.push({
        providerId: 'YAHOO_UNOFFICIAL',
        providerName: options.yahoo.providerName,
        status: updated.length > 0 ? 'CONNECTED' : 'DEGRADED',
        candlesSynced: updated.length,
        macroSynced: 0,
        symbolsUpdated: updated,
        message:
          updated.length > 0
            ? `Synced ${updated.length} UNOFFICIAL D1 continuous series (${yahooRange}) from Yahoo Finance (personal use only).`
            : lastErr ?? 'No Yahoo candles returned for supported symbols.',
        error: updated.length === 0 ? lastErr : undefined,
      });
    } else {
      outcomes.push({
        providerId: 'YAHOO_UNOFFICIAL',
        providerName: options.yahoo.providerName,
        status: 'UNCONFIGURED',
        candlesSynced: 0,
        macroSynced: 0,
        symbolsUpdated: [],
        message: 'Yahoo adapter disabled (set YAHOO_ENABLED=true; UNOFFICIAL, personal use only).',
      });
    }
  }

  // 9. Federal Reserve Economic Data (FRED) macro & commodity benchmark sync (API key OR explicit public CSV)
  if (options.fred) {
    if (envPresent('FRED_API_KEY')) {
      const fredRes = await options.fred.syncMacroSeries();
      const benchRes = await options.fred.syncPublicCommodityBenchmarks();
      totalMacroAdded += fredRes.synced + benchRes.synced;
      outcomes.push({
        providerId: 'FRED_MACRO',
        providerName: options.fred.providerName,
        status: fredRes.synced + benchRes.synced > 0 ? 'CONNECTED' : 'DEGRADED',
        candlesSynced: 0,
        macroSynced: fredRes.synced + benchRes.synced,
        symbolsUpdated: options.fred.getBenchmarkQuote('BRN') ? ['BRN'] : [],
        message: `Synced ${fredRes.synced} FRED macro series & ${benchRes.synced} Brent/IMF benchmarks.`,
        error: fredRes.error ?? benchRes.error,
      });
    } else if (options.includePublicMacro || envPresent('FRED_PUBLIC_CSV_ENABLED')) {
      const fredCsvRes = await options.fred.syncPublicCsvMacroSeries();
      const benchRes = await options.fred.syncPublicCommodityBenchmarks();
      const totalSynced = fredCsvRes.synced + benchRes.synced;
      totalMacroAdded += totalSynced;
      outcomes.push({
        providerId: 'FRED_MACRO',
        providerName: options.fred.providerName,
        status: totalSynced > 0 ? 'CONNECTED' : 'DEGRADED',
        candlesSynced: 0,
        macroSynced: totalSynced,
        symbolsUpdated: options.fred.getBenchmarkQuote('BRN') ? ['BRN'] : [],
        message:
          totalSynced > 0
            ? `Synced ${fredCsvRes.synced} macro series + ${benchRes.synced} Brent/IMF benchmarks via official FRED Public CSV (0 key).`
            : fredCsvRes.error ?? benchRes.error ?? 'FRED Public CSV sync failed.',
        error: fredCsvRes.error ?? benchRes.error,
      });
    } else {
      outcomes.push({
        providerId: 'FRED_MACRO',
        providerName: options.fred.providerName,
        status: 'UNCONFIGURED',
        candlesSynced: 0,
        macroSynced: 0,
        symbolsUpdated: [],
        message: 'FRED_API_KEY not set (Pass includePublicMacro=true for no-key Public CSV).',
      });
    }
  }

  return {
    syncedAt: new Date().toISOString(),
    totalCandlesDatasetsAdded,
    totalMacroAdded,
    outcomes,
    persistence,
    persistenceEnabled: Boolean(options.persistCandles),
  };
}
