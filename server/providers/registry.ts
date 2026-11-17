import type { InstrumentDefinition } from '../../src/shared/types/instrument.ts';
import type { MarketDataProvider, MarketQuote, ProviderHealth } from '../../src/shared/types/market.ts';
import { FailClosedProviderAdapter } from './base.ts';
import { createUnavailableQuote } from '../../src/shared/utils/validation.ts';

export class ProviderRegistry {
  private readonly providers: MarketDataProvider[];

  constructor() {
    this.providers = [
      new FailClosedProviderAdapter({
        providerId: 'MXV_OFFICIAL',
        providerName: 'MXV (Mercantile Exchange of Vietnam)',
        exchanges: ['MXV'],
        envKeyNames: ['MXV_API_KEY'],
        supportsRealtime: true,
        supportsHistorical: true,
        unconfiguredMessage:
          'No official MXV API credentials configured. MXV public API is not assumed; requires authorized broker/exchange access.',
      }),
      new FailClosedProviderAdapter({
        providerId: 'CME_GROUP',
        providerName: 'CME / CBOT / COMEX DataMine',
        exchanges: ['CME', 'CBOT', 'COMEX'],
        envKeyNames: ['CME_DATAMINE_API_KEY'],
        supportsRealtime: true,
        supportsHistorical: true,
        unconfiguredMessage:
          'CME_DATAMINE_API_KEY not configured on server. Official licensing required for CME/CBOT/COMEX feeds.',
      }),
      new FailClosedProviderAdapter({
        providerId: 'NYMEX_ENERGY',
        providerName: 'NYMEX Energy Feed',
        exchanges: ['NYMEX'],
        envKeyNames: ['CME_DATAMINE_API_KEY'],
        supportsRealtime: true,
        supportsHistorical: true,
        unconfiguredMessage:
          'CME_DATAMINE_API_KEY not configured on server for NYMEX energy futures.',
      }),
      new FailClosedProviderAdapter({
        providerId: 'ICE_FUTURES',
        providerName: 'ICE Futures US / Europe',
        exchanges: ['ICE'],
        envKeyNames: ['ICE_API_KEY'],
        supportsRealtime: true,
        supportsHistorical: true,
        unconfiguredMessage:
          'ICE_API_KEY not configured on server. Authorized ICE feed required.',
      }),
      new FailClosedProviderAdapter({
        providerId: 'THIRD_PARTY_FEED',
        providerName: 'Configurable 3rd-Party Market Data Provider',
        exchanges: ['CBOT', 'CME', 'COMEX', 'NYMEX', 'ICE'],
        envKeyNames: ['MARKET_DATA_PROVIDER_URL', 'MARKET_DATA_PROVIDER_KEY'],
        supportsRealtime: true,
        supportsHistorical: true,
        unconfiguredMessage:
          'No third-party market data endpoint configured in server environment.',
      }),
      new FailClosedProviderAdapter({
        providerId: 'CSV_HISTORICAL',
        providerName: 'Historical CSV OHLCV Importer',
        exchanges: ['MXV', 'CBOT', 'CME', 'COMEX', 'NYMEX', 'ICE'],
        envKeyNames: [],
        supportsRealtime: false,
        supportsHistorical: true,
        unconfiguredMessage:
          'No CSV historical files imported yet. Historical CSV import workflow activates in Phase 2.',
      }),
    ];
  }

  async getAllHealth(): Promise<ProviderHealth[]> {
    return Promise.all(this.providers.map((p) => p.getProviderStatus()));
  }

  getProviderForExchange(exchange: string): MarketDataProvider | null {
    switch (exchange) {
      case 'MXV':
        return this.providers[0];
      case 'CME':
      case 'CBOT':
      case 'COMEX':
        return this.providers[1];
      case 'NYMEX':
        return this.providers[2];
      case 'ICE':
        return this.providers[3];
      default:
        return this.providers[4] ?? null;
    }
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
