import type { Timeframe } from '../../src/shared/types/instrument.ts';
import type { DataQualityStatus, MarketCandle } from '../../src/shared/types/market.ts';
import type { ObvSummary } from '../../src/shared/types/cycle.ts';
import { validateCandleSeries } from '../../src/shared/utils/validation.ts';

export interface PivotSwing {
  index: number;
  timestamp: string;
  price: number;
  type: 'HIGH' | 'LOW';
  confirmed: boolean;
}

export interface TechnicalSnapshot {
  symbol: string;
  exchange: string;
  timeframe: Timeframe;
  status: DataQualityStatus;
  reason?: string;
  candleCount: number;
  completeCandleCount: number;
  hasIncompleteTrailingCandle: boolean;
  lastTimestamp: string | null;
  lastClose: number | null;
  ema: {
    ema9: number | null;
    ema20: number | null;
    ema50: number | null;
    ema100: number | null;
    ema200: number | null;
  };
  sma: {
    sma20: number | null;
    sma50: number | null;
    sma200: number | null;
  };
  rsi14: number | null;
  macd: {
    macd: number | null;
    signal: number | null;
    histogram: number | null;
  };
  bollinger: {
    upper: number | null;
    middle: number | null;
    lower: number | null;
    bandwidthPct: number | null;
  };
  atr14: number | null;
  atrPct: number | null;
  adx14: {
    adx: number | null;
    plusDI: number | null;
    minusDI: number | null;
  };
  vwap: number | null;
  /** On-Balance Volume summary; null when volume is missing or history is too short. */
  obv: ObvSummary | null;
  pivots: {
    pivot: number;
    r1: number;
    r2: number;
    r3: number;
    s1: number;
    s2: number;
    s3: number;
  } | null;
  fibonacci: {
    swingHigh: number;
    swingLow: number;
    trend: 'UP' | 'DOWN';
    levels: Record<string, number>;
  } | null;
  marketStructure: {
    mainTrend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS' | 'UNCERTAIN';
    shortTermTrend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS' | 'UNCERTAIN';
    momentum: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'UNCERTAIN';
    volatility: 'LOW' | 'NORMAL' | 'HIGH' | 'UNCERTAIN';
    marketRegime: 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' | 'HIGH_VOLATILITY' | 'INSUFFICIENT_DATA';
    structurePattern: 'HH_HL' | 'LH_LL' | 'MIXED' | 'INSUFFICIENT_DATA';
    confirmedSwings: PivotSwing[];
    unconfirmedSwings: PivotSwing[];
    supportZones: number[];
    resistanceZones: number[];
    bullishInvalidationLevel: number | null;
    bearishInvalidationLevel: number | null;
  };
}

export function calculateSMA(values: number[], period: number): Array<number | null> {
  if (period <= 0) throw new Error('SMA period must be > 0');
  const result: Array<number | null> = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) {
      sum -= values[i - period];
    }
    if (i >= period - 1) {
      result[i] = sum / period;
    }
  }
  return result;
}

export function calculateEMA(values: number[], period: number): Array<number | null> {
  if (period <= 0) throw new Error('EMA period must be > 0');
  const result: Array<number | null> = new Array(values.length).fill(null);
  if (values.length < period) return result;

  // Standard SMA seed initialization for first EMA value
  let seedSum = 0;
  for (let i = 0; i < period; i++) {
    seedSum += values[i];
  }
  let prevEma = seedSum / period;
  result[period - 1] = prevEma;

  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    const ema = values[i] * k + prevEma * (1 - k);
    result[i] = ema;
    prevEma = ema;
  }
  return result;
}

export function calculateRSI(closes: number[], period = 14): Array<number | null> {
  if (period <= 0) throw new Error('RSI period must be > 0');
  const result: Array<number | null> = new Array(closes.length).fill(null);
  if (closes.length <= period) return result;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gainSum += diff;
    else lossSum += Math.abs(diff);
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  return result;
}

export function calculateMACD(
  closes: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): {
  macd: Array<number | null>;
  signal: Array<number | null>;
  histogram: Array<number | null>;
} {
  const fastEma = calculateEMA(closes, fastPeriod);
  const slowEma = calculateEMA(closes, slowPeriod);
  const macd: Array<number | null> = closes.map((_, i) => {
    const f = fastEma[i];
    const s = slowEma[i];
    return f !== null && s !== null ? f - s : null;
  });

  const signal: Array<number | null> = new Array(closes.length).fill(null);
  const histogram: Array<number | null> = new Array(closes.length).fill(null);

  const validMacdValues: number[] = [];
  const validIndices: number[] = [];
  for (let i = 0; i < macd.length; i++) {
    if (macd[i] !== null) {
      validMacdValues.push(macd[i]!);
      validIndices.push(i);
    }
  }

  const signalOnValid = calculateEMA(validMacdValues, signalPeriod);
  for (let j = 0; j < validIndices.length; j++) {
    const idx = validIndices[j];
    const sig = signalOnValid[j];
    signal[idx] = sig;
    if (sig !== null && macd[idx] !== null) {
      histogram[idx] = macd[idx]! - sig;
    }
  }

  return { macd, signal, histogram };
}

export function calculateBollingerBands(
  closes: number[],
  period = 20,
  stdDevMultiplier = 2
): {
  upper: Array<number | null>;
  middle: Array<number | null>;
  lower: Array<number | null>;
  bandwidthPct: Array<number | null>;
} {
  const middle = calculateSMA(closes, period);
  const upper: Array<number | null> = new Array(closes.length).fill(null);
  const lower: Array<number | null> = new Array(closes.length).fill(null);
  const bandwidthPct: Array<number | null> = new Array(closes.length).fill(null);

  for (let i = period - 1; i < closes.length; i++) {
    const sma = middle[i]!;
    let varianceSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = closes[j] - sma;
      varianceSum += diff * diff;
    }
    const std = Math.sqrt(varianceSum / period);
    const up = sma + stdDevMultiplier * std;
    const low = sma - stdDevMultiplier * std;
    upper[i] = up;
    lower[i] = low;
    bandwidthPct[i] = sma !== 0 ? ((up - low) / sma) * 100 : null;
  }

  return { upper, middle, lower, bandwidthPct };
}

export function calculateATR(candles: MarketCandle[], period = 14): Array<number | null> {
  const result: Array<number | null> = new Array(candles.length).fill(null);
  if (candles.length <= period) return result;

  const trueRanges: number[] = [candles[0].high - candles[0].low];
  for (let i = 1; i < candles.length; i++) {
    const prevClose = candles[i - 1].close;
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - prevClose),
      Math.abs(candles[i].low - prevClose)
    );
    trueRanges.push(tr);
  }

  let sum = 0;
  for (let i = 1; i <= period; i++) {
    sum += trueRanges[i];
  }
  let atr = sum / period;
  result[period] = atr;

  for (let i = period + 1; i < candles.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
    result[i] = atr;
  }

  return result;
}

export function calculateADX(
  candles: MarketCandle[],
  period = 14
): {
  adx: Array<number | null>;
  plusDI: Array<number | null>;
  minusDI: Array<number | null>;
} {
  const len = candles.length;
  const adx: Array<number | null> = new Array(len).fill(null);
  const plusDI: Array<number | null> = new Array(len).fill(null);
  const minusDI: Array<number | null> = new Array(len).fill(null);

  if (len <= period * 2) return { adx, plusDI, minusDI };

  const tr: number[] = new Array(len).fill(0);
  const plusDM: number[] = new Array(len).fill(0);
  const minusDM: number[] = new Array(len).fill(0);

  for (let i = 1; i < len; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0;
    tr[i] = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
  }

  let smTr = 0;
  let smPlusDM = 0;
  let smMinusDM = 0;
  for (let i = 1; i <= period; i++) {
    smTr += tr[i];
    smPlusDM += plusDM[i];
    smMinusDM += minusDM[i];
  }

  const dxValues: number[] = new Array(len).fill(0);
  for (let i = period; i < len; i++) {
    if (i > period) {
      smTr = smTr - smTr / period + tr[i];
      smPlusDM = smPlusDM - smPlusDM / period + plusDM[i];
      smMinusDM = smMinusDM - smMinusDM / period + minusDM[i];
    }

    const pdi = smTr > 0 ? (smPlusDM / smTr) * 100 : 0;
    const mdi = smTr > 0 ? (smMinusDM / smTr) * 100 : 0;
    plusDI[i] = pdi;
    minusDI[i] = mdi;

    const sumDi = pdi + mdi;
    dxValues[i] = sumDi > 0 ? (Math.abs(pdi - mdi) / sumDi) * 100 : 0;
  }

  let adxSeed = 0;
  const adxStart = period * 2 - 1;
  for (let i = period; i <= adxStart; i++) {
    adxSeed += dxValues[i];
  }
  let prevAdx = adxSeed / period;
  adx[adxStart] = prevAdx;

  for (let i = adxStart + 1; i < len; i++) {
    prevAdx = (prevAdx * (period - 1) + dxValues[i]) / period;
    adx[i] = prevAdx;
  }

  return { adx, plusDI, minusDI };
}

export function calculateVWAP(candles: MarketCandle[]): Array<number | null> {
  const result: Array<number | null> = new Array(candles.length).fill(null);
  let cumPv = 0;
  let cumVol = 0;
  for (let i = 0; i < candles.length; i++) {
    const vol = candles[i].volume;
    if (vol === null || vol <= 0) {
      result[i] = cumVol > 0 ? cumPv / cumVol : null;
      continue;
    }
    const typical = (candles[i].high + candles[i].low + candles[i].close) / 3;
    cumPv += typical * vol;
    cumVol += vol;
    result[i] = cumVol > 0 ? cumPv / cumVol : null;
  }
  return result;
}

/**
 * On-Balance Volume: running total that adds the bar volume when close rises, subtracts it when
 * close falls and leaves it unchanged on an unchanged close. obv[0] = 0. Missing volume counts as 0.
 */
export function calculateOBV(candles: MarketCandle[]): number[] {
  const out: number[] = new Array(candles.length).fill(0);
  for (let i = 1; i < candles.length; i++) {
    const v = candles[i].volume;
    const vol = v !== null && v > 0 ? v : 0;
    const diff = candles[i].close - candles[i - 1].close;
    out[i] = out[i - 1] + (diff > 0 ? vol : diff < 0 ? -vol : 0);
  }
  return out;
}

/**
 * Divergence of the LAST bar versus the previous `lookback` bars (the last bar is excluded from the
 * reference window, so nothing is look-ahead).
 * - BEARISH: close makes a new high of the window but OBV stays below its window high.
 * - BULLISH: close makes a new low of the window but OBV stays above its window low.
 */
export function detectObvDivergence(
  closes: number[],
  obv: number[],
  lookback = 20
): 'BULLISH' | 'BEARISH' | 'NONE' {
  const last = closes.length - 1;
  if (lookback < 2 || last < lookback || obv.length !== closes.length) return 'NONE';
  let maxC = -Infinity;
  let minC = Infinity;
  let maxO = -Infinity;
  let minO = Infinity;
  for (let i = last - lookback; i < last; i++) {
    if (closes[i] > maxC) maxC = closes[i];
    if (closes[i] < minC) minC = closes[i];
    if (obv[i] > maxO) maxO = obv[i];
    if (obv[i] < minO) minO = obv[i];
  }
  if (closes[last] > maxC && obv[last] < maxO) return 'BEARISH';
  if (closes[last] < minC && obv[last] > minO) return 'BULLISH';
  return 'NONE';
}

export function summarizeObv(candles: MarketCandle[], lookback = 20, emaPeriod = 20): ObvSummary | null {
  if (candles.length < Math.max(lookback, emaPeriod) + 2) return null;
  if (!candles.some((c) => c.volume !== null && c.volume > 0)) return null;
  const closes = candles.map((c) => c.close);
  const obv = calculateOBV(candles);
  const ema = calculateEMA(obv, emaPeriod);
  const last = candles.length - 1;
  const e = ema[last];
  return {
    value: obv[last],
    ema: e,
    signal: e === null ? null : obv[last] > e ? 'ABOVE_EMA' : obv[last] < e ? 'BELOW_EMA' : 'FLAT',
    divergence: detectObvDivergence(closes, obv, lookback),
    lookback,
    emaPeriod,
  };
}

export function calculatePivotPoints(prevHigh: number, prevLow: number, prevClose: number) {
  const pivot = (prevHigh + prevLow + prevClose) / 3;
  const r1 = 2 * pivot - prevLow;
  const s1 = 2 * pivot - prevHigh;
  const r2 = pivot + (prevHigh - prevLow);
  const s2 = pivot - (prevHigh - prevLow);
  const r3 = prevHigh + 2 * (pivot - prevLow);
  const s3 = prevLow - 2 * (prevHigh - pivot);
  return { pivot, r1, r2, r3, s1, s2, s3 };
}

export function calculateFibonacciRetracement(
  swingHigh: number,
  swingLow: number,
  trend: 'UP' | 'DOWN'
): Record<string, number> {
  const range = swingHigh - swingLow;
  const ratios = [0.236, 0.382, 0.5, 0.618, 0.786];
  const levels: Record<string, number> = {};
  for (const r of ratios) {
    levels[r.toFixed(3)] = trend === 'UP' ? swingHigh - range * r : swingLow + range * r;
  }
  return levels;
}

/**
 * Strictly separates confirmed swing highs/lows (which have `lookback` closed right-hand bars)
 * from unconfirmed trailing swings so confirmed structure never repaints.
 */
export function detectMarketStructure(candles: MarketCandle[], lookback = 3): {
  confirmedSwings: PivotSwing[];
  unconfirmedSwings: PivotSwing[];
  structurePattern: 'HH_HL' | 'LH_LL' | 'MIXED' | 'INSUFFICIENT_DATA';
  supportZones: number[];
  resistanceZones: number[];
  bullishInvalidationLevel: number | null;
  bearishInvalidationLevel: number | null;
} {
  const confirmedSwings: PivotSwing[] = [];
  const unconfirmedSwings: PivotSwing[] = [];

  if (candles.length < lookback * 2 + 1) {
    return {
      confirmedSwings,
      unconfirmedSwings,
      structurePattern: 'INSUFFICIENT_DATA',
      supportZones: [],
      resistanceZones: [],
      bullishInvalidationLevel: null,
      bearishInvalidationLevel: null,
    };
  }

  for (let i = lookback; i < candles.length; i++) {
    const hasFullRightConfirm = i + lookback < candles.length;
    const rightEnd = Math.min(candles.length - 1, i + lookback);

    let isSwingHigh = true;
    let isSwingLow = true;

    for (let j = i - lookback; j <= rightEnd; j++) {
      if (j === i) continue;
      if (j < i) {
        if (candles[j].high > candles[i].high) isSwingHigh = false;
        if (candles[j].low < candles[i].low) isSwingLow = false;
      } else {
        if (candles[j].high >= candles[i].high) isSwingHigh = false;
        if (candles[j].low <= candles[i].low) isSwingLow = false;
      }
    }

    if (isSwingHigh) {
      const swing: PivotSwing = {
        index: i,
        timestamp: candles[i].timestamp,
        price: candles[i].high,
        type: 'HIGH',
        confirmed: hasFullRightConfirm,
      };
      if (hasFullRightConfirm) confirmedSwings.push(swing);
      else unconfirmedSwings.push(swing);
    }

    if (isSwingLow) {
      const swing: PivotSwing = {
        index: i,
        timestamp: candles[i].timestamp,
        price: candles[i].low,
        type: 'LOW',
        confirmed: hasFullRightConfirm,
      };
      if (hasFullRightConfirm) confirmedSwings.push(swing);
      else unconfirmedSwings.push(swing);
    }
  }

  const confirmedHighs = confirmedSwings.filter((s) => s.type === 'HIGH');
  const confirmedLows = confirmedSwings.filter((s) => s.type === 'LOW');

  let structurePattern: 'HH_HL' | 'LH_LL' | 'MIXED' | 'INSUFFICIENT_DATA' = 'INSUFFICIENT_DATA';
  if (confirmedHighs.length >= 2 && confirmedLows.length >= 2) {
    const h1 = confirmedHighs[confirmedHighs.length - 2].price;
    const h2 = confirmedHighs[confirmedHighs.length - 1].price;
    const l1 = confirmedLows[confirmedLows.length - 2].price;
    const l2 = confirmedLows[confirmedLows.length - 1].price;

    if (h2 > h1 && l2 > l1) structurePattern = 'HH_HL';
    else if (h2 < h1 && l2 < l1) structurePattern = 'LH_LL';
    else structurePattern = 'MIXED';
  }

  const supportZones = confirmedLows.slice(-3).map((s) => s.price);
  const resistanceZones = confirmedHighs.slice(-3).map((s) => s.price);

  return {
    confirmedSwings,
    unconfirmedSwings,
    structurePattern,
    supportZones,
    resistanceZones,
    bullishInvalidationLevel: confirmedLows.length > 0 ? confirmedLows[confirmedLows.length - 1].price : null,
    bearishInvalidationLevel: confirmedHighs.length > 0 ? confirmedHighs[confirmedHighs.length - 1].price : null,
  };
}

export function analyzeTechnicalSnapshot(
  rawCandles: MarketCandle[],
  symbol: string,
  exchange: string,
  timeframe: Timeframe
): TechnicalSnapshot {
  const validation = validateCandleSeries(rawCandles);
  if (!validation.valid) {
    return {
      symbol,
      exchange,
      timeframe,
      status: validation.status,
      reason: validation.errors.join('; ') || 'DATA_UNAVAILABLE — No valid candles.',
      candleCount: 0,
      completeCandleCount: 0,
      hasIncompleteTrailingCandle: false,
      lastTimestamp: null,
      lastClose: null,
      ema: { ema9: null, ema20: null, ema50: null, ema100: null, ema200: null },
      sma: { sma20: null, sma50: null, sma200: null },
      rsi14: null,
      macd: { macd: null, signal: null, histogram: null },
      bollinger: { upper: null, middle: null, lower: null, bandwidthPct: null },
      atr14: null,
      atrPct: null,
      adx14: { adx: null, plusDI: null, minusDI: null },
      vwap: null,
      obv: null,
      pivots: null,
      fibonacci: null,
      marketStructure: {
        mainTrend: 'UNCERTAIN',
        shortTermTrend: 'UNCERTAIN',
        momentum: 'UNCERTAIN',
        volatility: 'UNCERTAIN',
        marketRegime: 'INSUFFICIENT_DATA',
        structurePattern: 'INSUFFICIENT_DATA',
        confirmedSwings: [],
        unconfirmedSwings: [],
        supportZones: [],
        resistanceZones: [],
        bullishInvalidationLevel: null,
        bearishInvalidationLevel: null,
      },
    };
  }

  const hasIncompleteTrailingCandle =
    validation.validCandles.length > 0 &&
    !validation.validCandles[validation.validCandles.length - 1].isComplete;
  const completeCandles = validation.validCandles.filter((c) => c.isComplete);

  if (completeCandles.length < 2) {
    return {
      symbol,
      exchange,
      timeframe,
      status: 'INVALID',
      reason: 'Insufficient complete candles for technical analysis.',
      candleCount: validation.validCandles.length,
      completeCandleCount: completeCandles.length,
      hasIncompleteTrailingCandle,
      lastTimestamp: completeCandles[0]?.timestamp ?? null,
      lastClose: completeCandles[0]?.close ?? null,
      ema: { ema9: null, ema20: null, ema50: null, ema100: null, ema200: null },
      sma: { sma20: null, sma50: null, sma200: null },
      rsi14: null,
      macd: { macd: null, signal: null, histogram: null },
      bollinger: { upper: null, middle: null, lower: null, bandwidthPct: null },
      atr14: null,
      atrPct: null,
      adx14: { adx: null, plusDI: null, minusDI: null },
      vwap: null,
      obv: null,
      pivots: null,
      fibonacci: null,
      marketStructure: {
        mainTrend: 'UNCERTAIN',
        shortTermTrend: 'UNCERTAIN',
        momentum: 'UNCERTAIN',
        volatility: 'UNCERTAIN',
        marketRegime: 'INSUFFICIENT_DATA',
        structurePattern: 'INSUFFICIENT_DATA',
        confirmedSwings: [],
        unconfirmedSwings: [],
        supportZones: [],
        resistanceZones: [],
        bullishInvalidationLevel: null,
        bearishInvalidationLevel: null,
      },
    };
  }

  const closes = completeCandles.map((c) => c.close);
  const lastIdx = completeCandles.length - 1;
  const lastBar = completeCandles[lastIdx];
  const prevBar = completeCandles[lastIdx - 1];

  const ema9Arr = calculateEMA(closes, 9);
  const ema20Arr = calculateEMA(closes, 20);
  const ema50Arr = calculateEMA(closes, 50);
  const ema100Arr = calculateEMA(closes, 100);
  const ema200Arr = calculateEMA(closes, 200);

  const sma20Arr = calculateSMA(closes, 20);
  const sma50Arr = calculateSMA(closes, 50);
  const sma200Arr = calculateSMA(closes, 200);

  const rsiArr = calculateRSI(closes, 14);
  const macdObj = calculateMACD(closes, 12, 26, 9);
  const bbObj = calculateBollingerBands(closes, 20, 2);
  const atrArr = calculateATR(completeCandles, 14);
  const adxObj = calculateADX(completeCandles, 14);
  const vwapArr = calculateVWAP(completeCandles);
  const structure = detectMarketStructure(completeCandles, 3);

  const ema9 = ema9Arr[lastIdx];
  const ema20 = ema20Arr[lastIdx];
  const ema50 = ema50Arr[lastIdx];
  const ema100 = ema100Arr[lastIdx];
  const ema200 = ema200Arr[lastIdx];
  const rsi14 = rsiArr[lastIdx];
  const atr14 = atrArr[lastIdx];
  const atrPct = atr14 !== null && lastBar.close > 0 ? (atr14 / lastBar.close) * 100 : null;
  const adxVal = adxObj.adx[lastIdx];
  const plusDI = adxObj.plusDI[lastIdx];
  const minusDI = adxObj.minusDI[lastIdx];

  const mainTrend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS' | 'UNCERTAIN' =
    ema20 !== null && ema50 !== null
      ? lastBar.close > ema50 && ema20 > ema50
        ? 'BULLISH'
        : lastBar.close < ema50 && ema20 < ema50
          ? 'BEARISH'
          : 'SIDEWAYS'
      : 'UNCERTAIN';

  const shortTermTrend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS' | 'UNCERTAIN' =
    ema9 !== null && ema20 !== null
      ? ema9 > ema20 && lastBar.close > ema9
        ? 'BULLISH'
        : ema9 < ema20 && lastBar.close < ema9
          ? 'BEARISH'
          : 'SIDEWAYS'
      : 'UNCERTAIN';

  const momentum: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'UNCERTAIN' =
    rsi14 !== null
      ? rsi14 >= 55
        ? 'BULLISH'
        : rsi14 <= 45
          ? 'BEARISH'
          : 'NEUTRAL'
      : 'UNCERTAIN';

  const volatility: 'LOW' | 'NORMAL' | 'HIGH' | 'UNCERTAIN' =
    atrPct !== null
      ? atrPct >= 2.5
        ? 'HIGH'
        : atrPct <= 0.7
          ? 'LOW'
          : 'NORMAL'
      : 'UNCERTAIN';

  let marketRegime: TechnicalSnapshot['marketStructure']['marketRegime'] = 'INSUFFICIENT_DATA';
  if (volatility === 'HIGH' && (adxVal === null || adxVal < 20)) {
    marketRegime = 'HIGH_VOLATILITY';
  } else if (adxVal !== null && adxVal >= 25) {
    marketRegime = mainTrend === 'BULLISH' ? 'TRENDING_UP' : mainTrend === 'BEARISH' ? 'TRENDING_DOWN' : 'RANGING';
  } else if (mainTrend !== 'UNCERTAIN') {
    marketRegime = 'RANGING';
  }

  let fibonacci: TechnicalSnapshot['fibonacci'] = null;
  const recentHighs = structure.confirmedSwings.filter((s) => s.type === 'HIGH');
  const recentLows = structure.confirmedSwings.filter((s) => s.type === 'LOW');
  if (recentHighs.length > 0 && recentLows.length > 0) {
    const sh = recentHighs[recentHighs.length - 1].price;
    const sl = recentLows[recentLows.length - 1].price;
    if (sh > sl) {
      const fibTrend = mainTrend === 'BEARISH' ? 'DOWN' : 'UP';
      fibonacci = {
        swingHigh: sh,
        swingLow: sl,
        trend: fibTrend,
        levels: calculateFibonacciRetracement(sh, sl, fibTrend),
      };
    }
  }

  return {
    symbol,
    exchange,
    timeframe,
    status: validation.status,
    candleCount: validation.validCandles.length,
    completeCandleCount: completeCandles.length,
    hasIncompleteTrailingCandle,
    lastTimestamp: lastBar.timestamp,
    lastClose: lastBar.close,
    ema: { ema9, ema20, ema50, ema100, ema200 },
    sma: { sma20: sma20Arr[lastIdx], sma50: sma50Arr[lastIdx], sma200: sma200Arr[lastIdx] },
    rsi14,
    macd: {
      macd: macdObj.macd[lastIdx],
      signal: macdObj.signal[lastIdx],
      histogram: macdObj.histogram[lastIdx],
    },
    bollinger: {
      upper: bbObj.upper[lastIdx],
      middle: bbObj.middle[lastIdx],
      lower: bbObj.lower[lastIdx],
      bandwidthPct: bbObj.bandwidthPct[lastIdx],
    },
    atr14,
    atrPct,
    adx14: { adx: adxVal, plusDI, minusDI },
    vwap: vwapArr[lastIdx],
    obv: summarizeObv(completeCandles),
    pivots: calculatePivotPoints(prevBar.high, prevBar.low, prevBar.close),
    fibonacci,
    marketStructure: {
      mainTrend,
      shortTermTrend,
      momentum,
      volatility,
      marketRegime,
      structurePattern: structure.structurePattern,
      confirmedSwings: structure.confirmedSwings,
      unconfirmedSwings: structure.unconfirmedSwings,
      supportZones: structure.supportZones,
      resistanceZones: structure.resistanceZones,
      bullishInvalidationLevel: structure.bullishInvalidationLevel,
      bearishInvalidationLevel: structure.bearishInvalidationLevel,
    },
  };
}
