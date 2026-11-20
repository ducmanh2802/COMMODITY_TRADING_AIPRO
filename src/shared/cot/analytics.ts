/**
 * CFTC Commitments of Traders (COT) analytics — pure, deterministic functions (no I/O, no clock).
 *
 * Conventions (same as `src/shared/analytics/`):
 * - Fail-closed: invalid input → `INVALID_INPUT`; too little data → `INSUFFICIENT_DATA`; values are `null`.
 * - Missing weeks are NEVER interpolated or forward-filled. They are reported in `gaps`, and any
 *   computation that would need a missing week (week-over-week change, COT Index window) yields `null`.
 *
 * Dates
 * - `reportDate` is the CFTC "as of" date (normally a Tuesday) exactly as CFTC publishes it, YYYY-MM-DD.
 * - CFTC normally RELEASES that report on the following Friday (15:30 US Eastern); holiday weeks and
 *   government shutdowns delay releases. Any backtest / signal research must therefore only use a row
 *   from its release time onward, never from `reportDate`, or it introduces look-ahead bias.
 *   `expectedReleaseDate()` gives the TYPICAL Friday only — it is an estimate, not the actual release.
 *
 * Formulas
 * - net(category)            = long − short                     (spreading positions are excluded)
 * - netPctOi(category)       = net / openInterest × 100          (null when openInterest ≤ 0)
 * - netChangeWoW(category)   = net(t) − net(t − 7 days)           (null unless the previous report is
 *                                                                  exactly 7 calendar days earlier)
 * - COT Index(category, N)   = (net(t) − min(net over window)) / (max − min) × 100
 *     window = the reports with reportDate in (t − 7·N days, t], i.e. the latest N weekly reports
 *     including t. The point is computed only when the window holds at least N − maxMissingWeeks
 *     reports (default maxMissingWeeks = 0 → a complete window of N weekly reports), otherwise null.
 *     When max = min the index is undefined → null with a warning.
 *     Default N = 156 weeks (3 years). 0 = net at the low of the window, 100 = at the high.
 */

export type CotAnalyticsStatus = 'OK' | 'INSUFFICIENT_DATA' | 'INVALID_INPUT';

export type CotReportType = 'DISAGGREGATED' | 'LEGACY';

export const DISAGGREGATED_CATEGORIES = [
  'producerMerchant',
  'swapDealers',
  'managedMoney',
  'otherReportables',
  'nonReportables',
] as const;

export const LEGACY_CATEGORIES = ['nonCommercial', 'commercial', 'nonReportables'] as const;

export type DisaggregatedCategory = (typeof DISAGGREGATED_CATEGORIES)[number];
export type LegacyCategory = (typeof LEGACY_CATEGORIES)[number];
export type CotCategory = DisaggregatedCategory | LegacyCategory;

export function categoriesFor(reportType: CotReportType): readonly CotCategory[] {
  return reportType === 'DISAGGREGATED' ? DISAGGREGATED_CATEGORIES : LEGACY_CATEGORIES;
}

/** Positions of one trader category, in contracts. `spread` is null for categories without one. */
export interface CotCategoryPositions {
  long: number;
  short: number;
  spread: number | null;
}

/** One weekly report for one market (only the fields analytics needs). */
export interface CotPositionsRow {
  reportDate: string;
  openInterest: number;
  positions: Partial<Record<CotCategory, CotCategoryPositions>>;
}

export interface CotWeeklyGap {
  /** Last report before the gap. */
  after: string;
  /** First report after the gap. */
  before: string;
  /** Calendar days between the two reports. */
  days: number;
  /** Whole weeks with no report (days/7 − 1), or null when the spacing is not a multiple of 7. */
  missingWeeks: number | null;
  kind: 'MISSING_WEEKS' | 'IRREGULAR_INTERVAL';
}

export interface CotCategoryAnalytics extends CotCategoryPositions {
  net: number;
  netPctOi: number | null;
  netChangeWoW: number | null;
  cotIndex: number | null;
}

export interface CotAnalyticsRow {
  reportDate: string;
  expectedReleaseDate: string;
  openInterest: number;
  openInterestChange4w: number | null;
  categories: Partial<Record<CotCategory, CotCategoryAnalytics>>;
}

export interface CotAnalyticsOptions {
  lookbackWeeks?: number;
  maxMissingWeeks?: number;
}

export interface CotAnalyticsResult {
  status: CotAnalyticsStatus;
  reason?: string;
  warnings: string[];
  reportType: CotReportType;
  lookbackWeeks: number;
  maxMissingWeeks: number;
  formula: typeof COT_FORMULAS;
  gaps: CotWeeklyGap[];
  rows: CotAnalyticsRow[];
  /** Latest row (most recent reportDate), or null. */
  latest: CotAnalyticsRow | null;
}

export const DEFAULT_COT_LOOKBACK_WEEKS = 156;
export const MIN_COT_LOOKBACK_WEEKS = 4;
export const MAX_COT_LOOKBACK_WEEKS = 1040;

export const COT_FORMULAS = {
  net: 'long - short (spreading excluded)',
  netPctOi: 'net / openInterest * 100',
  netChangeWoW: 'net(t) - net(t - 7 days); null if the previous report is not exactly 7 days earlier',
  openInterestChange4w: 'openInterest(t) - openInterest(t - 28 days); null if the report 28 days earlier is missing',
  cotIndex:
    '(net(t) - min(net in window)) / (max(net in window) - min(net in window)) * 100; window = reports with reportDate in (t - 7*N days, t]; requires >= N - maxMissingWeeks reports; null if max = min',
  timing:
    'reportDate is the CFTC as-of date (usually Tuesday). Data is typically released the following Friday 15:30 ET; use rows only from release time to avoid look-ahead bias.',
} as const;

const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse a strict YYYY-MM-DD calendar date to UTC epoch ms, or null. */
export function parseIsoDate(value: string): number | null {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  // Reject rollovers such as 2026-02-30.
  return new Date(ms).toISOString().slice(0, 10) === value ? ms : null;
}

function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * The TYPICAL CFTC release date for a report: the first Friday on or after reportDate + 1 day.
 * Estimate only — holidays / shutdowns delay actual releases.
 */
export function expectedReleaseDate(reportDate: string): string {
  const ms = parseIsoDate(reportDate);
  if (ms === null) throw new Error(`Invalid reportDate ${reportDate}`);
  const day = new Date(ms).getUTCDay(); // 0 Sun … 5 Fri
  let add = (5 - day + 7) % 7;
  if (add === 0) add = 7;
  return toIsoDate(ms + add * DAY_MS);
}

/** Report gaps between consecutive weekly report dates (input must be ascending, unique). */
export function detectWeeklyGaps(reportDates: readonly string[]): CotWeeklyGap[] {
  const gaps: CotWeeklyGap[] = [];
  for (let i = 1; i < reportDates.length; i += 1) {
    const prev = parseIsoDate(reportDates[i - 1]);
    const cur = parseIsoDate(reportDates[i]);
    if (prev === null || cur === null) continue;
    const days = Math.round((cur - prev) / DAY_MS);
    if (days === 7) continue;
    const multiple = days % 7 === 0;
    gaps.push({
      after: reportDates[i - 1],
      before: reportDates[i],
      days,
      missingWeeks: multiple ? days / 7 - 1 : null,
      kind: multiple ? 'MISSING_WEEKS' : 'IRREGULAR_INTERVAL',
    });
  }
  return gaps;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function validate(rows: readonly CotPositionsRow[], reportType: CotReportType): string | null {
  const cats = categoriesFor(reportType);
  let prev: number | null = null;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const ms = parseIsoDate(row?.reportDate);
    if (ms === null) return `rows[${i}].reportDate is not a valid YYYY-MM-DD date`;
    if (prev !== null && ms <= prev) return `rows must be strictly ascending by reportDate (rows[${i}] = ${row.reportDate})`;
    prev = ms;
    if (!isFiniteNumber(row.openInterest) || row.openInterest < 0) {
      return `rows[${i}].openInterest must be a finite non-negative number`;
    }
    for (const cat of cats) {
      const p = row.positions?.[cat];
      if (!p) return `rows[${i}] is missing category ${cat}`;
      if (!isFiniteNumber(p.long) || !isFiniteNumber(p.short) || p.long < 0 || p.short < 0) {
        return `rows[${i}].${cat} long/short must be finite non-negative numbers`;
      }
      if (p.spread !== null && (!isFiniteNumber(p.spread) || p.spread < 0)) {
        return `rows[${i}].${cat}.spread must be null or a finite non-negative number`;
      }
    }
  }
  return null;
}

/**
 * COT Index series for one ascending net-position series. `dates` and `nets` are index-aligned.
 * Returns null where the window is incomplete or flat. See the module header for the formula.
 */
export function cotIndexSeries(
  dates: readonly string[],
  nets: readonly number[],
  lookbackWeeks: number,
  maxMissingWeeks = 0
): { values: (number | null)[]; flatWindows: number } {
  const times = dates.map((d) => parseIsoDate(d) as number);
  const values: (number | null)[] = [];
  let flatWindows = 0;
  const windowMs = lookbackWeeks * 7 * DAY_MS;
  const required = lookbackWeeks - maxMissingWeeks;
  let start = 0;
  for (let i = 0; i < nets.length; i += 1) {
    while (times[start] <= times[i] - windowMs) start += 1;
    const count = i - start + 1;
    if (count < required) {
      values.push(null);
      continue;
    }
    let min = Infinity;
    let max = -Infinity;
    for (let j = start; j <= i; j += 1) {
      if (nets[j] < min) min = nets[j];
      if (nets[j] > max) max = nets[j];
    }
    if (max === min) {
      flatWindows += 1;
      values.push(null);
      continue;
    }
    values.push(((nets[i] - min) / (max - min)) * 100);
  }
  return { values, flatWindows };
}

/** Full COT analytics for one market and report type. Input rows must be ascending by reportDate. */
export function analyzeCot(
  rows: readonly CotPositionsRow[],
  reportType: CotReportType,
  options: CotAnalyticsOptions = {}
): CotAnalyticsResult {
  const lookbackWeeks = options.lookbackWeeks ?? DEFAULT_COT_LOOKBACK_WEEKS;
  const maxMissingWeeks = options.maxMissingWeeks ?? 0;
  const base = {
    reportType,
    lookbackWeeks,
    maxMissingWeeks,
    formula: COT_FORMULAS,
    warnings: [] as string[],
  };
  const fail = (status: Exclude<CotAnalyticsStatus, 'OK'>, reason: string, gaps: CotWeeklyGap[] = []) => ({
    ...base,
    status,
    reason,
    gaps,
    rows: [],
    latest: null,
  });

  if (
    !Number.isInteger(lookbackWeeks) ||
    lookbackWeeks < MIN_COT_LOOKBACK_WEEKS ||
    lookbackWeeks > MAX_COT_LOOKBACK_WEEKS
  ) {
    return fail('INVALID_INPUT', `lookbackWeeks must be an integer in [${MIN_COT_LOOKBACK_WEEKS}, ${MAX_COT_LOOKBACK_WEEKS}]`);
  }
  if (!Number.isInteger(maxMissingWeeks) || maxMissingWeeks < 0 || maxMissingWeeks >= lookbackWeeks) {
    return fail('INVALID_INPUT', 'maxMissingWeeks must be an integer in [0, lookbackWeeks)');
  }
  const invalid = validate(rows, reportType);
  if (invalid) return fail('INVALID_INPUT', invalid);
  if (rows.length === 0) return fail('INSUFFICIENT_DATA', 'No COT reports available.');

  const dates = rows.map((r) => r.reportDate);
  const gaps = detectWeeklyGaps(dates);
  const warnings: string[] = [];
  if (gaps.length > 0) {
    const missing = gaps.reduce((s, g) => s + (g.missingWeeks ?? 0), 0);
    warnings.push(
      `${gaps.length} gap(s) in weekly reports (${missing} missing week(s)); not interpolated — affected week-over-week changes and COT Index windows are null.`
    );
  }

  const cats = categoriesFor(reportType);
  const outRows: CotAnalyticsRow[] = rows.map((r) => ({
    reportDate: r.reportDate,
    expectedReleaseDate: expectedReleaseDate(r.reportDate),
    openInterest: r.openInterest,
    openInterestChange4w: null,
    categories: {},
  }));
  // Compute 4-week open interest change (28 calendar days)
  const oiValues = rows.map((r) => r.openInterest);
  for (let i = 0; i < rows.length; i += 1) {
    const curMs = parseIsoDate(dates[i]) as number;
    const targetMs = curMs - 28 * DAY_MS;
    const targetDate = toIsoDate(targetMs);
    const j = dates.indexOf(targetDate);
    if (j >= 0) {
      outRows[i].openInterestChange4w = oiValues[i] - oiValues[j];
    }
  }
  let zeroOi = 0;
  for (const r of rows) if (r.openInterest <= 0) zeroOi += 1;
  if (zeroOi > 0) warnings.push(`${zeroOi} report(s) with zero open interest; netPctOi is null there.`);

  let anyIndex = false;
  let flatTotal = 0;
  for (const cat of cats) {
    const nets = rows.map((r) => r.positions[cat]!.long - r.positions[cat]!.short);
    const { values: idx, flatWindows } = cotIndexSeries(dates, nets, lookbackWeeks, maxMissingWeeks);
    flatTotal += flatWindows;
    for (let i = 0; i < rows.length; i += 1) {
      const p = rows[i].positions[cat]!;
      const prevMs = i > 0 ? parseIsoDate(dates[i - 1]) : null;
      const curMs = parseIsoDate(dates[i]) as number;
      const contiguous = prevMs !== null && curMs - prevMs === 7 * DAY_MS;
      if (idx[i] !== null) anyIndex = true;
      outRows[i].categories[cat] = {
        long: p.long,
        short: p.short,
        spread: p.spread,
        net: nets[i],
        netPctOi: rows[i].openInterest > 0 ? (nets[i] / rows[i].openInterest) * 100 : null,
        netChangeWoW: contiguous ? nets[i] - nets[i - 1] : null,
        cotIndex: idx[i],
      };
    }
  }
  if (flatTotal > 0) warnings.push(`${flatTotal} COT Index window(s) had max = min net; index is null there.`);

  const latest = outRows[outRows.length - 1];
  if (!anyIndex) {
    return {
      ...base,
      warnings,
      status: 'INSUFFICIENT_DATA',
      reason: `COT Index needs ${lookbackWeeks - maxMissingWeeks} weekly reports within a ${lookbackWeeks}-week window; have ${rows.length} report(s)${gaps.length ? ' with gaps' : ''}.`,
      gaps,
      rows: outRows,
      latest,
    };
  }
  const latestHasIndex = cats.some((c) => latest.categories[c]?.cotIndex !== null);
  if (!latestHasIndex) warnings.push('COT Index is null for the latest report (incomplete or flat window).');
  return { ...base, warnings, status: 'OK', gaps, rows: outRows, latest };
}
