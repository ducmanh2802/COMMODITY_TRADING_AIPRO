import type { InstrumentDefinition } from '../../src/shared/types/instrument.ts';
import type { MarketCandle } from '../../src/shared/types/market.ts';
import type {
  BottomClassification,
  BottomDetectionResult,
  BottomFactorScore,
  CycleTimeframeKey,
  MultiTimeframeCycleState,
  TradeSetupPlan,
} from '../../src/shared/types/cycle.ts';
import { calculateATR, calculateRSI } from './technicalEngine.ts';
import { computePercentileRank } from './cycleEngine.ts';

export interface BottomDetectionInputs {
  instrument: InstrumentDefinition;
  dailyCandles: MarketCandle[];
  weeklyCandles: MarketCandle[];
  timeframes: Record<CycleTimeframeKey, MultiTimeframeCycleState>;
  supplyDemandBiasScore?: number | null; // -1 (surplus) .. +1 (tightening deficit)
  supplyDemandEvidence?: string;
  cotIndex?: number | null; // 0..100 (low = managed money heavily short / washed out)
  cotNote?: string;
  macroScoreNormalized?: number | null; // -1 (headwind) .. +1 (tailwind)
  macroEvidence?: string;
}

const METHODOLOGY_NOTE =
  'Bottom Score (0–100) và Model Confidence là chỉ số chấm điểm định lượng nội bộ dựa trên độ đồng thuận và mức độ đầy đủ của dữ liệu đầu vào (không phải xác suất thống kê đã hiệu chỉnh qua kiểm thử ngoài mẫu). Hệ thống không kết luận tạo đáy chỉ dựa trên RSI thấp hoặc giá đã giảm sâu.';

function classifyBottomScore(score: number): {
  classification: BottomClassification;
  labelVi: string;
} {
  if (score >= 85) {
    return {
      classification: 'EXTREME_BOTTOM_OPPORTUNITY',
      labelVi: '85–100 · Cơ hội vùng đáy cực đại',
    };
  }
  if (score >= 70) {
    return {
      classification: 'STRONG_BOTTOM_CANDIDATE',
      labelVi: '70–84 · Ứng viên tạo đáy mạnh',
    };
  }
  if (score >= 55) {
    return {
      classification: 'EARLY_ACCUMULATION_ZONE',
      labelVi: '55–69 · Vùng tích lũy sớm',
    };
  }
  if (score >= 40) {
    return {
      classification: 'NEUTRAL',
      labelVi: '40–54 · Trung tính / Theo dõi',
    };
  }
  return {
    classification: 'NO_BOTTOM_SIGNAL',
    labelVi: '< 40 · Chưa có tín hiệu tạo đáy',
  };
}

function detectBullishRsiDivergence(candles: MarketCandle[]): {
  detected: boolean;
  strength: number; // 0..1
  evidence: string;
} {
  if (candles.length < 40) {
    return { detected: false, strength: 0, evidence: 'Thiếu dữ liệu (<40 nến) để đo phân kỳ.' };
  }
  const closes = candles.map((c) => c.close);
  const rsiArr = calculateRSI(closes, 14);
  const recentWindow = 45;
  const start = Math.max(20, candles.length - recentWindow);
  const mid = Math.floor((start + candles.length) / 2);

  let low1Idx = start;
  for (let i = start; i < mid; i++) {
    if (candles[i].low < candles[low1Idx].low) low1Idx = i;
  }
  let low2Idx = mid;
  for (let i = mid; i < candles.length; i++) {
    if (candles[i].low < candles[low2Idx].low) low2Idx = i;
  }

  const rsi1 = rsiArr[low1Idx];
  const rsi2 = rsiArr[low2Idx];
  const p1 = candles[low1Idx].low;
  const p2 = candles[low2Idx].low;

  if (rsi1 === null || rsi2 === null) {
    return { detected: false, strength: 0, evidence: 'Chưa đủ dữ liệu RSI hợp lệ.' };
  }

  // Bullish regular divergence: price makes lower/equal low while RSI makes higher low in low territory
  if (p2 <= p1 * 1.01 && rsi2 > rsi1 + 2.5 && rsi1 < 45) {
    const gap = Math.min(1, (rsi2 - rsi1) / 15);
    return {
      detected: true,
      strength: Number((0.65 + gap * 0.35).toFixed(2)),
      evidence: `Phân kỳ dương RSI: đáy giá ${p1.toFixed(2)}→${p2.toFixed(2)} trong khi RSI tăng ${rsi1.toFixed(1)}→${rsi2.toFixed(1)}.`,
    };
  }

  // Secondary check: higher-low base stabilization after oversold RSI
  if (p2 > p1 && rsi1 < 38 && rsi2 > 42) {
    return {
      detected: true,
      strength: 0.6,
      evidence: `Tạo đáy sau cao hơn đáy trước (${p1.toFixed(2)}→${p2.toFixed(2)}) kèm RSI phục hồi lên ${rsi2.toFixed(1)}.`,
    };
  }

  return {
    detected: false,
    strength: rsi2 < 35 ? 0.25 : 0.1,
    evidence: `Chưa xác nhận phân kỳ tăng giá rõ ràng (RSI hiện tại ${rsi2.toFixed(1)}).`,
  };
}

export function runBottomDetectionEngine(inputs: BottomDetectionInputs): BottomDetectionResult {
  const sortedDaily = [...inputs.dailyCandles]
    .filter((c) => c.isComplete && Number.isFinite(c.close) && c.close > 0)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const primaryState = inputs.timeframes.WEEKLY.available
    ? inputs.timeframes.WEEKLY
    : inputs.timeframes.DAILY;

  if (sortedDaily.length < 30 || !primaryState.available || primaryState.lastClose === null) {
    const emptyFactors: BottomFactorScore[] = [
      { key: 'HISTORICAL_VALUATION', label: 'Historical Valuation', labelVi: 'Định giá lịch sử', weight: 15, score: null, available: false, evidence: 'DATA_UNAVAILABLE' },
      { key: 'LONG_TERM_PRICE_POSITION', label: 'Long-Term Price Position', labelVi: 'Vị thế giá dài hạn', weight: 15, score: null, available: false, evidence: 'DATA_UNAVAILABLE' },
      { key: 'SUPPLY_DEMAND_REVERSAL', label: 'Supply/Demand Reversal', labelVi: 'Đảo chiều Cung – Cầu', weight: 20, score: null, available: false, evidence: 'DATA_UNAVAILABLE' },
      { key: 'TECHNICAL_DIVERGENCE', label: 'Technical Divergence', labelVi: 'Phân kỳ kỹ thuật', weight: 15, score: null, available: false, evidence: 'DATA_UNAVAILABLE' },
      { key: 'SPECULATIVE_POSITIONING', label: 'Speculative Positioning (COT)', labelVi: 'Vị thế đầu cơ COT', weight: 10, score: null, available: false, evidence: 'DATA_UNAVAILABLE' },
      { key: 'VOLATILITY_CONTRACTION', label: 'Volatility Contraction', labelVi: 'Thu hẹp biến động', weight: 10, score: null, available: false, evidence: 'DATA_UNAVAILABLE' },
      { key: 'MACRO_ENVIRONMENT', label: 'Macro Environment', labelVi: 'Bối cảnh vĩ mô', weight: 10, score: null, available: false, evidence: 'DATA_UNAVAILABLE' },
      { key: 'VOLUME_CONFIRMATION', label: 'Volume Confirmation', labelVi: 'Xác nhận khối lượng', weight: 5, score: null, available: false, evidence: 'DATA_UNAVAILABLE' },
    ];
    return {
      status: 'DATA_UNAVAILABLE',
      totalScore: null,
      maxObservableWeight: 100,
      observedWeight: 0,
      classification: 'DATA_UNAVAILABLE',
      classificationLabelVi: 'DATA_UNAVAILABLE — Thiếu dữ liệu lịch sử OHLCV (>= 30 nến D1)',
      modelConfidenceScore: null,
      confirmationConditions: ['Cần đồng bộ hoặc import tối thiểu 30–250 nến D1 lịch sử để chấm điểm chu kỳ.'],
      invalidationTriggers: [],
      factors: emptyFactors,
      methodologyNote: METHODOLOGY_NOTE,
    };
  }

  const closes = sortedDaily.map((c) => c.close);
  const lastClose = closes[closes.length - 1];
  const highMax = Math.max(...sortedDaily.map((c) => c.high));
  const pct = inputs.timeframes.MONTHLY.percentile10Y ?? primaryState.percentile10Y ?? computePercentileRank(closes, lastClose);

  // Factor 1: Historical Valuation (15 pts)
  let valuationScore = 3;
  if (pct !== null) {
    if (pct <= 15) valuationScore = 15;
    else if (pct <= 25) valuationScore = 13;
    else if (pct <= 35) valuationScore = 10;
    else if (pct <= 50) valuationScore = 6;
    else if (pct <= 65) valuationScore = 3;
    else valuationScore = 0;
  }
  const f1: BottomFactorScore = {
    key: 'HISTORICAL_VALUATION',
    label: 'Historical Valuation',
    labelVi: 'Định giá lịch sử (Percentile)',
    weight: 15,
    score: pct !== null ? valuationScore : null,
    available: pct !== null,
    evidence: pct !== null
      ? `Giá đang ở bách phân vị ${pct.toFixed(1)}% của chuỗi lịch sử quan sát (${sortedDaily.length} phiên).`
      : 'Không đủ độ dài lịch sử tính bách phân vị.',
  };

  // Factor 2: Long-Term Price Position (15 pts)
  const drawdownFromPeakPct = highMax > 0 ? ((highMax - lastClose) / highMax) * 100 : 0;
  const emaRef = primaryState.ema50 ?? primaryState.ema200;
  let posScore = 2;
  if (drawdownFromPeakPct >= 45 && (emaRef === null || lastClose <= emaRef * 1.03)) posScore = 14;
  else if (drawdownFromPeakPct >= 30 && (emaRef === null || lastClose <= emaRef * 1.05)) posScore = 11;
  else if (drawdownFromPeakPct >= 18) posScore = 7;
  else if (drawdownFromPeakPct >= 10) posScore = 4;
  else posScore = 1;
  // Bonus 1 pt if price closed back above Daily EMA20 from deep drawdown (stabilization, not free-fall)
  if (inputs.timeframes.DAILY.ema20 !== null && lastClose >= inputs.timeframes.DAILY.ema20 && drawdownFromPeakPct >= 25) {
    posScore = Math.min(15, posScore + 1);
  }
  const f2: BottomFactorScore = {
    key: 'LONG_TERM_PRICE_POSITION',
    label: 'Long-Term Price Position',
    labelVi: 'Vị thế giá & Chiết khấu dài hạn',
    weight: 15,
    score: posScore,
    available: true,
    evidence: `Giá chiết khấu -${drawdownFromPeakPct.toFixed(1)}% so với đỉnh chuỗi (${highMax.toFixed(2)}).`,
  };

  // Factor 3: Supply/Demand Reversal (20 pts)
  const hasSd = inputs.supplyDemandBiasScore !== null && inputs.supplyDemandBiasScore !== undefined;
  const sdScore = hasSd
    ? Math.round(((Math.max(-1, Math.min(1, inputs.supplyDemandBiasScore!)) + 1) / 2) * 20)
    : null;
  const f3: BottomFactorScore = {
    key: 'SUPPLY_DEMAND_REVERSAL',
    label: 'Supply/Demand Reversal',
    labelVi: 'Đảo chiều Cung – Cầu vật chất',
    weight: 20,
    score: sdScore,
    available: hasSd,
    evidence: inputs.supplyDemandEvidence ?? 'DATA_UNAVAILABLE — Chưa có dữ liệu Cung–Cầu (EIA/USDA/Fundamental).',
  };

  // Factor 4: Technical Divergence (15 pts)
  const divSource = inputs.weeklyCandles.length >= 40 ? inputs.weeklyCandles : sortedDaily;
  const div = detectBullishRsiDivergence(divSource);
  const f4: BottomFactorScore = {
    key: 'TECHNICAL_DIVERGENCE',
    label: 'Technical Divergence',
    labelVi: 'Phân kỳ kỹ thuật (RSI/Đáy giá)',
    weight: 15,
    score: Math.round(div.strength * 15),
    available: true,
    evidence: div.evidence,
  };

  // Factor 5: Speculative Positioning / COT (10 pts)
  const hasCot = inputs.cotIndex !== null && inputs.cotIndex !== undefined;
  let cotScore: number | null = null;
  if (hasCot) {
    const ci = inputs.cotIndex!;
    if (ci <= 15) cotScore = 10;
    else if (ci <= 25) cotScore = 8;
    else if (ci <= 40) cotScore = 5;
    else if (ci <= 65) cotScore = 2;
    else cotScore = 0;
  }
  const f5: BottomFactorScore = {
    key: 'SPECULATIVE_POSITIONING',
    label: 'Speculative Positioning (COT)',
    labelVi: 'Vị thế đầu cơ (CFTC COT Index)',
    weight: 10,
    score: cotScore,
    available: hasCot,
    evidence: inputs.cotNote ?? 'DATA_UNAVAILABLE — Chưa đồng bộ dữ liệu CFTC COT.',
  };

  // Factor 6: Volatility Contraction (10 pts)
  const bbRatio = inputs.timeframes.DAILY.bbWidthRatio ?? primaryState.bbWidthRatio;
  let volaScore: number | null = null;
  if (bbRatio !== null) {
    if (bbRatio <= 0.65) volaScore = 10;
    else if (bbRatio <= 0.85) volaScore = 7;
    else if (bbRatio <= 1.1) volaScore = 4;
    else volaScore = 1;
  }
  const f6: BottomFactorScore = {
    key: 'VOLATILITY_CONTRACTION',
    label: 'Volatility Contraction',
    labelVi: 'Nén biến động (BB Squeeze)',
    weight: 10,
    score: volaScore,
    available: volaScore !== null,
    evidence: bbRatio !== null
      ? `Tỷ lệ độ rộng Bollinger hiện tại / TB60 = ${bbRatio.toFixed(2)}x.`
      : 'Chưa đủ dữ liệu tính dải Bollinger 60 phiên.',
  };

  // Factor 7: Macro Environment (10 pts)
  const hasMacro = inputs.macroScoreNormalized !== null && inputs.macroScoreNormalized !== undefined;
  const macroScore = hasMacro
    ? Math.round(((Math.max(-1, Math.min(1, inputs.macroScoreNormalized!)) + 1) / 2) * 10)
    : null;
  const f7: BottomFactorScore = {
    key: 'MACRO_ENVIRONMENT',
    label: 'Macro Environment',
    labelVi: 'Môi trường vĩ mô (DXY / Lãi suất)',
    weight: 10,
    score: macroScore,
    available: hasMacro,
    evidence: inputs.macroEvidence ?? 'DATA_UNAVAILABLE — Chưa cấu hình dữ liệu vĩ mô (FRED / Fundamental).',
  };

  // Factor 8: Volume Confirmation (5 pts)
  const recent20 = sortedDaily.slice(-20);
  const volBars = recent20.filter((c) => c.volume !== null && c.volume > 0);
  let volumeScore: number | null = null;
  let volumeEvidence = 'DATA_UNAVAILABLE — Nguồn dữ liệu không cung cấp khối lượng giao dịch.';
  if (volBars.length >= 12) {
    let upVol = 0;
    let downVol = 0;
    for (const c of volBars) {
      if (c.close >= c.open) upVol += c.volume!;
      else downVol += c.volume!;
    }
    const ratio = downVol > 0 ? upVol / downVol : 1.5;
    if (ratio >= 1.35) volumeScore = 5;
    else if (ratio >= 1.1) volumeScore = 4;
    else if (ratio >= 0.95) volumeScore = 2;
    else volumeScore = 1;
    volumeEvidence = `Tỷ lệ khối lượng phiên tăng / giảm (20 phiên) = ${ratio.toFixed(2)}x.`;
  }
  const f8: BottomFactorScore = {
    key: 'VOLUME_CONFIRMATION',
    label: 'Volume Confirmation',
    labelVi: 'Xác nhận dòng tiền (Khối lượng)',
    weight: 5,
    score: volumeScore,
    available: volumeScore !== null,
    evidence: volumeEvidence,
  };

  const factors = [f1, f2, f3, f4, f5, f6, f7, f8];
  const observedFactors = factors.filter((f) => f.available && f.score !== null);
  const observedWeight = observedFactors.reduce((acc, f) => acc + f.weight, 0);
  const rawObservedScore = observedFactors.reduce((acc, f) => acc + (f.score ?? 0), 0);

  // Scale honestly to 0-100 across observed factors ONLY if >= 40 weight observed; never inflate missing weights silently
  const normalizedScore =
    observedWeight >= 40
      ? Math.round((rawObservedScore / observedWeight) * 100)
      : rawObservedScore;

  // Guardrail: never label as Extreme/Strong Bottom if asset is near multi-year highs (percentile > 70)
  const guardedScore =
    pct !== null && pct >= 70 ? Math.min(normalizedScore, 35) : normalizedScore;

  const { classification, labelVi } = classifyBottomScore(guardedScore);

  const coverageRatio = observedWeight / 100;
  const confirmationHitCount = [
    pct !== null && pct <= 30,
    div.detected,
    hasCot && (inputs.cotIndex ?? 100) <= 25,
    bbRatio !== null && bbRatio <= 0.85,
    inputs.timeframes.DAILY.ema20 !== null && lastClose >= inputs.timeframes.DAILY.ema20,
  ].filter(Boolean).length;
  const modelConfidenceScore = Math.round(
    Math.min(95, Math.max(15, coverageRatio * 55 + (confirmationHitCount / 5) * 45))
  );

  const confirmationConditions: string[] = [];
  if (inputs.timeframes.DAILY.ema20 !== null && lastClose < inputs.timeframes.DAILY.ema20) {
    confirmationConditions.push(`Giá đóng cửa D1 vượt lên trên EMA20 (${inputs.timeframes.DAILY.ema20.toFixed(2)}).`);
  } else {
    confirmationConditions.push('Giữ vững cấu trúc đáy sau cao hơn đáy trước trên khung D1/W1.');
  }
  if (!div.detected) {
    confirmationConditions.push('Xuất hiện phân kỳ dương RSI hoặc MACD Histogram cắt lên trên 0.');
  }
  if (!hasSd) {
    confirmationConditions.push('Bổ sung báo cáo Cung–Cầu (WASDE/EIA) để xác nhận điểm uốn tồn kho.');
  }
  if (!hasCot) {
    confirmationConditions.push('Đồng bộ CFTC COT để xác nhận vị thế đầu cơ đã giải chấp cực đoan.');
  }

  const recentLow = Math.min(...sortedDaily.slice(-30).map((c) => c.low));
  const invalidationTriggers = [
    `Giá đóng cửa tuần phá vỡ đáy 30 phiên (${recentLow.toFixed(2)}) kèm khối lượng bán tăng mạnh.`,
    'Tồn kho thực tế tăng mạnh bất thường hoặc mất cấu trúc phân kỳ tăng.',
  ];

  return {
    status: observedWeight < 100 ? 'PARTIAL' : 'COMPUTED',
    totalScore: guardedScore,
    maxObservableWeight: 100,
    observedWeight,
    classification,
    classificationLabelVi: labelVi,
    modelConfidenceScore,
    confirmationConditions,
    invalidationTriggers,
    factors,
    methodologyNote: METHODOLOGY_NOTE,
  };
}

export function buildDualTradeSetupPlans(params: {
  instrument: InstrumentDefinition;
  dailyCandles: MarketCandle[];
  timeframes: Record<CycleTimeframeKey, MultiTimeframeCycleState>;
  bottomDetection: BottomDetectionResult;
}): {
  longTermCycle: TradeSetupPlan;
  swingTrading: TradeSetupPlan;
} {
  const sorted = [...params.dailyCandles]
    .filter((c) => c.isComplete && Number.isFinite(c.close) && c.close > 0)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  if (sorted.length < 30 || params.bottomDetection.totalScore === null) {
    const unavailablePlan = (
      horizonType: TradeSetupPlan['horizonType'],
      title: string
    ): TradeSetupPlan => ({
      horizonType,
      title,
      status: 'DATA_UNAVAILABLE',
      direction: 'UNAVAILABLE',
      autoExecutionAllowed: false,
      entryZone: { low: null, high: null, note: 'DATA_UNAVAILABLE' },
      stopLoss: null,
      takeProfits: [],
      riskRewardRatio: null,
      positionSizingGuidance: 'DATA_UNAVAILABLE — Chưa đủ nến OHLCV và dữ liệu ATR để thiết lập kế hoạch giao dịch.',
      confirmationRequired: ['Cần tối thiểu 30 nến D1 hợp lệ.'],
      invalidationCondition: 'N/A',
    });
    return {
      longTermCycle: unavailablePlan('LONG_TERM_CYCLE', 'A. Đầu tư Chu kỳ Dài hạn (Cycle Investing)'),
      swingTrading: unavailablePlan('SWING_TRADING', 'B. Giao dịch Swing (Swing Trading)'),
    };
  }

  const atrSeries = calculateATR(sorted, 14);
  const atr = atrSeries[atrSeries.length - 1] ?? sorted[sorted.length - 1].close * 0.02;
  const lastClose = sorted[sorted.length - 1].close;
  const swingLow30 = Math.min(...sorted.slice(-30).map((c) => c.low));
  const swingHigh60 = Math.max(...sorted.slice(-60).map((c) => c.high));
  const score = params.bottomDetection.totalScore;
  const phase = params.timeframes.WEEKLY.available
    ? params.timeframes.WEEKLY.phase
    : params.timeframes.DAILY.phase;

  // Plan A: Long-Term Cycle Investing
  let longStatus: TradeSetupPlan['status'] = 'WATCH_ONLY';
  let longDir: TradeSetupPlan['direction'] = 'WAIT_CONFIRMATION';
  if (score >= 70 && (phase === 'PHASE_1_ACCUMULATION' || phase === 'PHASE_2_EARLY_RECOVERY')) {
    longStatus = 'ACTIVE_CANDIDATE';
    longDir = 'LONG_ACCUMULATE';
  } else if (phase === 'PHASE_3_MARKUP') {
    longStatus = 'WATCH_ONLY';
    longDir = 'LONG_BREAKOUT';
  } else if (phase === 'PHASE_4_DISTRIBUTION') {
    longStatus = 'NO_SETUP';
    longDir = 'AVOID_OR_SHORT';
  }

  const ltEntryLow = Number(Math.max(swingLow30, lastClose - 0.8 * atr).toFixed(4));
  const ltEntryHigh = Number((lastClose + 0.35 * atr).toFixed(4));
  const ltMid = (ltEntryLow + ltEntryHigh) / 2;
  const ltSl = Number(Math.max(0.01, swingLow30 - 1.5 * atr).toFixed(4));
  const ltRisk = Math.max(1e-6, ltMid - ltSl);
  const ltTp1 = Number(Math.max(swingHigh60, ltMid + 2.0 * ltRisk).toFixed(4));
  const ltTp2 = Number((ltMid + 3.5 * ltRisk).toFixed(4));
  const ltRR = Number(((ltTp1 - ltMid) / ltRisk).toFixed(2));

  const longTermCycle: TradeSetupPlan = {
    horizonType: 'LONG_TERM_CYCLE',
    title: 'A. Đầu tư Chu kỳ Dài hạn (Long-Term Cycle Investing)',
    status: longStatus,
    direction: longDir,
    autoExecutionAllowed: false,
    entryZone: {
      low: ltEntryLow,
      high: ltEntryHigh,
      note: 'Vùng giải ngân từng phần quanh hỗ trợ cấu trúc tuần/tháng (không mua đuổi).',
    },
    stopLoss: ltSl,
    takeProfits: [ltTp1, ltTp2],
    riskRewardRatio: ltRR,
    positionSizingGuidance:
      params.instrument.isMvxListed
        ? `Khuyến nghị chia 2–3 đợt giải ngân trên MXV (${params.instrument.mxvMapping?.mxvSymbol ?? params.instrument.exchangeSymbol}), tổng rủi ro <= 1.0%–1.5% NAV.`
        : 'Chia 2–3 đợt vị thế trung dài hạn, tổng rủi ro tối đa 1.0%–1.5% NAV.',
    confirmationRequired: params.bottomDetection.confirmationConditions,
    invalidationCondition: `Đóng cửa tuần dưới ${ltSl} (thủng đáy chu kỳ 30 phiên - 1.5×ATR).`,
  };

  // Plan B: Swing Trading (Daily / H4)
  const dEma20 = params.timeframes.DAILY.ema20 ?? lastClose;
  const swEntryLow = Number(Math.min(dEma20, lastClose - 0.5 * atr).toFixed(4));
  const swEntryHigh = Number((lastClose + 0.25 * atr).toFixed(4));
  const swMid = (swEntryLow + swEntryHigh) / 2;
  const swSl = Number(Math.max(0.01, swEntryLow - 1.4 * atr).toFixed(4));
  const swRisk = Math.max(1e-6, swMid - swSl);
  const swTp1 = Number((swMid + 1.8 * swRisk).toFixed(4));
  const swTp2 = Number((swMid + 2.8 * swRisk).toFixed(4));
  const swRR = Number(((swTp1 - swMid) / swRisk).toFixed(2));

  let swStatus: TradeSetupPlan['status'] = 'WATCH_ONLY';
  let swDir: TradeSetupPlan['direction'] = 'WAIT_CONFIRMATION';
  if (phase === 'PHASE_2_EARLY_RECOVERY' || phase === 'PHASE_3_MARKUP') {
    swStatus = lastClose >= dEma20 ? 'ACTIVE_CANDIDATE' : 'WATCH_ONLY';
    swDir = 'LONG_BREAKOUT';
  } else if (phase === 'PHASE_4_DISTRIBUTION') {
    swStatus = 'NO_SETUP';
    swDir = 'AVOID_OR_SHORT';
  }

  const swingTrading: TradeSetupPlan = {
    horizonType: 'SWING_TRADING',
    title: 'B. Giao dịch Swing (Daily / H4 Timing)',
    status: swStatus,
    direction: swDir,
    autoExecutionAllowed: false,
    entryZone: {
      low: swEntryLow,
      high: swEntryHigh,
      note: 'Vùng pullback kiểm định EMA20 D1 hoặc điểm phá vỡ nền tích lũy H4.',
    },
    stopLoss: swSl,
    takeProfits: [swTp1, swTp2],
    riskRewardRatio: swRR,
    positionSizingGuidance:
      'Sử dụng Risk Management Calculator để tính chính xác số lot theo kích thước tick MXV/Quốc tế (rủi ro <= 1% tài khoản).',
    confirmationRequired: [
      `Giá D1 giữ vững trên vùng ${swEntryLow} và không xuất hiện nến đảo chiều khối lượng lớn.`,
      'Kiểm tra lịch công bố dữ liệu USDA / EIA / FOMC theo giờ Việt Nam trước khi vào lệnh.',
    ],
    invalidationCondition: `Đóng cửa D1 dưới ${swSl}.`,
  };

  return { longTermCycle, swingTrading };
}
