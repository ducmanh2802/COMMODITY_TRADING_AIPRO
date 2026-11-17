/**
 * Shared types, validation and numeric helpers for the analytics library.
 *
 * Library-wide conventions (apply to every module in `src/shared/analytics/`):
 * - Pure, deterministic functions. No I/O, no clocks, no randomness. Usable in Node and the browser.
 * - Fail-closed: invalid input yields `status: 'INVALID_INPUT'` with a `reason`; too little data yields
 *   `status: 'INSUFFICIENT_DATA'`. In both cases every value is `null`.
 * - Output `values` are index-aligned with the input timestamps. `null` marks warm-up / undefined points.
 * - Missing data is never interpolated and never forward-filled unless an explicit option says so.
 * - Timestamps must be parseable by `Date.parse` (UTC ISO-8601 recommended), strictly ascending and
 *   unique (compared as parsed epoch milliseconds, so "2024-01-02" and "2024-01-02T00:00:00Z" collide).
 * - All numeric inputs must be finite numbers.
 */
import type { MarketCandle } from '../types/market';

export type AnalyticsStatus = 'OK' | 'INSUFFICIENT_DATA' | 'INVALID_INPUT';

/** A plain time series point. `t` is a UTC ISO-8601 timestamp, `v` the value. */
export interface SeriesPoint {
  t: string;
  v: number;
}

/**
 * Minimal OHLC(V) bar. `MarketCandle` is structurally compatible.
 * `volume` is optional/null-able; only volume-based functions (VWAP) require it.
 */
export type OhlcBar = Pick<MarketCandle, 'timestamp' | 'open' | 'high' | 'low' | 'close'> & {
  volume?: number | null;
};

/** Standard result for any series-valued computation. */
export interface SeriesResult<T = number> {
  /** Timestamps the `values` are aligned to (copy of the input timestamps unless documented otherwise). */
  timestamps: string[];
  values: (T | null)[];
  status: AnalyticsStatus;
  warnings: string[];
  /** Human-readable reason when status !== 'OK'. */
  reason?: string;
}

/** Standard result for a scalar computation. */
export interface ScalarResult<T = number> {
  value: T | null;
  status: AnalyticsStatus;
  warnings: string[];
  reason?: string;
}

export class ValidationError extends Error {}

// ---------------------------------------------------------------------------------------------
// Result constructors
// ---------------------------------------------------------------------------------------------

export function failSeries<T>(
  timestamps: string[],
  status: Exclude<AnalyticsStatus, 'OK'>,
  reason: string,
  warnings: string[] = []
): SeriesResult<T> {
  return {
    timestamps: [...timestamps],
    values: timestamps.map(() => null),
    status,
    warnings,
    reason,
  };
}

export function failScalar<T>(
  status: Exclude<AnalyticsStatus, 'OK'>,
  reason: string,
  warnings: string[] = []
): ScalarResult<T> {
  return { value: null, status, warnings, reason };
}

// ---------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------

export function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

/** Parses timestamps and checks strictly ascending, unique order. Returns epoch-ms array or a reason. */
export function validateTimestamps(ts: unknown[]): { ok: true; ms: number[] } | { ok: false; reason: string } {
  const ms: number[] = [];
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    if (typeof t !== 'string' || t.length === 0) {
      return { ok: false, reason: `timestamp at index ${i} is not a non-empty string` };
    }
    const p = Date.parse(t);
    if (!Number.isFinite(p)) return { ok: false, reason: `timestamp at index ${i} ("${t}") is not parseable` };
    if (i > 0) {
      const prev = ms[i - 1];
      if (p === prev) return { ok: false, reason: `duplicate timestamp at index ${i} ("${t}")` };
      if (p < prev) return { ok: false, reason: `timestamps not sorted ascending at index ${i} ("${t}")` };
    }
    ms.push(p);
  }
  return { ok: true, ms };
}

export interface ValidatedSeries {
  timestamps: string[];
  ms: number[];
  values: number[];
}

/**
 * Validates a `{t, v}` series: array, parseable strictly-ascending unique timestamps, finite values.
 * @param opts.positive require v > 0 (price levels used for ratios / log returns)
 */
export function validateSeries(
  series: unknown,
  opts: { positive?: boolean; name?: string } = {}
): { ok: true; data: ValidatedSeries } | { ok: false; reason: string; timestamps: string[] } {
  const name = opts.name ?? 'series';
  if (!Array.isArray(series)) return { ok: false, reason: `${name} is not an array`, timestamps: [] };
  const timestamps = series.map((p) => (p && typeof p === 'object' ? String((p as SeriesPoint).t) : ''));
  for (let i = 0; i < series.length; i++) {
    const p = series[i] as SeriesPoint | null;
    if (!p || typeof p !== 'object') return { ok: false, reason: `${name}[${i}] is not an object`, timestamps };
    if (!isFiniteNumber(p.v)) return { ok: false, reason: `${name}[${i}].v is not a finite number`, timestamps };
    if (opts.positive && p.v <= 0) {
      return { ok: false, reason: `${name}[${i}].v must be > 0 (got ${p.v})`, timestamps };
    }
  }
  const tv = validateTimestamps(series.map((p) => (p as SeriesPoint).t));
  if (!tv.ok) return { ok: false, reason: `${name}: ${tv.reason}`, timestamps };
  return {
    ok: true,
    data: { timestamps: series.map((p) => (p as SeriesPoint).t), ms: tv.ms, values: series.map((p) => (p as SeriesPoint).v) },
  };
}

export interface ValidatedBars {
  timestamps: string[];
  ms: number[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: (number | null)[];
}

/**
 * Validates OHLC bars: finite O/H/L/C, high >= max(open, close, low), low <= min(open, close),
 * strictly ascending unique timestamps.
 * @param opts.positive require all prices > 0
 * @param opts.requireVolume require every volume to be a finite number >= 0
 */
export function validateBars(
  bars: unknown,
  opts: { positive?: boolean; requireVolume?: boolean } = {}
): { ok: true; data: ValidatedBars } | { ok: false; reason: string; timestamps: string[] } {
  if (!Array.isArray(bars)) return { ok: false, reason: 'bars is not an array', timestamps: [] };
  const timestamps = bars.map((b) => (b && typeof b === 'object' ? String((b as OhlcBar).timestamp) : ''));
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i] as OhlcBar | null;
    if (!b || typeof b !== 'object') return { ok: false, reason: `bars[${i}] is not an object`, timestamps };
    for (const k of ['open', 'high', 'low', 'close'] as const) {
      if (!isFiniteNumber(b[k])) return { ok: false, reason: `bars[${i}].${k} is not a finite number`, timestamps };
      if (opts.positive && b[k] <= 0) return { ok: false, reason: `bars[${i}].${k} must be > 0`, timestamps };
    }
    if (b.high < b.low || b.high < b.open || b.high < b.close || b.low > b.open || b.low > b.close) {
      return { ok: false, reason: `bars[${i}] has inconsistent OHLC (high/low do not bound open/close)`, timestamps };
    }
    if (opts.requireVolume) {
      if (b.volume === null || b.volume === undefined) {
        return { ok: false, reason: `bars[${i}].volume is null/missing but volume is required`, timestamps };
      }
      if (!isFiniteNumber(b.volume) || b.volume < 0) {
        return { ok: false, reason: `bars[${i}].volume must be a finite number >= 0`, timestamps };
      }
    }
  }
  const tv = validateTimestamps(bars.map((b) => (b as OhlcBar).timestamp));
  if (!tv.ok) return { ok: false, reason: `bars: ${tv.reason}`, timestamps };
  const arr = bars as OhlcBar[];
  return {
    ok: true,
    data: {
      timestamps: arr.map((b) => b.timestamp),
      ms: tv.ms,
      open: arr.map((b) => b.open),
      high: arr.map((b) => b.high),
      low: arr.map((b) => b.low),
      close: arr.map((b) => b.close),
      volume: arr.map((b) => (b.volume === undefined ? null : b.volume)),
    },
  };
}

/** Throws-free check for a positive integer option. Returns a reason string if invalid. */
export function checkPeriod(name: string, p: unknown, min = 1): string | null {
  if (typeof p !== 'number' || !Number.isInteger(p) || p < min) return `${name} must be an integer >= ${min} (got ${String(p)})`;
  return null;
}

export function checkPositiveNumber(name: string, x: unknown): string | null {
  if (!isFiniteNumber(x) || x <= 0) return `${name} must be a finite number > 0 (got ${String(x)})`;
  return null;
}

// ---------------------------------------------------------------------------------------------
// Numeric helpers (operate on plain arrays, no validation)
// ---------------------------------------------------------------------------------------------

/** Arithmetic mean. Caller guarantees non-empty. */
export function mean(xs: number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/**
 * Standard deviation.
 * @param kind 'sample' divides by (n − 1); 'population' divides by n.
 * Two-pass algorithm (mean first) for numerical stability.
 */
export function stdDev(xs: number[], kind: 'sample' | 'population'): number {
  const n = xs.length;
  const m = mean(xs);
  let ss = 0;
  for (const x of xs) ss += (x - m) * (x - m);
  return Math.sqrt(ss / (kind === 'sample' ? n - 1 : n));
}

/** Median (average of the two middle values for even n). Caller guarantees non-empty. */
export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Rolling simple mean over a nullable array: output at i is the mean of xs[i-p+1..i] only if all
 * p values are non-null; otherwise null. Used for smoothing derived series (e.g. Stochastic %D).
 */
export function rollingMeanNullable(xs: (number | null)[], p: number): (number | null)[] {
  const out: (number | null)[] = xs.map(() => null);
  for (let i = p - 1; i < xs.length; i++) {
    let s = 0;
    let ok = true;
    for (let j = i - p + 1; j <= i; j++) {
      const x = xs[j];
      if (x === null) {
        ok = false;
        break;
      }
      s += x;
    }
    if (ok) out[i] = s / p;
  }
  return out;
}

/** Convert candles to a close-price series. Incomplete candles are dropped by default (with a warning). */
export function candlesToCloseSeries(
  candles: Pick<MarketCandle, 'timestamp' | 'close' | 'isComplete'>[],
  opts: { excludeIncomplete?: boolean } = {}
): { series: SeriesPoint[]; warnings: string[] } {
  const exclude = opts.excludeIncomplete ?? true;
  const warnings: string[] = [];
  const series: SeriesPoint[] = [];
  let dropped = 0;
  for (const c of candles) {
    if (exclude && c.isComplete === false) {
      dropped++;
      continue;
    }
    series.push({ t: c.timestamp, v: c.close });
  }
  if (dropped > 0) warnings.push(`${dropped} incomplete candle(s) excluded`);
  return { series, warnings };
}
