/**
 * Pure, deterministic scoring/labelling for the instrument scorecard. Inputs are plain numbers already
 * computed by existing engines; every function returns an UNAVAILABLE dimension when its inputs are
 * missing (never an estimate). Labels describe the data, they are not trading signals.
 */
import type {
  ScorecardClarityLevel,
  ScorecardDataQualityLevel,
  ScorecardDimension,
  ScorecardDimensionId,
  ScorecardLevel,
  ScorecardRiskLevel,
} from '../../../src/shared/types/scorecard.ts';
import type { BriefText } from '../../../src/shared/types/brief.ts';

const t = (vi: string, en: string): BriefText => ({ vi, en });
const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const num = (x: number, d = 1) => x.toFixed(d);

export const SCORECARD_DISCLAIMER: BriefText = t(
  'Công cụ nghiên cứu, không phải khuyến nghị mua/bán. Nhãn chỉ mô tả dữ liệu quá khứ, không dự báo giá.',
  'Research tool, not buy/sell advice. Labels only describe past data and do not forecast prices.'
);

function unavailable(id: ScorecardDimensionId, reason: BriefText, source = 'NONE'): ScorecardDimension {
  return { id, status: 'UNAVAILABLE', level: null, label: null, score: null, metrics: [], explanation: reason, source, asOf: null };
}

type Pick2 = readonly [ScorecardLevel, BriefText];

// ---------------------------------------------------------------- trend
export interface TrendInput {
  close: number | null;
  sma50: number | null;
  sma200: number | null;
  /** SMA50 value ~20 bars ago (slope). */
  sma50Prev: number | null;
  source: string;
  asOf: string | null;
}

/** Each available component votes +1/-1; the average decides the label. Needs close and SMA50. */
export function scoreTrend(i: TrendInput): ScorecardDimension {
  if (i.close === null || i.sma50 === null) {
    return unavailable(
      'trend',
      t('Chưa đủ lịch sử giá (cần ít nhất 50 phiên) để đánh giá xu hướng.', 'Not enough price history (need at least 50 sessions) to judge the trend.'),
      i.source
    );
  }
  const votes: number[] = [i.close > i.sma50 ? 1 : -1];
  if (i.sma200 !== null) votes.push(i.sma50 > i.sma200 ? 1 : -1);
  if (i.sma50Prev !== null) votes.push(i.sma50 > i.sma50Prev ? 1 : -1);
  const avg = votes.reduce((a, b) => a + b, 0) / votes.length;
  const dev = i.close / i.sma50 - 1;
  const nearMa = Math.abs(dev) < 0.01;
  let pick: Pick2;
  if (avg === 1) pick = ['STRONG_UP', t('Tăng mạnh', 'Strong uptrend')];
  else if (avg === -1) pick = ['STRONG_DOWN', t('Giảm mạnh', 'Strong downtrend')];
  else if (avg === 0 || nearMa) pick = ['SIDEWAYS', t('Đi ngang', 'Sideways')];
  else if (avg > 0) pick = ['UP', t('Tăng', 'Uptrend')];
  else pick = ['DOWN', t('Giảm', 'Downtrend')];
  const [level, label] = pick;
  const parts: string[] = [`giá ${dev >= 0 ? 'trên' : 'dưới'} MA50 ${pct(Math.abs(dev))}`];
  const partsEn: string[] = [`price ${dev >= 0 ? 'above' : 'below'} the 50-day average by ${pct(Math.abs(dev))}`];
  if (i.sma200 !== null) {
    parts.push(`MA50 ${i.sma50 > i.sma200 ? 'trên' : 'dưới'} MA200`);
    partsEn.push(`50-day average ${i.sma50 > i.sma200 ? 'above' : 'below'} the 200-day`);
  }
  return {
    id: 'trend',
    status: 'OK',
    level,
    label,
    score: Math.round(((avg + 1) / 2) * 100),
    metrics: [
      { key: 'close', value: i.close },
      { key: 'sma50', value: i.sma50 },
      { key: 'sma200', value: i.sma200 },
      { key: 'votes', value: votes.join(',') },
    ],
    explanation: t(
      `Xu hướng "${label.vi}": ${parts.join('; ')}${i.sma200 === null ? ' (chưa đủ 200 phiên để dùng MA200)' : ''}.`,
      `Trend "${label.en}": ${partsEn.join('; ')}${i.sma200 === null ? ' (fewer than 200 sessions, 200-day average not used)' : ''}.`
    ),
    source: i.source,
    asOf: i.asOf,
  };
}

// ---------------------------------------------------------------- momentum
export interface MomentumInput {
  rsi14: number | null;
  ret20: number | null;
  source: string;
  asOf: string | null;
}

export function scoreMomentum(i: MomentumInput): ScorecardDimension {
  if (i.rsi14 === null) {
    return unavailable(
      'momentum',
      t('Chưa đủ dữ liệu (cần ít nhất 15 phiên) để tính RSI.', 'Not enough data (need at least 15 sessions) to compute RSI.'),
      i.source
    );
  }
  const r = i.rsi14;
  let pick: Pick2;
  if (r >= 70) pick = ['VERY_STRONG', t('Rất mạnh (RSI cao)', 'Very strong (high RSI)')];
  else if (r >= 55) pick = ['STRONG', t('Mạnh', 'Strong')];
  else if (r > 45) pick = ['NEUTRAL', t('Trung tính', 'Neutral')];
  else if (r > 30) pick = ['WEAK', t('Yếu', 'Weak')];
  else pick = ['VERY_WEAK', t('Rất yếu (RSI thấp)', 'Very weak (low RSI)')];
  const [level, label] = pick;
  const ret = i.ret20 !== null ? ` Lợi suất 20 phiên: ${pct(i.ret20)}.` : '';
  const retEn = i.ret20 !== null ? ` 20-session return: ${pct(i.ret20)}.` : '';
  return {
    id: 'momentum',
    status: 'OK',
    level,
    label,
    score: Math.round(r),
    metrics: [
      { key: 'rsi14', value: Number(num(r)) },
      { key: 'ret20', value: i.ret20 },
    ],
    explanation: t(
      `RSI 14 phiên = ${num(r)} nên động lượng "${label.vi}".${ret} RSI chỉ đo tốc độ giá gần đây, không báo trước giá.`,
      `RSI(14) = ${num(r)}, so momentum is "${label.en}".${retEn} RSI only measures recent price speed, it does not predict price.`
    ),
    source: i.source,
    asOf: i.asOf,
  };
}

// ---------------------------------------------------------------- volatility
export interface VolatilityInput {
  /** Current 20-day annualised realised vol (fraction, e.g. 0.25). */
  vol20: number | null;
  /** Rolling 20d vol values over the last year (>= 60 needed). */
  volHistory: number[];
  source: string;
  asOf: string | null;
}

/** Percentile rank of x within xs (share of values <= x), 0-100. */
export function percentileRank(xs: number[], x: number): number {
  if (xs.length === 0) return NaN;
  return (xs.filter((v) => v <= x).length / xs.length) * 100;
}

export function scoreVolatility(i: VolatilityInput): ScorecardDimension {
  if (i.vol20 === null || i.volHistory.length < 60) {
    return unavailable(
      'volatility',
      t('Chưa đủ lịch sử (cần ~1 năm) để so biến động hiện tại với chính nó.', 'Not enough history (about 1 year) to compare current volatility with its own past.'),
      i.source
    );
  }
  const p = percentileRank(i.volHistory, i.vol20);
  let pick: Pick2;
  if (p >= 67) pick = ['HIGH', t('Cao so với 1 năm', 'High vs 1 year')];
  else if (p >= 33) pick = ['MEDIUM', t('Trung bình so với 1 năm', 'Medium vs 1 year')];
  else pick = ['LOW', t('Thấp so với 1 năm', 'Low vs 1 year')];
  const [level, label] = pick;
  return {
    id: 'volatility',
    status: 'OK',
    level,
    label,
    score: Math.round(p),
    metrics: [
      { key: 'vol20', value: Number((i.vol20 * 100).toFixed(1)), unit: '% annualised' },
      { key: 'percentile', value: Math.round(p), unit: '%' },
      { key: 'samples', value: i.volHistory.length },
    ],
    explanation: t(
      `Biến động 20 phiên quy năm ${pct(i.vol20)}, cao hơn khoảng ${Math.round(p)}% số ngày trong ~1 năm qua: mức "${label.vi}".`,
      `20-session annualised volatility is ${pct(i.vol20)}, above about ${Math.round(p)}% of days in the past ~year: "${label.en}".`
    ),
    source: i.source,
    asOf: i.asOf,
  };
}

// ---------------------------------------------------------------- drawdown
export interface DrawdownInput {
  close: number | null;
  high52w: number | null;
  bars: number;
  source: string;
  asOf: string | null;
}

export function scoreDrawdown(i: DrawdownInput): ScorecardDimension {
  if (i.close === null || i.high52w === null || i.high52w <= 0 || i.bars < 120) {
    return unavailable(
      'drawdown',
      t('Chưa đủ lịch sử (cần ít nhất ~6 tháng) để tính mức giảm từ đỉnh 52 tuần.', 'Not enough history (about 6 months) to compute the drop from the 52-week high.'),
      i.source
    );
  }
  const dd = Math.min(0, i.close / i.high52w - 1);
  const a = Math.abs(dd);
  let pick: Pick2;
  if (a < 0.05) pick = ['NEAR_HIGH', t('Gần đỉnh 52 tuần', 'Near 52-week high')];
  else if (a < 0.15) pick = ['MILD', t('Thấp hơn đỉnh nhẹ', 'Mildly below high')];
  else if (a < 0.3) pick = ['DEEP', t('Thấp hơn đỉnh nhiều', 'Well below high')];
  else pick = ['VERY_DEEP', t('Thấp hơn đỉnh rất sâu', 'Far below high')];
  const [level, label] = pick;
  const span = i.bars >= 250 ? '52 tuần' : `${i.bars} phiên`;
  const spanEn = i.bars >= 250 ? '52-week' : `${i.bars}-session`;
  return {
    id: 'drawdown',
    status: 'OK',
    level,
    label,
    score: Math.round(Math.min(100, (a / 0.4) * 100)),
    metrics: [
      { key: 'drawdownPct', value: Number((dd * 100).toFixed(1)), unit: '%' },
      { key: 'high52w', value: i.high52w },
      { key: 'close', value: i.close },
    ],
    explanation: t(`Giá đang thấp hơn đỉnh ${span} ${pct(a)}: "${label.vi}".`, `Price is ${pct(a)} below the ${spanEn} high: "${label.en}".`),
    source: i.source,
    asOf: i.asOf,
  };
}

// ---------------------------------------------------------------- COT
export interface CotScoreInput {
  available: boolean;
  reason: BriefText | null;
  cotIndex: number | null;
  cotIndexWeeks: number | null;
  mmNetPctOi: number | null;
  reportDate: string | null;
  stale: boolean;
  source: string;
}

export function scoreCot(i: CotScoreInput): ScorecardDimension {
  if (!i.available || i.cotIndex === null) {
    return unavailable('cot', i.reason ?? t('Chưa có chỉ số COT cho mã này.', 'No COT index for this instrument.'), i.source);
  }
  const x = i.cotIndex;
  let pick: Pick2;
  if (x >= 80) pick = ['HIGH_VS_HISTORY', t('Quỹ: vị thế ròng ở vùng cao lịch sử', 'Funds: net position high vs history')];
  else if (x <= 20) pick = ['LOW_VS_HISTORY', t('Quỹ: vị thế ròng ở vùng thấp lịch sử', 'Funds: net position low vs history')];
  else pick = ['MID_VS_HISTORY', t('Quỹ: vị thế ròng ở mức giữa', 'Funds: net position mid-range')];
  const [level, label] = pick;
  const stale = i.stale ? ' Báo cáo đã cũ hơn 17 ngày.' : '';
  const staleEn = i.stale ? ' The report is older than 17 days.' : '';
  return {
    id: 'cot',
    status: 'OK',
    level,
    label,
    score: Math.round(x),
    metrics: [
      { key: 'cotIndex', value: Number(num(x)) },
      { key: 'weeks', value: i.cotIndexWeeks },
      { key: 'mmNetPctOi', value: i.mmNetPctOi },
    ],
    explanation: t(
      `Chỉ số COT ${num(x, 0)}/100 (so với ${i.cotIndexWeeks ?? '?'} tuần gần nhất, báo cáo ${i.reportDate ?? '?'}).${stale} Đây là vị thế đã xảy ra, không phải dự báo.`,
      `COT index ${num(x, 0)}/100 (vs the last ${i.cotIndexWeeks ?? '?'} weeks, report ${i.reportDate ?? '?'}).${staleEn} It describes existing positioning, not a forecast.`
    ),
    source: i.source,
    asOf: i.reportDate,
  };
}

// ---------------------------------------------------------------- seasonality
export interface SeasonInput {
  ok: boolean;
  yearsCovered: number;
  month: number;
  count: number;
  mean: number | null;
  /** Share of years with a positive month, fraction (0-1) or percent (0-100). */
  pctPositive: number | null;
  source: string;
  asOf: string | null;
}

export function scoreSeasonality(i: SeasonInput): ScorecardDimension {
  if (!i.ok || i.yearsCovered < 3 || i.count < 3 || i.pctPositive === null || i.mean === null) {
    return unavailable('seasonality', t('Chưa đủ lịch sử (cần ít nhất 3 năm) để xem mùa vụ.', 'Not enough history (at least 3 years) for seasonality.'), i.source);
  }
  const share = i.pctPositive > 1 ? i.pctPositive / 100 : i.pctPositive;
  let pick: Pick2;
  if (share >= 0.6) pick = ['USUALLY_UP', t('Tháng này thường tăng', 'Usually rises this month')];
  else if (share <= 0.4) pick = ['USUALLY_DOWN', t('Tháng này thường giảm', 'Usually falls this month')];
  else pick = ['MIXED', t('Mùa vụ không rõ', 'No clear seasonal pattern')];
  const [level, label] = pick;
  return {
    id: 'seasonality',
    status: 'OK',
    level,
    label,
    score: Math.round(share * 100),
    metrics: [
      { key: 'years', value: i.yearsCovered },
      { key: 'meanReturn', value: i.mean },
      { key: 'pctPositive', value: Math.round(share * 100), unit: '%' },
    ],
    explanation: t(
      `Tháng ${i.month}: tăng trong ${Math.round(share * 100)}% số năm (${i.count} năm có dữ liệu). Mẫu nhỏ, chỉ mang tính tham khảo.`,
      `Month ${i.month}: rose in ${Math.round(share * 100)}% of years (${i.count} years of data). Small sample, indicative only.`
    ),
    source: i.source,
    asOf: i.asOf,
  };
}

// ---------------------------------------------------------------- overall
export interface OverallTrendClarity {
  score: number | null;
  level: ScorecardClarityLevel | null;
  label: BriefText;
  explanation: BriefText;
}

export function overallTrendClarity(trend: ScorecardDimension, momentum: ScorecardDimension): OverallTrendClarity {
  if (trend.status !== 'OK' || trend.score === null) {
    return {
      score: null,
      level: null,
      label: t('Chưa đủ dữ liệu', 'Insufficient data'),
      explanation: t('Không đủ dữ liệu xu hướng nên không tính độ rõ ràng.', 'Not enough trend data to compute clarity.'),
    };
  }
  const strength = Math.abs(trend.score - 50) / 50; // 0..1
  const trendSign = Math.sign(trend.score - 50);
  let value = strength;
  let withMom = false;
  if (momentum.status === 'OK' && momentum.score !== null && trendSign !== 0) {
    const momSign = momentum.score >= 55 ? 1 : momentum.score <= 45 ? -1 : 0;
    value = 0.7 * strength + 0.3 * (momSign === trendSign ? 1 : 0);
    withMom = true;
  }
  const score = Math.round(value * 100);
  const level: ScorecardClarityLevel = score >= 67 ? 'CLEAR' : score >= 34 ? 'MODERATE' : 'UNCLEAR';
  const label =
    level === 'CLEAR' ? t('Xu hướng rõ', 'Clear trend') : level === 'MODERATE' ? t('Xu hướng vừa phải', 'Moderate trend') : t('Xu hướng mờ', 'Unclear trend');
  return {
    score,
    level,
    label,
    explanation: t(
      `Độ rõ ràng ${score}/100, tính từ mức đồng thuận của các đường trung bình${withMom ? ' và độ phù hợp của động lượng' : ''}. Chỉ đo xu hướng có rõ hay không, không cho biết nên làm gì.`,
      `Clarity ${score}/100, from agreement of the moving averages${withMom ? ' and momentum alignment' : ''}. It only measures how clear the trend is, not what to do.`
    ),
  };
}

export interface OverallVolatilityRisk {
  score: number | null;
  level: ScorecardRiskLevel | null;
  label: BriefText;
  explanation: BriefText;
}

export function overallVolatilityRisk(vol: ScorecardDimension, dd: ScorecardDimension): OverallVolatilityRisk {
  if (vol.status !== 'OK' || vol.score === null) {
    return {
      score: null,
      level: null,
      label: t('Chưa đủ dữ liệu', 'Insufficient data'),
      explanation: t('Không đủ lịch sử biến động nên không tính mức rủi ro biến động.', 'Not enough volatility history to compute the volatility risk.'),
    };
  }
  const ddScore = dd.status === 'OK' && dd.score !== null ? dd.score : null;
  const score = Math.round(ddScore === null ? vol.score : 0.7 * vol.score + 0.3 * ddScore);
  const level: ScorecardRiskLevel = score >= 67 ? 'HIGH' : score >= 33 ? 'MEDIUM' : 'LOW';
  const label =
    level === 'HIGH' ? t('Rủi ro biến động cao', 'High volatility risk') : level === 'MEDIUM' ? t('Rủi ro biến động trung bình', 'Medium volatility risk') : t('Rủi ro biến động thấp', 'Low volatility risk');
  return {
    score,
    level,
    label,
    explanation: t(
      `Mức ${score}/100 từ vị trí biến động hiện tại so với 1 năm${ddScore === null ? '' : ' và độ sâu so với đỉnh 52 tuần'}. Biến động cao nghĩa là giá dao động mạnh, theo cả hai hướng.`,
      `Level ${score}/100 from current volatility vs 1 year${ddScore === null ? '' : ' and depth below the 52-week high'}. High volatility means large price swings in both directions.`
    ),
  };
}

// ---------------------------------------------------------------- data quality
export interface DataQualityInput {
  quotePrice: number | null;
  quoteStatus: string;
  historyBars: number;
}

export function scoreDataQuality(i: DataQualityInput): { level: ScorecardDataQualityLevel; label: BriefText } {
  const hasQuote = i.quotePrice !== null && i.quoteStatus !== 'UNAVAILABLE';
  if (!hasQuote && i.historyBars === 0) return { level: 'UNAVAILABLE', label: t('Chưa có dữ liệu', 'No data') };
  if (i.historyBars < 60) return { level: 'POOR', label: t('Dữ liệu rất ít', 'Very little data') };
  if (!hasQuote || i.quoteStatus === 'STALE' || i.historyBars < 250) return { level: 'LIMITED', label: t('Dữ liệu hạn chế', 'Limited data') };
  return { level: 'GOOD', label: t('Dữ liệu đủ dùng', 'Adequate data') };
}
