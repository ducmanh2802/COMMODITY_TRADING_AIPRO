/**
 * Technical indicators (task T11). Pure, deterministic, fail-closed. See `core.ts` for library-wide
 * conventions (validation, `null` warm-up values, no interpolation / forward fill).
 *
 * Index convention: `values[i]` is computed only from inputs at indices `<= i` (no look-ahead).
 */
import {
  type OhlcBar,
  type SeriesPoint,
  type SeriesResult,
  checkPeriod,
  checkPositiveNumber,
  failSeries,
  mean,
  rollingMeanNullable,
  stdDev,
  validateBars,
  validateSeries,
} from './core';

// ---------------------------------------------------------------------------------------------
// Internal array kernels (no validation). Exported for reuse inside the library only.
// ---------------------------------------------------------------------------------------------

/** SMA kernel: out[i] = mean(xs[i-p+1..i]) for i >= p-1. Uses fresh summation (no drift). */
export function smaKernel(xs: number[], p: number): (number | null)[] {
  const out: (number | null)[] = xs.map(() => null);
  for (let i = p - 1; i < xs.length; i++) {
    let s = 0;
    for (let j = i - p + 1; j <= i; j++) s += xs[j];
    out[i] = s / p;
  }
  return out;
}

/**
 * EMA kernel over xs starting at `start` (values before `start` are ignored).
 * Seed: out[start+p-1] = SMA(xs[start..start+p-1]); then out[i] = α·xs[i] + (1−α)·out[i−1], α = 2/(p+1).
 */
export function emaKernel(xs: number[], p: number, start = 0): (number | null)[] {
  const out: (number | null)[] = xs.map(() => null);
  const seedIdx = start + p - 1;
  if (seedIdx >= xs.length) return out;
  const alpha = 2 / (p + 1);
  let prev = mean(xs.slice(start, seedIdx + 1));
  out[seedIdx] = prev;
  for (let i = seedIdx + 1; i < xs.length; i++) {
    prev = alpha * xs[i] + (1 - alpha) * prev;
    out[i] = prev;
  }
  return out;
}

/** True range kernel. TR[0] = H0 − L0 (no prior close); TR[i] = max(H−L, |H−Cprev|, |L−Cprev|). */
export function trueRangeKernel(h: number[], l: number[], c: number[]): number[] {
  return h.map((hi, i) => {
    if (i === 0) return hi - l[i];
    const pc = c[i - 1];
    return Math.max(hi - l[i], Math.abs(hi - pc), Math.abs(l[i] - pc));
  });
}

/** Wilder ATR kernel: ATR[p-1] = mean(TR[0..p-1]); ATR[i] = (ATR[i-1]·(p−1) + TR[i]) / p. */
export function atrKernel(tr: number[], p: number): (number | null)[] {
  const out: (number | null)[] = tr.map(() => null);
  if (tr.length < p) return out;
  let prev = mean(tr.slice(0, p));
  out[p - 1] = prev;
  for (let i = p; i < tr.length; i++) {
    prev = (prev * (p - 1) + tr[i]) / p;
    out[i] = prev;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Moving averages
// ---------------------------------------------------------------------------------------------

/**
 * Simple moving average. values[i] = (1/p)·Σ v[i−p+1..i]; null for i < p−1.
 * INSUFFICIENT_DATA when n < p.
 */
export function sma(series: SeriesPoint[], period: number): SeriesResult {
  const pe = checkPeriod('period', period);
  const v = validateSeries(series);
  if (!v.ok) return failSeries(v.timestamps, 'INVALID_INPUT', v.reason);
  if (pe) return failSeries(v.data.timestamps, 'INVALID_INPUT', pe);
  if (v.data.values.length < period) {
    return failSeries(v.data.timestamps, 'INSUFFICIENT_DATA', `need >= ${period} points, got ${v.data.values.length}`);
  }
  return { timestamps: v.data.timestamps, values: smaKernel(v.data.values, period), status: 'OK', warnings: [] };
}

/**
 * Exponential moving average, α = 2/(p+1), **seeded with the SMA of the first p values**
 * (first non-null value at index p−1). This matches the StockCharts ChartSchool convention.
 * INSUFFICIENT_DATA when n < p.
 */
export function ema(series: SeriesPoint[], period: number): SeriesResult {
  const pe = checkPeriod('period', period);
  const v = validateSeries(series);
  if (!v.ok) return failSeries(v.timestamps, 'INVALID_INPUT', v.reason);
  if (pe) return failSeries(v.data.timestamps, 'INVALID_INPUT', pe);
  if (v.data.values.length < period) {
    return failSeries(v.data.timestamps, 'INSUFFICIENT_DATA', `need >= ${period} points, got ${v.data.values.length}`);
  }
  return { timestamps: v.data.timestamps, values: emaKernel(v.data.values, period), status: 'OK', warnings: [] };
}

/**
 * Linearly weighted moving average: weights 1..p, the most recent value has weight p.
 * values[i] = Σ_{k=1..p} k·v[i−p+k] / (p(p+1)/2). INSUFFICIENT_DATA when n < p.
 */
export function wma(series: SeriesPoint[], period: number): SeriesResult {
  const pe = checkPeriod('period', period);
  const v = validateSeries(series);
  if (!v.ok) return failSeries(v.timestamps, 'INVALID_INPUT', v.reason);
  if (pe) return failSeries(v.data.timestamps, 'INVALID_INPUT', pe);
  const xs = v.data.values;
  if (xs.length < period) {
    return failSeries(v.data.timestamps, 'INSUFFICIENT_DATA', `need >= ${period} points, got ${xs.length}`);
  }
  const denom = (period * (period + 1)) / 2;
  const out: (number | null)[] = xs.map(() => null);
  for (let i = period - 1; i < xs.length; i++) {
    let s = 0;
    for (let k = 1; k <= period; k++) s += k * xs[i - period + k];
    out[i] = s / denom;
  }
  return { timestamps: v.data.timestamps, values: out, status: 'OK', warnings: [] };
}

// ---------------------------------------------------------------------------------------------
// Oscillators
// ---------------------------------------------------------------------------------------------

/**
 * Relative Strength Index (Wilder).
 * - change[i] = v[i] − v[i−1] for i >= 1; gain = max(change, 0), loss = max(−change, 0).
 * - Seed (index p): avgGain = mean(gain[1..p]), avgLoss = mean(loss[1..p]) — i.e. SMA of first p changes.
 * - Then Wilder smoothing: avg[i] = (avg[i−1]·(p−1) + x[i]) / p.
 * - RSI = 100 − 100/(1 + avgGain/avgLoss). avgLoss = 0 & avgGain > 0 → 100. Both zero (flat) → null
 *   with a warning (0/0 is undefined; we do not guess 50).
 * First non-null value at index p (needs p+1 prices). INSUFFICIENT_DATA when n < p+1.
 */
export function rsi(series: SeriesPoint[], period = 14): SeriesResult {
  const pe = checkPeriod('period', period);
  const v = validateSeries(series);
  if (!v.ok) return failSeries(v.timestamps, 'INVALID_INPUT', v.reason);
  if (pe) return failSeries(v.data.timestamps, 'INVALID_INPUT', pe);
  const xs = v.data.values;
  if (xs.length < period + 1) {
    return failSeries(v.data.timestamps, 'INSUFFICIENT_DATA', `need >= ${period + 1} points, got ${xs.length}`);
  }
  const out: (number | null)[] = xs.map(() => null);
  const warnings: string[] = [];
  let g = 0;
  let l = 0;
  for (let i = 1; i <= period; i++) {
    const d = xs[i] - xs[i - 1];
    if (d > 0) g += d;
    else l -= d;
  }
  let avgG = g / period;
  let avgL = l / period;
  const emit = (i: number) => {
    if (avgL === 0 && avgG === 0) {
      out[i] = null;
      warnings.push(`RSI undefined at ${v.data.timestamps[i]} (no gains and no losses in smoothing window)`);
    } else if (avgL === 0) out[i] = 100;
    else out[i] = 100 - 100 / (1 + avgG / avgL);
  };
  emit(period);
  for (let i = period + 1; i < xs.length; i++) {
    const d = xs[i] - xs[i - 1];
    avgG = (avgG * (period - 1) + Math.max(d, 0)) / period;
    avgL = (avgL * (period - 1) + Math.max(-d, 0)) / period;
    emit(i);
  }
  return { timestamps: v.data.timestamps, values: out, status: 'OK', warnings };
}

export interface MacdPoint {
  macd: number;
  signal: number | null;
  histogram: number | null;
}

/**
 * MACD. macd = EMA(fast) − EMA(slow) (both SMA-seeded, see `ema`); signal = EMA(signalPeriod) of the
 * MACD line seeded with the SMA of its first `signalPeriod` values; histogram = macd − signal.
 * values[i] is null until index slow−1; `signal`/`histogram` are null until index slow+signal−2.
 * Requires fast < slow. INSUFFICIENT_DATA when n < slow + signal − 1.
 */
export function macd(
  series: SeriesPoint[],
  opts: { fast?: number; slow?: number; signal?: number } = {}
): SeriesResult<MacdPoint> {
  const fast = opts.fast ?? 12;
  const slow = opts.slow ?? 26;
  const sig = opts.signal ?? 9;
  const v = validateSeries(series);
  if (!v.ok) return failSeries(v.timestamps, 'INVALID_INPUT', v.reason);
  const pe = checkPeriod('fast', fast) ?? checkPeriod('slow', slow) ?? checkPeriod('signal', sig);
  if (pe) return failSeries(v.data.timestamps, 'INVALID_INPUT', pe);
  if (fast >= slow) return failSeries(v.data.timestamps, 'INVALID_INPUT', `fast (${fast}) must be < slow (${slow})`);
  const xs = v.data.values;
  const need = slow + sig - 1;
  if (xs.length < need) return failSeries(v.data.timestamps, 'INSUFFICIENT_DATA', `need >= ${need} points, got ${xs.length}`);
  const ef = emaKernel(xs, fast);
  const es = emaKernel(xs, slow);
  const line: number[] = xs.map((_, i) => (es[i] === null ? NaN : (ef[i] as number) - (es[i] as number)));
  const sigLine = emaKernel(line, sig, slow - 1);
  const out: (MacdPoint | null)[] = xs.map((_, i) => {
    if (es[i] === null) return null;
    const s = sigLine[i];
    return { macd: line[i], signal: s, histogram: s === null ? null : line[i] - s };
  });
  return { timestamps: v.data.timestamps, values: out, status: 'OK', warnings: [] };
}

export interface BollingerPoint {
  middle: number;
  upper: number;
  lower: number;
  /** σ of the window — **population** standard deviation (divide by N). */
  stdDev: number;
}

/**
 * Bollinger Bands: middle = SMA(p); σ = **population** standard deviation of the same p values
 * (divide by N, as in Bollinger's and StockCharts' definition); upper/lower = middle ± k·σ.
 * Defaults p = 20, k = 2. INSUFFICIENT_DATA when n < p.
 */
export function bollingerBands(
  series: SeriesPoint[],
  opts: { period?: number; k?: number } = {}
): SeriesResult<BollingerPoint> {
  const period = opts.period ?? 20;
  const k = opts.k ?? 2;
  const v = validateSeries(series);
  if (!v.ok) return failSeries(v.timestamps, 'INVALID_INPUT', v.reason);
  const pe = checkPeriod('period', period) ?? checkPositiveNumber('k', k);
  if (pe) return failSeries(v.data.timestamps, 'INVALID_INPUT', pe);
  const xs = v.data.values;
  if (xs.length < period) return failSeries(v.data.timestamps, 'INSUFFICIENT_DATA', `need >= ${period} points, got ${xs.length}`);
  const out: (BollingerPoint | null)[] = xs.map(() => null);
  for (let i = period - 1; i < xs.length; i++) {
    const w = xs.slice(i - period + 1, i + 1);
    const m = mean(w);
    const sd = stdDev(w, 'population');
    out[i] = { middle: m, upper: m + k * sd, lower: m - k * sd, stdDev: sd };
  }
  return { timestamps: v.data.timestamps, values: out, status: 'OK', warnings: [] };
}

// ---------------------------------------------------------------------------------------------
// Range / trend
// ---------------------------------------------------------------------------------------------

/**
 * True Range. TR[i] = max(H−L, |H−C[i−1]|, |L−C[i−1]|). For the first bar there is no prior close,
 * so TR[0] = H−L (Wilder / StockCharts convention) and a warning says so.
 */
export function trueRange(bars: OhlcBar[]): SeriesResult {
  const v = validateBars(bars);
  if (!v.ok) return failSeries(v.timestamps, 'INVALID_INPUT', v.reason);
  if (v.data.close.length === 0) return failSeries([], 'INSUFFICIENT_DATA', 'no bars');
  const d = v.data;
  return {
    timestamps: d.timestamps,
    values: trueRangeKernel(d.high, d.low, d.close),
    status: 'OK',
    warnings: ['TR of the first bar is high − low (no prior close available)'],
  };
}

/**
 * Average True Range (Wilder). ATR[p−1] = mean(TR[0..p−1]) (TR[0] = H−L); thereafter
 * ATR[i] = (ATR[i−1]·(p−1) + TR[i]) / p. Default p = 14. INSUFFICIENT_DATA when n < p.
 */
export function atr(bars: OhlcBar[], period = 14): SeriesResult {
  const pe = checkPeriod('period', period);
  const v = validateBars(bars);
  if (!v.ok) return failSeries(v.timestamps, 'INVALID_INPUT', v.reason);
  if (pe) return failSeries(v.data.timestamps, 'INVALID_INPUT', pe);
  const d = v.data;
  if (d.close.length < period) return failSeries(d.timestamps, 'INSUFFICIENT_DATA', `need >= ${period} bars, got ${d.close.length}`);
  const tr = trueRangeKernel(d.high, d.low, d.close);
  return { timestamps: d.timestamps, values: atrKernel(tr, period), status: 'OK', warnings: [] };
}

export interface AdxPoint {
  plusDI: number;
  minusDI: number;
  dx: number;
  /** null until index 2p−1 */
  adx: number | null;
}

/**
 * ADX / +DI / −DI (Wilder, as in StockCharts ChartSchool).
 * For i >= 1: upMove = H[i]−H[i−1], downMove = L[i−1]−L[i];
 *   +DM = upMove if upMove > downMove and upMove > 0 else 0; −DM symmetric; TR uses the prior close.
 * Wilder sums: first smoothed value at index p = Σ over indices 1..p; then S[i] = S[i−1] − S[i−1]/p + x[i].
 * +DI = 100·S(+DM)/S(TR), −DI = 100·S(−DM)/S(TR), DX = 100·|+DI − −DI| / (+DI + −DI).
 * ADX first value at index 2p−1 = mean(DX[p..2p−1]); then ADX[i] = (ADX[i−1]·(p−1) + DX[i]) / p.
 * Degenerate windows (S(TR) = 0 or +DI + −DI = 0) set the affected quantity to 0 **with a warning**.
 * values[i] null for i < p. INSUFFICIENT_DATA when n < 2p.
 */
export function adx(bars: OhlcBar[], period = 14): SeriesResult<AdxPoint> {
  const pe = checkPeriod('period', period);
  const v = validateBars(bars);
  if (!v.ok) return failSeries(v.timestamps, 'INVALID_INPUT', v.reason);
  if (pe) return failSeries(v.data.timestamps, 'INVALID_INPUT', pe);
  const { high: h, low: l, close: c, timestamps } = v.data;
  const n = c.length;
  const p = period;
  if (n < 2 * p) return failSeries(timestamps, 'INSUFFICIENT_DATA', `need >= ${2 * p} bars, got ${n}`);
  const warnings: string[] = [];
  const tr: number[] = [0];
  const pdm: number[] = [0];
  const mdm: number[] = [0];
  for (let i = 1; i < n; i++) {
    const up = h[i] - h[i - 1];
    const down = l[i - 1] - l[i];
    pdm.push(up > down && up > 0 ? up : 0);
    mdm.push(down > up && down > 0 ? down : 0);
    tr.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
  }
  const out: (AdxPoint | null)[] = c.map(() => null);
  let sTR = 0;
  let sP = 0;
  let sM = 0;
  for (let i = 1; i <= p; i++) {
    sTR += tr[i];
    sP += pdm[i];
    sM += mdm[i];
  }
  const dxs: number[] = [];
  let adxPrev: number | null = null;
  for (let i = p; i < n; i++) {
    if (i > p) {
      sTR = sTR - sTR / p + tr[i];
      sP = sP - sP / p + pdm[i];
      sM = sM - sM / p + mdm[i];
    }
    let pdi = 0;
    let mdi = 0;
    if (sTR === 0) warnings.push(`smoothed TR is 0 at ${timestamps[i]}; +DI/−DI set to 0`);
    else {
      pdi = (100 * sP) / sTR;
      mdi = (100 * sM) / sTR;
    }
    let dx = 0;
    if (pdi + mdi === 0) warnings.push(`+DI + −DI = 0 at ${timestamps[i]}; DX set to 0`);
    else dx = (100 * Math.abs(pdi - mdi)) / (pdi + mdi);
    dxs.push(dx);
    let a: number | null = null;
    if (i === 2 * p - 1) a = mean(dxs);
    else if (i > 2 * p - 1 && adxPrev !== null) a = (adxPrev * (p - 1) + dx) / p;
    if (a !== null) adxPrev = a;
    out[i] = { plusDI: pdi, minusDI: mdi, dx, adx: a };
  }
  return { timestamps, values: out, status: 'OK', warnings };
}

export interface StochasticPoint {
  k: number | null;
  d: number | null;
}

/**
 * Stochastic oscillator.
 * rawK[i] = 100·(C[i] − LL)/(HH − LL) where HH/LL = highest high / lowest low of the last kPeriod bars
 * (including bar i). If HH = LL the value is undefined → null with a warning.
 * %K = SMA(rawK, smoothK) (smoothK = 1 → "fast" stochastic; 3 → "slow"); %D = SMA(%K, dPeriod).
 * Rolling SMAs require every input in the window to be non-null (no skipping).
 * Defaults kPeriod 14, dPeriod 3, smoothK 1. INSUFFICIENT_DATA when n < kPeriod.
 */
export function stochastic(
  bars: OhlcBar[],
  opts: { kPeriod?: number; dPeriod?: number; smoothK?: number } = {}
): SeriesResult<StochasticPoint> {
  const kp = opts.kPeriod ?? 14;
  const dp = opts.dPeriod ?? 3;
  const sk = opts.smoothK ?? 1;
  const v = validateBars(bars);
  if (!v.ok) return failSeries(v.timestamps, 'INVALID_INPUT', v.reason);
  const pe = checkPeriod('kPeriod', kp) ?? checkPeriod('dPeriod', dp) ?? checkPeriod('smoothK', sk);
  if (pe) return failSeries(v.data.timestamps, 'INVALID_INPUT', pe);
  const { high: h, low: l, close: c, timestamps } = v.data;
  if (c.length < kp) return failSeries(timestamps, 'INSUFFICIENT_DATA', `need >= ${kp} bars, got ${c.length}`);
  const warnings: string[] = [];
  const raw: (number | null)[] = c.map(() => null);
  for (let i = kp - 1; i < c.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - kp + 1; j <= i; j++) {
      if (h[j] > hh) hh = h[j];
      if (l[j] < ll) ll = l[j];
    }
    if (hh === ll) warnings.push(`%K undefined at ${timestamps[i]} (highest high = lowest low)`);
    else raw[i] = (100 * (c[i] - ll)) / (hh - ll);
  }
  const k = sk === 1 ? raw : rollingMeanNullable(raw, sk);
  const d = rollingMeanNullable(k, dp);
  const out: (StochasticPoint | null)[] = c.map((_, i) => (k[i] === null && d[i] === null ? null : { k: k[i], d: d[i] }));
  return { timestamps, values: out, status: 'OK', warnings };
}

export interface DonchianPoint {
  upper: number;
  lower: number;
  middle: number;
}

/**
 * Donchian channel / rolling high-low. upper = max(high) and lower = min(low) over the last `period`
 * bars **including the current bar** by default; with `excludeCurrent: true` the window is the
 * `period` bars before bar i (useful for breakout tests without self-reference). middle = (upper+lower)/2.
 */
export function donchian(bars: OhlcBar[], opts: { period?: number; excludeCurrent?: boolean } = {}): SeriesResult<DonchianPoint> {
  const period = opts.period ?? 20;
  const shift = opts.excludeCurrent ? 1 : 0;
  const v = validateBars(bars);
  if (!v.ok) return failSeries(v.timestamps, 'INVALID_INPUT', v.reason);
  const pe = checkPeriod('period', period);
  if (pe) return failSeries(v.data.timestamps, 'INVALID_INPUT', pe);
  const { high: h, low: l, timestamps } = v.data;
  const need = period + shift;
  if (h.length < need) return failSeries(timestamps, 'INSUFFICIENT_DATA', `need >= ${need} bars, got ${h.length}`);
  const out: (DonchianPoint | null)[] = h.map(() => null);
  for (let i = need - 1; i < h.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - shift - period + 1; j <= i - shift; j++) {
      if (h[j] > hh) hh = h[j];
      if (l[j] < ll) ll = l[j];
    }
    out[i] = { upper: hh, lower: ll, middle: (hh + ll) / 2 };
  }
  return { timestamps, values: out, status: 'OK', warnings: [] };
}

/**
 * Session-anchored VWAP using typical price TP = (H+L+C)/3:
 * VWAP[i] = Σ TP·V / Σ V, cumulated from the first bar of bar i's session.
 * Session = calendar date of (timestamp + sessionOffsetMinutes) in UTC; default offset 0 → resets at
 * 00:00 UTC. Pass e.g. +420 for Asia/Ho_Chi_Minh (UTC+7) days. Exchange sessions that span midnight
 * need an offset that moves the session boundary accordingly — the caller must choose it.
 * **Volume is required**: any null/missing/negative volume → INVALID_INPUT (no guessing).
 * Zero cumulative session volume → null with a warning. If every session has a single bar (e.g. daily
 * data), VWAP equals the typical price and a warning is emitted.
 */
export function vwap(bars: OhlcBar[], opts: { sessionOffsetMinutes?: number } = {}): SeriesResult {
  const offset = opts.sessionOffsetMinutes ?? 0;
  const v = validateBars(bars, { requireVolume: true });
  if (!v.ok) return failSeries(v.timestamps, 'INVALID_INPUT', v.reason);
  const { high: h, low: l, close: c, volume, ms, timestamps } = v.data;
  if (!Number.isFinite(offset) || Math.abs(offset) > 24 * 60) {
    return failSeries(timestamps, 'INVALID_INPUT', 'sessionOffsetMinutes must be finite and within ±1440');
  }
  if (c.length === 0) return failSeries([], 'INSUFFICIENT_DATA', 'no bars');
  const warnings: string[] = [];
  const out: (number | null)[] = c.map(() => null);
  let session = '';
  let pv = 0;
  let vol = 0;
  let sessions = 0;
  for (let i = 0; i < c.length; i++) {
    const key = new Date(ms[i] + offset * 60_000).toISOString().slice(0, 10);
    if (key !== session) {
      session = key;
      pv = 0;
      vol = 0;
      sessions++;
    }
    const vi = volume[i] as number;
    pv += ((h[i] + l[i] + c[i]) / 3) * vi;
    vol += vi;
    if (vol === 0) warnings.push(`VWAP undefined at ${timestamps[i]} (zero cumulative session volume)`);
    else out[i] = pv / vol;
  }
  if (sessions === c.length) warnings.push('every session contains exactly one bar; VWAP equals typical price (use intraday bars)');
  return { timestamps, values: out, status: 'OK', warnings };
}

export interface PivotPoint {
  pivot: number;
  r1: number;
  s1: number;
  r2: number;
  s2: number;
  r3: number;
  s3: number;
}

/**
 * Classic (floor-trader) pivot points for bar i computed from the **prior bar** (i−1) H/L/C:
 * P = (H+L+C)/3; R1 = 2P − L; S1 = 2P − H; R2 = P + (H − L); S2 = P − (H − L);
 * R3 = H + 2(P − L); S3 = L − 2(H − P). values[0] = null.
 * Feed daily bars for daily pivots (the function does not resample).
 */
export function pivotPoints(bars: OhlcBar[]): SeriesResult<PivotPoint> {
  const v = validateBars(bars);
  if (!v.ok) return failSeries(v.timestamps, 'INVALID_INPUT', v.reason);
  const { high: hs, low: ls, close: cs, timestamps } = v.data;
  if (cs.length < 2) return failSeries(timestamps, 'INSUFFICIENT_DATA', `need >= 2 bars, got ${cs.length}`);
  const out: (PivotPoint | null)[] = cs.map((_, i) => {
    if (i === 0) return null;
    const H = hs[i - 1];
    const L = ls[i - 1];
    const C = cs[i - 1];
    const P = (H + L + C) / 3;
    return { pivot: P, r1: 2 * P - L, s1: 2 * P - H, r2: P + (H - L), s2: P - (H - L), r3: H + 2 * (P - L), s3: L - 2 * (H - P) };
  });
  return { timestamps, values: out, status: 'OK', warnings: [] };
}
