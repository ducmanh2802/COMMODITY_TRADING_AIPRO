/** Wire types for GET /api/market-pulse ("Tình hình tài chính thế giới"). Descriptive only, never a forecast. */
export type PulseQuality = 'OFFICIAL' | 'LICENSED_VENDOR' | 'UNOFFICIAL' | 'USER_PROVIDED';
export type PulseText = { vi: string; en: string };

export interface PulseSparkPoint {
  date: string;
  value: number;
}

export interface PulseIndicator {
  id: 'FED_FUNDS' | 'DGS2' | 'DGS10' | 'SPREAD_10Y2Y' | 'CPI_YOY' | 'REAL_10Y' | 'USD_BROAD';
  label: PulseText;
  /** Latest value; null when the series could not be loaded (never fabricated). */
  value: number | null;
  unit: '%' | 'index' | 'pp';
  asOf: string | null;
  /** 'pp' = change in percentage points (rates); 'pct' = percent change (index levels). */
  changeKind: 'pp' | 'pct';
  change1m: number | null;
  change3m: number | null;
  /** Exact calculation, stated to the reader. */
  formula: PulseText | null;
  source: string;
  sourceUrl: string;
  quality: PulseQuality;
  note?: string;
  spark: PulseSparkPoint[];
}

export interface PulseGroupStats {
  group: 'AGRI' | 'METALS' | 'ENERGY';
  label: PulseText;
  count: number;
  avg1d: number | null;
  avg5d: number | null;
  avg20d: number | null;
  vol20: number | null;
  /** 0..100 percentile of current 20d realized vol within the group's own ~1y history; null if too short. */
  volPercentile: number | null;
  volLevel: 'HIGH' | 'NORMAL' | 'LOW' | null;
  /** 60-day correlation of daily returns with the broad dollar index (FRED); null when not computable. */
  corrUsd60d: number | null;
  corrObservations: number;
}

export interface PulseMover {
  symbol: string;
  name: string;
  group: PulseGroupStats['group'];
  changePct: number;
  asOf: string;
}

export interface PulseBreadth {
  instrumentsWithData: number;
  up1d: number;
  down1d: number;
  flat1d: number;
  up5d: number;
  down5d: number;
  flat5d: number;
  asOf: string | null;
}

export interface MarketPulse {
  generatedAt: string;
  /** Set by GET /api/market-pulse (stale-while-revalidate): true when served from an expired cache. */
  asOf?: string;
  stale?: boolean;
  fed: PulseIndicator[];
  fomc: { available: false; calendarUrl: string; note: PulseText };
  commodities: {
    breadth: PulseBreadth;
    groups: PulseGroupStats[];
    moversUp: PulseMover[];
    moversDown: PulseMover[];
    avg1d: number | null;
    avg5d: number | null;
    avg20d: number | null;
    historySources: string[];
    quality: PulseQuality;
    note: PulseText | null;
  };
  summary: PulseText[];
  explanations: { id: string; title: PulseText; body: PulseText }[];
  disclaimer: PulseText;
  warnings: string[];
}
