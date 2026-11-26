/**
 * Pure trend-following rules (education / research only).
 * Every function reads only bars up to and including index `t` (no look-ahead). The backtest engine
 * trades the resulting signal on the NEXT bar's open.
 */

export type TrendSide = 'LONG' | 'SHORT' | 'NONE';

/**
 * Time-series momentum (Moskowitz, Ooi, Pedersen 2012): sign of the past `lookback`-bar return.
 * Return > 0 -> LONG, < 0 -> SHORT, equal or not enough data -> NONE.
 */
export function tsmomSignal(closes: readonly number[], t: number, lookback = 252): TrendSide {
  if (!Number.isInteger(lookback) || lookback < 1 || t < lookback || t >= closes.length) return 'NONE';
  const now = closes[t];
  const past = closes[t - lookback];
  if (!Number.isFinite(now) || !Number.isFinite(past) || past <= 0) return 'NONE';
  const ret = now / past - 1;
  return ret > 0 ? 'LONG' : ret < 0 ? 'SHORT' : 'NONE';
}

export interface DonchianResult {
  side: TrendSide;
  /** Highest high of the `entryN` bars BEFORE bar t. */
  entryHigh: number | null;
  /** Lowest low of the `entryN` bars BEFORE bar t. */
  entryLow: number | null;
  /** Lowest low of the `exitN` bars before bar t (protective level for a long). */
  exitLow: number | null;
  /** Highest high of the `exitN` bars before bar t (protective level for a short). */
  exitHigh: number | null;
}

/**
 * Donchian channel breakout (Turtle-style). Bar t closing above the highest high of the previous
 * `entryN` bars -> LONG; closing below the lowest low of the previous `entryN` bars -> SHORT.
 * The channel excludes bar t itself, so a bar can only break out of the past.
 */
export function donchianSignal(
  highs: readonly number[],
  lows: readonly number[],
  closes: readonly number[],
  t: number,
  entryN = 20,
  exitN = 10
): DonchianResult {
  const none: DonchianResult = { side: 'NONE', entryHigh: null, entryLow: null, exitLow: null, exitHigh: null };
  const need = Math.max(entryN, exitN);
  if (!Number.isInteger(entryN) || !Number.isInteger(exitN) || entryN < 1 || exitN < 1) return none;
  if (t < need || t >= closes.length || highs.length !== closes.length || lows.length !== closes.length) return none;
  let entryHigh = -Infinity;
  let entryLow = Infinity;
  for (let k = t - entryN; k < t; k++) {
    if (highs[k] > entryHigh) entryHigh = highs[k];
    if (lows[k] < entryLow) entryLow = lows[k];
  }
  let exitHigh = -Infinity;
  let exitLow = Infinity;
  for (let k = t - exitN; k < t; k++) {
    if (highs[k] > exitHigh) exitHigh = highs[k];
    if (lows[k] < exitLow) exitLow = lows[k];
  }
  const c = closes[t];
  const side: TrendSide = c > entryHigh ? 'LONG' : c < entryLow ? 'SHORT' : 'NONE';
  return { side, entryHigh, entryLow, exitLow, exitHigh };
}
