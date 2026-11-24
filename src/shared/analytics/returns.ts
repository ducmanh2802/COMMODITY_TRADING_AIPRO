/**
 * Return and drawdown computations. See `core.ts` for library-wide conventions.
 *
 * Price-based functions (returns, cumulative return, drawdown) require **strictly positive** levels:
 * percentage/log returns of a level that can be zero or negative (e.g. a spread, or WTI in April 2020)
 * are not meaningful — use `differences()` for such series instead.
 *
 * Returns are computed between consecutive observations present in the input. Gaps (missing days) are
 * NOT filled: a return spanning a gap covers the whole gap.
 */
import { type ScalarResult, type SeriesPoint, type SeriesResult, failScalar, failSeries, validateSeries } from './core';

/** Simple return r[i] = v[i]/v[i−1] − 1; values[0] = null. Requires v > 0. */
export function simpleReturns(series: SeriesPoint[]): SeriesResult {
  const v = validateSeries(series, { positive: true });
  if (!v.ok) return failSeries(v.timestamps, 'INVALID_INPUT', v.reason);
  const xs = v.data.values;
  if (xs.length < 2) return failSeries(v.data.timestamps, 'INSUFFICIENT_DATA', `need >= 2 points, got ${xs.length}`);
  return { timestamps: v.data.timestamps, values: xs.map((x, i) => (i === 0 ? null : x / xs[i - 1] - 1)), status: 'OK', warnings: [] };
}

/** Log return r[i] = ln(v[i]/v[i−1]); values[0] = null. Requires v > 0. */
export function logReturns(series: SeriesPoint[]): SeriesResult {
  const v = validateSeries(series, { positive: true });
  if (!v.ok) return failSeries(v.timestamps, 'INVALID_INPUT', v.reason);
  const xs = v.data.values;
  if (xs.length < 2) return failSeries(v.data.timestamps, 'INSUFFICIENT_DATA', `need >= 2 points, got ${xs.length}`);
  return { timestamps: v.data.timestamps, values: xs.map((x, i) => (i === 0 ? null : Math.log(x / xs[i - 1]))), status: 'OK', warnings: [] };
}

/** First difference d[i] = v[i] − v[i−1]; values[0] = null. Any finite values (sign-agnostic, for spreads). */
export function differences(series: SeriesPoint[]): SeriesResult {
  const v = validateSeries(series);
  if (!v.ok) return failSeries(v.timestamps, 'INVALID_INPUT', v.reason);
  const xs = v.data.values;
  if (xs.length < 2) return failSeries(v.data.timestamps, 'INSUFFICIENT_DATA', `need >= 2 points, got ${xs.length}`);
  return { timestamps: v.data.timestamps, values: xs.map((x, i) => (i === 0 ? null : x - xs[i - 1])), status: 'OK', warnings: [] };
}

/** Cumulative simple return from the first observation: c[i] = v[i]/v[0] − 1 (c[0] = 0). Requires v > 0. */
export function cumulativeReturn(series: SeriesPoint[]): SeriesResult {
  const v = validateSeries(series, { positive: true });
  if (!v.ok) return failSeries(v.timestamps, 'INVALID_INPUT', v.reason);
  const xs = v.data.values;
  if (xs.length < 1) return failSeries([], 'INSUFFICIENT_DATA', 'empty series');
  return { timestamps: v.data.timestamps, values: xs.map((x) => x / xs[0] - 1), status: 'OK', warnings: [] };
}

interface MaxDrawdown {
  /** Most negative drawdown, as a fraction (e.g. −0.25 = −25%). 0 if the series never declines. */
  maxDrawdown: number;
  /** Timestamp of the running peak preceding the max drawdown trough. */
  peakT: string;
  peakValue: number;
  troughT: string;
  troughValue: number;
  /** First timestamp after the trough at which the level is >= the peak again; null if not recovered. */
  recoveryT: string | null;
}

export interface DrawdownResult extends SeriesResult {
  max: MaxDrawdown | null;
}

/**
 * Drawdown series dd[i] = v[i] / max(v[0..i]) − 1 (always <= 0), plus the maximum drawdown with its
 * peak, trough and (if any) recovery timestamps. Ties: the earliest trough with the most negative
 * drawdown is reported. Requires v > 0.
 */
export function drawdown(series: SeriesPoint[]): DrawdownResult {
  const v = validateSeries(series, { positive: true });
  if (!v.ok) return { ...failSeries(v.timestamps, 'INVALID_INPUT', v.reason), max: null };
  const { values: xs, timestamps: ts } = v.data;
  if (xs.length < 1) return { ...failSeries([], 'INSUFFICIENT_DATA', 'empty series'), max: null };
  const dd: number[] = [];
  let peakIdx = 0;
  let best = { dd: 0, peak: 0, trough: 0 };
  for (let i = 0; i < xs.length; i++) {
    if (xs[i] > xs[peakIdx]) peakIdx = i;
    const d = xs[i] / xs[peakIdx] - 1;
    dd.push(d);
    if (d < best.dd) best = { dd: d, peak: peakIdx, trough: i };
  }
  let recoveryT: string | null = null;
  if (best.dd < 0) {
    for (let i = best.trough + 1; i < xs.length; i++) {
      if (xs[i] >= xs[best.peak]) {
        recoveryT = ts[i];
        break;
      }
    }
  }
  return {
    timestamps: ts,
    values: dd,
    status: 'OK',
    warnings: [],
    max: {
      maxDrawdown: best.dd,
      peakT: ts[best.peak],
      peakValue: xs[best.peak],
      troughT: ts[best.trough],
      troughValue: xs[best.trough],
      recoveryT,
    },
  };
}

/** Convenience scalar: total simple return over the whole series, v[n−1]/v[0] − 1. */
export function totalReturn(series: SeriesPoint[]): ScalarResult {
  const r = cumulativeReturn(series);
  if (r.status !== 'OK') return failScalar(r.status, r.reason ?? 'failed');
  if (r.values.length < 2) return failScalar('INSUFFICIENT_DATA', 'need >= 2 points');
  return { value: r.values[r.values.length - 1], status: 'OK', warnings: [] };
}
