/** "Vì sao & sắp tới" (T56) response. Descriptive statistics and scenarios only; never a forecast or advice. */
export interface DText {
  vi: string;
  en: string;
}
export type DriverPartId = 'group' | 'usd' | 'rates' | 'own';
export type DriverStatus = 'OK' | 'PARTIAL' | 'UNAVAILABLE';

export interface DriverEventFlag {
  date: string;
  kind: 'WASDE' | 'EIA' | 'COT';
  label: DText;
}
export interface DriverPart {
  id: DriverPartId;
  /** Contribution to the horizon return, in percentage points (simple-return scale). */
  pct: number;
  /** pct / total return; null when the total is ~0. */
  share: number | null;
  /** Rolling-1y OLS beta (null for 'own'). */
  beta: number | null;
}
export interface DriverHorizon {
  days: 1 | 5 | 20;
  startDate: string;
  endDate: string;
  totalPct: number;
  parts: DriverPart[];
  events: DriverEventFlag[];
  sentence: DText;
}
export interface DriverAttribution {
  status: DriverStatus;
  reason?: DText;
  rSquared: number | null;
  sampleDays: number;
  factors: { id: DriverPartId; label: DText; source: string; asOf: string | null }[];
  horizons: DriverHorizon[];
  note: DText;
}
export interface ConeBand {
  lo: number;
  hi: number;
  loPct: number;
  hiPct: number;
}
export interface ConeHorizon {
  days: 5 | 21;
  parametric: { b50: ConeBand; b80: ConeBand } | null;
  empirical: { n: number; b50: ConeBand; b80: ConeBand; median: number } | null;
  sentence: DText | null;
}
export interface DriverScenarios {
  status: DriverStatus;
  reason?: DText;
  lastClose: number | null;
  asOf: string | null;
  sigmaDaily: number | null;
  volWindowDays: number;
  horizons: ConeHorizon[];
  /** Parametric cone path for charting (day 0..21). */
  path: { d: number; lo50: number; hi50: number; lo80: number; hi80: number }[];
  recent: { date: string; close: number }[];
  source: string | null;
  disclaimer: DText;
}
export interface DriverUpcomingEvent {
  date: string;
  kind: 'WASDE' | 'EIA' | 'COT';
  label: DText;
  source: string;
  scheduled: 'official' | 'weekly-rule';
}
export interface DriverSeasonality {
  status: DriverStatus;
  reason?: DText;
  month: number | null;
  years: number;
  mean: number | null;
  hitUp: number;
  hitText: DText | null;
  min: number | null;
  max: number | null;
  samples: { year: number; ret: number }[];
  source: string | null;
}
export interface DriversResponse {
  instrumentId: string;
  symbol: string;
  name: string;
  asOf: string | null;
  attribution: DriverAttribution;
  scenarios: DriverScenarios;
  /**
   * wasdeKnown: true only when official ESMIS upcoming WASDE dates were actually fetched; false means the
   * WASDE rows (if any) are not authoritative and clients should fall back to an estimated window.
   */
  events: { status: DriverStatus; upcoming: DriverUpcomingEvent[]; notes: DText[]; wasdeKnown: boolean };
  seasonality: DriverSeasonality;
  disclaimer: DText;
}
