import type { InstrumentDefinition, Timeframe } from '../../src/shared/types/instrument.ts';
import type {
  MarketDataProvider,
  MarketQuote,
  ProviderHealth,
} from '../../src/shared/types/market.ts';
import { createUnavailableQuote } from '../../src/shared/utils/validation.ts';
import { historicalCandleStore } from '../services/candleStore.ts';
import { FailClosedProviderAdapter } from './base.ts';
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

function hasEnv(name: string): boolean {
  const val = process.env[name];
  return typeof val === 'string' && val.trim().length > 0;
}

export class ProviderRegistry {
  private readonly mxvOfficial: ConfigurableRestFeedAdapter;
  private readonly twelveData: TwelveDataAdapter;
  private readonly fmp: FmpCommoditiesAdapter;
  private readonly commoditiesApi: CommoditiesApiAdapter;
  private readonly alphaVantage: AlphaVantageAdapter;
  private readonly eia: EiaEnergyAdapter;
  private readonly usda: UsdaQuickStatsAdapter;
  private readonly cmeGroup: FailClosedProviderAdapter;
  private readonly nymexEnergy: FailClosedProviderAdapter;
  private readonly iceFutures: FailClosedProviderAdapter;
  private readonly thirdPartyFeed: ConfigurableRestFeedAdapter;
  private readonly csvHistorical: FailClosedProviderAdapter;
  private readonly providers: MarketDataProvider[];

  private readonly liveQuoteCache = new Map<
    string,
    { quote: MarketQuote; expiresAtMs: number }
  >();
  private readonly quoteTtlMs = 60_000;

  constructor() {
    this.mxvOfficial = new ConfigurableRestFeedAdapter({
      providerId: 'MXV_OFFICIAL',
      providerName: 'MXV (Mercantile Exchange of Vietnam / CQG Member)',
      urlEnv: 'MXV_API_URL',
      keyEnv: 'MXV_API_KEY',
      exchanges: ['MXV'],
      unconfiguredMessage:
        'MXV routes via CQG / M-System without an open public API. Requires MXV_API_URL & MXV_API_KEY from an authorized MXV Thành viên Kinh doanh.',
    });
    this.twelveData = new TwelveDataAdapter();
    this.fmp = new FmpCommoditiesAdapter();
    this.commoditiesApi = new CommoditiesApiAdapter();
    this.alphaVantage = new AlphaVantageAdapter();
    this.eia = new EiaEnergyAdapter();
    this.usda = new UsdaQuickStatsAdapter();
    this.cmeGroup = new FailClosedProviderAdapter({
      providerId: 'CME_GROUP',
      providerName: 'CME / CBOT / COMEX DataMine',
      exchanges: ['CME', 'CBOT', 'COMEX'],
      envKeyNames: ['CME_DATAMINE_API_KEY'],
      supportsRealtime: true,
      supportsHistorical: true,
      unconfiguredMessage:
        'CME_DATAMINE_API_KEY not configured on server. Official CME licensing required for L1/L2 futures.',
    });
    this.nymexEnergy = new FailClosedProviderAdapter({
      providerId: 'NYMEX_ENERGY',
      providerName: 'NYMEX Energy Feed',
      exchanges: ['NYMEX'],
      envKeyNames: ['CME_DATAMINE_API_KEY'],
      supportsRealtime: true,
      supportsHistorical: true,
      unconfiguredMessage:
        'CME_DATAMINE_API_KEY not configured on server for direct NYMEX energy futures.',
    });
    this.iceFutures = new FailClosedProviderAdapter({
      providerId: 'ICE_FUTURES',
      providerName: 'ICE Futures US / Europe',
      exchanges: ['ICE'],
      envKeyNames: ['ICE_API_KEY'],
      supportsRealtime: true,
      supportsHistorical: true,
      unconfiguredMessage:
        'ICE_API_KEY not configured on server. Authorized ICE feed required for Robusta/Arabica/Brent L1.',
    });
    this.thirdPartyFeed = new ConfigurableRestFeedAdapter({
      providerId: 'THIRD_PARTY_FEED',
      providerName: 'Custom Authorized REST Market Feed',
      urlEnv: 'MARKET_DATA_PROVIDER_URL',
      keyEnv: 'MARKET_DATA_PROVIDER_KEY',
      exchanges: ['MXV', 'CBOT', 'CME', 'COMEX', 'NYMEX', 'ICE'],
      unconfiguredMessage:
        'Set MARKET_DATA_PROVIDER_URL & MARKET_DATA_PROVIDER_KEY in Secrets to attach a custom brokerage REST feed.',
    });
    this.csvHistorical = new FailClosedProviderAdapter({
      providerId: 'CSV_HISTORICAL',
      providerName: 'Historical CSV OHLCV Importer',
      exchanges: ['MXV', 'CBOT', 'CME', 'COMEX', 'NYMEX', 'ICE'],
      envKeyNames: [],
      supportsRealtime: false,
      supportsHistorical: true,
      unconfiguredMessage:
        'Ready for CSV historical OHLCV upload. Import a validated CSV dataset to populate charts, signals, and backtests.',
    });

    this.providers = [
      this.mxvOfficial,
      this.twelveData,
      this.fmp,
      this.commoditiesApi,
      this.alphaVantage,
      this.eia,
      this.usda,
      this.cmeGroup,
      this.nymexEnergy,
      this.iceFutures,
      this.thirdPartyFeed,
      this.csvHistorical,
    ];
  }

  async getAllHealth(): Promise<ProviderHealth[]> {
    const statuses = await Promise.all(this.providers.map((p) => p.getProviderStatus()));
    const importedDatasets = historicalCandleStore.listSummaries();

    return statuses.map((status) => {
      if (status.providerId === 'CSV_HISTORICAL' && importedDatasets.length > 0) {
        return {
          ...status,
          connectionState: 'CONNECTED',
          dataStatus: 'HISTORICAL',
          credentialsConfigured: true,
          lastSuccessfulSyncAt: importedDatasets[importedDatasets.length - 1].importedAt,
          message: `${importedDatasets.length} validated OHLCV dataset(s) loaded in memory.`,
        };
      }
      return status;
    });
  }

  getProviderForExchange(exchange: string): MarketDataProvider | null {
    switch (exchange) {
      case 'MXV':
        return this.mxvOfficial;
      case 'CME':
      case 'CBOT':
      case 'COMEX':
        return this.cmeGroup;
      case 'NYMEX':
        return this.nymexEnergy;
      case 'ICE':
        return this.iceFutures;
      default:
        return this.thirdPartyFeed;
    }
  }

  private async tryFetchLiveQuote(instrument: InstrumentDefinition): Promise<MarketQuote | null> {
    const cached = this.liveQuoteCache.get(instrument.exchangeSymbol);
    if (cached && cached.expiresAtMs > Date.now()) {
      return cached.quote;
    }

    const candidates: Array<{ enabled: boolean; fn: () => Promise<MarketQuote> }> = [
      {
        enabled: instrument.isMvxListed && hasEnv('MXV_API_URL') && hasEnv('MXV_API_KEY'),
        fn: () => this.mxvOfficial.getQuote(instrument.exchangeSymbol),
      },
      {
        enabled: hasEnv('TWELVEDATA_API_KEY') && Boolean(instrument.providerMappings?.twelveDataSymbol),
        fn: () => this.twelveData.getQuote(instrument.exchangeSymbol),
      },
      {
        enabled: hasEnv('FMP_API_KEY') && Boolean(instrument.providerMappings?.fmpSymbol),
        fn: () => this.fmp.getQuote(instrument.exchangeSymbol),
      },
      {
        enabled:
          hasEnv('COMMODITIES_API_KEY') &&
          Boolean(instrument.providerMappings?.commoditiesApiSymbol),
        fn: () => this.commoditiesApi.getQuote(instrument.exchangeSymbol),
      },
      {
        enabled: hasEnv('MARKET_DATA_PROVIDER_URL') && hasEnv('MARKET_DATA_PROVIDER_KEY'),
        fn: () => this.thirdPartyFeed.getQuote(instrument.exchangeSymbol),
      },
    ];

    for (const candidate of candidates) {
      if (!candidate.enabled) continue;
      const q = await candidate.fn();
      if (q.price !== null && (q.status === 'CURRENT' || q.status === 'DELAYED')) {
        this.liveQuoteCache.set(instrument.exchangeSymbol, {
          quote: q,
          expiresAtMs: Date.now() + this.quoteTtlMs,
        });
        return q;
      }
    }

    return null;
  }

  async getQuoteForInstrument(instrument: InstrumentDefinition): Promise<MarketQuote> {
    // 1. Prefer verified live/delayed API quote if server-side API credentials are configured
    const liveQuote = await this.tryFetchLiveQuote(instrument);
    if (liveQuote) {
      return {
        ...liveQuote,
        exchange: instrument.exchange,
        contractMonth: instrument.contractMonth,
      };
    }

    // 2. Fall back to latest validated historical candle store (from CSV import or API sync)
    const historicalQuote = historicalCandleStore.getLatestHistoricalQuote(
      instrument.exchangeSymbol,
      instrument.specification.tradingCurrency,
      instrument.specification.quotationUnit,
      instrument.exchange
    );
    if (historicalQuote.status === 'HISTORICAL') {
      return historicalQuote;
    }

    // 3. Fail closed honestly when no verified live or historical data is present
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
    return {
      ...quote,
      exchange: instrument.exchange,
      contractMonth: instrument.contractMonth,
      currency: instrument.specification.tradingCurrency,
      unit: instrument.specification.quotationUnit,
    };
  }

  async syncAll(options?: { symbol?: string; timeframe?: Timeframe }) {
    this.liveQuoteCache.clear();
    return syncConfiguredProviders({
      symbol: options?.symbol,
      timeframe: options?.timeframe,
      twelveData: this.twelveData,
      fmp: this.fmp,
      alphaVantage: this.alphaVantage,
      eia: this.eia,
      usda: this.usda,
      mxvRest: this.mxvOfficial,
      thirdPartyRest: this.thirdPartyFeed,
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
        'DATA_UNAVAILABLE — Configure TWELVEDATA_API_KEY or ALPHAVANTAGE_API_KEY in server Secrets for live USD/VND exchange rate.',
    };
  }
}

export const providerRegistry = new ProviderRegistry();
