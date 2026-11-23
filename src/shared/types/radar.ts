/** GET /api/radar: "Radar thị trường sôi động" (T64). Descriptive research data only, never trade advice. */
export type RadarSignalId = 'volume' | 'volExpansion' | 'breakout' | 'atrMove' | 'momentum' | 'cot' | 'event' | 'cycle';
export type RadarBreakoutKind = 'high20' | 'high55' | 'low20' | 'low55';

export interface RadarSignal {
  id: RadarSignalId;
  label: string;
  /** Points awarded (0..max). */
  points: number;
  max: number;
  active: boolean;
  /** Raw measured value behind the signal (ratio, ATR multiples, index...), null when it could not be measured. */
  value: number | null;
  /** Plain-language sentence, only present when the signal is active. */
  reason: string | null;
}

export interface RadarRatingComponent {
  label: string;
  points: number;
  max: number;
  note: string;
  /** false when the input was missing; excluded from the rating denominator. */
  available: boolean;
}
/** "Điểm đánh giá" 0..100: a research score (never a buy/sell instruction) with the reasons behind it. */
export interface RadarRating {
  rating: number;
  grade: 'A' | 'B' | 'C' | 'D';
  /** Which side the trend/setup favours (shorts are valid on futures). */
  direction: 'TĂNG' | 'GIẢM' | 'CHƯA RÕ';
  components: RadarRatingComponent[];
  confidence: 'CAO' | 'TRUNG BÌNH' | 'THẤP';
}

export interface RadarItem {
  id: string;
  symbol: string;
  name: string;
  category: string;
  /** "Độ sôi động" 0..100. */
  score: number;
  /** Research rating (optional for backward compatibility). */
  rating?: RadarRating;
  signals: RadarSignal[];
  reasons: string[];
  breakouts: RadarBreakoutKind[];
  lastClose: number;
  changePct: number | null;
  /** Date (YYYY-MM-DD) of the last daily bar. */
  asOf: string;
  source: string | null;
  quality: string | null;
  spark: number[];
  caveats: string[];
}

export interface RadarSetup {
  id: string;
  symbol: string;
  name: string;
  direction: 'UP' | 'DOWN';
  rating?: RadarRating;
  description: string;
  conditions: string[];
  risks: string[];
  /** Approximate money value of one ATR(14) move for one contract; null when contract specs are unknown. */
  atrMoney: number | null;
  currency: string | null;
  asOf: string;
  source: string | null;
}

export interface RadarEvent {
  date: string;
  kind: 'WASDE' | 'EIA' | 'COT';
  label: string;
  /** Category the report applies to (COT: all). */
  scope: string;
  source: string;
  scheduled: 'official' | 'weekly-rule';
}

export interface RadarResponse {
  asOf: string | null;
  stale?: boolean;
  items: RadarItem[];
  setups: RadarSetup[];
  events: RadarEvent[];
  caveats: string[];
  disclaimer: string;
  instrumentsTotal: number;
  instrumentsScored: number;
}
