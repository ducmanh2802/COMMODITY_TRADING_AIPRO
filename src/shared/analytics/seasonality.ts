/**
 * Seasonality analysis for daily price series (task T14). See `core.ts` for library-wide conventions.
 *
 * Conventions (all dates are UTC calendar dates of the input timestamps):
 * - Input: strictly positive daily prices, at most one observation per UTC calendar date (intraday
 *   data → INVALID_INPUT; aggregate to daily first).
 * - Month-end close = last observation in that calendar month.
 * - Monthly return for (year, month) = close(month) / close(previous calendar month) − 1. Computed only
 *   when the immediately preceding calendar month has data; otherwise that month is skipped (counted
 *   in warnings), never filled.
 * - The **final** calendar month in the series may be partial and is excluded unless
 *   `includeFinalMonth: true`. The first month has no prior month, so it has no return.
 * - "% positive" counts strictly positive returns (a 0 return is not positive).
 * - Coverage requirement: the number of distinct calendar years having at least one monthly return must
 *   be >= `minYears` (default 5), otherwise INSUFFICIENT_DATA.
 * - Average seasonal path: years with observations in both January and December are included; each
 *   such year is normalized to 100 at its **first observation of the year**. Days are indexed on a
 *   366-day leap calendar (Jan 1 = 1, Feb 29 = 60, Mar 1 = 61, Dec 31 = 366) so a calendar date maps
 *   to the same index in every year. By default (`pathFill: 'none'`) the mean for a day uses only the
 *   years that have an observation on that exact date (count reported per day). `pathFill:
 *   'carryForward'` explicitly opts into carrying each year's last observation forward over
 *   non-trading days (within that year, never before its first or after its last observation).
 */
import { type AnalyticsStatus, type SeriesPoint, checkPeriod, mean, median, validateSeries } from './core';

export interface MonthStats {
  /** 1..12 */
  month: number;
  /** Number of yearly samples (monthly returns) for this month. */
  count: number;
  mean: number | null;
  median: number | null;
  /** Fraction (0..1) of samples with return > 0. */
  pctPositive: number | null;
  min: number | null;
  max: number | null;
  /** Individual samples, by year. */
  samples: { year: number; ret: number }[];
}

export interface PathPoint {
  /** 1..366 on a leap calendar */
  dayIndex: number;
  /** "MM-DD" */
  monthDay: string;
  /** Mean normalized level (100 = first observation of the year) or null if no year contributes. */
  mean: number | null;
  /** Number of years contributing to this day. */
  count: number;
}

export interface YearCoverage {
  year: number;
  observations: number;
  monthlyReturns: number;
  includedInPath: boolean;
}

export interface SeasonalityResult {
  status: AnalyticsStatus;
  reason?: string;
  warnings: string[];
  yearsCovered: number;
  months: MonthStats[];
  path: PathPoint[];
  years: YearCoverage[];
}

const MONTH_DAYS_LEAP = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const CUM = MONTH_DAYS_LEAP.reduce<number[]>((acc, d, i) => (acc.push(i === 0 ? 0 : acc[i - 1] + MONTH_DAYS_LEAP[i - 1]), acc), []);

/** Leap-calendar day index (1..366) for a UTC month (1..12) and day. */
export function leapDayIndex(month: number, day: number): number {
  return CUM[month - 1] + day;
}

function monthDayOf(idx: number): string {
  let m = 0;
  while (m < 11 && CUM[m + 1] < idx) m++;
  return `${String(m + 1).padStart(2, '0')}-${String(idx - CUM[m]).padStart(2, '0')}`;
}

export function seasonality(
  series: SeriesPoint[],
  opts: { minYears?: number; includeFinalMonth?: boolean; pathFill?: 'none' | 'carryForward' } = {}
): SeasonalityResult {
  const minYears = opts.minYears ?? 5;
  const fill = opts.pathFill ?? 'none';
  const emptyMonths = (): MonthStats[] =>
    Array.from({ length: 12 }, (_, i) => ({ month: i + 1, count: 0, mean: null, median: null, pctPositive: null, min: null, max: null, samples: [] }));
  const fail = (status: Exclude<AnalyticsStatus, 'OK'>, reason: string, extra: Partial<SeasonalityResult> = {}): SeasonalityResult => ({
    status,
    reason,
    warnings: [],
    yearsCovered: 0,
    months: emptyMonths(),
    path: [],
    years: [],
    ...extra,
  });
  const pe = checkPeriod('minYears', minYears);
  if (pe) return fail('INVALID_INPUT', pe);
  if (fill !== 'none' && fill !== 'carryForward') return fail('INVALID_INPUT', `unknown pathFill "${String(fill)}"`);
  const v = validateSeries(series, { positive: true });
  if (!v.ok) return fail('INVALID_INPUT', v.reason);
  const { ms, values } = v.data;
  if (values.length < 2) return fail('INSUFFICIENT_DATA', 'need >= 2 observations');

  const dates = ms.map((m) => {
    const d = new Date(m);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
  });
  for (let i = 1; i < dates.length; i++) {
    const a = dates[i - 1];
    const b = dates[i];
    if (a.y === b.y && a.m === b.m && a.d === b.d) {
      return fail('INVALID_INPUT', `more than one observation on UTC date ${b.y}-${b.m}-${b.d}; seasonality requires daily data`);
    }
  }
  const warnings: string[] = [];
  const gaps = ms.slice(1).map((m, i) => (m - ms[i]) / 86_400_000);
  if (median(gaps) > 4) warnings.push(`median spacing ${median(gaps).toFixed(1)} days; series does not look daily`);

  // --- monthly returns ---
  const monthKey = (y: number, m: number) => y * 12 + (m - 1);
  const monthClose = new Map<number, number>(); // key -> last close (insertion ordered ascending)
  dates.forEach((d, i) => monthClose.set(monthKey(d.y, d.m), values[i]));
  const keys = [...monthClose.keys()];
  const finalKey = keys[keys.length - 1];
  const months = emptyMonths();
  let skippedGap = 0;
  const retYears = new Set<number>();
  const retCountByYear = new Map<number, number>();
  for (const k of keys) {
    if (k === finalKey && !opts.includeFinalMonth) continue;
    const prev = monthClose.get(k - 1);
    if (prev === undefined) {
      if (k !== keys[0]) skippedGap++;
      continue;
    }
    const y = Math.floor(k / 12);
    const m = (k % 12) + 1;
    months[m - 1].samples.push({ year: y, ret: (monthClose.get(k) as number) / prev - 1 });
    retYears.add(y);
    retCountByYear.set(y, (retCountByYear.get(y) ?? 0) + 1);
  }
  if (!opts.includeFinalMonth) warnings.push('final calendar month excluded as potentially partial (set includeFinalMonth to include)');
  if (skippedGap > 0) warnings.push(`${skippedGap} month(s) skipped because the preceding calendar month has no data`);
  for (const ms_ of months) {
    const rs = ms_.samples.map((s) => s.ret);
    ms_.count = rs.length;
    if (rs.length > 0) {
      ms_.mean = mean(rs);
      ms_.median = median(rs);
      ms_.pctPositive = rs.filter((r) => r > 0).length / rs.length;
      ms_.min = Math.min(...rs);
      ms_.max = Math.max(...rs);
    }
    if (rs.length < minYears) warnings.push(`month ${ms_.month} has only ${rs.length} yearly sample(s) (< minYears ${minYears})`);
  }
  const yearsCovered = retYears.size;

  // --- per-year coverage & seasonal path ---
  const byYear = new Map<number, { idx: number; v: number; m: number }[]>();
  dates.forEach((d, i) => {
    const arr = byYear.get(d.y) ?? [];
    arr.push({ idx: leapDayIndex(d.m, d.d), v: values[i], m: d.m });
    byYear.set(d.y, arr);
  });
  const sums = new Array<number>(367).fill(0);
  const counts = new Array<number>(367).fill(0);
  const years: YearCoverage[] = [];
  for (const [y, obs] of byYear) {
    const included = obs.some((o) => o.m === 1) && obs.some((o) => o.m === 12);
    years.push({ year: y, observations: obs.length, monthlyReturns: retCountByYear.get(y) ?? 0, includedInPath: included });
    if (!included) continue;
    const base = obs[0].v;
    if (fill === 'none') {
      for (const o of obs) {
        sums[o.idx] += (100 * o.v) / base;
        counts[o.idx]++;
      }
    } else {
      let j = 0;
      let last = obs[0].v;
      for (let idx = obs[0].idx; idx <= obs[obs.length - 1].idx; idx++) {
        if (j < obs.length && obs[j].idx === idx) {
          last = obs[j].v;
          j++;
        }
        sums[idx] += (100 * last) / base;
        counts[idx]++;
      }
    }
  }
  const path: PathPoint[] = [];
  for (let idx = 1; idx <= 366; idx++) {
    path.push({ dayIndex: idx, monthDay: monthDayOf(idx), mean: counts[idx] > 0 ? sums[idx] / counts[idx] : null, count: counts[idx] });
  }
  if (fill === 'carryForward') warnings.push('seasonal path uses carry-forward over non-trading days (explicit option)');

  if (yearsCovered < minYears) {
    return fail('INSUFFICIENT_DATA', `need >= ${minYears} years with monthly returns, got ${yearsCovered}`, {
      warnings,
      yearsCovered,
      years,
    });
  }
  return { status: 'OK', warnings, yearsCovered, months, path, years };
}
