/**
 * Volatility estimators (task T16). See `core.ts` for library-wide conventions.
 *
 * Annualization: σ_annual = σ_per_period · √(annualizationFactor). Default factor = 252 (trading days
 * per year) which is correct **only for daily bars**; pass 52 for weekly, 12 for monthly, or the right
 * number of bars per year for intraday data. Results are fractions (0.25 = 25% annualized vol).
 * All price inputs must be strictly positive (log ratios).
 */
import {
  type OhlcBar,
  type SeriesPoint,
  type SeriesResult,
  checkPeriod,
  checkPositiveNumber,
  failSeries,
  stdDev,
  validateBars,
  validateSeries,
} from './core';
import { atrKernel, trueRangeKernel } from './indicators';

export interface VolOptions {
  /** Number of observations (returns or bars) per window. Default 20. */
  window?: number;
  /** Periods per year for annualization. Default 252 (daily). Use 1 for un-annualized output. */
  annualizationFactor?: number;
}

function opts(o: VolOptions) {
  const window = o.window ?? 20;
  const af = o.annualizationFactor ?? 252;
  return { window, af, err: checkPeriod('window', window, 2) ?? checkPositiveNumber('annualizationFactor', af) };
}

/**
 * Rolling close-to-close realized volatility.
 * r[i] = ln(v[i]/v[i−1]); σ = **sample** standard deviation (n−1 denominator, mean subtracted) of the
 * last `window` log returns; value = σ·√AF. First value at index `window` (needs window+1 prices).
 */
export function realizedVolatility(series: SeriesPoint[], o: VolOptions = {}): SeriesResult {
  const { window, af, err } = opts(o);
  const v = validateSeries(series, { positive: true });
  if (!v.ok) return failSeries(v.timestamps, 'INVALID_INPUT', v.reason);
  if (err) return failSeries(v.data.timestamps, 'INVALID_INPUT', err);
  const xs = v.data.values;
  if (xs.length < window + 1) {
    return failSeries(v.data.timestamps, 'INSUFFICIENT_DATA', `need >= ${window + 1} points, got ${xs.length}`);
  }
  const r = xs.map((x, i) => (i === 0 ? 0 : Math.log(x / xs[i - 1])));
  const out: (number | null)[] = xs.map(() => null);
  for (let i = window; i < xs.length; i++) out[i] = stdDev(r.slice(i - window + 1, i + 1), 'sample') * Math.sqrt(af);
  return { timestamps: v.data.timestamps, values: out, status: 'OK', warnings: [] };
}

/**
 * Parkinson (1980) high-low estimator over the last `window` bars (including bar i):
 * σ² = (1 / (4·ln2·n)) · Σ ln(H/L)²; value = √(σ²·AF). Assumes zero drift and continuous trading;
 * ignores overnight gaps (biased low for futures with significant gaps). First value at index window−1.
 */
export function parkinsonVolatility(bars: OhlcBar[], o: VolOptions = {}): SeriesResult {
  const { window, af, err } = opts(o);
  const v = validateBars(bars, { positive: true });
  if (!v.ok) return failSeries(v.timestamps, 'INVALID_INPUT', v.reason);
  if (err) return failSeries(v.data.timestamps, 'INVALID_INPUT', err);
  const { high: h, low: l, timestamps } = v.data;
  if (h.length < window) return failSeries(timestamps, 'INSUFFICIENT_DATA', `need >= ${window} bars, got ${h.length}`);
  const term = h.map((hi, i) => Math.log(hi / l[i]) ** 2);
  const out: (number | null)[] = h.map(() => null);
  for (let i = window - 1; i < h.length; i++) {
    let s = 0;
    for (let j = i - window + 1; j <= i; j++) s += term[j];
    out[i] = Math.sqrt((s / (4 * Math.LN2 * window)) * af);
  }
  return { timestamps, values: out, status: 'OK', warnings: ['Parkinson estimator ignores overnight gaps and drift'] };
}

/**
 * Garman–Klass (1980) OHLC estimator over the last `window` bars (including bar i):
 * σ² = (1/n) · Σ [ 0.5·ln(H/L)² − (2·ln2 − 1)·ln(C/O)² ]; value = √(σ²·AF).
 * Ignores overnight gaps (open vs prior close). A negative window variance (possible in degenerate
 * data) yields null with a warning. First value at index window−1.
 */
export function garmanKlassVolatility(bars: OhlcBar[], o: VolOptions = {}): SeriesResult {
  const { window, af, err } = opts(o);
  const v = validateBars(bars, { positive: true });
  if (!v.ok) return failSeries(v.timestamps, 'INVALID_INPUT', v.reason);
  if (err) return failSeries(v.data.timestamps, 'INVALID_INPUT', err);
  const { open: op, high: h, low: l, close: c, timestamps } = v.data;
  if (h.length < window) return failSeries(timestamps, 'INSUFFICIENT_DATA', `need >= ${window} bars, got ${h.length}`);
  const k = 2 * Math.LN2 - 1;
  const term = h.map((hi, i) => 0.5 * Math.log(hi / l[i]) ** 2 - k * Math.log(c[i] / op[i]) ** 2);
  const warnings = ['Garman–Klass estimator ignores overnight gaps'];
  const out: (number | null)[] = h.map(() => null);
  for (let i = window - 1; i < h.length; i++) {
    let s = 0;
    for (let j = i - window + 1; j <= i; j++) s += term[j];
    const var_ = s / window;
    if (var_ < 0) warnings.push(`negative Garman–Klass variance at ${timestamps[i]}; value set to null`);
    else out[i] = Math.sqrt(var_ * af);
  }
  return { timestamps, values: out, status: 'OK', warnings };
}

/** ATR% = 100 · ATR_Wilder(period)[i] / close[i] (see `atr`). Not annualized. Default period 14. */
export function atrPercent(bars: OhlcBar[], period = 14): SeriesResult {
  const pe = checkPeriod('period', period);
  const v = validateBars(bars, { positive: true });
  if (!v.ok) return failSeries(v.timestamps, 'INVALID_INPUT', v.reason);
  if (pe) return failSeries(v.data.timestamps, 'INVALID_INPUT', pe);
  const { high: h, low: l, close: c, timestamps } = v.data;
  if (c.length < period) return failSeries(timestamps, 'INSUFFICIENT_DATA', `need >= ${period} bars, got ${c.length}`);
  const a = atrKernel(trueRangeKernel(h, l, c), period);
  return { timestamps, values: a.map((x, i) => (x === null ? null : (100 * x) / c[i])), status: 'OK', warnings: [] };
}
