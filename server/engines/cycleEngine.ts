import type { MarketCandle } from '../../src/shared/types/market.ts';
import type {
  CyclePhase,
  CycleTimeframeKey,
  MonthlySeasonalityStat,
  MultiTimeframeCycleState,
  PerformanceHorizonReturns,
} from '../../src/shared/types/cycle.ts';
import {
  calculateATR,
  calculateBollingerBands,
  calculateEMA,
  calculateMACD,
  calculateRSI,
  summarizeObv,
} from './technicalEngine.ts';

export const CYCLE_PHASE_LABELS_VI: Record<CyclePhase, string> = {
  PHASE_1_ACCUMULATION: 'Giai đoạn 1 · Tích lũy đáy',
  PHASE_2_EARLY_RECOVERY: 'Giai đoạn 2 · Phục hồi sớm',
  PHASE_3_MARKUP: 'Giai đoạn 3 · Tăng trưởng (Markup)',
  PHASE_4_DISTRIBUTION: 'Giai đoạn 4 · Phân phối / Rủi ro đỉnh',
  DATA_UNAVAILABLE: 'DATA_UNAVAILABLE',
};

function sortAscending(candles: MarketCandle[]): MarketCandle[] {
  return [...candles]
    .filter((c) => c.isComplete && Number.isFinite(c.close) && c.close > 0)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function aggregateCandlesByBucket(
  candles: MarketCandle[],
  bucketKeyFn: (iso: string) => string,
  targetTimeframe: string
): MarketCandle[] {
  const sorted = sortAscending(candles);
  if (sorted.length === 0) return [];

  const buckets = new Map<string, MarketCandle[]>();
  for (const candle of sorted) {
    const key = bucketKeyFn(candle.timestamp);
    const list = buckets.get(key);
    if (list) list.push(candle);
    else buckets.set(key, [candle]);
  }

  const out: MarketCandle[] = [];
  for (const [, group] of buckets) {
    const first = group[0];
    const last = group[group.length - 1];
    let high = first.high;
    let low = first.low;
    let volSum = 0;
    let hasVol = false;
    for (const bar of group) {
      if (bar.high > high) high = bar.high;
      if (bar.low < low) low = bar.low;
      if (bar.volume !== null && Number.isFinite(bar.volume)) {
        volSum += bar.volume;
        hasVol = true;
      }
    }
    out.push({
      symbol: first.symbol,
      exchange: first.exchange,
      timeframe: targetTimeframe,
      timestamp: first.timestamp,
      retrievedAt: last.retrievedAt,
      open: first.open,
      high,
      low,
      close: last.close,
      volume: hasVol ? volSum : null,
      openInterest: last.openInterest,
      isComplete: true,
      source: first.source,
      status: last.status,
    });
  }
  return out;
}

function getIsoWeekKey(iso: string): string {
  const d = new Date(iso);
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function resampleDailyToWeekly(dailyCandles: MarketCandle[]): MarketCandle[] {
  return aggregateCandlesByBucket(dailyCandles, getIsoWeekKey, 'W1');
}

function resampleDailyToMonthly(dailyCandles: MarketCandle[]): MarketCandle[] {
  return aggregateCandlesByBucket(dailyCandles, (iso) => iso.slice(0, 7), 'MN');
}

export function computePercentileRank(series: number[], currentValue: number): number | null {
  if (series.length < 10 || !Number.isFinite(currentValue)) return null;
  let countLe = 0;
  for (const val of series) {
    if (val <= currentValue) countLe += 1;
  }
  return Number(((countLe / series.length) * 100).toFixed(2));
}

export interface CycleClassificationInputs {
  candleCount: number;
  lastClose: number | null;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  rsi14: number | null;
  macdHist: number | null;
  percentile10Y: number | null;
  bbWidthRatio: number | null;
}

export function classifyCyclePhase(input: CycleClassificationInputs): CyclePhase {
  const {
    candleCount,
    lastClose,
    ema20,
    ema50,
    ema200,
    rsi14,
    macdHist,
    percentile10Y,
    bbWidthRatio,
  } = input;

  if (candleCount < 20 || lastClose === null || ema20 === null) {
    return 'DATA_UNAVAILABLE';
  }

  const refEma = ema50 ?? ema200;
  const momentumWeakening =
    lastClose < ema20 || (macdHist !== null && macdHist < 0);
  const intactUptrend =
    lastClose > ema20 &&
    (refEma === null || ema20 >= refEma) &&
    (macdHist === null || macdHist >= 0);

  // Phase 4 (Distribution / Top Risk): High historical valuation / overbought RSI
  // AND observable price/momentum rollover. An intact steady uptrend must remain Markup.
  const stretchedHigh =
    (percentile10Y !== null && percentile10Y >= 78) ||
    (rsi14 !== null && rsi14 >= 68);
  if (stretchedHigh && momentumWeakening && !intactUptrend) {
    return 'PHASE_4_DISTRIBUTION';
  }

  // Phase 3 (Markup / Uptrend): Trend structure aligned upwards above EMAs
  if (
    lastClose > ema20 &&
    (refEma === null || (lastClose > refEma && ema20 >= refEma * 0.995)) &&
    (percentile10Y === null || percentile10Y > 42 || (rsi14 !== null && rsi14 >= 55))
  ) {
    return 'PHASE_3_MARKUP';
  }

  // Phase 2 (Early Recovery): Breaking out from low percentile / oversold base
  const inLowerBand = percentile10Y === null || percentile10Y <= 58;
  const bullishTurn =
    lastClose >= ema20 || (macdHist !== null && macdHist > 0 && (rsi14 === null || rsi14 >= 44));
  if (inLowerBand && bullishTurn) {
    return 'PHASE_2_EARLY_RECOVERY';
  }

  // Phase 1 (Accumulation / Bottoming): Depressed valuation percentile or tight consolidation base
  if (
    (percentile10Y !== null && percentile10Y <= 40) ||
    (bbWidthRatio !== null && bbWidthRatio <= 0.75) ||
    (refEma !== null && lastClose <= refEma)
  ) {
    return 'PHASE_1_ACCUMULATION';
  }

  return lastClose >= ema20 ? 'PHASE_3_MARKUP' : 'PHASE_1_ACCUMULATION';
}

function analyzeTimeframeCycle(
  timeframe: CycleTimeframeKey,
  rawCandles: MarketCandle[]
): MultiTimeframeCycleState {
  const candles = sortAscending(rawCandles);
  if (candles.length < 20) {
    return {
      timeframe,
      available: false,
      candleCount: candles.length,
      phase: 'DATA_UNAVAILABLE',
      trendDirection: 'UNAVAILABLE',
      lastClose: candles.length > 0 ? candles[candles.length - 1].close : null,
      ema20: null,
      ema50: null,
      ema200: null,
      rsi14: null,
      macdHist: null,
      atrPct: null,
      percentile10Y: null,
      bbWidthRatio: null,
      volumeRatio: null,
      summary: `DATA_UNAVAILABLE — Cần tối thiểu 20 nến ${timeframe} (hiện có ${candles.length}).`,
    };
  }

  const closes = candles.map((c) => c.close);
  const idx = closes.length - 1;
  const lastClose = closes[idx];
  const ema20Arr = calculateEMA(closes, 20);
  const ema50Arr = calculateEMA(closes, 50);
  const ema200Arr = calculateEMA(closes, 200);
  const rsiArr = calculateRSI(closes, 14);
  const macdRes = calculateMACD(closes);
  const bbRes = calculateBollingerBands(closes, 20, 2);
  const atrArr = calculateATR(candles, 14);

  const ema20 = ema20Arr[idx];
  const ema50 = ema50Arr[idx];
  const ema200 = ema200Arr[idx];
  const rsi14 = rsiArr[idx];
  const macdHist = macdRes.histogram[idx];
  const atr14 = atrArr[idx];
  const atrPct = atr14 !== null && lastClose > 0 ? Number(((atr14 / lastClose) * 100).toFixed(3)) : null;

  const windowCloses = closes.slice(-Math.min(closes.length, timeframe === 'MONTHLY' ? 120 : 2520));
  const percentile10Y = computePercentileRank(windowCloses, lastClose);

  const validWidths = bbRes.bandwidthPct.filter((v): v is number => v !== null && v > 0);
  const latestWidth = bbRes.bandwidthPct[idx];
  let bbWidthRatio: number | null = null;
  if (latestWidth !== null && validWidths.length >= 20) {
    const recentWidths = validWidths.slice(-60);
    const meanWidth = recentWidths.reduce((a, b) => a + b, 0) / recentWidths.length;
    if (meanWidth > 0) bbWidthRatio = Number((latestWidth / meanWidth).toFixed(3));
  }

  const recentVols = candles.slice(-20).map((c) => c.volume).filter((v): v is number => v !== null && v > 0);
  const lastVol = candles[idx].volume;
  let volumeRatio: number | null = null;
  if (lastVol !== null && recentVols.length >= 10) {
    const avgVol = recentVols.reduce((a, b) => a + b, 0) / recentVols.length;
    if (avgVol > 0) volumeRatio = Number((lastVol / avgVol).toFixed(2));
  }

  const phase = classifyCyclePhase({
    candleCount: candles.length,
    lastClose,
    ema20,
    ema50,
    ema200,
    rsi14,
    macdHist,
    percentile10Y,
    bbWidthRatio,
  });

  const trendDirection: MultiTimeframeCycleState['trendDirection'] =
    ema20 !== null && ema50 !== null
      ? lastClose > ema20 && ema20 > ema50
        ? 'UP'
        : lastClose < ema20 && ema20 < ema50
          ? 'DOWN'
          : 'SIDEWAYS'
      : ema20 !== null
        ? lastClose > ema20 * 1.01
          ? 'UP'
          : lastClose < ema20 * 0.99
            ? 'DOWN'
            : 'SIDEWAYS'
        : 'UNAVAILABLE';

  const summary =
    phase === 'PHASE_1_ACCUMULATION'
      ? `Giá đi ngang/nén biến động quanh vùng thấp lịch sử${percentile10Y !== null ? ` (bách phân vị ${percentile10Y.toFixed(0)}%)` : ''}.`
      : phase === 'PHASE_2_EARLY_RECOVERY'
        ? 'Tín hiệu bật lên khỏi vùng tích lũy, động lượng bắt đầu cải thiện trên EMA20.'
        : phase === 'PHASE_3_MARKUP'
          ? 'Cấu trúc xu hướng tăng được xác nhận phía trên các đường EMA chủ đạo.'
          : 'Vùng định giá cao lịch sử kèm dấu hiệu suy yếu động lượng ngắn hạn.';

  return {
    timeframe,
    available: true,
    candleCount: candles.length,
    phase,
    trendDirection,
    lastClose: Number(lastClose.toFixed(4)),
    ema20: ema20 !== null ? Number(ema20.toFixed(4)) : null,
    ema50: ema50 !== null ? Number(ema50.toFixed(4)) : null,
    ema200: ema200 !== null ? Number(ema200.toFixed(4)) : null,
    rsi14: rsi14 !== null ? Number(rsi14.toFixed(2)) : null,
    macdHist: macdHist !== null ? Number(macdHist.toFixed(4)) : null,
    atrPct,
    percentile10Y,
    bbWidthRatio,
    volumeRatio,
    obv: summarizeObv(candles),
    summary,
  };
}

function calcHorizonReturnByCalendarDays(sortedDaily: MarketCandle[], calendarDays: number): number | null {
  if (sortedDaily.length < 2) return null;
  const latest = sortedDaily[sortedDaily.length - 1];
  const latestMs = Date.parse(latest.timestamp);
  const firstMs = Date.parse(sortedDaily[0].timestamp);
  const targetMs = latestMs - calendarDays * 86_400_000;
  // Require real historical span covering at least 85% of the requested horizon (fail closed otherwise)
  if (firstMs > targetMs + calendarDays * 86_400_000 * 0.15) {
    return null;
  }

  let anchor: MarketCandle | null = null;
  for (let i = sortedDaily.length - 2; i >= 0; i--) {
    const ms = Date.parse(sortedDaily[i].timestamp);
    if (ms <= targetMs) {
      anchor = sortedDaily[i];
      break;
    }
  }
  if (!anchor || anchor.close <= 0) return null;
  return Number((((latest.close - anchor.close) / anchor.close) * 100).toFixed(2));
}

export function computePerformanceHorizonReturns(dailyCandles: MarketCandle[]): PerformanceHorizonReturns {
  const sorted = sortAscending(dailyCandles);
  return {
    w1: calcHorizonReturnByCalendarDays(sorted, 7),
    m1: calcHorizonReturnByCalendarDays(sorted, 30),
    m3: calcHorizonReturnByCalendarDays(sorted, 91),
    m6: calcHorizonReturnByCalendarDays(sorted, 182),
    y1: calcHorizonReturnByCalendarDays(sorted, 365),
    y3: calcHorizonReturnByCalendarDays(sorted, 365 * 3),
    y5: calcHorizonReturnByCalendarDays(sorted, 365 * 5),
    y10: calcHorizonReturnByCalendarDays(sorted, 365 * 10),
  };
}

const MONTH_LABELS_VI = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
];

function computeMonthlySeasonality(dailyCandles: MarketCandle[]): MonthlySeasonalityStat[] {
  const monthly = resampleDailyToMonthly(dailyCandles);
  const statsByMonth = new Map<number, number[]>();
  for (let m = 1; m <= 12; m++) statsByMonth.set(m, []);

  for (let i = 1; i < monthly.length; i++) {
    const prev = monthly[i - 1];
    const curr = monthly[i];
    if (prev.close > 0) {
      const retPct = ((curr.close - prev.close) / prev.close) * 100;
      const monthNum = new Date(curr.timestamp).getUTCMonth() + 1;
      statsByMonth.get(monthNum)?.push(retPct);
    }
  }

  return MONTH_LABELS_VI.map((label, idx) => {
    const month = idx + 1;
    const samples = statsByMonth.get(month) ?? [];
    if (samples.length === 0) {
      return { month, label, sampleYears: 0, avgReturnPct: null, winRatePct: null };
    }
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    const wins = samples.filter((r) => r > 0).length;
    return {
      month,
      label,
      sampleYears: samples.length,
      avgReturnPct: Number(avg.toFixed(2)),
      winRatePct: Number(((wins / samples.length) * 100).toFixed(1)),
    };
  });
}

export function evaluateMultiTimeframeCycle(params: {
  dailyCandles: MarketCandle[];
  weeklyCandles?: MarketCandle[];
  h4Candles?: MarketCandle[];
}): {
  timeframes: Record<CycleTimeframeKey, MultiTimeframeCycleState>;
  primaryPhase: CyclePhase;
  returns: PerformanceHorizonReturns;
  seasonality: MonthlySeasonalityStat[];
} {
  const sortedDaily = sortAscending(params.dailyCandles);
  const weeklySource =
    params.weeklyCandles && params.weeklyCandles.length >= 20
      ? sortAscending(params.weeklyCandles)
      : resampleDailyToWeekly(sortedDaily);
  const monthlySource = resampleDailyToMonthly(sortedDaily);
  const h4Source = params.h4Candles ? sortAscending(params.h4Candles) : [];

  const monthly = analyzeTimeframeCycle('MONTHLY', monthlySource);
  const weekly = analyzeTimeframeCycle('WEEKLY', weeklySource);
  const daily = analyzeTimeframeCycle('DAILY', sortedDaily);
  const h4 = analyzeTimeframeCycle('H4', h4Source);

  // Priority hierarchy per spec: Monthly > Weekly > Daily
  const primaryPhase: CyclePhase =
    monthly.available && monthly.phase !== 'DATA_UNAVAILABLE'
      ? monthly.phase
      : weekly.available && weekly.phase !== 'DATA_UNAVAILABLE'
        ? weekly.phase
        : daily.available && daily.phase !== 'DATA_UNAVAILABLE'
          ? daily.phase
          : 'DATA_UNAVAILABLE';

  return {
    timeframes: { MONTHLY: monthly, WEEKLY: weekly, DAILY: daily, H4: h4 },
    primaryPhase,
    returns: computePerformanceHorizonReturns(sortedDaily),
    seasonality: computeMonthlySeasonality(sortedDaily),
  };
}
