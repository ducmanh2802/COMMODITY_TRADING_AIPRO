import type {
  DataQualityStatus,
  MarketCandle,
  MarketDataProvider,
  MarketQuote,
  ProviderHealth,
  ProviderId,
} from '../../src/shared/types/market.ts';
import { createUnavailableQuote } from '../../src/shared/utils/validation.ts';

export interface UnconfiguredProviderConfig {
  providerId: ProviderId;
  providerName: string;
  exchanges: string[];
  envKeyNames: string[];
  supportsRealtime: boolean;
  supportsHistorical: boolean;
  unconfiguredMessage: string;
}

/**
 * Honest fail-closed adapter for exchange/market data feeds that do not yet
 * have authorized credentials or verified API endpoints configured.
 * Never fabricates prices, volumes, open interest, or candles.
 */
export class FailClosedProviderAdapter implements MarketDataProvider {
  public readonly providerId: ProviderId;
  public readonly providerName: string;
  private readonly config: UnconfiguredProviderConfig;

  constructor(config: UnconfiguredProviderConfig) {
    this.providerId = config.providerId;
    this.providerName = config.providerName;
    // Defensive copy so shared/default config objects cannot be mutated through an adapter.
    this.config = {
      ...config,
      exchanges: [...config.exchanges],
      envKeyNames: [...config.envKeyNames],
    };
  }

  /** Exchanges this adapter declares support for (copy). */
  get exchanges(): string[] {
    return [...this.config.exchanges];
  }

  private hasCredentials(): boolean {
    if (this.config.envKeyNames.length === 0) {
      return false;
    }
    return this.config.envKeyNames.every((key) => {
      const value = process.env[key];
      return typeof value === 'string' && value.trim().length > 0;
    });
  }

  async getInstruments(): Promise<string[]> {
    return [];
  }

  async getQuote(symbol: string): Promise<MarketQuote> {
    return createUnavailableQuote({
      symbol,
      exchange: this.config.exchanges[0] ?? 'UNKNOWN',
      contractMonth: null,
      currency: 'USD',
      unit: 'UNSPECIFIED',
      source: this.providerId,
      reason: this.hasCredentials()
        ? `${this.providerName} adapter is pending Phase 2 endpoint verification.`
        : `DATA_UNAVAILABLE — ${this.config.unconfiguredMessage}`,
    });
  }

  async getCandles(): Promise<{
    candles: MarketCandle[];
    status: DataQualityStatus;
    reason?: string;
  }> {
    return {
      candles: [],
      status: 'UNAVAILABLE',
      reason: `DATA_UNAVAILABLE — ${this.config.unconfiguredMessage}`,
    };
  }

  async getVolume(): Promise<{
    volume: number | null;
    timestamp: string | null;
    status: DataQualityStatus;
  }> {
    return { volume: null, timestamp: null, status: 'UNAVAILABLE' };
  }

  async getOpenInterest(): Promise<{
    openInterest: number | null;
    timestamp: string | null;
    status: DataQualityStatus;
  }> {
    return { openInterest: null, timestamp: null, status: 'UNAVAILABLE' };
  }

  async getContractSpecification(): Promise<Record<string, unknown> | null> {
    return null;
  }

  async getProviderStatus(): Promise<ProviderHealth> {
    const credentialsConfigured = this.hasCredentials();
    return {
      providerId: this.providerId,
      name: this.providerName,
      exchanges: [...this.config.exchanges],
      connectionState: credentialsConfigured ? 'UNAVAILABLE' : 'UNCONFIGURED',
      dataStatus: 'UNAVAILABLE',
      credentialsConfigured,
      supportsRealtime: this.config.supportsRealtime,
      supportsHistorical: this.config.supportsHistorical,
      lastCheckedAt: new Date().toISOString(),
      lastSuccessfulSyncAt: null,
      message: credentialsConfigured
        ? 'Credentials detected in server environment; live provider integration scheduled in Phase 2.'
        : this.config.unconfiguredMessage,
    };
  }
}
