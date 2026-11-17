export type DataQualityStatus =
  | 'CURRENT'
  | 'DELAYED'
  | 'HISTORICAL'
  | 'STALE'
  | 'UNAVAILABLE'
  | 'INVALID';

export type MarketScope = 'ALL' | 'MXV' | 'INTERNATIONAL';

export type ProviderId =
  | 'MXV_OFFICIAL'
  | 'CME_GROUP'
  | 'ICE_FUTURES'
  | 'NYMEX_ENERGY'
  | 'THIRD_PARTY_FEED'
  | 'CSV_HISTORICAL';

export type ProviderConnectionState =
  | 'CONNECTED'
  | 'UNCONFIGURED'
  | 'UNAVAILABLE'
  | 'DEGRADED'
  | 'ERROR';

export interface MarketQuote {
  symbol: string;
  exchange: string;
  contractMonth: string | null;
  price: number | null;
  bid: number | null;
  ask: number | null;
  volume: number | null;
  openInterest: number | null;
  currency: string;
  unit: string;
  source: string;
  timestamp: string | null; // Original market timestamp in UTC ISO-8601
  retrievedAt: string; // Retrieval timestamp in UTC ISO-8601
  status: DataQualityStatus;
  statusReason?: string;
}

export interface MarketCandle {
  symbol: string;
  exchange: string;
  timeframe: string;
  timestamp: string; // UTC ISO-8601 candle open time
  retrievedAt: string; // UTC ISO-8601 retrieval time
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  openInterest: number | null;
  isComplete: boolean;
  source: string;
  status: DataQualityStatus;
}

export interface ProviderHealth {
  providerId: ProviderId;
  name: string;
  exchanges: string[];
  connectionState: ProviderConnectionState;
  dataStatus: DataQualityStatus;
  credentialsConfigured: boolean;
  supportsRealtime: boolean;
  supportsHistorical: boolean;
  lastCheckedAt: string;
  lastSuccessfulSyncAt: string | null;
  message: string;
}

export interface MarketDataProvider {
  readonly providerId: ProviderId;
  readonly providerName: string;
  getInstruments(): Promise<string[]>;
  getQuote(symbol: string): Promise<MarketQuote>;
  getCandles(
    symbol: string,
    timeframe: string,
    fromIso: string,
    toIso: string
  ): Promise<{ candles: MarketCandle[]; status: DataQualityStatus; reason?: string }>;
  getVolume(symbol: string): Promise<{ volume: number | null; timestamp: string | null; status: DataQualityStatus }>;
  getOpenInterest(symbol: string): Promise<{ openInterest: number | null; timestamp: string | null; status: DataQualityStatus }>;
  getContractSpecification(symbol: string): Promise<Record<string, unknown> | null>;
  getProviderStatus(): Promise<ProviderHealth>;
}
