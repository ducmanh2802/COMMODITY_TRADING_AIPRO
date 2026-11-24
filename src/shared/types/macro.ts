import type { DataQualityStatus } from './market';

/** OFFICIAL = published by the issuing agency itself (EIA, USDA, SBV). Everything else is UNOFFICIAL. */
type MacroSourceQuality = 'OFFICIAL' | 'UNOFFICIAL';

export type MacroDatapointId =
  | 'EIA_CRUDE_EX_SPR'
  | 'EIA_GASOLINE'
  | 'EIA_DISTILLATE'
  | 'WASDE_US_CORN_ENDING_STOCKS'
  | 'WASDE_US_SOYBEAN_ENDING_STOCKS'
  | 'WASDE_US_WHEAT_ENDING_STOCKS'
  | 'EIA_ETHANOL_PRODUCTION'
  | 'FAS_EXPORT_SALES_CORN'
  | 'FAS_EXPORT_SALES_SOYBEAN'
  | 'FAS_EXPORT_SALES_WHEAT'
  | 'ERS_BREAKEVEN_CORN'
  | 'ERS_BREAKEVEN_SOYBEAN'
  | 'ERS_BREAKEVEN_WHEAT'
  | 'DXY'
  | 'USDVND_SBV_CENTRAL'
  | 'USDVND_VCB';

/**
 * One fundamental/macro value with full provenance. `value` is null whenever status is UNAVAILABLE or
 * INVALID — a value is never synthesized.
 */
export interface MacroDatapoint {
  id: MacroDatapointId;
  /** Short English label (UI translates by id). */
  label: string;
  value: number | null;
  unit: string;
  /** Period / observation time the value refers to (ISO date or date-time), as stated by the source. */
  asOf: string | null;
  /** Publication time stated by the source, when the source provides one. Never inferred. */
  releasedAt?: string | null;
  /** Prior comparable value from the same source (previous week / previous month's estimate). */
  previousValue?: number | null;
  /** Period of previousValue, as stated by the source. */
  previousAsOf?: string | null;
  /** Extra numeric fields from the same source record (e.g. bank buy/sell). */
  details?: Record<string, number>;
  sourceName: string;
  /** URL that returns (or documents) this exact value. API keys are never included. */
  sourceUrl: string;
  sourceQuality: MacroSourceQuality;
  status: DataQualityStatus;
  /** Why the value is UNAVAILABLE/INVALID/STALE, or caveats about the source. */
  reason?: string;
  /** When this server fetched the source (ISO). */
  fetchedAt: string;
}

export interface WasdeRelease {
  /** release_datetime exactly as published by USDA ESMIS. */
  releasedAtRaw: string;
  /** Parsed ISO time, or null if unparseable. */
  releasedAt: string | null;
  title: string;
  /** Official report files (pdf/txt/xls/xml). */
  files: string[];
}

export interface MacroGroupResult<T> {
  status: DataQualityStatus;
  items: T[];
  sourceUrl: string;
  fetchedAt: string;
  reason?: string;
}

export interface WasdeResult {
  status: DataQualityStatus;
  /** Past releases (newest first) from the ESMIS release API. */
  releases: WasdeRelease[];
  /** Scheduled releases, only if ESMIS publishes them (often empty). Never estimated. */
  upcoming: WasdeRelease[];
  /** Key U.S. numbers parsed from the latest official WASDE text file. */
  keyNumbers: MacroDatapoint[];
  calendarSourceUrl: string;
  fetchedAt: string;
  reason?: string;
}

export interface MacroOverview {
  eia: MacroGroupResult<MacroDatapoint>;
  wasde: WasdeResult;
  fx: MacroGroupResult<MacroDatapoint>;
}
