/**
 * COT positioning percentile (education only). Pure functions, no I/O.
 *
 * For a series of weekly net positions (oldest first) the LAST value is compared with its own trailing
 * window (the last `windowWeeks` values, including itself). No future values are ever used.
 * - percentile: mid-rank, (count(< latest) + 0.5 * count(== latest)) / N * 100
 * - cotIndex:   (latest - min) / (max - min) * 100 over the same window; null when the range is 0
 * Fewer values than the window: the actual N is reported and `insufficient` is true.
 */
export const COT_PERCENTILE_WINDOW = 156;
export const COT_LOW_BAND = 10;
export const COT_HIGH_BAND = 90;

export interface CotPositioningPoint {
  date: string;
  net: number;
}

export type CotPositioningBand = 'low' | 'mid' | 'high';

export interface CotPositioningResult {
  /** Number of valid weekly values actually used (<= windowWeeks). */
  n: number;
  windowWeeks: number;
  /** True when n < windowWeeks. */
  insufficient: boolean;
  latestDate: string | null;
  latestNet: number | null;
  min: number | null;
  max: number | null;
  percentile: number | null;
  cotIndex: number | null;
  band: CotPositioningBand | null;
  zeroRange: boolean;
  /** Window values (oldest first), for sparklines. */
  window: CotPositioningPoint[];
}

export function bandOf(v: number | null): CotPositioningBand | null {
  if (v === null || !Number.isFinite(v)) return null;
  if (v < COT_LOW_BAND) return 'low';
  if (v > COT_HIGH_BAND) return 'high';
  return 'mid';
}

export function computeCotPositioning(points: readonly CotPositioningPoint[], windowWeeks: number = COT_PERCENTILE_WINDOW): CotPositioningResult {
  const w = Number.isInteger(windowWeeks) && windowWeeks >= 2 ? windowWeeks : COT_PERCENTILE_WINDOW;
  const valid = points.filter((p) => typeof p.net === 'number' && Number.isFinite(p.net));
  const win = valid.slice(-w);
  const empty: CotPositioningResult = {
    n: win.length,
    windowWeeks: w,
    insufficient: win.length < w,
    latestDate: null,
    latestNet: null,
    min: null,
    max: null,
    percentile: null,
    cotIndex: null,
    band: null,
    zeroRange: false,
    window: win,
  };
  if (win.length === 0) return empty;
  const latest = win[win.length - 1];
  const vals = win.map((p) => p.net);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const base = { ...empty, latestDate: latest.date, latestNet: latest.net, min, max };
  if (win.length < 2) return base;
  const less = vals.filter((v) => v < latest.net).length;
  const equal = vals.filter((v) => v === latest.net).length;
  const percentile = ((less + 0.5 * equal) / vals.length) * 100;
  const zeroRange = max === min;
  const cotIndex = zeroRange ? null : ((latest.net - min) / (max - min)) * 100;
  return { ...base, percentile, cotIndex, zeroRange, band: bandOf(zeroRange ? null : percentile) };
}
