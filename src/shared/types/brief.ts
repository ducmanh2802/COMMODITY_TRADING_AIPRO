/**
 * "Phân tích chi tiết" (detailed brief) for one instrument — GET /api/analysis/brief/:instrumentId.
 *
 * Deterministic: the server only composes existing engines/services (quotes, candles, technical engine,
 * shared analytics, COT, contract chain) and turns the numbers into neutral sentences with fixed
 * templates. No AI, no trading signals (no buy/sell/entry/target/stop). Every fact carries its source,
 * quality and as-of time; missing data is reported as such, never filled in.
 */

export type BriefSectionId =
  | 'price'
  | 'trend'
  | 'momentum'
  | 'risk'
  | 'seasonality'
  | 'cot'
  | 'termStructure'
  | 'contract'
  | 'missing';

export type BriefSectionStatus = 'OK' | 'PARTIAL' | 'UNAVAILABLE';

/**
 * Quality of a single fact:
 * - OFFICIAL / LICENSED_VENDOR / UNOFFICIAL / USER_PROVIDED: quality of the underlying data source.
 * - DERIVED: computed by this app from the data shown next to it (inherits that data's limits).
 * - REFERENCE: static reference data from the Instrument Master (contract specs, profiles).
 */
export type BriefFactQuality =
  | 'OFFICIAL'
  | 'LICENSED_VENDOR'
  | 'UNOFFICIAL'
  | 'USER_PROVIDED'
  | 'DERIVED'
  | 'REFERENCE';

/** Bilingual text; Vietnamese is primary. */
export interface BriefText {
  vi: string;
  en: string;
}

export interface BriefFact {
  label: BriefText;
  /** Display-ready value (formatted per language), or null when unavailable. */
  value: BriefText | null;
  /** Raw numeric value when the fact is a number (for charts / tests). */
  raw?: number | null;
  unit?: string | null;
  source: string;
  quality: BriefFactQuality;
  /** Freshness label of the data, e.g. DELAYED / HISTORICAL / STALE (DataQualityStatus). */
  freshness?: string | null;
  /** ISO timestamp or YYYY-MM-DD date the value refers to. */
  asOf: string | null;
}

export interface BriefSection {
  id: BriefSectionId;
  status: BriefSectionStatus;
  facts: BriefFact[];
  /** One to three neutral sentences generated from the numbers. */
  plainText: BriefText;
  /** Short beginner explanation of the concept. */
  whatItMeans: BriefText;
  /** Why the section is partial/unavailable (plain language). */
  missingReason?: BriefText | null;
}

export interface BriefChartPoint {
  t: string;
  close: number;
  ma50: number | null;
}

export interface AnalysisBrief {
  instrumentId: string;
  exchangeSymbol: string;
  productName: string;
  vietnameseName: string | null;
  generatedAt: string;
  /** Where the daily history came from (or null when none). */
  history: {
    origin: 'SQLITE' | 'MEMORY' | 'YAHOO' | 'NONE';
    source: string | null;
    quality: BriefFactQuality | null;
    bars: number;
    firstDate: string | null;
    lastDate: string | null;
    note: string | null;
  };
  summary: BriefText[];
  sections: BriefSection[];
  chart: { unit: string; points: BriefChartPoint[] } | null;
  disclaimer: BriefText;
}
