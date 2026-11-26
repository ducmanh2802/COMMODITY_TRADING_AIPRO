import type { StrategyDefinition, StrategyId } from '../../src/shared/types/analysis.ts';
import type { Timeframe } from '../../src/shared/types/instrument.ts';
import type { DataQualityStatus, MarketCandle } from '../../src/shared/types/market.ts';
import type { TechnicalSnapshot } from './technicalEngine.ts';
import { defaultParams, type StrategyParams } from './strategyParams.ts';
import { donchianSignal, tsmomSignal } from './trendRules.ts';

export interface DeterministicSignal {
  strategyId: StrategyId;
  strategyName: string;
  direction: 'LONG' | 'SHORT' | 'NONE';
  confirmationStatus: 'CONFIRMED' | 'PENDING' | 'INVALIDATED' | 'UNAVAILABLE';
  setupQualityScore: number | null;
  scoreBreakdown: string[];
  entryZone: [number, number] | null;
  stopLoss: number | null;
  takeProfits: number[];
  riskReward: number | null;
  invalidationCondition: string;
  rationale: string;
  dataStatus: DataQualityStatus;
}

export const STRATEGY_CATALOG: Array<
  StrategyDefinition & {
    minCandlesRequired: number;
    minRiskReward: number;
  }
> = [
  {
    id: 'TREND_FOLLOWING',
    name: 'Trend Following (EMA 20/50 + ADX)',
    applicableTimeframes: ['H1', 'H4', 'D1', 'W1'],
    requiredIndicators: ['EMA 20', 'EMA 50', 'ADX 14', 'ATR 14'],
    entryConditions: 'Close aligned with EMA20 > EMA50 (long) or EMA20 < EMA50 (short) and ADX >= 22 confirming directional strength.',
    exitConditions: 'EMA20 crosses against EMA50 or price reaches ATR-scaled target.',
    stopLossLogic: '1.5 x ATR14 beyond entry or confirmed swing invalidation.',
    takeProfitLogic: 'TP1 = 1.5R, TP2 = 2.5R.',
    invalidationConditions: 'Close across EMA50 or break of latest confirmed swing.',
    minCandlesRequired: 55,
    minRiskReward: 1.5,
  },
  {
    id: 'EMA_PULLBACK',
    name: 'EMA Pullback Continuation',
    applicableTimeframes: ['M15', 'M30', 'H1', 'H4', 'D1'],
    requiredIndicators: ['EMA 9', 'EMA 20', 'EMA 50', 'RSI 14', 'ATR 14'],
    entryConditions: 'Primary trend EMA20/EMA50 aligned while price pulls back near EMA20 without violating EMA50 and RSI resets near 45-55.',
    exitConditions: 'Momentum stalls at prior swing or reaches 2.0R target.',
    stopLossLogic: '1.25 x ATR14 beyond EMA20/50 zone.',
    takeProfitLogic: 'TP1 = 1.5R, TP2 = 2.5R.',
    invalidationConditions: 'Close beyond EMA50.',
    minCandlesRequired: 55,
    minRiskReward: 1.5,
  },
  {
    id: 'BREAKOUT',
    name: 'Confirmed Range / Pivot Breakout',
    applicableTimeframes: ['M15', 'H1', 'H4', 'D1'],
    requiredIndicators: ['ATR 14', 'Confirmed Swings', 'ADX 14'],
    entryConditions: 'Bar close breaks above highest confirmed resistance (or below lowest confirmed support) with ATR expansion.',
    exitConditions: 'Target projected by 2.0x risk distance or return inside broken level.',
    stopLossLogic: '1.2 x ATR14 inside broken breakout boundary.',
    takeProfitLogic: 'TP1 = 1.5R, TP2 = 2.5R.',
    invalidationConditions: 'Immediate close back inside prior range.',
    minCandlesRequired: 35,
    minRiskReward: 1.5,
  },
  {
    id: 'RANGE_TRADING',
    name: 'Bollinger Range Mean Reversion',
    applicableTimeframes: ['M15', 'M30', 'H1', 'H4'],
    requiredIndicators: ['Bollinger Bands 20', 'RSI 14', 'ADX 14', 'ATR 14'],
    entryConditions: 'Non-trending regime (ADX < 22) where price tests lower/upper Bollinger Band with RSI confirmation.',
    exitConditions: 'Mean reversion to Bollinger Middle Band (SMA 20).',
    stopLossLogic: '1.2 x ATR14 outside Bollinger extreme.',
    takeProfitLogic: 'TP1 = SMA20 mean, TP2 = opposite band.',
    invalidationConditions: 'ADX rises >= 25 signaling trend breakout.',
    minCandlesRequired: 35,
    minRiskReward: 1.3,
  },
  {
    id: 'SR_REVERSAL',
    name: 'Support / Resistance Rejection',
    applicableTimeframes: ['H1', 'H4', 'D1', 'W1'],
    requiredIndicators: ['Confirmed S/R Zones', 'RSI 14', 'ATR 14'],
    entryConditions: 'Price tests a confirmed historical S/R zone within 0.5x ATR and closes rejecting the boundary.',
    exitConditions: 'Opposite S/R zone or 2.0R target.',
    stopLossLogic: '1.2 x ATR14 beyond confirmed S/R zone.',
    takeProfitLogic: 'TP1 = 1.5R, TP2 = 2.5R.',
    invalidationConditions: 'Full candle close beyond S/R zone + 0.5 ATR.',
    minCandlesRequired: 35,
    minRiskReward: 1.5,
  },
  {
    id: 'RSI_REVERSAL',
    name: 'RSI Exhaustion Reversal',
    applicableTimeframes: ['M15', 'M30', 'H1', 'H4', 'D1'],
    requiredIndicators: ['RSI 14', 'EMA 20', 'ATR 14'],
    entryConditions: 'RSI <= 30 (oversold long) or RSI >= 70 (overbought short) with candle rejecting extreme.',
    exitConditions: 'RSI returns to 50 neutral zone or 2.0R.',
    stopLossLogic: '1.3 x ATR14 beyond recent extreme.',
    takeProfitLogic: 'TP1 = 1.5R, TP2 = 2.0R.',
    invalidationConditions: 'Continued RSI extreme with trend expansion.',
    minCandlesRequired: 30,
    minRiskReward: 1.5,
  },
  {
    id: 'MACD_MOMENTUM',
    name: 'MACD Histogram Momentum',
    applicableTimeframes: ['M30', 'H1', 'H4', 'D1'],
    requiredIndicators: ['MACD 12/26/9', 'EMA 50', 'ATR 14'],
    entryConditions: 'MACD line above signal with positive histogram aligned with EMA 50 (or inverse for short).',
    exitConditions: 'MACD histogram flips sign.',
    stopLossLogic: '1.5 x ATR14 from entry.',
    takeProfitLogic: 'TP1 = 1.5R, TP2 = 2.5R.',
    invalidationConditions: 'MACD crosses opposite direction.',
    minCandlesRequired: 50,
    minRiskReward: 1.5,
  },
  {
    id: 'ATR_VOLATILITY_BREAKOUT',
    name: 'ATR Volatility Expansion Breakout',
    applicableTimeframes: ['M5', 'M15', 'M30', 'H1', 'H4'],
    requiredIndicators: ['ATR 14', 'EMA 20', 'Bollinger Bands 20'],
    entryConditions: 'True range exceeds 1.3x ATR14 closing outside Bollinger Band in direction of momentum.',
    exitConditions: 'Volatility contraction or 2.0R target.',
    stopLossLogic: '1.5 x ATR14 from breakout close.',
    takeProfitLogic: 'TP1 = 1.5R, TP2 = 2.5R.',
    invalidationConditions: 'Close back inside Bollinger middle band.',
    minCandlesRequired: 30,
    minRiskReward: 1.5,
  },
  {
    id: 'TSMOM_12M',
    name: 'Time-Series Momentum 12 tháng (TSMOM)',
    applicableTimeframes: ['D1', 'W1'],
    requiredIndicators: ['Lợi suất 12 tháng (~252 phiên)', 'ATR 14'],
    entryConditions: 'Lợi suất đóng cửa trong N phiên gần nhất > 0 thì LONG, < 0 thì SHORT (tính trên nến đã đóng).',
    exitConditions: 'Chạm cắt lỗ ATR hoặc mục tiêu R (xấp xỉ tái cân bằng hằng tháng trên nến ngày).',
    stopLossLogic: '2.0 x ATR14 từ giá vào.',
    takeProfitLogic: 'TP1 = 3R.',
    invalidationConditions: 'Dấu lợi suất N phiên đổi chiều.',
    minCandlesRequired: 253,
    minRiskReward: 1.5,
  },
  {
    id: 'DONCHIAN_BREAKOUT',
    name: 'Donchian Breakout (kiểu Turtle)',
    applicableTimeframes: ['D1', 'W1', 'H4'],
    requiredIndicators: ['Kênh Donchian N vào / M thoát', 'ATR 14'],
    entryConditions: 'Đóng cửa trên đỉnh cao nhất N phiên trước (LONG) hoặc dưới đáy thấp nhất N phiên trước (SHORT).',
    exitConditions: 'Cắt lỗ tại kênh thoát M phiên hoặc mục tiêu R.',
    stopLossLogic: 'Đáy (LONG) / đỉnh (SHORT) của M phiên gần nhất.',
    takeProfitLogic: 'TP1 = 3R.',
    invalidationConditions: 'Giá đóng cửa xuyên kênh thoát.',
    minCandlesRequired: 56,
    minRiskReward: 1.5,
  },
];

/** Bars of history evaluateStrategy needs ending at the signal bar (2 for the classic strategies). */
export function strategyLookbackBars(strategyId: StrategyId, params?: StrategyParams): number {
  const P = { ...defaultParams(strategyId), ...(params ?? {}) };
  if (strategyId === 'TSMOM_12M') return Math.max(2, Math.trunc(P.lookback) + 1);
  if (strategyId === 'DONCHIAN_BREAKOUT') return Math.max(2, Math.trunc(Math.max(P.entryN, P.exitN)) + 1);
  return 2;
}

function buildTradeLevels(
  entry: number,
  atr: number,
  direction: 'LONG' | 'SHORT',
  slMultiplier: number,
  tp1R = 1.5
): { entryZone: [number, number]; stopLoss: number; takeProfits: number[]; riskReward: number } {
  const slDist = atr * slMultiplier;
  const zoneHalf = atr * 0.15;
  if (direction === 'LONG') {
    const sl = entry - slDist;
    const tp1 = entry + slDist * tp1R;
    const tp2 = entry + slDist * (tp1R + 1);
    return {
      entryZone: [entry - zoneHalf, entry + zoneHalf],
      stopLoss: sl,
      takeProfits: [tp1, tp2],
      riskReward: 2.0,
    };
  }
  const sl = entry + slDist;
  const tp1 = entry - slDist * tp1R;
  const tp2 = entry - slDist * (tp1R + 1);
  return {
    entryZone: [entry - zoneHalf, entry + zoneHalf],
    stopLoss: sl,
    takeProfits: [tp1, tp2],
    riskReward: 2.0,
  };
}

export function evaluateStrategy(
  strategyId: StrategyId,
  snapshot: TechnicalSnapshot,
  candles: MarketCandle[],
  paramOverrides?: StrategyParams
): DeterministicSignal {
  const P: StrategyParams = { ...defaultParams(strategyId), ...(paramOverrides ?? {}) };
  const meta = STRATEGY_CATALOG.find((s) => s.id === strategyId)!;
  // Only the last two complete bars are read below; scan from the end instead of filtering the whole
  // history (the backtest calls this once per bar per parameter combination).
  const tailBars: MarketCandle[] = [];
  for (let k = candles.length - 1; k >= 0 && tailBars.length < 2; k--) {
    if (candles[k].isComplete) tailBars.unshift(candles[k]);
  }
  const completeCount =
    typeof snapshot.completeCandleCount === 'number'
      ? snapshot.completeCandleCount
      : candles.filter((c) => c.isComplete).length;

  if (
    snapshot.status === 'UNAVAILABLE' ||
    snapshot.status === 'INVALID' ||
    snapshot.lastClose === null ||
    snapshot.atr14 === null ||
    completeCount < meta.minCandlesRequired
  ) {
    return {
      strategyId,
      strategyName: meta.name,
      direction: 'NONE',
      confirmationStatus: 'UNAVAILABLE',
      setupQualityScore: null,
      scoreBreakdown: ['Required validated OHLCV or indicator inputs are unavailable.'],
      entryZone: null,
      stopLoss: null,
      takeProfits: [],
      riskReward: null,
      invalidationCondition: meta.invalidationConditions,
      rationale:
        snapshot.reason ??
        `DATA_UNAVAILABLE — Requires at least ${meta.minCandlesRequired} validated complete candles.`,
      dataStatus: snapshot.status === 'INVALID' ? 'INVALID' : 'UNAVAILABLE',
    };
  }

  const price = snapshot.lastClose;
  const atr = snapshot.atr14;
  const lastBar = tailBars[tailBars.length - 1];
  const prevBar = tailBars[tailBars.length - 2];

  let direction: 'LONG' | 'SHORT' | 'NONE' = 'NONE';
  let score = 0;
  const breakdown: string[] = [];
  const slMult = P.slAtrMult ?? 1.5;

  switch (strategyId) {
    case 'TREND_FOLLOWING': {
      const { ema20, ema50 } = snapshot.ema;
      const adx = snapshot.adx14.adx;
      if (ema20 === null || ema50 === null || adx === null) break;
      if (price > ema20 && ema20 > ema50 && adx >= P.adxMin) {
        direction = 'LONG';
        score = 65 + (adx >= 30 ? 15 : 8) + (snapshot.marketStructure.structurePattern === 'HH_HL' ? 15 : 0);
        breakdown.push('EMA20 > EMA50 bullish alignment', `ADX ${adx.toFixed(1)} >= ${P.adxMin}`);
      } else if (price < ema20 && ema20 < ema50 && adx >= P.adxMin) {
        direction = 'SHORT';
        score = 65 + (adx >= 30 ? 15 : 8) + (snapshot.marketStructure.structurePattern === 'LH_LL' ? 15 : 0);
        breakdown.push('EMA20 < EMA50 bearish alignment', `ADX ${adx.toFixed(1)} >= ${P.adxMin}`);
      }
      break;
    }

    case 'EMA_PULLBACK': {
      const { ema20, ema50 } = snapshot.ema;
      const rsi = snapshot.rsi14;
      if (ema20 === null || ema50 === null || rsi === null) break;
      if (ema20 > ema50 && Math.abs(price - ema20) <= atr * P.pullbackAtr && price > ema50 && rsi >= 42 && rsi <= 62) {
        direction = 'LONG';
        score = 72 + (lastBar.close > lastBar.open ? 12 : 0);
        breakdown.push('Bullish EMA20 > EMA50', `Price pulled back within ${P.pullbackAtr} ATR of EMA20`);
      } else if (ema20 < ema50 && Math.abs(price - ema20) <= atr * P.pullbackAtr && price < ema50 && rsi >= 38 && rsi <= 58) {
        direction = 'SHORT';
        score = 72 + (lastBar.close < lastBar.open ? 12 : 0);
        breakdown.push('Bearish EMA20 < EMA50', `Price pulled back within ${P.pullbackAtr} ATR of EMA20`);
      }
      break;
    }

    case 'BREAKOUT': {
      const res = snapshot.marketStructure.resistanceZones;
      const sup = snapshot.marketStructure.supportZones;
      if (res.length > 0 && price > Math.max(...res)) {
        direction = 'LONG';
        score = 74 + (snapshot.adx14.adx && snapshot.adx14.adx >= 20 ? 12 : 0);
        breakdown.push(`Confirmed close above resistance ${Math.max(...res).toFixed(2)}`);
      } else if (sup.length > 0 && price < Math.min(...sup)) {
        direction = 'SHORT';
        score = 74 + (snapshot.adx14.adx && snapshot.adx14.adx >= 20 ? 12 : 0);
        breakdown.push(`Confirmed close below support ${Math.min(...sup).toFixed(2)}`);
      }
      break;
    }

    case 'RANGE_TRADING': {
      const { upper, lower } = snapshot.bollinger;
      const adx = snapshot.adx14.adx;
      const rsi = snapshot.rsi14;
      if (upper === null || lower === null || adx === null || rsi === null) break;
      if (adx < P.adxMax && price <= lower * 1.003 && rsi <= P.rsiLow) {
        direction = 'LONG';
        score = 70;
        breakdown.push(`Range ADX ${adx.toFixed(1)} < ${P.adxMax}`, 'Lower Bollinger Band test with low RSI');
      } else if (adx < P.adxMax && price >= upper * 0.997 && rsi >= 100 - P.rsiLow) {
        direction = 'SHORT';
        score = 70;
        breakdown.push(`Range ADX ${adx.toFixed(1)} < ${P.adxMax}`, 'Upper Bollinger Band test with elevated RSI');
      }
      break;
    }

    case 'SR_REVERSAL': {
      const sup = snapshot.marketStructure.supportZones;
      const res = snapshot.marketStructure.resistanceZones;
      if (sup.length > 0) {
        const nearestSup = sup[sup.length - 1];
        if (Math.abs(lastBar.low - nearestSup) <= atr * P.proximityAtr && lastBar.close > nearestSup && lastBar.close > lastBar.open) {
          direction = 'LONG';
          score = 73;
          breakdown.push(`Bullish rejection at confirmed support ${nearestSup.toFixed(2)}`);
        }
      }
      if (direction === 'NONE' && res.length > 0) {
        const nearestRes = res[res.length - 1];
        if (Math.abs(lastBar.high - nearestRes) <= atr * P.proximityAtr && lastBar.close < nearestRes && lastBar.close < lastBar.open) {
          direction = 'SHORT';
          score = 73;
          breakdown.push(`Bearish rejection at confirmed resistance ${nearestRes.toFixed(2)}`);
        }
      }
      break;
    }

    case 'RSI_REVERSAL': {
      const rsi = snapshot.rsi14;
      if (rsi === null) break;
      if (rsi <= P.rsiOversold && lastBar.close > lastBar.open) {
        direction = 'LONG';
        score = 68 + (rsi <= 25 ? 10 : 0);
        breakdown.push(`RSI14 oversold (${rsi.toFixed(1)}) with bullish reversal close`);
      } else if (rsi >= 100 - P.rsiOversold && lastBar.close < lastBar.open) {
        direction = 'SHORT';
        score = 68 + (rsi >= 75 ? 10 : 0);
        breakdown.push(`RSI14 overbought (${rsi.toFixed(1)}) with bearish reversal close`);
      }
      break;
    }

    case 'MACD_MOMENTUM': {
      const { macd, signal, histogram } = snapshot.macd;
      const ema50 = snapshot.ema.ema50;
      if (macd === null || signal === null || histogram === null || ema50 === null) break;
      if (macd > signal && histogram > 0 && price > ema50) {
        direction = 'LONG';
        score = 71;
        breakdown.push('MACD > Signal with positive histogram above EMA50');
      } else if (macd < signal && histogram < 0 && price < ema50) {
        direction = 'SHORT';
        score = 71;
        breakdown.push('MACD < Signal with negative histogram below EMA50');
      }
      break;
    }

    case 'ATR_VOLATILITY_BREAKOUT': {
      const { upper, lower } = snapshot.bollinger;
      if (upper === null || lower === null) break;
      const barRange = Math.max(
        lastBar.high - lastBar.low,
        Math.abs(lastBar.high - prevBar.close),
        Math.abs(lastBar.low - prevBar.close)
      );
      if (barRange >= atr * P.rangeAtrMult && lastBar.close > upper) {
        direction = 'LONG';
        score = 76;
        breakdown.push(`Volatility expansion (>= ${P.rangeAtrMult}x ATR) closing above Upper Bollinger Band`);
      } else if (barRange >= atr * P.rangeAtrMult && lastBar.close < lower) {
        direction = 'SHORT';
        score = 76;
        breakdown.push(`Volatility expansion (>= ${P.rangeAtrMult}x ATR) closing below Lower Bollinger Band`);
      }
      break;
    }
  }

  // Trend-following rules need a longer window than the last two bars; they use bars up to the last one only.
  let customLevels: ReturnType<typeof buildTradeLevels> | null = null;
  if (strategyId === 'TSMOM_12M' || strategyId === 'DONCHIAN_BREAKOUT') {
    const bars = candles.filter((c) => c.isComplete);
    const t = bars.length - 1;
    if (strategyId === 'TSMOM_12M') {
      const side = tsmomSignal(bars.map((c) => c.close), t, Math.trunc(P.lookback));
      if (side !== 'NONE') {
        direction = side;
        score = 70;
        breakdown.push(`Lợi suất ${Math.trunc(P.lookback)} phiên ${side === 'LONG' ? '> 0' : '< 0'}`);
      }
    } else {
      const d = donchianSignal(
        bars.map((c) => c.high),
        bars.map((c) => c.low),
        bars.map((c) => c.close),
        t,
        Math.trunc(P.entryN),
        Math.trunc(P.exitN)
      );
      const stop = d.side === 'LONG' ? d.exitLow : d.side === 'SHORT' ? d.exitHigh : null;
      if (d.side !== 'NONE' && stop !== null && Math.abs(price - stop) > 0) {
        direction = d.side;
        score = 72;
        const dist = Math.abs(price - stop);
        const sign = d.side === 'LONG' ? 1 : -1;
        const tp1 = P.tp1R ?? 3;
        customLevels = {
          entryZone: [price - atr * 0.15, price + atr * 0.15],
          stopLoss: stop,
          takeProfits: [price + sign * dist * tp1, price + sign * dist * (tp1 + 1)],
          riskReward: tp1,
        };
        breakdown.push(`Đóng cửa ${d.side === 'LONG' ? 'trên đỉnh' : 'dưới đáy'} kênh ${Math.trunc(P.entryN)} phiên`);
      }
    }
  }

  if (direction === 'NONE') {
    return {
      strategyId,
      strategyName: meta.name,
      direction: 'NONE',
      confirmationStatus: 'PENDING',
      setupQualityScore: 0,
      scoreBreakdown: ['Setup entry conditions not satisfied on latest confirmed candle.'],
      entryZone: null,
      stopLoss: null,
      takeProfits: [],
      riskReward: null,
      invalidationCondition: meta.invalidationConditions,
      rationale: 'No qualified setup detected; remain flat.',
      dataStatus: snapshot.status,
    };
  }

  const levels = customLevels ?? buildTradeLevels(price, atr, direction, slMult, P.tp1R ?? 1.5);
  return {
    strategyId,
    strategyName: meta.name,
    direction,
    confirmationStatus: 'CONFIRMED',
    setupQualityScore: Math.min(100, score),
    scoreBreakdown: breakdown,
    entryZone: levels.entryZone,
    stopLoss: levels.stopLoss,
    takeProfits: levels.takeProfits,
    riskReward: levels.riskReward,
    invalidationCondition: meta.invalidationConditions,
    rationale: breakdown.join(' · '),
    dataStatus: snapshot.status,
  };
}

export function evaluateAllStrategies(
  snapshot: TechnicalSnapshot,
  candles: MarketCandle[],
  timeframe?: Timeframe
): DeterministicSignal[] {
  return STRATEGY_CATALOG.filter(
    (s) => !timeframe || s.applicableTimeframes.includes(timeframe) || true
  ).map((s) => evaluateStrategy(s.id, snapshot, candles));
}
