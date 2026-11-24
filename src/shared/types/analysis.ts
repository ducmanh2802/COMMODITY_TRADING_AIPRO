import type { DataQualityStatus, SourceQualityLabel } from './market';
import type { ExchangeCode, ProductCategory, Timeframe, TradingStyle } from './instrument';

export type MarketDirection = 'BULLISH' | 'BEARISH' | 'SIDEWAYS' | 'UNCERTAIN';

export type StrategyId =
  | 'TREND_FOLLOWING'
  | 'EMA_PULLBACK'
  | 'BREAKOUT'
  | 'RANGE_TRADING'
  | 'SR_REVERSAL'
  | 'RSI_REVERSAL'
  | 'MACD_MOMENTUM'
  | 'ATR_VOLATILITY_BREAKOUT';

export interface StrategyDefinition {
  id: StrategyId;
  name: string;
  applicableTimeframes: Timeframe[];
  requiredIndicators: string[];
  entryConditions: string;
  exitConditions: string;
  stopLossLogic: string;
  takeProfitLogic: string;
  invalidationConditions: string;
}

/** Data block ids the AI research summary may cite (T20). */
export type AiDataInputId = 'SPEC' | 'QUOTE' | 'TECHNICAL' | 'COT';

/** Market-data quality label, or the verification status for reference data (contract spec). */
type AiInputQuality = DataQualityStatus | 'VERIFIED' | 'UNVERIFIED';

/** One block of server-held data handed to the model, with its quality label and as-of time. */
export interface AiDataInput {
  id: AiDataInputId;
  quality: AiInputQuality;
  /** e.g. 'UNOFFICIAL' for Yahoo-sourced quotes. */
  sourceQuality: SourceQualityLabel | null;
  source: string;
  /** Market/report as-of timestamp (UTC ISO-8601 or YYYY-MM-DD), null when unknown. */
  asOf: string | null;
  note: string | null;
  /** null when the block is UNAVAILABLE (nothing was sent to the model for it). */
  data: Record<string, unknown> | null;
}

export type AiUnavailableReason =
  | 'NO_API_KEY'
  | 'NO_VERIFIED_DATA'
  | 'MODEL_TIMEOUT'
  | 'MODEL_RATE_LIMITED'
  | 'MODEL_ERROR'
  | 'INVALID_MODEL_OUTPUT';

export type AiLanguage = 'vi' | 'en';

/**
 * AI Analyst output in research-summary mode (decision D3): no actions, levels or confidence —
 * only a summary, sourced key facts, risks and data gaps over verified server-side data.
 */
export interface AiResearchSummary {
  status: 'OK' | 'UNAVAILABLE';
  unavailableReason: AiUnavailableReason | null;
  instrument: string;
  timeframe: Timeframe;
  language: AiLanguage;
  generatedAt: string;
  model: string | null;
  summary: string;
  keyFacts: Array<{ statement: string; sourceRefs: AiDataInputId[] }>;
  risks: string[];
  dataGaps: string[];
  inputs: AiDataInput[];
  /** Server-side post-check: sentences with recommendation language are removed, never shown. */
  postCheck: {
    flagged: boolean;
    removedSentences: number;
    matchedTerms: string[];
    droppedUnsourcedFacts: number;
  };
}

export interface TradeScannerOpportunity {
  instrument: string;
  exchange: ExchangeCode;
  category: ProductCategory;
  tradingStyle: TradingStyle;
  timeframe: Timeframe;
  marketPrice: number | null;
  marketTimestamp: string | null;
  direction: 'LONG' | 'SHORT' | 'NONE';
  strategy: StrategyId;
  setupQualityScore: number | null;
  entryZone: [number, number] | null;
  stopLoss: number | null;
  takeProfitLevels: number[];
  riskReward: number | null;
  dataQuality: DataQualityStatus;
  confirmationStatus: 'CONFIRMED' | 'PENDING' | 'INVALIDATED' | 'UNAVAILABLE';
  invalidationCondition: string;
}

export type FundamentalDatasetCategory =
  | 'USDA_WASDE'
  | 'USDA_CROP'
  | 'EIA_INVENTORIES'
  | 'CFTC_COT'
  | 'ICE_STOCKS'
  | 'GLOBAL_SD'
  | 'SEASONAL'
  | 'WEATHER_RISK'
  | 'MACRO';

export interface FundamentalMacroRecord {
  id: string;
  dataset: string;
  source: string;
  publicationTimestamp: string;
  /** Observation period / "as-of" date (YYYY-MM-DD), separated from publicationTimestamp to prevent look-ahead bias. */
  observationDate?: string;
  dataPeriod: string;
  category?: FundamentalDatasetCategory;
  relatedSymbols?: string[];
  actualValue: number | string | null;
  previousValue: number | string | null;
  forecastValue: number | string | null;
  unit: string;
  revisionStatus: 'PRELIMINARY' | 'FINAL' | 'REVISED';
  impactAssessment: MarketDirection;
  freshnessStatus?: DataQualityStatus;
  /** Number of calendar days between observationDate and publicationTimestamp. */
  releaseLagDays?: number;
}
