import type { InstrumentDefinition } from '../../src/shared/types/instrument.ts';
import type {
  MarketDataProvider,
  MarketQuote,
  ProviderHealth,
  ProviderId,
} from '../../src/shared/types/market.ts';
import { FailClosedProviderAdapter, type UnconfiguredProviderConfig } from './base.ts';
import { createUnavailableQuote } from '../../src/shared/utils/validation.ts';
import type { ICandleRepository } from '../storage/candleRepository.ts';
import { CsvHistoricalProvider } from './csvHistorical.ts';

/** Provider adapter configuration. Order only affects health listing order, never routing. */
export const DEFAULT_PROVIDER_CONFIGS: readonly UnconfiguredProviderConfig[] = [
  {
    providerId: 'MXV_OFFICIAL',
    providerName: 'MXV (Mercantile Exchange of Vietnam)',
    exchanges: ['MXV'],
    envKeyNames: ['MXV_API_KEY'],
    supportsRealtime: true,
    supportsHistorical: true,
    unconfiguredMessage:
      'No official MXV API credentials configured. MXV public API is not assumed; requires authorized broker/exchange access.',
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
    providerName: 'Configurable 3rd-Party Market Data Provider',
    exchanges: ['CBOT', 'CME', 'COMEX', 'NYMEX', 'ICE'],
    envKeyNames: ['MARKET_DATA_PROVIDER_URL', 'MARKET_DATA_PROVIDER_KEY'],
    supportsRealtime: true,
    supportsHistorical: true,
    unconfiguredMessage: 'No third-party market data endpoint configured in server environment.',
  },
  {
    providerId: 'CSV_HISTORICAL',
    providerName: 'Historical CSV OHLCV Importer',
    exchanges: ['MXV', 'CBOT', 'CME', 'COMEX', 'NYMEX', 'ICE'],
    envKeyNames: [],
    supportsRealtime: false,
    supportsHistorical: true,
    unconfiguredMessage:
      'No CSV historical files imported yet. Historical CSV import workflow activates in Phase 2.',
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

export interface ProviderRegistryOptions {
  configs?: readonly UnconfiguredProviderConfig[];
  routing?: Readonly<Record<string, ProviderId>>;
  /**
   * Historical candle store. When given, the CSV_HISTORICAL provider reads from it and reports honest
   * health; when omitted it stays a fail-closed adapter.
   */
  candles?: ICandleRepository;
}

export class ProviderRegistry {
  private readonly providers: MarketDataProvider[];
  private readonly providersById: Map<ProviderId, MarketDataProvider>;
  private readonly exchangeRouting: Map<string, MarketDataProvider>;

  constructor(options: ProviderRegistryOptions = {}) {
    const configs = options.configs ?? DEFAULT_PROVIDER_CONFIGS;
    const routing = options.routing ?? DEFAULT_EXCHANGE_ROUTING;

    this.providers = [];
    this.providersById = new Map();
    const configById = new Map<ProviderId, UnconfiguredProviderConfig>();
    for (const config of configs) {
      if (configById.has(config.providerId)) {
        throw new Error(`Duplicate market data provider id: ${config.providerId}`);
      }
      const provider: MarketDataProvider =
        config.providerId === 'CSV_HISTORICAL' && options.candles
          ? new CsvHistoricalProvider(config, options.candles)
          : new FailClosedProviderAdapter(config);
      configById.set(config.providerId, config);
      this.providersById.set(config.providerId, provider);
      this.providers.push(provider);
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
    return Promise.all(this.providers.map((p) => p.getProviderStatus()));
  }

  getProviderById(providerId: ProviderId): MarketDataProvider | null {
    return this.providersById.get(providerId) ?? null;
  }

  /** Returns the primary provider for an exchange, or null when no route exists (caller fails closed). */
  getProviderForExchange(exchange: string): MarketDataProvider | null {
    return this.exchangeRouting.get(exchange.trim().toUpperCase()) ?? null;
  }

  async getQuoteForInstrument(instrument: InstrumentDefinition): Promise<MarketQuote> {
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
}

export const providerRegistry = new ProviderRegistry();
