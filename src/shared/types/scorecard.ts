/**
 * "Đánh giá các mã" scorecard — GET /api/scorecard. Deterministic, descriptive labels per dimension.
 * NOT a buy/sell score: it describes how clear the trend is and how large the volatility is.
 * Dimensions without enough data are UNAVAILABLE and excluded from the overall readings.
 */
import type { BriefText } from './brief.ts';

export type ScorecardDimensionId = 'trend' | 'momentum' | 'volatility' | 'drawdown' | 'cot' | 'seasonality' | 'valuation';

export type ScorecardLevel =
  // trend
  | 'STRONG_UP' | 'UP' | 'SIDEWAYS' | 'DOWN' | 'STRONG_DOWN'
  // momentum (RSI)
  | 'VERY_STRONG' | 'STRONG' | 'NEUTRAL' | 'WEAK' | 'VERY_WEAK'
  // volatility / generic
  | 'LOW' | 'MEDIUM' | 'HIGH'
  // drawdown
  | 'NEAR_HIGH' | 'MILD' | 'DEEP' | 'VERY_DEEP'
  // cot
  | 'HIGH_VS_HISTORY' | 'MID_VS_HISTORY' | 'LOW_VS_HISTORY'
  // seasonality
  | 'USUALLY_UP' | 'USUALLY_DOWN' | 'MIXED'
  // valuation context (position vs own history; descriptive only)
  | 'RANGE_HIGH' | 'RANGE_MID' | 'RANGE_LOW';

export interface ScorecardMetric {
  key: string;
  value: number | string | null;
  unit?: string | null;
}

export interface ScorecardDimension {
  id: ScorecardDimensionId;
  status: 'OK' | 'UNAVAILABLE';
  level: ScorecardLevel | null;
  label: BriefText | null;
  /** 0-100 position along the dimension (meaning depends on the dimension), null when unavailable. */
  score: number | null;
  metrics: ScorecardMetric[];
  explanation: BriefText;
  source: string;
  asOf: string | null;
}

export type ScorecardClarityLevel = 'CLEAR' | 'MODERATE' | 'UNCLEAR';
export type ScorecardRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type ScorecardDataQualityLevel = 'GOOD' | 'LIMITED' | 'POOR' | 'UNAVAILABLE';

export type ScorecardNarrativeProvider = 'rules' | 'gemini' | 'ollama';

/** Short descriptive summary built from scorecard facts (rules templates, or an optional LLM). */
export interface ScorecardNarrative {
  vi: string;
  en: string;
  provider: ScorecardNarrativeProvider;
  /** Human-readable engine label. */
  source: BriefText;
  generatedAt: string;
  /** Set when a configured LLM failed and the rules narrative was used instead. */
  fallbackFrom?: 'gemini' | 'ollama' | null;
}

export interface Scorecard {
  instrumentId: string;
  exchangeSymbol: string;
  productName: string;
  vietnameseName: string | null;
  category: string;
  generatedAt: string;
  price: {
    value: number | null;
    status: string;
    source: string;
    sourceQuality: string | null;
    asOf: string | null;
    changePct: number | null;
    note: string | null;
  };
  dimensions: ScorecardDimension[];
  overall: {
    /** "Mức độ rõ ràng của xu hướng" 0-100 (not a direction/buy-sell score). */
    trendClarity: { score: number | null; level: ScorecardClarityLevel | null; label: BriefText; explanation: BriefText };
    /** "Mức rủi ro biến động". */
    volatilityRisk: { score: number | null; level: ScorecardRiskLevel | null; label: BriefText; explanation: BriefText };
    dimensionsUsed: ScorecardDimensionId[];
    dimensionsExcluded: ScorecardDimensionId[];
  };
  dataQuality: {
    level: ScorecardDataQualityLevel;
    label: BriefText;
    quoteStatus: string;
    quoteSource: string;
    historyOrigin: 'SQLITE' | 'MEMORY' | 'YAHOO' | 'NONE';
    historySource: string | null;
    historyQuality: string | null;
    historyBars: number;
    historyFrom: string | null;
    historyTo: string | null;
  };
  /** Free rules-based narrative (always present, offline). */
  narrative?: ScorecardNarrative;
  /** Configured AI_PROVIDER; the on-demand AI button is only offered for gemini/ollama. */
  aiProvider?: ScorecardNarrativeProvider;
  disclaimer: BriefText;
}

export interface ScorecardListResponse {
  generatedAt: string;
  cacheTtlSeconds: number;
  count: number;
  scorecards: Scorecard[];
  disclaimer: BriefText;
  /** ISO time the scorecards were computed (served stale-while-revalidate). */
  asOf?: string;
  /** true when served from an expired cache while a refresh runs in the background. */
  stale?: boolean;
}
