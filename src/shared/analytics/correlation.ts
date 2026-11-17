/**
 * Alignment, correlation and beta (task T16). See `core.ts` for library-wide conventions.
 *
 * IMPORTANT — correlation is always computed on **returns, never on price levels**. Price levels of
 * trending assets are non-stationary and show spurious correlation. Every function here takes price
 * series (strictly positive), aligns them on the **intersection of timestamps** (no fill), and then
 * computes returns on the aligned series, so each return spans the same interval for both legs.
 * The number of observations dropped from each input by the alignment is always reported.
 *
 * Covariance / variance use the sample (n−1) convention; Pearson r and beta are invariant to that choice.
 */
import {
  type AnalyticsStatus,
  type SeriesPoint,
  type ScalarResult,
  type ValidatedSeries,
  type SeriesResult,
  checkPeriod,
  failScalar,
  failSeries,
  validateSeries,
} from './core';

export type ReturnKind = 'log' | 'simple';

export interface AlignResult {
  status: AnalyticsStatus;
  reason?: string;
  warnings: string[];
  /** Common timestamps (taken from series A's spelling). */
  timestamps: string[];
  a: number[];
  b: number[];
  droppedA: number;
  droppedB: number;
}

/**
 * Inner-join two series on timestamp (compared as parsed epoch ms). Points present in only one series
 * are dropped (and counted) — never interpolated or forward-filled.
 */
export function alignSeries(a: SeriesPoint[], b: SeriesPoint[], opts: { positive?: boolean } = {}): AlignResult {
  const empty = { timestamps: [], a: [], b: [], droppedA: 0, droppedB: 0, warnings: [] as string[] };
  const va = validateSeries(a, { positive: opts.positive, name: 'a' });
  if (!va.ok) return { ...empty, status: 'INVALID_INPUT', reason: va.reason };
  const vb = validateSeries(b, { positive: opts.positive, name: 'b' });
  if (!vb.ok) return { ...empty, status: 'INVALID_INPUT', reason: vb.reason };
  const mapB = new Map<number, number>();
  vb.data.ms.forEach((m, i) => mapB.set(m, vb.data.values[i]));
  const timestamps: string[] = [];
  const xa: number[] = [];
  const xb: number[] = [];
  va.data.ms.forEach((m, i) => {
    const bv = mapB.get(m);
    if (bv !== undefined) {
      timestamps.push(va.data.timestamps[i]);
      xa.push(va.data.values[i]);
      xb.push(bv);
    }
  });
  const droppedA = va.data.values.length - xa.length;
  const droppedB = vb.data.values.length - xb.length;
  const warnings: string[] = [];
  if (droppedA || droppedB) warnings.push(`alignment dropped ${droppedA} point(s) from A and ${droppedB} from B`);
  return { status: 'OK', warnings, timestamps, a: xa, b: xb, droppedA, droppedB };
}

/** Pearson correlation of two equal-length numeric arrays. null if n < 2 or either variance is 0. */
export function pearson(x: number[], y: number[]): number | null {
  const n = x.length;
  if (n !== y.length || n < 2) return null;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += x[i];
    my += y[i];
  }
  mx /= n;
  my /= n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  const r = sxy / Math.sqrt(sxx * syy);
  return Math.max(-1, Math.min(1, r));
}

/** OLS slope of y on x: cov(x,y)/var(x). null if n < 2 or var(x) = 0. */
export function olsBeta(y: number[], x: number[]): number | null {
  const n = x.length;
  if (n !== y.length || n < 2) return null;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += x[i];
    my += y[i];
  }
  mx /= n;
  my /= n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
  }
  return sxx === 0 ? null : sxy / sxx;
}

function toReturns(xs: number[], kind: ReturnKind): number[] {
  const r: number[] = [];
  for (let i = 1; i < xs.length; i++) r.push(kind === 'log' ? Math.log(xs[i] / xs[i - 1]) : xs[i] / xs[i - 1] - 1);
  return r;
}

export interface CorrelationResult extends ScalarResult {
  /** Number of return pairs used. */
  n: number;
  droppedA: number;
  droppedB: number;
}

/**
 * Pearson correlation of the returns of two **price** series (aligned by timestamp intersection first).
 * @param opts.returns 'log' (default) or 'simple'
 * @param opts.minObservations minimum number of return pairs; default 20 → INSUFFICIENT_DATA below it.
 * Zero variance in either return series → INSUFFICIENT_DATA (correlation undefined).
 */
export function correlation(
  a: SeriesPoint[],
  b: SeriesPoint[],
  opts: { returns?: ReturnKind; minObservations?: number } = {}
): CorrelationResult {
  const kind = opts.returns ?? 'log';
  const minObs = opts.minObservations ?? 20;
  const pe = checkPeriod('minObservations', minObs, 2);
  const al = alignSeries(a, b, { positive: true });
  const base = { n: 0, droppedA: al.droppedA, droppedB: al.droppedB };
  if (al.status !== 'OK') return { ...failScalar('INVALID_INPUT', al.reason ?? 'invalid'), ...base };
  if (pe) return { ...failScalar('INVALID_INPUT', pe), ...base };
  const ra = toReturns(al.a, kind);
  const rb = toReturns(al.b, kind);
  const n = ra.length;
  if (n < minObs) return { ...failScalar('INSUFFICIENT_DATA', `need >= ${minObs} return pairs after alignment, got ${n}`, al.warnings), ...base, n };
  const r = pearson(ra, rb);
  if (r === null) return { ...failScalar('INSUFFICIENT_DATA', 'zero variance in returns; correlation undefined', al.warnings), ...base, n };
  return { value: r, status: 'OK', warnings: al.warnings, ...base, n };
}

export interface RollingPairResult extends SeriesResult {
  droppedA: number;
  droppedB: number;
}

function rollingPair(
  a: SeriesPoint[],
  b: SeriesPoint[],
  window: number,
  kind: ReturnKind,
  fn: (ra: number[], rb: number[]) => number | null,
  label: string
): RollingPairResult {
  const al = alignSeries(a, b, { positive: true });
  if (al.status !== 'OK') return { ...failSeries([], 'INVALID_INPUT', al.reason ?? 'invalid'), droppedA: 0, droppedB: 0 };
  const pe = checkPeriod('window', window, 2);
  const extra = { droppedA: al.droppedA, droppedB: al.droppedB };
  if (pe) return { ...failSeries(al.timestamps, 'INVALID_INPUT', pe), ...extra };
  if (al.a.length < window + 1) {
    return { ...failSeries(al.timestamps, 'INSUFFICIENT_DATA', `need >= ${window + 1} aligned points, got ${al.a.length}`, al.warnings), ...extra };
  }
  const ra = toReturns(al.a, kind);
  const rb = toReturns(al.b, kind);
  const warnings = [...al.warnings];
  const out: (number | null)[] = al.timestamps.map(() => null);
  // return index j corresponds to aligned price index j+1
  for (let i = window; i < al.a.length; i++) {
    const val = fn(ra.slice(i - window, i), rb.slice(i - window, i));
    if (val === null) warnings.push(`${label} undefined at ${al.timestamps[i]} (zero variance in window)`);
    out[i] = val;
  }
  return { timestamps: al.timestamps, values: out, status: 'OK', warnings, ...extra };
}

/**
 * Rolling Pearson correlation of returns over the last `window` return pairs.
 * **Output is aligned to the intersected timestamps** (not to either input); values[i] is null for
 * i < window. Default returns 'log'.
 */
export function rollingCorrelation(
  a: SeriesPoint[],
  b: SeriesPoint[],
  opts: { window: number; returns?: ReturnKind }
): RollingPairResult {
  return rollingPair(a, b, opts.window, opts.returns ?? 'log', pearson, 'correlation');
}

/**
 * Rolling beta of `asset` returns on `benchmark` returns: β = cov(r_asset, r_bench) / var(r_bench)
 * over the last `window` return pairs. Output aligned to intersected timestamps; null for i < window.
 */
export function rollingBeta(
  asset: SeriesPoint[],
  benchmark: SeriesPoint[],
  opts: { window: number; returns?: ReturnKind }
): RollingPairResult {
  return rollingPair(asset, benchmark, opts.window, opts.returns ?? 'log', (ra, rb) => olsBeta(ra, rb), 'beta');
}

export interface CorrelationMatrixResult {
  labels: string[];
  /** matrix[i][j] = correlation of returns of labels[i] and labels[j]; diagonal = 1; null if undefined. */
  matrix: (number | null)[][];
  /** Number of return observations used (common alignment → same for every pair). */
  n: number;
  /** Common timestamps used (prices) across all series. */
  timestamps: string[];
  /** Points dropped from each input by the common-intersection alignment. */
  dropped: Record<string, number>;
  status: AnalyticsStatus;
  warnings: string[];
  reason?: string;
}

/**
 * Correlation matrix of returns for N price series. All series are aligned on the **common
 * intersection** of timestamps (one sample for every pair, which keeps the matrix consistent / PSD).
 * @param opts.minObservations default 20 return observations.
 */
export function correlationMatrix(
  seriesByLabel: Record<string, SeriesPoint[]>,
  opts: { returns?: ReturnKind; minObservations?: number } = {}
): CorrelationMatrixResult {
  const kind = opts.returns ?? 'log';
  const minObs = opts.minObservations ?? 20;
  const labels = Object.keys(seriesByLabel);
  const fail = (status: Exclude<AnalyticsStatus, 'OK'>, reason: string, extra: Partial<CorrelationMatrixResult> = {}): CorrelationMatrixResult => ({
    labels,
    matrix: labels.map(() => labels.map(() => null)),
    n: 0,
    timestamps: [],
    dropped: {},
    status,
    warnings: [],
    reason,
    ...extra,
  });
  if (labels.length < 2) return fail('INVALID_INPUT', 'need at least 2 series');
  const pe = checkPeriod('minObservations', minObs, 2);
  if (pe) return fail('INVALID_INPUT', pe);
  const validated: ValidatedSeries[] = [];
  for (const lab of labels) {
    const v = validateSeries(seriesByLabel[lab], { positive: true, name: lab });
    if (!v.ok) return fail('INVALID_INPUT', v.reason);
    validated.push(v.data);
  }
  let common = new Set(validated[0].ms);
  for (const d of validated.slice(1)) {
    const s = new Set(d.ms);
    common = new Set([...common].filter((m) => s.has(m)));
  }
  const commonMs = validated[0].ms.filter((m) => common.has(m));
  const dropped: Record<string, number> = {};
  const aligned: number[][] = validated.map((d, k) => {
    const idx = new Map<number, number>();
    d.ms.forEach((m, i) => idx.set(m, d.values[i]));
    dropped[labels[k]] = d.values.length - commonMs.length;
    return commonMs.map((m) => idx.get(m) as number);
  });
  const timestamps = validated[0].ms.map((m, i) => [m, validated[0].timestamps[i]] as const).filter(([m]) => common.has(m)).map(([, t]) => t);
  const warnings: string[] = [];
  const totalDropped = Object.values(dropped).reduce((s, x) => s + x, 0);
  if (totalDropped > 0) warnings.push(`common alignment dropped points: ${labels.map((l) => `${l}=${dropped[l]}`).join(', ')}`);
  const n = Math.max(0, commonMs.length - 1);
  if (n < minObs) return fail('INSUFFICIENT_DATA', `need >= ${minObs} common return observations, got ${n}`, { n, dropped, timestamps, warnings });
  const rets = aligned.map((xs) => toReturns(xs, kind));
  const matrix = labels.map((_, i) =>
    labels.map((__, j) => {
      if (i === j) return 1;
      return pearson(rets[i], rets[j]);
    })
  );
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      if (matrix[i][j] === null) warnings.push(`correlation ${labels[i]}/${labels[j]} undefined (zero variance)`);
    }
    if (rets[i].every((r) => r === rets[i][0])) matrix[i][i] = null;
  }
  return { labels, matrix, n, timestamps, dropped, status: 'OK', warnings };
}
