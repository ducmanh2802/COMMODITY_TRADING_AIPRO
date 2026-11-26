export type LessonRecommendationLanguage = 'vi' | 'en';

export interface SearchedCommoditySignalPayload {
  symbol: string;
  name: string;
  category?: string | null;
  count: number;
  lastAt?: number;
}

export interface OpenPositionSignalPayload {
  symbol: string;
  name: string;
  category?: string | null;
  side: 'LONG' | 'SHORT';
  contracts: number;
}

export interface CandidateLessonSummary {
  id: string;
  title: string;
  objective: string;
  levelNumber: number;
  levelTitle: string;
  instrumentIds: string[];
  done: boolean;
  matchedSymbols: string[];
}

export type LessonRecommendationPriority = 'HIGH' | 'MEDIUM';

export interface LessonRecommendationItem {
  lessonId: string;
  reason: string;
  matchedSymbols: string[];
  priority: LessonRecommendationPriority;
}

export type LessonRecommendationUnavailableReason =
  | 'NO_API_KEY'
  | 'NO_SIGNALS'
  | 'MODEL_TIMEOUT'
  | 'MODEL_RATE_LIMITED'
  | 'MODEL_ERROR'
  | 'INVALID_MODEL_OUTPUT';

export interface LessonRecommendationResult {
  status: 'OK' | 'UNAVAILABLE';
  unavailableReason?: LessonRecommendationUnavailableReason;
  headline: string;
  recommendations: LessonRecommendationItem[];
  generatedAt: string;
  model?: string;
  language: LessonRecommendationLanguage;
}

export interface LessonRecommendationRequest {
  language: LessonRecommendationLanguage;
  searchedCommodities: SearchedCommoditySignalPayload[];
  openPositions: OpenPositionSignalPayload[];
  candidates: CandidateLessonSummary[];
  maxResults?: number;
  forceRefresh?: boolean;
}
