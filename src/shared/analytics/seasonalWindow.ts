/**
 * Seasonal window check (task S4). Education tool that also teaches overfitting / data snooping.
 *
 * For one daily close series and a calendar window (entry month/day to exit month/day), each year's
 * trade is: entry = FIRST bar on/after the entry date, exit = LAST bar on/before the exit date.
 * A bar further than `MAX_GAP_DAYS` calendar days from the target date (long holiday / missing data)
 * is treated as missing; that year is excluded and listed in `skippedYears`. A window whose exit
 * month/day is not after the entry month/day ends in the following year. Never invents data.
 *
 * `scanWindows` tries every window start (every `stepDays` days from Jan 1) with a fixed length and
 * counts how many "look great" (win rate >= `greatWinRate`), then compares with what a fair coin
 * would produce (binomial tail) to show that the best of many windows overstates the edge.
 * Refs: Bailey, Borwein, Lopez de Prado, Zhu (2014) "Pseudo-Mathematics and Financial Charlatanism";
 * Harvey and Liu (2015) on multiple testing.
 */
import { type SeriesPoint, mean, median, validateSeries } from './core';

export const MAX_GAP_DAYS = 7;
const DAY = 86_400_000;

export interface WindowYear {
  year: number;
  entryDate: string;
  exitDate: string;
  entryClose: number;
  exitClose: number;
  /** Fraction, 0.05 = +5%. */
  ret: number;
  up: boolean;
}

export interface WindowStats {
  status: 'OK' | 'INSUFFICIENT_DATA' | 'INVALID_INPUT';
  reason?: string;
  years: WindowYear[];
  /** Years tried but excluded because the entry or exit bar was missing or too far away. */
  skippedYears: number[];
  n: number;
  winRate: number | null;
  median: number | null;
  mean: number | null;
  worst: WindowYear | null;
}

interface Bars {
  ms: number[];
  values: number[];
}

function prep(series: SeriesPoint[]): { bars: Bars } | { error: string } {
  const v = validateSeries(series, { positive: true });
  if (!v.ok) return { error: v.reason };
  const ms = v.data.ms.map((m) => Math.floor(m / DAY) * DAY);
  for (let i = 1; i < ms.length; i++) if (ms[i] === ms[i - 1]) return { error: 'more than one observation on one UTC date; daily data required' };
  return { bars: { ms, values: v.data.values } };
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** UTC ms of (year, month, day); day is clamped to the month length (Feb 29 becomes Feb 28 in non-leap years). */
function dateMs(year: number, month: number, day: number): number {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Date.UTC(year, month - 1, Math.min(day, last));
}

function firstOnOrAfter(ms: number[], target: number): number {
  let lo = 0;
  let hi = ms.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ms[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo; // ms.length when none
}

function evalYears(b: Bars, entryAt: (y: number) => number, exitAt: (y: number) => number): { years: WindowYear[]; skipped: number[] } {
  const firstY = new Date(b.ms[0]).getUTCFullYear();
  const lastY = new Date(b.ms[b.ms.length - 1]).getUTCFullYear();
  const years: WindowYear[] = [];
  const skipped: number[] = [];
  for (let y = firstY; y <= lastY; y++) {
    const et = entryAt(y);
    const xt = exitAt(y);
    const i = firstOnOrAfter(b.ms, et);
    const j = firstOnOrAfter(b.ms, xt + DAY) - 1; // last bar on/before exit
    const ok = i < b.ms.length && j >= 0 && i < j && b.ms[i] - et <= MAX_GAP_DAYS * DAY && xt - b.ms[j] <= MAX_GAP_DAYS * DAY;
    if (!ok) {
      skipped.push(y);
      continue;
    }
    const ret = b.values[j] / b.values[i] - 1;
    years.push({ year: y, entryDate: iso(b.ms[i]), exitDate: iso(b.ms[j]), entryClose: b.values[i], exitClose: b.values[j], ret, up: ret > 0 });
  }
  return { years, skipped };
}

function summarize(years: WindowYear[], skipped: number[]): WindowStats {
  const n = years.length;
  if (n === 0) return { status: 'INSUFFICIENT_DATA', reason: 'no complete year for this window', years, skippedYears: skipped, n, winRate: null, median: null, mean: null, worst: null };
  const rs = years.map((y) => y.ret);
  return {
    status: 'OK',
    years,
    skippedYears: skipped,
    n,
    winRate: years.filter((y) => y.up).length / n,
    median: median(rs),
    mean: mean(rs),
    worst: years.reduce((w, y) => (y.ret < w.ret ? y : w)),
  };
}

const bad = (reason: string): WindowStats => ({ status: 'INVALID_INPUT', reason, years: [], skippedYears: [], n: 0, winRate: null, median: null, mean: null, worst: null });
const validMD = (m: number, d: number) => Number.isInteger(m) && Number.isInteger(d) && m >= 1 && m <= 12 && d >= 1 && d <= 31;

export function seasonalWindow(series: SeriesPoint[], start: { month: number; day: number }, end: { month: number; day: number }): WindowStats {
  if (!validMD(start.month, start.day) || !validMD(end.month, end.day)) return bad('invalid month/day');
  const p = prep(series);
  if ('error' in p) return bad(p.error);
  if (p.bars.ms.length < 2) return { ...bad('need >= 2 observations'), status: 'INSUFFICIENT_DATA' };
  const wrap = end.month < start.month || (end.month === start.month && end.day <= start.day) ? 1 : 0;
  const r = evalYears(
    p.bars,
    (y) => dateMs(y, start.month, start.day),
    (y) => dateMs(y + wrap, end.month, end.day)
  );
  return summarize(r.years, r.skipped);
}

export interface ScanResult {
  status: 'OK' | 'INSUFFICIENT_DATA' | 'INVALID_INPUT';
  reason?: string;
  lengthDays: number;
  minYears: number;
  greatWinRate: number;
  /** Window start dates tried. */
  windows: number;
  /** Windows with enough years to judge (n >= minYears). */
  evaluated: number;
  /** Evaluated windows with win rate >= greatWinRate. */
  great: number;
  /** Expected number of "great" windows if every window were a fair coin flip (sum of binomial tails). */
  expectedByChance: number;
  best: { startMonthDay: string; stats: WindowStats } | null;
}

/** P(X >= k) for X ~ Binomial(n, 0.5). */
export function binomTailHalf(n: number, k: number): number {
  if (k <= 0) return 1;
  if (k > n) return 0;
  let c = 1; // C(n, 0)
  let sum = 0;
  for (let i = 0; i <= n; i++) {
    if (i >= k) sum += c;
    c = (c * (n - i)) / (i + 1);
  }
  return sum / 2 ** n;
}

export function scanWindows(series: SeriesPoint[], opts: { lengthDays?: number; stepDays?: number; minYears?: number; greatWinRate?: number } = {}): ScanResult {
  const lengthDays = opts.lengthDays ?? 30;
  const stepDays = opts.stepDays ?? 7;
  const minYears = opts.minYears ?? 5;
  const greatWinRate = opts.greatWinRate ?? 0.8;
  const base = { lengthDays, minYears, greatWinRate, windows: 0, evaluated: 0, great: 0, expectedByChance: 0, best: null };
  if (!(lengthDays >= 1) || !(stepDays >= 1)) return { ...base, status: 'INVALID_INPUT', reason: 'lengthDays and stepDays must be >= 1' };
  const p = prep(series);
  if ('error' in p) return { ...base, status: 'INVALID_INPUT', reason: p.error };
  if (p.bars.ms.length < 2) return { ...base, status: 'INSUFFICIENT_DATA', reason: 'need >= 2 observations' };
  let windows = 0;
  let evaluated = 0;
  let great = 0;
  let expected = 0;
  let best: ScanResult['best'] = null;
  for (let off = 0; off < 365; off += stepDays) {
    windows++;
    // Non-leap reference year 2001 only maps the day offset to a month/day.
    const ref = new Date(Date.UTC(2001, 0, 1) + off * DAY);
    const sm = ref.getUTCMonth() + 1;
    const sd = ref.getUTCDate();
    const r = evalYears(
      p.bars,
      (y) => dateMs(y, sm, sd),
      (y) => dateMs(y, sm, sd) + lengthDays * DAY
    );
    const st = summarize(r.years, r.skipped);
    if (st.status !== 'OK' || st.n < minYears) continue;
    evaluated++;
    const wr = st.winRate as number;
    if (wr >= greatWinRate) great++;
    expected += binomTailHalf(st.n, Math.ceil(greatWinRate * st.n - 1e-9));
    if (!best || wr > (best.stats.winRate as number) || (wr === best.stats.winRate && (st.median as number) > (best.stats.median as number))) {
      best = { startMonthDay: `${String(sm).padStart(2, '0')}-${String(sd).padStart(2, '0')}`, stats: st };
    }
  }
  if (evaluated === 0) return { ...base, windows, status: 'INSUFFICIENT_DATA', reason: `no window has >= ${minYears} years` };
  return { status: 'OK', lengthDays, minYears, greatWinRate, windows, evaluated, great, expectedByChance: expected, best };
}
