// Pure candle-pattern & support/resistance detection (education aid, T94). No UI, no I/O.
export interface OhlcBar {
  open: number;
  high: number;
  low: number;
  close: number;
}

export type PatternKind =
  | 'hammer'
  | 'shootingStar'
  | 'bullishEngulfing'
  | 'bearishEngulfing'
  | 'insideBar'
  | 'doji';

type PatternDirection = 'bullish' | 'bearish' | 'neutral';

export interface DetectedPattern {
  index: number;
  kind: PatternKind;
  direction: PatternDirection;
}

const PATTERN_DIRECTION: Record<PatternKind, PatternDirection> = {
  hammer: 'bullish',
  shootingStar: 'bearish',
  bullishEngulfing: 'bullish',
  bearishEngulfing: 'bearish',
  insideBar: 'neutral',
  doji: 'neutral',
};

/** Wilder ATR; entries before `period` bars are null. */
export function computeAtr(bars: OhlcBar[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  if (bars.length <= period) return out;
  const tr = bars.map((b, i) =>
    i === 0 ? b.high - b.low : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close))
  );
  let atr = 0;
  for (let i = 1; i <= period; i++) atr += tr[i];
  atr /= period;
  out[period] = atr;
  for (let i = period + 1; i < bars.length; i++) {
    atr = (atr * (period - 1) + tr[i]) / period;
    out[i] = atr;
  }
  return out;
}

const TREND_LOOKBACK = 3;

/** Detects single- and two-candle patterns on every bar. Several patterns can hit the same bar. */
export function detectCandlePatterns(bars: OhlcBar[]): DetectedPattern[] {
  const atr = computeAtr(bars);
  const found: DetectedPattern[] = [];
  const push = (index: number, kind: PatternKind) => found.push({ index, kind, direction: PATTERN_DIRECTION[kind] });

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const range = b.high - b.low;
    if (!(range > 0)) continue;
    const body = Math.abs(b.close - b.open);
    const upper = b.high - Math.max(b.open, b.close);
    const lower = Math.min(b.open, b.close) - b.low;
    // Ignore tiny noise candles once ATR is known.
    const meaningful = atr[i] === null || range >= 0.5 * (atr[i] as number);
    const downtrend = i >= TREND_LOOKBACK && bars[i - 1].close < bars[i - TREND_LOOKBACK].close;
    const uptrend = i >= TREND_LOOKBACK && bars[i - 1].close > bars[i - TREND_LOOKBACK].close;

    // Doji: negligible body, and not a pin-bar shape.
    const isDoji = body <= 0.1 * range;
    const pinLike = lower >= 0.6 * range || upper >= 0.6 * range;
    if (meaningful) {
      if (body <= 0.35 * range && lower >= 2 * body && lower >= 0.55 * range && upper <= 0.2 * range && downtrend) push(i, 'hammer');
      else if (body <= 0.35 * range && upper >= 2 * body && upper >= 0.55 * range && lower <= 0.2 * range && uptrend) push(i, 'shootingStar');
      else if (isDoji && !pinLike) push(i, 'doji');
    }

    if (i > 0) {
      const p = bars[i - 1];
      const pBody = Math.abs(p.close - p.open);
      if (meaningful && body > 0 && pBody > 0 && body > pBody) {
        if (p.close < p.open && b.close > b.open && b.open <= p.close && b.close >= p.open) push(i, 'bullishEngulfing');
        else if (p.close > p.open && b.close < b.open && b.open >= p.close && b.close <= p.open) push(i, 'bearishEngulfing');
      }
      if (b.high < p.high && b.low > p.low) push(i, 'insideBar');
    }
  }
  return found;
}

export interface SrZone {
  low: number;
  high: number;
  touches: number;
  kind: 'support' | 'resistance';
}

export interface SrOptions {
  /** Bars on each side that must be lower/higher for a swing point. */
  swing?: number;
  /** Cluster tolerance as a multiple of the latest ATR. */
  atrMult?: number;
  minTouches?: number;
  maxZones?: number;
}

/** Swing highs/lows clustered into zones using an ATR-based tolerance. */
export function detectSrZones(bars: OhlcBar[], opts: SrOptions = {}): SrZone[] {
  const k = opts.swing ?? 3;
  const atrMult = opts.atrMult ?? 0.5;
  const minTouches = opts.minTouches ?? 2;
  const maxZones = opts.maxZones ?? 6;
  if (bars.length < 2 * k + 1) return [];

  const atrSeries = computeAtr(bars);
  let atrLast: number | null = null;
  for (let i = atrSeries.length - 1; i >= 0; i--) {
    if (atrSeries[i] !== null) {
      atrLast = atrSeries[i];
      break;
    }
  }
  if (atrLast === null) atrLast = bars.reduce((s, b) => s + (b.high - b.low), 0) / bars.length;
  const tol = atrLast * atrMult;
  if (!(tol > 0)) return [];

  const pivots: number[] = [];
  for (let i = k; i < bars.length - k; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= k; j++) {
      if (bars[i].high < bars[i - j].high || bars[i].high <= bars[i + j].high) isHigh = false;
      if (bars[i].low > bars[i - j].low || bars[i].low >= bars[i + j].low) isLow = false;
    }
    if (isHigh) pivots.push(bars[i].high);
    if (isLow) pivots.push(bars[i].low);
  }
  if (pivots.length === 0) return [];
  pivots.sort((a, b) => a - b);

  const clusters: number[][] = [];
  for (const p of pivots) {
    const cur = clusters[clusters.length - 1];
    if (cur && p - cur[0] <= tol) cur.push(p);
    else clusters.push([p]);
  }

  const last = bars[bars.length - 1].close;
  const zones: SrZone[] = clusters
    .filter((c) => c.length >= minTouches)
    .map((c) => {
      const mid = c.reduce((s, v) => s + v, 0) / c.length;
      const low = Math.min(c[0], mid - tol * 0.25);
      const high = Math.max(c[c.length - 1], mid + tol * 0.25);
      return { low, high, touches: c.length, kind: mid >= last ? ('resistance' as const) : ('support' as const) };
    });

  const dist = (z: SrZone) => Math.abs((z.low + z.high) / 2 - last);
  zones.sort((a, b) => b.touches - a.touches || dist(a) - dist(b));
  return zones.slice(0, maxZones).sort((a, b) => a.low - b.low);
}
