/**
 * Yahoo Finance delayed-quote adapter (T30) — UNOFFICIAL, opt-in via YAHOO_ENABLED=true (default off).
 *
 * Source: the public chart endpoint query1.finance.yahoo.com/v8/finance/chart/<symbol> (no account, no
 * key). Not a licensed feed: Yahoo's terms allow personal use only, delays are exchange-imposed
 * (CBOT ~10 min, ICE US / COMEX / NYMEX ~30 min, see docs/REALTIME_DATA_SOURCES.md) and the series is
 * Yahoo's continuous front month, not a specific contract. Every quote therefore carries
 * sourceQuality 'UNOFFICIAL', delayMinutes and contract 'CONTINUOUS (front month as defined by Yahoo)',
 * is never CURRENT, and is used only after licensed/official providers in the live-quote chain.
 *
 * Mapping was verified live once on 2026-11-17 ~18:00 UTC (exchangeName / currency returned by Yahoo
 * recorded below). At runtime the response must still match the recorded exchange and currency;
 * otherwise the quote is refused (INVALID) instead of guessed.
 */
import type { InstrumentDefinition, Timeframe } from '../../src/shared/types/instrument.ts';
import type {
  DataQualityStatus,
  MarketCandle,
  MarketDataProvider,
  MarketQuote,
  ProviderHealth,
  ProviderId,
} from '../../src/shared/types/market.ts';
import { evaluateDataFreshness } from '../../src/shared/utils/time.ts';
import { createUnavailableQuote, validateCandleSeries } from '../../src/shared/utils/validation.ts';
import { sanitizeExternalText } from '../services/fundamentalService.ts';
import { instrumentRepository } from '../services/instrumentRegistry.ts';

export type FetchLike = typeof fetch;

export const YAHOO_PROVIDER_ID: ProviderId = 'YAHOO_UNOFFICIAL';
export const YAHOO_CONTRACT_LABEL = 'CONTINUOUS (front month as defined by Yahoo)';
export const YAHOO_CHART_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart/';
/** Generic client identification; contains no personal or project information. */
export const YAHOO_USER_AGENT = 'Mozilla/5.0 (compatible; market-data-client/1.0)';
/** Margin added on top of the exchange delay before a quote is considered STALE. */
export const YAHOO_DELAY_MARGIN_MINUTES = 15;

/** Yahoo `meta.currency`: USX = US cents, USD = US dollars. */
export type YahooCurrency = 'USX' | 'USD';

export interface YahooSymbolMapping {
  yahooSymbol: string;
  /** Yahoo meta.exchangeName recorded at verification. */
  expectedExchangeName: string;
  /** Yahoo meta.fullExchangeName recorded at verification (informational). */
  fullExchangeName: string;
  expectedCurrency: YahooCurrency;
  delayMinutes: number;
}

/**
 * Instrument exchangeSymbol → Yahoo continuous symbol. Verified 2026-11-17T18:00Z:
 * every entry returned HTTP 200, instrumentType FUTURE and the exchange/currency below.
 */
export const YAHOO_SYMBOL_MAP: Readonly<Record<string, YahooSymbolMapping>> = {
  ZC: { yahooSymbol: 'ZC=F', expectedExchangeName: 'CBT', fullExchangeName: 'CBOT', expectedCurrency: 'USX', delayMinutes: 10 },
  ZS: { yahooSymbol: 'ZS=F', expectedExchangeName: 'CBT', fullExchangeName: 'CBOT', expectedCurrency: 'USX', delayMinutes: 10 },
  ZM: { yahooSymbol: 'ZM=F', expectedExchangeName: 'CBT', fullExchangeName: 'CBOT', expectedCurrency: 'USD', delayMinutes: 10 },
  ZL: { yahooSymbol: 'ZL=F', expectedExchangeName: 'CBT', fullExchangeName: 'CBOT', expectedCurrency: 'USX', delayMinutes: 10 },
  ZW: { yahooSymbol: 'ZW=F', expectedExchangeName: 'CBT', fullExchangeName: 'CBOT', expectedCurrency: 'USX', delayMinutes: 10 },
  ZR: { yahooSymbol: 'ZR=F', expectedExchangeName: 'CBT', fullExchangeName: 'CBOT', expectedCurrency: 'USD', delayMinutes: 10 },
  KC: { yahooSymbol: 'KC=F', expectedExchangeName: 'NYB', fullExchangeName: 'ICE Futures', expectedCurrency: 'USX', delayMinutes: 30 },
  SB: { yahooSymbol: 'SB=F', expectedExchangeName: 'NYB', fullExchangeName: 'ICE Futures', expectedCurrency: 'USX', delayMinutes: 30 },
  CC: { yahooSymbol: 'CC=F', expectedExchangeName: 'NYB', fullExchangeName: 'ICE Futures', expectedCurrency: 'USD', delayMinutes: 30 },
  HG: { yahooSymbol: 'HG=F', expectedExchangeName: 'CMX', fullExchangeName: 'COMEX', expectedCurrency: 'USD', delayMinutes: 30 },
  GC: { yahooSymbol: 'GC=F', expectedExchangeName: 'CMX', fullExchangeName: 'COMEX', expectedCurrency: 'USD', delayMinutes: 30 },
  SI: { yahooSymbol: 'SI=F', expectedExchangeName: 'CMX', fullExchangeName: 'COMEX', expectedCurrency: 'USD', delayMinutes: 30 },
  PL: { yahooSymbol: 'PL=F', expectedExchangeName: 'NYM', fullExchangeName: 'NY Mercantile', expectedCurrency: 'USD', delayMinutes: 30 },
  CL: { yahooSymbol: 'CL=F', expectedExchangeName: 'NYM', fullExchangeName: 'NY Mercantile', expectedCurrency: 'USD', delayMinutes: 30 },
  NG: { yahooSymbol: 'NG=F', expectedExchangeName: 'NYM', fullExchangeName: 'NY Mercantile', expectedCurrency: 'USD', delayMinutes: 30 },
};

/** Instruments explicitly not served by this adapter, with the reason shown to the user. */
export const YAHOO_UNSUPPORTED: Readonly<Record<string, string>> = {
  RC: 'ICE Europe Robusta is not on Yahoo: RC=F returned HTTP 404 "No data found" (verified 2026-11-17).',
  BRN: 'ICE Europe Brent is not on Yahoo: BZ=F is the NYMEX Brent contract (exchangeName NYM), not ICE BRN.',
  TIO: 'CME Iron Ore (TIO) has no verified Yahoo continuous symbol.',
  JRU: 'Rubber (JRU / Osaka-TOCOM) has no verified Yahoo continuous symbol.',
  CT: 'Yahoo CT=F resolved to exchangeName NYM / instrumentType ALTSYMBOL (not ICE US cotton) at verification (2026-11-17); refused until re-verified.',
};

export function isYahooEnabled(): boolean {
  return (process.env.YAHOO_ENABLED ?? '').trim().toLowerCase() === 'true';
}

// ---------------------------------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------------------------------

export type UnitConversion =
  | { ok: true; factor: number; note: string }
  | { ok: false; reason: string };

/**
 * Factor that converts a Yahoo price (in `yahooCurrency`) into our instrument quotationUnit.
 * Only cents↔dollars per the same physical unit is supported; anything else is refused.
 */
export function yahooUnitConversion(yahooCurrency: string | undefined, quotationUnit: string): UnitConversion {
  const unit = quotationUnit.trim().toLowerCase();
  const ours: YahooCurrency | null = unit.startsWith('cents/') ? 'USX' : unit.startsWith('usd/') ? 'USD' : null;
  if (!ours) {
    return { ok: false, reason: `Unsupported quotation unit "${quotationUnit}" for Yahoo conversion.` };
  }
  if (yahooCurrency !== 'USX' && yahooCurrency !== 'USD') {
    return { ok: false, reason: `Unexpected Yahoo currency "${yahooCurrency ?? 'missing'}".` };
  }
  if (yahooCurrency === ours) {
    return { ok: true, factor: 1, note: `Yahoo ${yahooCurrency} matches ${quotationUnit}; no conversion.` };
  }
  if (yahooCurrency === 'USX' && ours === 'USD') {
    return { ok: true, factor: 0.01, note: `Yahoo quotes US cents; divided by 100 to ${quotationUnit}.` };
  }
  return { ok: true, factor: 100, note: `Yahoo quotes USD; multiplied by 100 to ${quotationUnit}.` };
}

export function applyUnitFactor(value: number, factor: number): number {
  return factor === 1 ? value : Number((value * factor).toPrecision(12));
}

// ---------------------------------------------------------------------------------------------------
// Freshness
// ---------------------------------------------------------------------------------------------------

/**
 * Status from the market timestamp with thresholds that account for the declared exchange delay:
 * DELAYED within delay + margin, STALE beyond, never CURRENT. Outside the trading period Yahoo reports,
 * the last price is STALE.
 */
export function classifyYahooFreshness(
  marketTimestampIso: string | null,
  delayMinutes: number,
  nowMs: number = Date.now(),
  tradingPeriod?: { start?: number; end?: number } | null
): DataQualityStatus {
  const status = evaluateDataFreshness(marketTimestampIso, nowMs, {
    currentMaxAgeMs: Number.NEGATIVE_INFINITY, // a delayed unofficial source is never CURRENT
    delayedMaxAgeMs: (delayMinutes + YAHOO_DELAY_MARGIN_MINUTES) * 60_000,
  });
  if (status === 'CURRENT') return 'DELAYED'; // defensive: cannot happen with -Infinity
  if (status === 'DELAYED' && tradingPeriod && typeof tradingPeriod.start === 'number' && typeof tradingPeriod.end === 'number') {
    const nowSec = nowMs / 1000;
    if (nowSec < tradingPeriod.start || nowSec > tradingPeriod.end) return 'STALE';
  }
  return status;
}

// ---------------------------------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------------------------------

interface YahooTradingPeriod {
  start?: number;
  end?: number;
  gmtoffset?: number;
}

export interface YahooChartMeta {
  currency?: string;
  symbol?: string;
  exchangeName?: string;
  fullExchangeName?: string;
  instrumentType?: string;
  regularMarketPrice?: number;
  regularMarketTime?: number;
  regularMarketVolume?: number;
  gmtoffset?: number;
  exchangeTimezoneName?: string;
  shortName?: string;
  currentTradingPeriod?: { regular?: YahooTradingPeriod };
}

interface YahooChartResult {
  meta?: YahooChartMeta;
  timestamp?: number[];
  indicators?: {
    quote?: Array<{
      open?: Array<number | null>;
      high?: Array<number | null>;
      low?: Array<number | null>;
      close?: Array<number | null>;
      volume?: Array<number | null>;
    }>;
  };
}

interface YahooChartResponse {
  chart?: { result?: YahooChartResult[] | null; error?: { code?: string; description?: string } | null };
}

// ---------------------------------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------------------------------

export interface YahooAdapterOptions {
  fetchFn?: FetchLike;
  /** Minimum spacing between outgoing requests (polite rate limit). Default 1000 ms (≤ 1 req/s). */
  minIntervalMs?: number;
  /** Quote cache TTL. Default 60 s. */
  quoteTtlMs?: number;
  /** Retries after the first attempt on HTTP 429 / 5xx / network error. Default 2. */
  maxRetries?: number;
  /** Base backoff; attempt n waits base * 2^n (or Retry-After, capped at 30 s). Default 1000 ms. */
  backoffBaseMs?: number;
  timeoutMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

type FetchResult = { ok: true; result: YahooChartResult } | { ok: false; error: string };

export class YahooFinanceAdapter implements MarketDataProvider {
  public readonly providerId: ProviderId = YAHOO_PROVIDER_ID;
  public readonly providerName = 'Yahoo Finance chart API (UNOFFICIAL, delayed, personal use only)';
  private readonly fetchFn: FetchLike;
  private readonly minIntervalMs: number;
  private readonly quoteTtlMs: number;
  private readonly maxRetries: number;
  private readonly backoffBaseMs: number;
  private readonly timeoutMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly quoteCache = new Map<string, { quote: MarketQuote; expiresAtMs: number }>();
  /** Serialises outgoing requests so spacing holds even under Promise.all callers. */
  private queue: Promise<void> = Promise.resolve();
  private lastRequestAtMs = Number.NEGATIVE_INFINITY;
  private lastSyncAt: string | null = null;
  private lastError: string | null = null;
  /** Number of HTTP requests actually sent (for diagnostics/tests). */
  public requestCount = 0;

  constructor(options: YahooAdapterOptions = {}) {
    this.fetchFn = options.fetchFn ?? ((...args) => globalThis.fetch(...args));
    this.minIntervalMs = options.minIntervalMs ?? 1000;
    this.quoteTtlMs = options.quoteTtlMs ?? 60_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.backoffBaseMs = options.backoffBaseMs ?? 1000;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.now = options.now ?? (() => Date.now());
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  static mappingFor(exchangeSymbol: string): YahooSymbolMapping | null {
    return YAHOO_SYMBOL_MAP[exchangeSymbol.trim().toUpperCase()] ?? null;
  }

  static unsupportedReason(exchangeSymbol: string): string {
    const sym = exchangeSymbol.trim().toUpperCase();
    return YAHOO_UNSUPPORTED[sym] ?? `No verified Yahoo continuous symbol for ${sym}.`;
  }

  /** True when enabled and the instrument has a verified mapping whose unit can be converted. */
  supports(instrument: InstrumentDefinition): boolean {
    const m = YahooFinanceAdapter.mappingFor(instrument.exchangeSymbol);
    return Boolean(m) && yahooUnitConversion(m!.expectedCurrency, instrument.specification.quotationUnit).ok;
  }

  private async throttle(): Promise<void> {
    const prev = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((resolve) => (release = resolve));
    await prev;
    try {
      const waitMs = this.lastRequestAtMs + this.minIntervalMs - this.now();
      if (waitMs > 0) await this.sleep(waitMs);
      this.lastRequestAtMs = this.now();
    } finally {
      release();
    }
  }

  private async fetchChart(yahooSymbol: string, range: string, interval: string): Promise<FetchResult> {
    const url = `${YAHOO_CHART_BASE}${encodeURIComponent(yahooSymbol)}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`;
    let lastError = 'Unknown error';
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      await this.throttle();
      let retryAfterMs: number | null = null;
      try {
        this.requestCount += 1;
        const res = await this.fetchFn(url, {
          headers: { 'User-Agent': YAHOO_USER_AGENT, Accept: 'application/json' },
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (res.status === 429 || res.status >= 500) {
          lastError = `HTTP ${res.status}`;
          const ra = Number(res.headers.get('retry-after'));
          if (Number.isFinite(ra) && ra > 0) retryAfterMs = Math.min(ra * 1000, 30_000);
        } else {
          let body: YahooChartResponse;
          try {
            body = (await res.json()) as YahooChartResponse;
          } catch {
            return { ok: false, error: `HTTP ${res.status}: non-JSON response` };
          }
          const result = body.chart?.result?.[0];
          if (!res.ok || !result) {
            const desc = body.chart?.error?.description ?? body.chart?.error?.code ?? `HTTP ${res.status}`;
            return { ok: false, error: sanitizeExternalText(String(desc)) };
          }
          return { ok: true, result };
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'Network error';
      }
      if (attempt < this.maxRetries) {
        await this.sleep(retryAfterMs ?? this.backoffBaseMs * 2 ** attempt);
      }
    }
    return { ok: false, error: `${lastError} after ${this.maxRetries + 1} attempt(s)` };
  }

  async getInstruments(): Promise<string[]> {
    const all = await instrumentRepository.list();
    return all.filter((i) => this.supports(i)).map((i) => i.exchangeSymbol);
  }

  async getQuote(symbol: string): Promise<MarketQuote> {
    const inst = await instrumentRepository.findBySymbol(symbol);
    if (!inst) {
      return createUnavailableQuote({
        symbol,
        exchange: 'UNKNOWN',
        contractMonth: null,
        currency: 'USD',
        unit: 'UNSPECIFIED',
        source: this.providerId,
        reason: `Instrument ${symbol} is not registered.`,
      });
    }
    return this.getQuoteForInstrument(inst);
  }

  async getQuoteForInstrument(inst: InstrumentDefinition): Promise<MarketQuote> {
    const unit = inst.specification.quotationUnit;
    const currency = inst.specification.tradingCurrency;
    const unavailable = (reason: string, source: string = this.providerId): MarketQuote =>
      createUnavailableQuote({
        symbol: inst.exchangeSymbol,
        exchange: inst.exchange,
        contractMonth: null,
        currency,
        unit,
        source,
        reason,
      });

    if (!isYahooEnabled()) {
      return unavailable('DATA_UNAVAILABLE — Yahoo adapter disabled (set YAHOO_ENABLED=true; unofficial, personal use only).');
    }
    const mapping = YahooFinanceAdapter.mappingFor(inst.exchangeSymbol);
    if (!mapping) {
      return unavailable(`UNSUPPORTED — ${YahooFinanceAdapter.unsupportedReason(inst.exchangeSymbol)}`);
    }
    const source = `${this.providerId}:${mapping.yahooSymbol}`;
    const conv = yahooUnitConversion(mapping.expectedCurrency, unit);
    if (!conv.ok) return unavailable(`UNSUPPORTED — ${conv.reason}`, source);

    const cached = this.quoteCache.get(mapping.yahooSymbol);
    if (cached && cached.expiresAtMs > this.now()) {
      // Re-evaluate freshness on every read; the cached market timestamp keeps ageing.
      return { ...cached.quote, status: this.freshnessFor(cached.quote, mapping) };
    }

    const fetched = await this.fetchChart(mapping.yahooSymbol, '1d', '1d');
    if (!fetched.ok) {
      this.lastError = fetched.error;
      return unavailable(`Yahoo request failed: ${fetched.error}`, source);
    }
    const meta = fetched.result.meta ?? {};
    const invalid = (reason: string): MarketQuote => {
      this.lastError = reason;
      return { ...unavailable(reason, source), status: 'INVALID' };
    };
    if (meta.exchangeName !== mapping.expectedExchangeName) {
      return invalid(
        `Yahoo ${mapping.yahooSymbol} returned exchange "${meta.exchangeName ?? 'missing'}", expected "${mapping.expectedExchangeName}"; refused.`
      );
    }
    if (meta.currency !== mapping.expectedCurrency) {
      return invalid(
        `Yahoo ${mapping.yahooSymbol} returned currency "${meta.currency ?? 'missing'}", expected "${mapping.expectedCurrency}"; refused (unit cannot be confirmed).`
      );
    }
    const rawPrice = meta.regularMarketPrice;
    const rawTime = meta.regularMarketTime;
    if (typeof rawPrice !== 'number' || !Number.isFinite(rawPrice) || rawPrice <= 0) {
      return invalid(`Yahoo ${mapping.yahooSymbol} returned no valid regularMarketPrice.`);
    }
    if (typeof rawTime !== 'number' || !Number.isFinite(rawTime) || rawTime <= 0) {
      return invalid(`Yahoo ${mapping.yahooSymbol} returned no regularMarketTime (market timestamp).`);
    }
    const unitConv = yahooUnitConversion(meta.currency, unit);
    if (!unitConv.ok) return invalid(unitConv.reason);

    const timestamp = new Date(rawTime * 1000).toISOString();
    const vol = meta.regularMarketVolume;
    const quote: MarketQuote = {
      symbol: inst.exchangeSymbol,
      exchange: inst.exchange,
      contractMonth: null,
      price: applyUnitFactor(rawPrice, unitConv.factor),
      bid: null, // not provided by the chart endpoint; never filled
      ask: null,
      volume: typeof vol === 'number' && Number.isFinite(vol) && vol >= 0 ? vol : null,
      openInterest: null, // not provided; never filled
      currency,
      unit,
      source,
      timestamp,
      retrievedAt: new Date(this.now()).toISOString(),
      status: 'DELAYED',
      statusReason: `UNOFFICIAL Yahoo Finance ${mapping.yahooSymbol} (${mapping.fullExchangeName}), exchange delay ~${mapping.delayMinutes} min, ${YAHOO_CONTRACT_LABEL}; personal use only. ${unitConv.note}`,
      delayMinutes: mapping.delayMinutes,
      sourceQuality: 'UNOFFICIAL',
      contract: YAHOO_CONTRACT_LABEL,
      tradingPeriod: meta.currentTradingPeriod?.regular
        ? { start: meta.currentTradingPeriod.regular.start ?? null, end: meta.currentTradingPeriod.regular.end ?? null }
        : null,
    };
    quote.status = this.freshnessFor(quote, mapping);
    this.quoteCache.set(mapping.yahooSymbol, { quote, expiresAtMs: this.now() + this.quoteTtlMs });
    this.lastSyncAt = quote.retrievedAt;
    this.lastError = null;
    return quote;
  }

  private freshnessFor(quote: MarketQuote, mapping: YahooSymbolMapping): DataQualityStatus {
    const tp = quote.tradingPeriod;
    return classifyYahooFreshness(
      quote.timestamp,
      mapping.delayMinutes,
      this.now(),
      tp && tp.start !== null && tp.end !== null ? { start: tp.start, end: tp.end } : null
    );
  }

  /**
   * Daily candles (range=2y, interval=1d). Bars are dated by the exchange-local trading date
   * (UTC midnight). The bar of the session still in progress is dropped (incomplete).
   */
  async getCandles(
    symbol: string,
    _timeframe: string = 'D1'
  ): Promise<{ candles: MarketCandle[]; status: DataQualityStatus; reason?: string }> {
    if (!isYahooEnabled()) {
      return { candles: [], status: 'UNAVAILABLE', reason: 'Yahoo adapter disabled (YAHOO_ENABLED is not true).' };
    }
    const inst = await instrumentRepository.findBySymbol(symbol);
    if (!inst) return { candles: [], status: 'UNAVAILABLE', reason: `Instrument ${symbol} is not registered.` };
    const mapping = YahooFinanceAdapter.mappingFor(inst.exchangeSymbol);
    if (!mapping) {
      return { candles: [], status: 'UNAVAILABLE', reason: `UNSUPPORTED — ${YahooFinanceAdapter.unsupportedReason(inst.exchangeSymbol)}` };
    }
    const fetched = await this.fetchChart(mapping.yahooSymbol, '2y', '1d');
    if (!fetched.ok) {
      this.lastError = fetched.error;
      return { candles: [], status: 'UNAVAILABLE', reason: `Yahoo request failed: ${fetched.error}` };
    }
    const parsed = parseYahooDailyCandles(fetched.result, inst, mapping, this.now());
    if (!parsed.ok) {
      this.lastError = parsed.reason;
      return { candles: [], status: 'INVALID', reason: parsed.reason };
    }
    const validation = validateCandleSeries(parsed.candles);
    if (!validation.valid) {
      this.lastError = validation.errors.join('; ');
      return { candles: [], status: 'INVALID', reason: this.lastError };
    }
    this.lastSyncAt = new Date(this.now()).toISOString();
    this.lastError = null;
    return {
      candles: validation.validCandles,
      status: 'HISTORICAL',
      reason: `UNOFFICIAL Yahoo ${mapping.yahooSymbol} D1, ${YAHOO_CONTRACT_LABEL}; personal use only.${parsed.dropped ? ` ${parsed.dropped} incomplete/null bar(s) dropped.` : ''}`,
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
    const enabled = isYahooEnabled();
    const supported = Object.keys(YAHOO_SYMBOL_MAP);
    return {
      providerId: this.providerId,
      name: this.providerName,
      exchanges: ['CBOT', 'ICE', 'COMEX', 'NYMEX'],
      connectionState: !enabled ? 'UNCONFIGURED' : this.lastError ? 'DEGRADED' : 'CONNECTED',
      dataStatus: enabled && !this.lastError ? 'DELAYED' : 'UNAVAILABLE',
      credentialsConfigured: enabled,
      supportsRealtime: false,
      supportsHistorical: true,
      lastCheckedAt: new Date(this.now()).toISOString(),
      lastSuccessfulSyncAt: this.lastSyncAt,
      requiredEnvVars: ['YAHOO_ENABLED'],
      supportedScopes: [
        `Continuous front month (${supported.join(', ')})`,
        `Unsupported: ${Object.keys(YAHOO_UNSUPPORTED).join(', ')}`,
        'Daily OHLCV (2y)',
      ],
      lastError: this.lastError,
      sourceQuality: 'UNOFFICIAL',
      delayNote: 'CBOT ~10 min; ICE US / COMEX / NYMEX ~30 min',
      message: !enabled
        ? 'Disabled. Set YAHOO_ENABLED=true for free delayed quotes (UNOFFICIAL, personal use only per Yahoo terms; lower priority than licensed feeds).'
        : this.lastError
          ? `Last Yahoo issue: ${this.lastError}`
          : 'UNOFFICIAL delayed quotes enabled (CBOT ~10 min, ICE US/COMEX/NYMEX ~30 min). Personal use only; not a licensed feed.',
    };
  }
}

/** Parses a chart response into daily candles in our quotation unit. Exported for tests. */
export function parseYahooDailyCandles(
  result: YahooChartResult,
  inst: InstrumentDefinition,
  mapping: YahooSymbolMapping,
  nowMs: number
): { ok: true; candles: MarketCandle[]; dropped: number } | { ok: false; reason: string } {
  const meta = result.meta ?? {};
  if (meta.exchangeName !== mapping.expectedExchangeName || meta.currency !== mapping.expectedCurrency) {
    return {
      ok: false,
      reason: `Yahoo ${mapping.yahooSymbol} returned ${meta.exchangeName ?? '?'}/${meta.currency ?? '?'}, expected ${mapping.expectedExchangeName}/${mapping.expectedCurrency}; refused.`,
    };
  }
  const conv = yahooUnitConversion(meta.currency, inst.specification.quotationUnit);
  if (!conv.ok) return { ok: false, reason: conv.reason };
  const ts = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  const offsetSec = typeof meta.gmtoffset === 'number' ? meta.gmtoffset : 0;
  const regular = meta.currentTradingPeriod?.regular;
  const sessionInProgress =
    regular && typeof regular.start === 'number' && typeof regular.end === 'number' && nowMs / 1000 < regular.end;
  const retrievedAt = new Date(nowMs).toISOString();
  const candles: MarketCandle[] = [];
  let dropped = 0;
  for (let i = 0; i < ts.length; i++) {
    const open = q.open?.[i];
    const high = q.high?.[i];
    const low = q.low?.[i];
    const close = q.close?.[i];
    const vol = q.volume?.[i];
    if (
      typeof ts[i] !== 'number' ||
      [open, high, low, close].some((v) => typeof v !== 'number' || !Number.isFinite(v) || v <= 0)
    ) {
      dropped += 1;
      continue;
    }
    if (sessionInProgress && ts[i] >= regular!.start!) {
      dropped += 1; // today's bar is not final yet
      continue;
    }
    const localDate = new Date((ts[i] + offsetSec) * 1000).toISOString().slice(0, 10);
    candles.push({
      symbol: inst.exchangeSymbol,
      exchange: inst.exchange,
      timeframe: 'D1' satisfies Timeframe,
      timestamp: `${localDate}T00:00:00.000Z`,
      retrievedAt,
      open: applyUnitFactor(open as number, conv.factor),
      high: applyUnitFactor(high as number, conv.factor),
      low: applyUnitFactor(low as number, conv.factor),
      close: applyUnitFactor(close as number, conv.factor),
      volume: typeof vol === 'number' && Number.isFinite(vol) && vol >= 0 ? vol : null,
      openInterest: null,
      isComplete: true,
      source: `${YAHOO_PROVIDER_ID}:${mapping.yahooSymbol}`,
      status: 'HISTORICAL',
    });
  }
  candles.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  // Keep one bar per trading date (last wins).
  const unique = candles.filter((c, i) => i === candles.length - 1 || candles[i + 1].timestamp !== c.timestamp);
  return { ok: true, candles: unique, dropped: dropped + (candles.length - unique.length) };
}
