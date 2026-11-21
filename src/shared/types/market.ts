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
  | 'TWELVE_DATA'
  | 'FMP_COMMODITIES'
  | 'COMMODITIES_API'
  | 'ALPHA_VANTAGE'
  | 'EIA_ENERGY'
  | 'USDA_QUICKSTATS'
  | 'FRED_MACRO'
  | 'THIRD_PARTY_FEED'
  | 'CSV_HISTORICAL'
  | 'YAHOO_UNOFFICIAL';

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
  /** Provenance (optional): declared exchange delay of the source, in minutes. */
  delayMinutes?: number | null;
  /** Provenance (optional): source quality, e.g. 'UNOFFICIAL' for Yahoo. */
  sourceQuality?: SourceQualityLabel;
  /** Provenance (optional): which contract the price refers to, e.g. a continuous front month. */
  contract?: string;
  /** Human label of the actual contract month when the provider reports it, e.g. "Mar-2027" (contractMonth is 'YYYY-MM'). */
  contractLabel?: string | null;
  /** Machine flag set by the server consistency check, e.g. 'ROLL_MISMATCH' (quote vs last daily close on different contracts). */
  consistencyFlag?: string | null;
  /** Provider's current regular trading period (epoch seconds), when reported. */
  tradingPeriod?: { start: number | null; end: number | null } | null;
  /** 'BENCHMARK' = a monthly/daily reference series (e.g. IMF via FRED), NOT a futures quote. Absent = futures/market quote. */
  kind?: 'FUTURES' | 'BENCHMARK';
  /** Machine code for the status reason; the UI maps it to friendly text (i18n `fr.reason.<code>`). */
  reasonCode?: string;
  /** Present when kind === 'BENCHMARK'. */
  benchmark?: {
    seriesId: string;
    publisher: string;
    periodicity: 'MONTHLY' | 'DAILY';
    /** 'YYYY-MM' for monthly, 'YYYY-MM-DD' for daily. */
    period: string;
    nativeValue: number;
    nativeUnit: string;
    /** Stated exact unit conversion applied to `price`, or null when price is in the native unit. */
    conversion: string | null;
    url: string;
  };
}

export type SourceQualityLabel = 'OFFICIAL' | 'LICENSED_VENDOR' | 'UNOFFICIAL';

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
  requiredEnvVars?: string[];
  supportedScopes?: string[];
  lastError?: string | null;
  /** Source quality label shown in Data Health (e.g. 'UNOFFICIAL'). */
  sourceQuality?: SourceQualityLabel;
  /** Human-readable delay declaration, e.g. 'CBOT ~10 min'. */
  delayNote?: string;
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
