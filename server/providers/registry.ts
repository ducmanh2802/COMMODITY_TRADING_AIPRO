import type { InstrumentDefinition, Timeframe } from '../../src/shared/types/instrument.ts';
import type {
  MarketDataProvider,
  MarketQuote,
  ProviderHealth,
  ProviderId,
} from '../../src/shared/types/market.ts';
import { FailClosedProviderAdapter, type UnconfiguredProviderConfig } from './base.ts';
import { createUnavailableQuote } from '../../src/shared/utils/validation.ts';
import { CONTINUOUS_CONTRACT_CODE, type DatasetRecord, type ICandleRepository } from '../storage/candleRepository.ts';
import { createProviderCandlePersister, VENDOR_CONTRACT_PREFIX, type PersistProviderCandles } from './syncPersistence.ts';
import { historicalCandleStore } from '../services/candleStore.ts';
import { CsvHistoricalProvider } from './csvHistorical.ts';
import {
  AlphaVantageAdapter,
  CommoditiesApiAdapter,
  ConfigurableRestFeedAdapter,
  EiaEnergyAdapter,
  FmpCommoditiesAdapter,
  syncConfiguredProviders,
  TwelveDataAdapter,
  UsdaQuickStatsAdapter,
} from './externalAdapters.ts';
import { isYahooEnabled, YahooFinanceAdapter, type YahooAdapterOptions } from './yahooAdapter.ts';

function hasEnv(name: string): boolean {
  const val = process.env[name];
  return typeof val === 'string' && val.trim().length > 0;
}

/**
 * Exchange-feed provider configuration. Order only affects health listing order, never routing.
 * MXV_OFFICIAL and THIRD_PARTY_FEED are backed by the owner's ConfigurableRestFeedAdapter (active only
 * when both URL and KEY env vars are set); the others stay fail-closed until a licensed feed exists.
 */
export const DEFAULT_PROVIDER_CONFIGS: readonly UnconfiguredProviderConfig[] = [
  {
    providerId: 'MXV_OFFICIAL',
    providerName: 'MXV (Mercantile Exchange of Vietnam / CQG Member)',
    exchanges: ['MXV'],
    envKeyNames: ['MXV_API_URL', 'MXV_API_KEY'],
    supportsRealtime: true,
    supportsHistorical: true,
    unconfiguredMessage:
      'MXV routes via CQG / M-System without an open public API. Requires MXV_API_URL & MXV_API_KEY from an authorized MXV member.',
  },
  {
    providerId: 'CME_GROUP',
    providerName: 'CME / CBOT / COMEX DataMine',
    exchanges: ['CME', 'CBOT', 'COMEX'],
    envKeyNames: ['CME_DATAMINE_API_KEY'],
    supportsRealtime: true,
    supportsHistorical: true,
    unconfiguredMessage:
      'CME_DATAMINE_API_KEY not configured on server. Official licensing required for CME/CBOT/COMEX feeds.',
  },
  {
    providerId: 'NYMEX_ENERGY',
    providerName: 'NYMEX Energy Feed',
    exchanges: ['NYMEX'],
    envKeyNames: ['CME_DATAMINE_API_KEY'],
    supportsRealtime: true,
    supportsHistorical: true,
    unconfiguredMessage: 'CME_DATAMINE_API_KEY not configured on server for NYMEX energy futures.',
  },
  {
    providerId: 'ICE_FUTURES',
    providerName: 'ICE Futures US / Europe',
    exchanges: ['ICE'],
    envKeyNames: ['ICE_API_KEY'],
    supportsRealtime: true,
    supportsHistorical: true,
    unconfiguredMessage: 'ICE_API_KEY not configured on server. Authorized ICE feed required.',
  },
  {
    providerId: 'THIRD_PARTY_FEED',
    providerName: 'Custom Authorized REST Market Feed',
    exchanges: ['MXV', 'CBOT', 'CME', 'COMEX', 'NYMEX', 'ICE'],
    envKeyNames: ['MARKET_DATA_PROVIDER_URL', 'MARKET_DATA_PROVIDER_KEY'],
    supportsRealtime: true,
    supportsHistorical: true,
    unconfiguredMessage:
      'Set MARKET_DATA_PROVIDER_URL & MARKET_DATA_PROVIDER_KEY in server env to attach a custom brokerage REST feed.',
  },
  {
    providerId: 'CSV_HISTORICAL',
    providerName: 'Historical CSV OHLCV Importer',
    exchanges: ['MXV', 'CBOT', 'CME', 'COMEX', 'NYMEX', 'ICE'],
    envKeyNames: [],
    supportsRealtime: false,
    supportsHistorical: true,
    unconfiguredMessage:
      'No CSV historical files imported yet. Import a validated CSV dataset to populate charts, signals, and backtests.',
  },
];

/** Explicit exchange → primary quote provider routing. Unknown exchanges are not routed (fail closed). */
export const DEFAULT_EXCHANGE_ROUTING: Readonly<Record<string, ProviderId>> = {
  MXV: 'MXV_OFFICIAL',
  CBOT: 'CME_GROUP',
  CME: 'CME_GROUP',
  COMEX: 'CME_GROUP',
  NYMEX: 'NYMEX_ENERGY',
  ICE: 'ICE_FUTURES',
};

/** Config-driven REST adapters (owner's ConfigurableRestFeedAdapter): providerId → env var names. */
const REST_FEED_ENV: Partial<Record<ProviderId, { urlEnv: string; keyEnv: string }>> = {
  MXV_OFFICIAL: { urlEnv: 'MXV_API_URL', keyEnv: 'MXV_API_KEY' },
  THIRD_PARTY_FEED: { urlEnv: 'MARKET_DATA_PROVIDER_URL', keyEnv: 'MARKET_DATA_PROVIDER_KEY' },
};

export interface ProviderRegistryOptions {
  configs?: readonly UnconfiguredProviderConfig[];
  routing?: Readonly<Record<string, ProviderId>>;
  /**
   * Historical candle store (SQLite data layer). When given, the CSV_HISTORICAL provider reads from it
   * and reports honest health; when omitted it stays a fail-closed adapter.
   */
  candles?: ICandleRepository;
  /**
   * Register the owner's external API adapters (Twelve Data, FMP, Commodities-API, Alpha Vantage, EIA,
   * USDA). They only fetch when their API key env var is set. Default true.
   */
  externalAdapters?: boolean;
  /** Options for the Yahoo UNOFFICIAL adapter (tests inject fetch/sleep). Active only with YAHOO_ENABLED=true. */
  yahoo?: YahooAdapterOptions;
}

export class ProviderRegistry {
  private readonly twelveData: TwelveDataAdapter;
  private readonly fmp: FmpCommoditiesAdapter;
  private readonly commoditiesApi: CommoditiesApiAdapter;
  private readonly alphaVantage: AlphaVantageAdapter;
  private readonly eia: EiaEnergyAdapter;
  private readonly usda: UsdaQuickStatsAdapter;
  private readonly yahoo: YahooFinanceAdapter;
  private readonly restFeeds = new Map<ProviderId, ConfigurableRestFeedAdapter>();
  private readonly providers: MarketDataProvider[];
  private readonly providersById: Map<ProviderId, MarketDataProvider>;
  private readonly exchangeRouting: Map<string, MarketDataProvider>;
  private readonly liveQuoteCache = new Map<string, { quote: MarketQuote; expiresAtMs: number }>();
  private readonly quoteTtlMs = 60_000;
  private readonly candleRepository: ICandleRepository | null;
  private readonly persistCandles: PersistProviderCandles | undefined;

  constructor(options: ProviderRegistryOptions = {}) {
    const configs = options.configs ?? DEFAULT_PROVIDER_CONFIGS;
    const routing = options.routing ?? DEFAULT_EXCHANGE_ROUTING;
    this.candleRepository = options.candles ?? null;
    this.persistCandles = options.candles ? createProviderCandlePersister(options.candles) : undefined;

    this.twelveData = new TwelveDataAdapter();
    this.fmp = new FmpCommoditiesAdapter();
    this.commoditiesApi = new CommoditiesApiAdapter();
    this.alphaVantage = new AlphaVantageAdapter();
    this.eia = new EiaEnergyAdapter();
    this.usda = new UsdaQuickStatsAdapter();
    this.yahoo = new YahooFinanceAdapter(options.yahoo);

    this.providers = [];
    this.providersById = new Map();
    const register = (provider: MarketDataProvider) => {
      if (this.providersById.has(provider.providerId)) {
        throw new Error(`Duplicate market data provider id: ${provider.providerId}`);
      }
      this.providersById.set(provider.providerId, provider);
      this.providers.push(provider);
    };

    const configById = new Map<ProviderId, UnconfiguredProviderConfig>();
    for (const config of configs) {
      if (configById.has(config.providerId)) {
        throw new Error(`Duplicate market data provider id: ${config.providerId}`);
      }
      configById.set(config.providerId, config);
      const restEnv = REST_FEED_ENV[config.providerId];
      let provider: MarketDataProvider;
      if (config.providerId === 'CSV_HISTORICAL' && options.candles) {
        provider = new CsvHistoricalProvider(config, options.candles);
      } else if (restEnv) {
        const rest = new ConfigurableRestFeedAdapter({
          providerId: config.providerId,
          providerName: config.providerName,
          urlEnv: restEnv.urlEnv,
          keyEnv: restEnv.keyEnv,
          exchanges: [...config.exchanges],
          unconfiguredMessage: config.unconfiguredMessage,
        });
        this.restFeeds.set(config.providerId, rest);
        provider = rest;
      } else {
        provider = new FailClosedProviderAdapter(config);
      }
      register(provider);
    }

    if (options.externalAdapters !== false) {
      for (const adapter of [this.twelveData, this.fmp, this.commoditiesApi, this.alphaVantage, this.eia, this.usda, this.yahoo]) {
        register(adapter);
      }
    }

    this.exchangeRouting = new Map();
    for (const [exchange, providerId] of Object.entries(routing)) {
      const provider = this.providersById.get(providerId);
      const config = configById.get(providerId);
      if (!provider || !config) {
        throw new Error(`Exchange ${exchange} routed to unregistered provider ${providerId}`);
      }
      if (!config.exchanges.includes(exchange)) {
        throw new Error(`Provider ${providerId} does not declare support for exchange ${exchange}`);
      }
      this.exchangeRouting.set(exchange.toUpperCase(), provider);
    }
  }

  async getAllHealth(): Promise<ProviderHealth[]> {
    const statuses = await Promise.all(this.providers.map((p) => p.getProviderStatus()));
    // Owner's in-memory store (API sync / legacy CSV import) also counts as historical data.
    const importedDatasets = historicalCandleStore.listSummaries();

    return statuses.map((status) => {
      if (
        status.providerId === 'CSV_HISTORICAL' &&
        status.connectionState !== 'CONNECTED' &&
        importedDatasets.length > 0
      ) {
        return {
          ...status,
          connectionState: 'CONNECTED',
          dataStatus: 'HISTORICAL',
          credentialsConfigured: true,
          lastSuccessfulSyncAt: importedDatasets[importedDatasets.length - 1].importedAt,
          message: `${importedDatasets.length} validated OHLCV dataset(s) loaded in memory (not persisted).`,
        };
      }
      return status;
    });
  }

  getProviderById(providerId: ProviderId): MarketDataProvider | null {
    return this.providersById.get(providerId) ?? null;
  }

  /** Returns the primary provider for an exchange, or null when no route exists (caller fails closed). */
  getProviderForExchange(exchange: string): MarketDataProvider | null {
    return this.exchangeRouting.get(exchange.trim().toUpperCase()) ?? null;
  }

  /**
   * Live-quote chain: licensed/official providers first, Yahoo UNOFFICIAL last. Returns the first
   * CURRENT/DELAYED quote; a Yahoo STALE quote with a price (market closed / beyond delay margin) is
   * returned separately as `staleFallback`, competing with stored history by timestamp.
   */
  private async tryFetchLiveQuote(
    instrument: InstrumentDefinition
  ): Promise<{ quote: MarketQuote | null; staleFallback: MarketQuote | null }> {
    const cached = this.liveQuoteCache.get(instrument.exchangeSymbol);
    if (cached && cached.expiresAtMs > Date.now()) {
      return { quote: cached.quote, staleFallback: null };
    }

    const mxvRest = this.restFeeds.get('MXV_OFFICIAL');
    const thirdPartyRest = this.restFeeds.get('THIRD_PARTY_FEED');
    const external = this.providersById.has('TWELVE_DATA');
    const candidates: Array<{ enabled: boolean; fn: () => Promise<MarketQuote>; unofficial?: boolean }> = [
      {
        enabled: Boolean(mxvRest) && instrument.isMvxListed && hasEnv('MXV_API_URL') && hasEnv('MXV_API_KEY'),
        fn: () => mxvRest!.getQuote(instrument.exchangeSymbol),
      },
      {
        enabled: external && hasEnv('TWELVEDATA_API_KEY') && Boolean(instrument.providerMappings?.twelveDataSymbol),
        fn: () => this.twelveData.getQuote(instrument.exchangeSymbol),
      },
      {
        enabled: external && hasEnv('FMP_API_KEY') && Boolean(instrument.providerMappings?.fmpSymbol),
        fn: () => this.fmp.getQuote(instrument.exchangeSymbol),
      },
      {
        enabled:
          external && hasEnv('COMMODITIES_API_KEY') && Boolean(instrument.providerMappings?.commoditiesApiSymbol),
        fn: () => this.commoditiesApi.getQuote(instrument.exchangeSymbol),
      },
      {
        enabled: Boolean(thirdPartyRest) && hasEnv('MARKET_DATA_PROVIDER_URL') && hasEnv('MARKET_DATA_PROVIDER_KEY'),
        fn: () => thirdPartyRest!.getQuote(instrument.exchangeSymbol),
      },
      {
        // T30: lowest priority, UNOFFICIAL delayed quotes; opt-in via YAHOO_ENABLED=true.
        enabled: this.providersById.has('YAHOO_UNOFFICIAL') && isYahooEnabled() && this.yahoo.supports(instrument),
        fn: () => this.yahoo.getQuoteForInstrument(instrument),
        unofficial: true,
      },
    ];

    let staleFallback: MarketQuote | null = null;
    for (const candidate of candidates) {
      if (!candidate.enabled) continue;
      const q = await candidate.fn();
      if (q.price !== null && (q.status === 'CURRENT' || q.status === 'DELAYED')) {
        this.liveQuoteCache.set(instrument.exchangeSymbol, {
          quote: q,
          expiresAtMs: Date.now() + this.quoteTtlMs,
        });
        return { quote: q, staleFallback: null };
      }
      if (candidate.unofficial && q.price !== null && q.status === 'STALE' && q.timestamp) {
        staleFallback = q;
      }
    }

    return { quote: null, staleFallback };
  }

  async getQuoteForInstrument(instrument: InstrumentDefinition): Promise<MarketQuote> {
    // 1. Verified live/delayed API quote when server-side credentials are configured.
    const { quote: liveQuote, staleFallback } = await this.tryFetchLiveQuote(instrument);
    if (liveQuote) {
      return {
        ...liveQuote,
        exchange: instrument.exchange,
        contractMonth: instrument.contractMonth,
      };
    }

    // 2. Last close from stored history, explicitly labelled HISTORICAL with its bar date (never
    //    CURRENT): the owner's in-memory store and the SQLite data layer; the more recent bar wins.
    const memoryQuote = historicalCandleStore.getLatestHistoricalQuote(
      instrument.exchangeSymbol,
      instrument.specification.tradingCurrency,
      instrument.specification.quotationUnit,
      instrument.exchange
    );
    const sqliteQuote = await this.getSqliteHistoricalQuote(instrument);
    const candidates = [memoryQuote, sqliteQuote].filter(
      (q): q is MarketQuote => q !== null && q.status === 'HISTORICAL' && q.price !== null
    );
    // A STALE Yahoo last price (with its market timestamp) competes with stored history; newest wins.
    if (staleFallback) candidates.push({ ...staleFallback, exchange: instrument.exchange });
    if (candidates.length > 0) {
      candidates.sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? ''));
      return candidates[0];
    }

    // 3. Fail closed via the explicitly routed provider.
    const provider = this.getProviderForExchange(instrument.exchange);
    if (!provider) {
      return createUnavailableQuote({
        symbol: instrument.exchangeSymbol,
        exchange: instrument.exchange,
        contractMonth: instrument.contractMonth,
        currency: instrument.specification.tradingCurrency,
        unit: instrument.specification.quotationUnit,
        source: 'NONE',
        reason: 'DATA_UNAVAILABLE — No provider adapter registered for exchange.',
      });
    }

    const quote = await provider.getQuote(instrument.exchangeSymbol);
    const yahooNote =
      isYahooEnabled() && !this.yahoo.supports(instrument)
        ? ` | Yahoo (UNOFFICIAL): UNSUPPORTED — ${YahooFinanceAdapter.unsupportedReason(instrument.exchangeSymbol)}`
        : '';
    return {
      ...quote,
      ...(yahooNote ? { statusReason: `${quote.statusReason ?? 'DATA_UNAVAILABLE'}${yahooNote}` } : {}),
      exchange: instrument.exchange,
      contractMonth: instrument.contractMonth,
      currency: instrument.specification.tradingCurrency,
      unit: instrument.specification.quotationUnit,
    };
  }

  /**
   * Last close from the SQLite data layer for an instrument. Only series whose prices are real traded
   * prices are eligible: specific contracts and UNADJUSTED continuous series. Back/ratio-adjusted
   * continuous series and provider (VENDOR_*) series are excluded. Returns null when nothing qualifies.
   */
  private async getSqliteHistoricalQuote(instrument: InstrumentDefinition): Promise<MarketQuote | null> {
    if (!this.candleRepository) return null;
    let datasets: DatasetRecord[];
    try {
      datasets = await this.candleRepository.listDatasets({ instrumentId: instrument.id });
    } catch {
      return null;
    }
    const eligible = datasets.filter(
      (d) =>
        !d.contractCode.startsWith(VENDOR_CONTRACT_PREFIX) &&
        (d.contractCode !== CONTINUOUS_CONTRACT_CODE || d.continuousAdjustment === 'UNADJUSTED')
    );
    if (eligible.length === 0) return null;
    // Series with the most recent bar; dataset lastTimestamp is only a hint, the query is authoritative.
    eligible.sort((a, b) => b.lastTimestamp.localeCompare(a.lastTimestamp));
    const seen = new Set<string>();
    let best: { row: { timestampMs: number; close: number; volume: number | null; openInterest: number | null; datasetId: string }; ds: DatasetRecord } | null = null;
    for (const d of eligible) {
      const key = `${d.contractCode}|${d.timeframe}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const { rows } = await this.candleRepository.queryCandles(
        { instrumentId: d.instrumentId, contractCode: d.contractCode, timeframe: d.timeframe },
        { limit: 1 }
      );
      const row = rows[rows.length - 1];
      if (row && (!best || row.timestampMs > best.row.timestampMs)) {
        const owner = datasets.find((x) => x.id === row.datasetId) ?? d;
        best = { row, ds: owner };
      }
    }
    if (!best) return null;
    const { row, ds } = best;
    const barIso = new Date(row.timestampMs).toISOString();
    return {
      symbol: instrument.exchangeSymbol,
      exchange: instrument.exchange,
      contractMonth: ds.contractCode === CONTINUOUS_CONTRACT_CODE ? null : ds.contractCode,
      price: row.close,
      bid: null,
      ask: null,
      volume: row.volume,
      openInterest: row.openInterest,
      currency: instrument.specification.tradingCurrency,
      unit: ds.priceUnit || instrument.specification.quotationUnit,
      source: `${ds.sourceLabel} (${ds.sourceQuality})`,
      timestamp: barIso,
      retrievedAt: ds.importedAt,
      status: 'HISTORICAL',
      statusReason: `Last close of ${ds.contractCode} ${ds.timeframe} bar dated ${barIso.slice(0, 10)} from the stored dataset (imported ${ds.importedAt}); historical data, not a live quote.`,
    };
  }

  async syncAll(options?: { symbol?: string; timeframe?: Timeframe }) {
    this.liveQuoteCache.clear();
    const fallbackRest = (id: ProviderId, name: string, urlEnv: string, keyEnv: string) =>
      new ConfigurableRestFeedAdapter({
        providerId: id,
        providerName: name,
        urlEnv,
        keyEnv,
        exchanges: [],
        unconfiguredMessage: `${name} not registered.`,
      });
    return syncConfiguredProviders({
      symbol: options?.symbol,
      timeframe: options?.timeframe,
      twelveData: this.twelveData,
      fmp: this.fmp,
      alphaVantage: this.alphaVantage,
      eia: this.eia,
      usda: this.usda,
      mxvRest:
        this.restFeeds.get('MXV_OFFICIAL') ?? fallbackRest('MXV_OFFICIAL', 'MXV REST', 'MXV_API_URL', 'MXV_API_KEY'),
      thirdPartyRest:
        this.restFeeds.get('THIRD_PARTY_FEED') ??
        fallbackRest('THIRD_PARTY_FEED', 'Third-party REST', 'MARKET_DATA_PROVIDER_URL', 'MARKET_DATA_PROVIDER_KEY'),
      yahoo: this.providersById.has('YAHOO_UNOFFICIAL') ? this.yahoo : undefined,
      persistCandles: this.persistCandles,
    });
  }

  async getUsdVndRate(): Promise<{
    status: 'CURRENT' | 'UNAVAILABLE';
    rate: number | null;
    timestamp: string | null;
    source: string;
    reason?: string;
  }> {
    if (hasEnv('TWELVEDATA_API_KEY')) {
      const td = await this.twelveData.fetchUsdVndRate();
      if (td) {
        return { status: 'CURRENT', rate: td.rate, timestamp: td.timestamp, source: td.source };
      }
    }
    if (hasEnv('ALPHAVANTAGE_API_KEY')) {
      const av = await this.alphaVantage.fetchUsdVndRate();
      if (av) {
        return { status: 'CURRENT', rate: av.rate, timestamp: av.timestamp, source: av.source };
      }
    }
    return {
      status: 'UNAVAILABLE',
      rate: null,
      timestamp: null,
      source: 'NONE',
      reason:
        'DATA_UNAVAILABLE — Configure TWELVEDATA_API_KEY or ALPHAVANTAGE_API_KEY in server env for live USD/VND exchange rate.',
    };
  }
}

export const providerRegistry = new ProviderRegistry();
