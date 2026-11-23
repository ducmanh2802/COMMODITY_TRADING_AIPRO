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
/** Batch endpoint: one request returns 1m closes for many symbols (no crumb needed; no exchange metadata). */
export const YAHOO_SPARK_BASE = 'https://query1.finance.yahoo.com/v8/finance/spark';
/** Max |spark last - chart regularMarketPrice| / chart before a quote is refused as INVALID. */
export const YAHOO_CROSSCHECK_MAX_DEVIATION = 0.02;
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
  /**
   * ICE softs: Yahoo's daily close is the exchange SETTLEMENT, which can lie outside the traded high/low.
   * When true, high/low are widened to include the close (labelled in the reason); open must still be in range.
   */
  settlementClose?: boolean;
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
  KC: { yahooSymbol: 'KC=F', expectedExchangeName: 'NYB', fullExchangeName: 'ICE Futures', expectedCurrency: 'USX', delayMinutes: 30, settlementClose: true },
  SB: { yahooSymbol: 'SB=F', expectedExchangeName: 'NYB', fullExchangeName: 'ICE Futures', expectedCurrency: 'USX', delayMinutes: 30, settlementClose: true },
  CC: { yahooSymbol: 'CC=F', expectedExchangeName: 'NYB', fullExchangeName: 'ICE Futures', expectedCurrency: 'USD', delayMinutes: 30, settlementClose: true },
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

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * Parses the contract month Yahoo embeds in meta.shortName of a continuous futures symbol
 * (e.g. "Corn Futures,Mar-2027" -> { month: '2027-03', label: 'Mar-2027' }). null when absent.
 */
export function parseYahooContractMonth(shortName: string | undefined | null): { month: string; label: string } | null {
  if (typeof shortName !== 'string') return null;
  const m = /(?:^|[\s,])([A-Za-z]{3})-(\d{4})\s*$/.exec(shortName.trim());
  if (!m) return null;
  const idx = MONTHS.indexOf(m[1].toLowerCase());
  if (idx < 0) return null;
  return { month: `${m[2]}-${String(idx + 1).padStart(2, '0')}`, label: `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()}-${m[2]}` };
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
  longName?: string;
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
  /** Quote cache TTL. Default 15 s (one batch request refreshes every supported symbol). */
  quoteTtlMs?: number;
  /** How long validated exchange/currency metadata (from chart) is trusted. Default 3 h. */
  metaTtlMs?: number;
  /** Use the batch spark endpoint (default true); per-symbol chart remains the fallback. */
  useBatch?: boolean;
  /** Retries after the first attempt on HTTP 429 / 5xx / network error. Default 2. */
  maxRetries?: number;
  /** Base backoff; attempt n waits base * 2^n (or Retry-After, capped at 30 s). Default 1000 ms. */
  backoffBaseMs?: number;
  timeoutMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

interface YahooSparkSeries {
  symbol?: string;
  timestamp?: Array<number | null>;
  close?: Array<number | null>;
  start?: number;
  end?: number;
}

/** Last non-null positive close and its bar time (seconds). Exported for tests. */
export function lastSparkClose(series: YahooSparkSeries | undefined): { price: number; time: number } | null {
  const ts = series?.timestamp ?? [];
  const cl = series?.close ?? [];
  for (let i = Math.min(ts.length, cl.length) - 1; i >= 0; i--) {
    const c = cl[i];
    const t = ts[i];
    if (typeof c === 'number' && Number.isFinite(c) && c > 0 && typeof t === 'number' && Number.isFinite(t) && t > 0) {
      return { price: c, time: t };
    }
  }
  return null;
}

type MetaEntry = {
  expiresAtMs: number;
  /** null when exchange/currency matched; otherwise the refusal reason. */
  error: string | null;
  meta: YahooChartMeta | undefined;
};

type FetchResult = { ok: true; result: YahooChartResult } | { ok: false; error: string };

export type YahooHistoryRange = '1mo' | '3mo' | '6mo' | '1y' | '2y' | '5y' | '10y' | 'max';

export class YahooFinanceAdapter implements MarketDataProvider {
  public readonly providerId: ProviderId = YAHOO_PROVIDER_ID;
  public readonly providerName = 'Yahoo Finance chart API (UNOFFICIAL, delayed, personal use only)';
  private readonly fetchFn: FetchLike;
  private readonly minIntervalMs: number;
  private readonly quoteTtlMs: number;
  private readonly metaTtlMs: number;
  private readonly useBatch: boolean;
  private readonly metaCache = new Map<string, MetaEntry>();
  /** Quotes refused by the spark/chart cross-check (or failed metadata validation), by Yahoo symbol. */
  private readonly refused = new Map<string, { reason: string; expiresAtMs: number }>();
  private batchInflight: Promise<void> | null = null;
  private batchFailedUntilMs = Number.NEGATIVE_INFINITY;
  private readonly maxRetries: number;
  private readonly backoffBaseMs: number;
  private readonly timeoutMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly quoteCache = new Map<string, { quote: MarketQuote; expiresAtMs: number }>();
  /** In-flight background quote refreshes by Yahoo symbol (stale-while-revalidate dedupe). */
  private readonly inflight = new Map<string, Promise<MarketQuote | null>>();
  /** Per-symbol "do not refresh before" time after a failed background refresh (one TTL). */
  private readonly failedUntil = new Map<string, number>();
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
    this.quoteTtlMs = options.quoteTtlMs ?? 15_000;
    this.metaTtlMs = options.metaTtlMs ?? 3 * 3_600_000;
    this.useBatch = options.useBatch ?? true;
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

  // -------------------------------------------------------------------------------------------------
  // Batch refresh (spark)
  // -------------------------------------------------------------------------------------------------

  private async supportedInstruments(): Promise<InstrumentDefinition[]> {
    const all = await instrumentRepository.list();
    return all.filter((i) => this.supports(i));
  }

  /**
   * One spark request refreshes every supported symbol. Price = last non-null 1m close, timestamp = that
   * bar's time. Exchange/currency are validated through chart metadata at most once per metaTtlMs; when
   * the chart is fetched in the same cycle its regularMarketPrice cross-checks the spark price (>2%
   * apart => refused as INVALID and logged). Concurrent callers share one in-flight refresh. On any batch
   * failure the caller falls back to the per-symbol chart path.
   */
  refreshQuotesBatch(): Promise<void> {
    if (!isYahooEnabled() || !this.useBatch) return Promise.resolve();
    if (this.batchFailedUntilMs > this.now()) return Promise.resolve();
    if (!this.batchInflight) {
      this.batchInflight = this.doRefreshBatch()
        .catch((err: unknown) => {
          this.lastError = err instanceof Error ? err.message : 'Yahoo batch refresh failed';
          this.batchFailedUntilMs = this.now() + this.quoteTtlMs;
        })
        .finally(() => {
          this.batchInflight = null;
        });
    }
    return this.batchInflight;
  }

  private async fetchSpark(
    yahooSymbols: string[]
  ): Promise<{ ok: true; body: Record<string, YahooSparkSeries> } | { ok: false; error: string }> {
    const url = `${YAHOO_SPARK_BASE}?symbols=${yahooSymbols.map(encodeURIComponent).join(',')}&range=1d&interval=1m`;
    await this.throttle();
    try {
      this.requestCount += 1;
      const res = await this.fetchFn(url, {
        headers: { 'User-Agent': YAHOO_USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) return { ok: false, error: `spark HTTP ${res.status}` };
      const body = (await res.json()) as unknown;
      if (!body || typeof body !== 'object') return { ok: false, error: 'spark: unexpected response' };
      return { ok: true, body: body as Record<string, YahooSparkSeries> };
    } catch (err) {
      return { ok: false, error: `spark: ${err instanceof Error ? err.message : 'network error'}` };
    }
  }

  private async doRefreshBatch(): Promise<void> {
    const insts = await this.supportedInstruments();
    const entries = insts.map((inst) => ({ inst, mapping: YAHOO_SYMBOL_MAP[inst.exchangeSymbol.trim().toUpperCase()] }));
    if (entries.length === 0) return;
    const spark = await this.fetchSpark(entries.map((e) => e.mapping.yahooSymbol));
    if (!spark.ok) {
      this.lastError = spark.error;
      this.batchFailedUntilMs = this.now() + this.quoteTtlMs;
      return;
    }
    // Validate exchange/currency via chart meta for symbols without fresh metadata (rate-limited queue).
    const freshCharts = new Map<string, YahooChartMeta | undefined>();
    await Promise.all(
      entries.map(async ({ mapping }) => {
        const cached = this.metaCache.get(mapping.yahooSymbol);
        if (cached && cached.expiresAtMs > this.now()) return;
        const fetched = await this.fetchChart(mapping.yahooSymbol, '1d', '1d');
        if (!fetched.ok) return; // no metadata: no spark quote; the per-symbol path reports the error
        const meta = fetched.result.meta;
        let error: string | null = null;
        if (meta?.exchangeName !== mapping.expectedExchangeName) {
          error = `Yahoo ${mapping.yahooSymbol} returned exchange "${meta?.exchangeName ?? 'missing'}", expected "${mapping.expectedExchangeName}"; refused.`;
        } else if (meta?.currency !== mapping.expectedCurrency) {
          error = `Yahoo ${mapping.yahooSymbol} returned currency "${meta?.currency ?? 'missing'}", expected "${mapping.expectedCurrency}"; refused (unit cannot be confirmed).`;
        }
        this.metaCache.set(mapping.yahooSymbol, { expiresAtMs: this.now() + (error ? 30 * 60_000 : this.metaTtlMs), error, meta });
        freshCharts.set(mapping.yahooSymbol, meta);
      })
    );

    let okCount = 0;
    for (const { inst, mapping } of entries) {
      const sym = mapping.yahooSymbol;
      const metaEntry = this.metaCache.get(sym);
      if (!metaEntry || metaEntry.expiresAtMs <= this.now()) continue;
      if (metaEntry.error) {
        this.refused.set(sym, { reason: metaEntry.error, expiresAtMs: metaEntry.expiresAtMs });
        continue;
      }
      const last = lastSparkClose(spark.body[sym]);
      if (!last) continue;
      const chartPrice = freshCharts.get(sym)?.regularMarketPrice;
      if (typeof chartPrice === 'number' && chartPrice > 0) {
        const dev = Math.abs(last.price - chartPrice) / chartPrice;
        if (dev > YAHOO_CROSSCHECK_MAX_DEVIATION) {
          const reason = `Yahoo ${sym} cross-check failed: spark ${last.price} vs chart ${chartPrice} (${(dev * 100).toFixed(1)}% apart); refused.`;
          console.warn(`[yahoo] ${reason}`);
          this.lastError = reason;
          this.refused.set(sym, { reason, expiresAtMs: this.now() + this.quoteTtlMs });
          this.quoteCache.delete(sym);
          continue;
        }
      }
      this.refused.delete(sym);
      const built = this.buildQuoteFromSpark(inst, mapping, last, spark.body[sym], metaEntry.meta);
      if (!built) continue;
      this.quoteCache.set(sym, { quote: built, expiresAtMs: this.now() + this.quoteTtlMs });
      this.failedUntil.delete(sym);
      okCount += 1;
    }
    if (okCount > 0) {
      this.lastSyncAt = new Date(this.now()).toISOString();
      this.lastError = null;
    }
  }

  private buildQuoteFromSpark(
    inst: InstrumentDefinition,
    mapping: YahooSymbolMapping,
    last: { price: number; time: number },
    series: YahooSparkSeries | undefined,
    meta: YahooChartMeta | undefined
  ): MarketQuote | null {
    const unit = inst.specification.quotationUnit;
    const conv = yahooUnitConversion(mapping.expectedCurrency, unit);
    if (!conv.ok) return null;
    const start = typeof series?.start === 'number' ? series.start : (meta?.currentTradingPeriod?.regular?.start ?? null);
    const end = typeof series?.end === 'number' ? series.end : (meta?.currentTradingPeriod?.regular?.end ?? null);
    const cm = parseYahooContractMonth(meta?.shortName);
    const quote: MarketQuote = {
      symbol: inst.exchangeSymbol,
      exchange: inst.exchange,
      contractMonth: cm?.month ?? null,
      contractLabel: cm?.label ?? null,
      price: applyUnitFactor(last.price, conv.factor),
      bid: null,
      ask: null,
      volume: null, // spark carries no volume; never filled
      openInterest: null,
      currency: inst.specification.tradingCurrency,
      unit,
      source: `${this.providerId}:${mapping.yahooSymbol}`,
      timestamp: new Date(last.time * 1000).toISOString(),
      retrievedAt: new Date(this.now()).toISOString(),
      status: 'DELAYED',
      statusReason: `UNOFFICIAL Yahoo Finance ${mapping.yahooSymbol} (${mapping.fullExchangeName}) last 1m close via batch spark, exchange delay ~${mapping.delayMinutes} min, ${YAHOO_CONTRACT_LABEL}${cm ? ` (currently ${cm.label})` : ''}; personal use only. ${conv.note}`,
      delayMinutes: mapping.delayMinutes,
      sourceQuality: 'UNOFFICIAL',
      contract: YAHOO_CONTRACT_LABEL,
      tradingPeriod: start !== null && end !== null ? { start, end } : null,
    };
    quote.status = this.freshnessFor(quote, mapping);
    return quote;
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

    if (this.useBatch) {
      await this.refreshQuotesBatch();
      const fresh = this.quoteCache.get(mapping.yahooSymbol);
      if (fresh && fresh.expiresAtMs > this.now()) {
        return { ...fresh.quote, status: this.freshnessFor(fresh.quote, mapping) };
      }
      const refusal = this.refused.get(mapping.yahooSymbol);
      if (refusal && refusal.expiresAtMs > this.now()) {
        return { ...unavailable(refusal.reason, source), status: 'INVALID' };
      }
    }

    const fetched = await this.fetchChart(mapping.yahooSymbol, '1d', '1d');
    if (!fetched.ok) {
      this.lastError = fetched.error;
      return unavailable(`Yahoo request failed: ${fetched.error}`, source);
    }
    const parsedQuote = this.buildValidatedQuoteFromMeta(fetched.result.meta, inst, mapping);
    if (!parsedQuote.ok) {
      this.lastError = parsedQuote.reason;
      return { ...unavailable(parsedQuote.reason, source), status: 'INVALID' };
    }
    this.metaCache.set(mapping.yahooSymbol, { expiresAtMs: this.now() + this.metaTtlMs, error: null, meta: fetched.result.meta });
    this.quoteCache.set(mapping.yahooSymbol, { quote: parsedQuote.quote, expiresAtMs: this.now() + this.quoteTtlMs });
    this.failedUntil.delete(mapping.yahooSymbol);
    this.lastSyncAt = parsedQuote.quote.retrievedAt;
    this.lastError = null;
    return parsedQuote.quote;
  }

  private buildValidatedQuoteFromMeta(
    meta: YahooChartMeta | undefined,
    inst: InstrumentDefinition,
    mapping: YahooSymbolMapping
  ): { ok: true; quote: MarketQuote } | { ok: false; reason: string } {
    const m = meta ?? {};
    const currency = inst.specification.tradingCurrency;
    const unit = inst.specification.quotationUnit;
    const source = `${this.providerId}:${mapping.yahooSymbol}`;
    if (m.exchangeName !== mapping.expectedExchangeName) {
      return {
        ok: false,
        reason: `Yahoo ${mapping.yahooSymbol} returned exchange "${m.exchangeName ?? 'missing'}", expected "${mapping.expectedExchangeName}"; refused.`,
      };
    }
    if (m.currency !== mapping.expectedCurrency) {
      return {
        ok: false,
        reason: `Yahoo ${mapping.yahooSymbol} returned currency "${m.currency ?? 'missing'}", expected "${mapping.expectedCurrency}"; refused (unit cannot be confirmed).`,
      };
    }
    const rawPrice = m.regularMarketPrice;
    const rawTime = m.regularMarketTime;
    if (typeof rawPrice !== 'number' || !Number.isFinite(rawPrice) || rawPrice <= 0) {
      return { ok: false, reason: `Yahoo ${mapping.yahooSymbol} returned no valid regularMarketPrice.` };
    }
    if (typeof rawTime !== 'number' || !Number.isFinite(rawTime) || rawTime <= 0) {
      return { ok: false, reason: `Yahoo ${mapping.yahooSymbol} returned no regularMarketTime (market timestamp).` };
    }
    const unitConv = yahooUnitConversion(m.currency, unit);
    if (!unitConv.ok) return { ok: false, reason: unitConv.reason };

    const timestamp = new Date(rawTime * 1000).toISOString();
    const vol = m.regularMarketVolume;
    const cm = parseYahooContractMonth(m.shortName);
    const quote: MarketQuote = {
      symbol: inst.exchangeSymbol,
      exchange: inst.exchange,
      contractMonth: cm?.month ?? null,
      contractLabel: cm?.label ?? null,
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
      statusReason: `UNOFFICIAL Yahoo Finance ${mapping.yahooSymbol} (${mapping.fullExchangeName}), exchange delay ~${mapping.delayMinutes} min, ${YAHOO_CONTRACT_LABEL}${cm ? ` (currently ${cm.label})` : ''}; personal use only. ${unitConv.note}`,
      delayMinutes: mapping.delayMinutes,
      sourceQuality: 'UNOFFICIAL',
      contract: YAHOO_CONTRACT_LABEL,
      tradingPeriod: m.currentTradingPeriod?.regular
        ? { start: m.currentTradingPeriod.regular.start ?? null, end: m.currentTradingPeriod.regular.end ?? null }
        : null,
    };
    quote.status = this.freshnessFor(quote, mapping);
    return { ok: true, quote };
  }

  /**
   * Stale-while-revalidate quote read for request paths (GET /api/market/quotes). A fresh cached
   * quote is returned at once. Otherwise one background refresh per Yahoo symbol is started (deduped;
   * the polite 1 req/s queue still applies) and awaited for at most `waitMs`. If it has not finished,
   * the last cached quote is returned with its freshness re-evaluated from the MARKET timestamp (so it
   * honestly turns STALE as it ages), or, with no cache yet, an UNAVAILABLE placeholder. Callers never
   * wait for the whole Yahoo queue.
   */
  async getQuoteStaleWhileRevalidate(
    inst: InstrumentDefinition,
    waitMs: number
  ): Promise<{ quote: MarketQuote; refreshPending: boolean }> {
    const mapping = YahooFinanceAdapter.mappingFor(inst.exchangeSymbol);
    if (!isYahooEnabled() || !mapping || !yahooUnitConversion(mapping.expectedCurrency, inst.specification.quotationUnit).ok) {
      // No network involved: the regular path returns the disabled/unsupported quote immediately.
      return { quote: await this.getQuoteForInstrument(inst), refreshPending: false };
    }
    const cached = this.quoteCache.get(mapping.yahooSymbol);
    if (cached && cached.expiresAtMs > this.now()) {
      return { quote: { ...cached.quote, status: this.freshnessFor(cached.quote, mapping) }, refreshPending: false };
    }

    let refresh = this.inflight.get(mapping.yahooSymbol);
    const backoffUntil = this.failedUntil.get(mapping.yahooSymbol) ?? Number.NEGATIVE_INFINITY;
    if (!refresh && backoffUntil > this.now()) {
      // Recent failure: do not hammer Yahoo on every page load; serve what we have, labelled honestly.
      const reason = `Yahoo refresh paused after failure: ${this.lastError ?? 'unknown error'}`;
      if (cached) {
        return {
          quote: {
            ...cached.quote,
            status: this.freshnessFor(cached.quote, mapping),
            statusReason: `${cached.quote.statusReason ?? ''} ${reason}; showing last cached value.`.trim(),
          },
          refreshPending: false,
        };
      }
      return {
        quote: createUnavailableQuote({
          symbol: inst.exchangeSymbol,
          exchange: inst.exchange,
          contractMonth: null,
          currency: inst.specification.tradingCurrency,
          unit: inst.specification.quotationUnit,
          source: `${this.providerId}:${mapping.yahooSymbol}`,
          reason: `DATA_UNAVAILABLE — ${reason}.`,
        }),
        refreshPending: false,
      };
    }
    if (!refresh) {
      refresh = this.getQuoteForInstrument(inst)
        .catch((err: unknown) => {
          this.lastError = err instanceof Error ? err.message : 'Yahoo refresh failed';
          return null;
        })
        .then((q) => {
          if (!q || q.price === null) this.failedUntil.set(mapping.yahooSymbol, this.now() + this.quoteTtlMs);
          else this.failedUntil.delete(mapping.yahooSymbol);
          return q;
        })
        .finally(() => this.inflight.delete(mapping.yahooSymbol));
      this.inflight.set(mapping.yahooSymbol, refresh);
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), Math.max(0, waitMs));
    });
    const settled = await Promise.race([refresh, timeout]);
    clearTimeout(timer);
    if (settled !== 'timeout' && settled !== null) {
      // A failed refresh keeps the previous good quote (re-labelled by age) rather than blanking it.
      if (settled.price === null && cached) {
        return {
          quote: {
            ...cached.quote,
            status: this.freshnessFor(cached.quote, mapping),
            statusReason: `${cached.quote.statusReason ?? ''} Last refresh failed (${settled.statusReason ?? 'unknown'}); showing last cached value.`.trim(),
          },
          refreshPending: false,
        };
      }
      return { quote: settled, refreshPending: false };
    }

    if (cached) {
      return {
        quote: {
          ...cached.quote,
          status: this.freshnessFor(cached.quote, mapping),
          statusReason: `${cached.quote.statusReason ?? ''} Cached value (retrieved ${cached.quote.retrievedAt}); refreshing in background.`.trim(),
        },
        refreshPending: true,
      };
    }
    return {
      quote: createUnavailableQuote({
        symbol: inst.exchangeSymbol,
        exchange: inst.exchange,
        contractMonth: null,
        currency: inst.specification.tradingCurrency,
        unit: inst.specification.quotationUnit,
        source: `${this.providerId}:${mapping.yahooSymbol}`,
        reason: 'DATA_UNAVAILABLE — Yahoo (UNOFFICIAL) quote is being fetched in the background; refresh shortly.',
      }),
      refreshPending: true,
    };
  }

  /** Resolves when all background refreshes started so far have settled (tests / graceful shutdown). */
  async waitForBackgroundRefreshes(): Promise<void> {
    await Promise.all([...this.inflight.values()]);
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
   * Daily candles (default range=2y, interval=1d; supports 5y/10y via options.range).
   * Bars are dated by the exchange-local trading date (UTC midnight).
   * The bar of the session still in progress is dropped (incomplete).
   */
  async getCandles(
    symbol: string,
    _timeframe: string = 'D1',
    _fromIso?: string,
    _toIso?: string,
    options?: { range?: YahooHistoryRange }
  ): Promise<{ candles: MarketCandle[]; status: DataQualityStatus; reason?: string }> {
    const range: YahooHistoryRange = options?.range ?? '2y';
    if (!isYahooEnabled()) {
      return { candles: [], status: 'UNAVAILABLE', reason: 'Yahoo adapter disabled (YAHOO_ENABLED is not true).' };
    }
    const inst = await instrumentRepository.findBySymbol(symbol);
    if (!inst) return { candles: [], status: 'UNAVAILABLE', reason: `Instrument ${symbol} is not registered.` };
    const mapping = YahooFinanceAdapter.mappingFor(inst.exchangeSymbol);
    if (!mapping) {
      return { candles: [], status: 'UNAVAILABLE', reason: `UNSUPPORTED — ${YahooFinanceAdapter.unsupportedReason(inst.exchangeSymbol)}` };
    }
    const fetched = await this.fetchChart(mapping.yahooSymbol, range, '1d');
    if (!fetched.ok) {
      this.lastError = fetched.error;
      return { candles: [], status: 'UNAVAILABLE', reason: `Yahoo request failed: ${fetched.error}` };
    }
    const parsed = parseYahooDailyCandles(fetched.result, inst, mapping, this.now());
    if (!parsed.ok) {
      this.lastError = parsed.reason;
      return { candles: [], status: 'INVALID', reason: parsed.reason };
    }
    // Yahoo continuous series occasionally carry a settlement close outside that day's high/low. Drop only those
    // individual bars (never repair them) when they are rare (<=2%); anything else still fails closed.
    const ohlcOk = (c: MarketCandle) =>
      c.high >= c.low && c.high >= c.open && c.high >= c.close && c.low <= c.open && c.low <= c.close;
    let widened = 0;
    const base = mapping.settlementClose
      ? parsed.candles.map((c) => {
          if (c.high >= c.low && c.open <= c.high && c.open >= c.low && (c.close > c.high || c.close < c.low)) {
            widened++;
            return { ...c, high: Math.max(c.high, c.close), low: Math.min(c.low, c.close) };
          }
          return c;
        })
      : parsed.candles;
    const badOhlc = base.filter((c) => !ohlcOk(c)).length;
    const candlesIn = badOhlc > 0 && badOhlc <= Math.max(1, Math.floor(base.length * 0.02)) ? base.filter(ohlcOk) : base;
    const droppedOhlc = base.length - candlesIn.length;
    const validation = validateCandleSeries(candlesIn);
    if (!validation.valid) {
      this.lastError = validation.errors.join('; ');
      return { candles: [], status: 'INVALID', reason: this.lastError };
    }
    // Warm quoteCache from validated chart metadata so startup history sync also delivers live delayed quotes without extra API calls.
    const warmedQuote = this.buildValidatedQuoteFromMeta(fetched.result.meta, inst, mapping);
    if (warmedQuote.ok) {
      this.metaCache.set(mapping.yahooSymbol, { expiresAtMs: this.now() + this.metaTtlMs, error: null, meta: fetched.result.meta });
      this.quoteCache.set(mapping.yahooSymbol, {
        quote: warmedQuote.quote,
        expiresAtMs: this.now() + this.quoteTtlMs,
      });
      this.failedUntil.delete(mapping.yahooSymbol);
    }
    this.lastSyncAt = new Date(this.now()).toISOString();
    this.lastError = null;
    return {
      candles: validation.validCandles,
      status: 'HISTORICAL',
      reason: `UNOFFICIAL Yahoo ${mapping.yahooSymbol} D1 (${range}), ${YAHOO_CONTRACT_LABEL}; personal use only.${parsed.dropped ? ` ${parsed.dropped} incomplete/null bar(s) dropped.` : ''}${droppedOhlc ? ` ${droppedOhlc} bar(s) with inconsistent OHLC dropped.` : ''}${widened ? ` ${widened} bar(s): high/low widened to include the settlement close.` : ''}`,
    };
  }

  /** Intraday candles (M15: 15m/1mo, H1: 60m/3mo), UNOFFICIAL and delayed. One request per call. */
  async getIntradayCandles(
    symbol: string,
    timeframe: YahooIntradayTimeframe
  ): Promise<{ candles: MarketCandle[]; status: DataQualityStatus; reason?: string }> {
    if (!isYahooEnabled()) {
      return { candles: [], status: 'UNAVAILABLE', reason: 'Yahoo adapter disabled (YAHOO_ENABLED is not true).' };
    }
    const inst = await instrumentRepository.findBySymbol(symbol);
    if (!inst) return { candles: [], status: 'UNAVAILABLE', reason: `Instrument ${symbol} is not registered.` };
    const mapping = YahooFinanceAdapter.mappingFor(inst.exchangeSymbol);
    if (!mapping) {
      return { candles: [], status: 'UNAVAILABLE', reason: `UNSUPPORTED - ${YahooFinanceAdapter.unsupportedReason(inst.exchangeSymbol)}` };
    }
    const spec = YAHOO_INTRADAY_SPEC[timeframe];
    const fetched = await this.fetchChart(mapping.yahooSymbol, spec.range, spec.interval);
    if (!fetched.ok) {
      this.lastError = fetched.error;
      return { candles: [], status: 'UNAVAILABLE', reason: `Yahoo request failed: ${fetched.error}` };
    }
    const parsed = parseYahooIntradayCandles(fetched.result, inst, mapping, timeframe, this.now());
    if (!parsed.ok) {
      this.lastError = parsed.reason;
      return { candles: [], status: 'INVALID', reason: parsed.reason };
    }
    if (parsed.candles.length === 0) {
      return { candles: [], status: 'UNAVAILABLE', reason: 'Yahoo returned no complete intraday bars.' };
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
      reason: `UNOFFICIAL Yahoo ${mapping.yahooSymbol} ${timeframe} (${spec.range}), delayed ~${mapping.delayMinutes} min, ${YAHOO_CONTRACT_LABEL}; personal use only.${parsed.droppedIncomplete ? ` ${parsed.droppedIncomplete} incomplete bar(s) dropped.` : ''}${parsed.droppedOhlc ? ` ${parsed.droppedOhlc} bar(s) with inconsistent OHLC dropped.` : ''}${parsed.dropped ? ` ${parsed.dropped} null/duplicate bar(s) dropped.` : ''}`,
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

export type YahooIntradayTimeframe = 'M15' | 'H1';

/** Yahoo limits: <1h bars <= 60 days, 1h bars <= 730 days. We ask for the smallest range that covers retention. */
export const YAHOO_INTRADAY_SPEC: Readonly<Record<YahooIntradayTimeframe, { interval: string; range: string; barMs: number }>> = {
  M15: { interval: '15m', range: '1mo', barMs: 15 * 60_000 },
  H1: { interval: '60m', range: '3mo', barMs: 60 * 60_000 },
};

/**
 * Parses an intraday chart response into candles (bar START time, UTC ISO) in our quotation unit.
 * Dropped, never repaired: null/non-positive bars, bars with inconsistent OHLC, and bars not yet complete
 * (start + bar length > now - exchange delay), so append-only storage never freezes a half-formed bar.
 */
export function parseYahooIntradayCandles(
  result: YahooChartResult,
  inst: InstrumentDefinition,
  mapping: YahooSymbolMapping,
  timeframe: YahooIntradayTimeframe,
  nowMs: number
): { ok: true; candles: MarketCandle[]; dropped: number; droppedOhlc: number; droppedIncomplete: number } | { ok: false; reason: string } {
  const meta = result.meta ?? {};
  if (meta.exchangeName !== mapping.expectedExchangeName || meta.currency !== mapping.expectedCurrency) {
    return {
      ok: false,
      reason: `Yahoo ${mapping.yahooSymbol} returned ${meta.exchangeName ?? '?'}/${meta.currency ?? '?'}, expected ${mapping.expectedExchangeName}/${mapping.expectedCurrency}; refused.`,
    };
  }
  const conv = yahooUnitConversion(meta.currency, inst.specification.quotationUnit);
  if (!conv.ok) return { ok: false, reason: conv.reason };
  const barMs = YAHOO_INTRADAY_SPEC[timeframe].barMs;
  const completeBefore = nowMs - mapping.delayMinutes * 60_000;
  const ts = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  const retrievedAt = new Date(nowMs).toISOString();
  const candles: MarketCandle[] = [];
  let dropped = 0;
  let droppedOhlc = 0;
  let droppedIncomplete = 0;
  for (let i = 0; i < ts.length; i++) {
    const open = q.open?.[i];
    const high = q.high?.[i];
    const low = q.low?.[i];
    const close = q.close?.[i];
    const vol = q.volume?.[i];
    if (typeof ts[i] !== 'number' || [open, high, low, close].some((v) => typeof v !== 'number' || !Number.isFinite(v) || v <= 0)) {
      dropped += 1;
      continue;
    }
    const o = open as number;
    const h = high as number;
    const l = low as number;
    const c = close as number;
    if (h < l || h < o || h < c || l > o || l > c) {
      droppedOhlc += 1;
      continue;
    }
    if (ts[i] * 1000 + barMs > completeBefore) {
      droppedIncomplete += 1;
      continue;
    }
    candles.push({
      symbol: inst.exchangeSymbol,
      exchange: inst.exchange,
      timeframe: timeframe satisfies Timeframe,
      timestamp: new Date(ts[i] * 1000).toISOString(),
      retrievedAt,
      open: applyUnitFactor(o, conv.factor),
      high: applyUnitFactor(h, conv.factor),
      low: applyUnitFactor(l, conv.factor),
      close: applyUnitFactor(c, conv.factor),
      volume: typeof vol === 'number' && Number.isFinite(vol) && vol >= 0 ? vol : null,
      openInterest: null,
      isComplete: true,
      source: `${YAHOO_PROVIDER_ID}:${mapping.yahooSymbol}`,
      status: 'HISTORICAL',
    });
  }
  candles.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const unique = candles.filter((c, i) => i === candles.length - 1 || candles[i + 1].timestamp !== c.timestamp);
  return { ok: true, candles: unique, dropped: dropped + (candles.length - unique.length), droppedOhlc, droppedIncomplete };
}
