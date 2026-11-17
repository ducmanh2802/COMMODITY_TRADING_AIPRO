/**
 * Spread construction and spread statistics. See `core.ts` for library-wide conventions.
 *
 * No exchange constants are hard-coded: inter-commodity spreads take caller-supplied coefficients and
 * require the caller to state the unit of every leg and of the output. The library cannot verify the
 * economics of a conversion; it echoes the stated assumptions back in `legs` so they can be displayed.
 * Legs are aligned on the intersection of timestamps (no fill); dropped counts are reported.
 */
import {
  type AnalyticsStatus,
  type SeriesPoint,
  type SeriesResult,
  type ValidatedSeries,
  checkPeriod,
  failSeries,
  mean,
  stdDev,
  validateSeries,
} from './core';

export interface CalendarSpreadPoint {
  /** near − far (same unit as the legs). */
  spread: number;
  /** near / far; null if far <= 0 (ratio not meaningful). */
  ratio: number | null;
}

export interface MultiLegSeriesResult<T> extends SeriesResult<T> {
  /** Points dropped from each input leg by the intersection alignment, keyed by leg id. */
  dropped: Record<string, number>;
}

function intersect(
  legs: { id: string; series: SeriesPoint[] }[]
): { ok: true; timestamps: string[]; cols: number[][]; dropped: Record<string, number> } | { ok: false; reason: string } {
  const valid: ValidatedSeries[] = [];
  for (const l of legs) {
    const v = validateSeries(l.series, { name: l.id });
    if (!v.ok) return { ok: false, reason: v.reason };
    valid.push(v.data);
  }
  let common = new Set(valid[0].ms);
  for (const d of valid.slice(1)) {
    const s = new Set(d.ms);
    common = new Set([...common].filter((m) => s.has(m)));
  }
  const timestamps: string[] = [];
  const keepMs: number[] = [];
  valid[0].ms.forEach((m, i) => {
    if (common.has(m)) {
      keepMs.push(m);
      timestamps.push(valid[0].timestamps[i]);
    }
  });
  const dropped: Record<string, number> = {};
  const cols = valid.map((d, k) => {
    const map = new Map<number, number>();
    d.ms.forEach((m, i) => map.set(m, d.values[i]));
    dropped[legs[k].id] = d.values.length - keepMs.length;
    return keepMs.map((m) => map.get(m) as number);
  });
  return { ok: true, timestamps, cols, dropped };
}

function droppedWarning(dropped: Record<string, number>): string[] {
  const total = Object.values(dropped).reduce((s, x) => s + x, 0);
  return total > 0 ? [`alignment dropped points: ${Object.entries(dropped).map(([k, n]) => `${k}=${n}`).join(', ')}`] : [];
}

/**
 * Calendar spread between two contract months of the **same** commodity (same unit/currency assumed —
 * the caller is responsible for that). spread = near − far; ratio = near / far.
 * Output aligned to the timestamp intersection of the two legs.
 */
export function calendarSpread(near: SeriesPoint[], far: SeriesPoint[]): MultiLegSeriesResult<CalendarSpreadPoint> {
  const al = intersect([
    { id: 'near', series: near },
    { id: 'far', series: far },
  ]);
  if (!al.ok) return { ...failSeries([], 'INVALID_INPUT', al.reason), dropped: {} };
  const warnings = droppedWarning(al.dropped);
  if (al.timestamps.length === 0) return { ...failSeries([], 'INSUFFICIENT_DATA', 'no common timestamps', warnings), dropped: al.dropped };
  const [n, f] = al.cols;
  let badRatio = 0;
  const values = al.timestamps.map((_, i) => {
    const ratio = f[i] > 0 ? n[i] / f[i] : null;
    if (ratio === null) badRatio++;
    return { spread: n[i] - f[i], ratio };
  });
  if (badRatio > 0) warnings.push(`ratio undefined for ${badRatio} point(s) where far leg <= 0`);
  return { timestamps: al.timestamps, values, status: 'OK', warnings, dropped: al.dropped };
}

export interface SpreadLeg {
  /** Unique identifier (e.g. "ZM"). */
  id: string;
  series: SeriesPoint[];
  /**
   * Signed coefficient that converts one unit of this leg's quoted price into `outputUnit` per spread
   * unit (illustration only, for a crush in USD/bu: meal quoted USD/short ton × 0.022, oil quoted
   * USC/lb × 0.11, beans quoted USD/bu × −1 — the caller must verify yields and quote units; none are
   * built in).
   */
  coefficient: number;
  /** Stated unit of the leg's price, e.g. "USD/short ton". Required (non-empty). */
  priceUnit: string;
}

export interface InterCommoditySpreadResult extends MultiLegSeriesResult<number> {
  outputUnit: string;
  /** Echo of the stated conversion assumptions. */
  legs: { id: string; coefficient: number; priceUnit: string }[];
}

/**
 * Inter-commodity (multi-leg) spread: spread[t] = Σ_k coefficient_k · price_k[t], on the timestamp
 * intersection of all legs. Requires ≥ 2 legs, unique ids, finite non-zero coefficients, and non-empty
 * `priceUnit` per leg and `outputUnit` — otherwise INVALID_INPUT.
 */
export function interCommoditySpread(legs: SpreadLeg[], opts: { outputUnit: string }): InterCommoditySpreadResult {
  const echo = Array.isArray(legs) ? legs.map((l) => ({ id: l?.id, coefficient: l?.coefficient, priceUnit: l?.priceUnit })) : [];
  const outputUnit = opts?.outputUnit;
  const fail = (status: Exclude<AnalyticsStatus, 'OK'>, reason: string, extra: Partial<InterCommoditySpreadResult> = {}): InterCommoditySpreadResult => ({
    ...failSeries<number>([], status, reason),
    dropped: {},
    outputUnit: typeof outputUnit === 'string' ? outputUnit : '',
    legs: echo,
    ...extra,
  });
  if (!Array.isArray(legs) || legs.length < 2) return fail('INVALID_INPUT', 'need at least 2 legs');
  if (typeof outputUnit !== 'string' || outputUnit.trim() === '') return fail('INVALID_INPUT', 'outputUnit must be stated');
  const ids = new Set<string>();
  for (const l of legs) {
    if (!l || typeof l.id !== 'string' || l.id.trim() === '') return fail('INVALID_INPUT', 'every leg needs a non-empty id');
    if (ids.has(l.id)) return fail('INVALID_INPUT', `duplicate leg id "${l.id}"`);
    ids.add(l.id);
    if (typeof l.coefficient !== 'number' || !Number.isFinite(l.coefficient) || l.coefficient === 0) {
      return fail('INVALID_INPUT', `leg "${l.id}" coefficient must be a finite non-zero number`);
    }
    if (typeof l.priceUnit !== 'string' || l.priceUnit.trim() === '') return fail('INVALID_INPUT', `leg "${l.id}" priceUnit must be stated`);
  }
  const al = intersect(legs);
  if (!al.ok) return fail('INVALID_INPUT', al.reason);
  const warnings = droppedWarning(al.dropped);
  if (al.timestamps.length === 0) return fail('INSUFFICIENT_DATA', 'no common timestamps across legs', { dropped: al.dropped, warnings });
  const values = al.timestamps.map((_, i) => legs.reduce((s, l, k) => s + l.coefficient * al.cols[k][i], 0));
  return { timestamps: al.timestamps, values, status: 'OK', warnings, dropped: al.dropped, outputUnit, legs: echo };
}

/**
 * Rolling z-score of a (spread) series: z[i] = (v[i] − mean(W)) / σ(W), where W = v[i−window+1..i]
 * **includes the current observation**, and σ is the **sample** standard deviation (n−1). Works for
 * negative values. σ = 0 → null with a warning. null for i < window−1. Default window 20 (min 3).
 */
export function spreadZScore(series: SeriesPoint[], opts: { window?: number } = {}): SeriesResult {
  const window = opts.window ?? 20;
  const v = validateSeries(series);
  if (!v.ok) return failSeries(v.timestamps, 'INVALID_INPUT', v.reason);
  const pe = checkPeriod('window', window, 3);
  if (pe) return failSeries(v.data.timestamps, 'INVALID_INPUT', pe);
  const xs = v.data.values;
  if (xs.length < window) return failSeries(v.data.timestamps, 'INSUFFICIENT_DATA', `need >= ${window} points, got ${xs.length}`);
  const warnings: string[] = [];
  const out: (number | null)[] = xs.map(() => null);
  for (let i = window - 1; i < xs.length; i++) {
    const w = xs.slice(i - window + 1, i + 1);
    const sd = stdDev(w, 'sample');
    if (sd === 0) warnings.push(`z-score undefined at ${v.data.timestamps[i]} (zero variance in window)`);
    else out[i] = (xs[i] - mean(w)) / sd;
  }
  return { timestamps: v.data.timestamps, values: out, status: 'OK', warnings };
}
