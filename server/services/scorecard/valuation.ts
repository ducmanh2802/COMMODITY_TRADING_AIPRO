/**
 * Valuation context: DESCRIPTIVE statistics of where today's price sits versus its own history
 * (percentile in 52w / 5y range, distance from the 200-day average, z-score vs 1y mean, same-month average of
 * past years). Never a price target and never a buy/sell cue. Insufficient history → UNAVAILABLE.
 */
import type { ScorecardDimension, ScorecardLevel } from '../../../src/shared/types/scorecard.ts';
import type { BriefText } from '../../../src/shared/types/brief.ts';
import type { MarketCandle } from '../../../src/shared/types/market.ts';
import { calculateATR } from '../../engines/technicalEngine.ts';

const t = (vi: string, en: string): BriefText => ({ vi, en });
const sgn = (x: number, d = 1) => `${x >= 0 ? '+' : ''}${x.toFixed(d)}`;

export const MIN_VALUATION_BARS = 200;

export interface ValuationStats {
  bars: number;
  close: number;
  /** Share (0-100) of closes in the window that are <= today's close. */
  pct52w: number;
  high52w: number;
  low52w: number;
  pct5y: number | null;
  ma200DistPct: number | null;
  ma200DistAtr: number | null;
  z1y: number | null;
  monthVsPast: { month: number; years: number; pastAvg: number; diffPct: number } | null;
}

function percentile(window: number[], x: number): number {
  return (window.filter((v) => v <= x).length / window.length) * 100;
}

/** Pure; returns null when there are fewer than MIN_VALUATION_BARS complete daily bars. */
export function computeValuationStats(candles: MarketCandle[]): ValuationStats | null {
  const bars = candles.filter((c) => c.isComplete !== false);
  const n = bars.length;
  if (n < MIN_VALUATION_BARS) return null;
  const closes = bars.map((b) => b.close);
  const close = closes[n - 1];
  const w52 = closes.slice(-252);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  let pct5y: number | null = null;
  if (n >= 1000) pct5y = percentile(closes.slice(-1260), close);

  let ma200DistPct: number | null = null;
  let ma200DistAtr: number | null = null;
  const ma200 = mean(closes.slice(-200));
  if (ma200 > 0) {
    ma200DistPct = (close / ma200 - 1) * 100;
    const atr = calculateATR(bars, 14)[n - 1];
    if (atr !== null && atr > 0) ma200DistAtr = (close - ma200) / atr;
  }

  let z1y: number | null = null;
  const m = mean(w52);
  const sd = Math.sqrt(w52.reduce((a, b) => a + (b - m) ** 2, 0) / w52.length);
  if (sd > 0) z1y = (close - m) / sd;

  let monthVsPast: ValuationStats['monthVsPast'] = null;
  const first = Date.parse(bars[0].timestamp);
  const lastTs = Date.parse(bars[n - 1].timestamp);
  if ((lastTs - first) / (365.25 * 86_400_000) >= 3) {
    const lastD = new Date(lastTs);
    const month = lastD.getUTCMonth();
    const year = lastD.getUTCFullYear();
    const byYear = new Map<number, number[]>();
    for (const b of bars) {
      const d = new Date(b.timestamp);
      if (d.getUTCMonth() === month && d.getUTCFullYear() < year) {
        const arr = byYear.get(d.getUTCFullYear()) ?? [];
        arr.push(b.close);
        byYear.set(d.getUTCFullYear(), arr);
      }
    }
    if (byYear.size >= 3) {
      const pastAvg = mean([...byYear.values()].map(mean));
      if (pastAvg > 0) monthVsPast = { month: month + 1, years: byYear.size, pastAvg, diffPct: (close / pastAvg - 1) * 100 };
    }
  }

  return {
    bars: n,
    close,
    pct52w: percentile(w52, close),
    high52w: Math.max(...bars.slice(-252).map((b) => b.high)),
    low52w: Math.min(...bars.slice(-252).map((b) => b.low)),
    pct5y,
    ma200DistPct,
    ma200DistAtr,
    z1y,
    monthVsPast,
  };
}

export function zLabel(z: number): BriefText {
  const s = sgn(z);
  if (z >= 2) return t(`Cao hơn nhiều so với trung bình 1 năm (z=${s})`, `Far above the 1-year average (z=${s})`);
  if (z >= 1) return t(`Cao hơn trung bình 1 năm (z=${s})`, `Above the 1-year average (z=${s})`);
  if (z <= -2) return t(`Thấp hơn nhiều so với trung bình 1 năm (z=${s})`, `Far below the 1-year average (z=${s})`);
  if (z <= -1) return t(`Thấp hơn trung bình 1 năm (z=${s})`, `Below the 1-year average (z=${s})`);
  return t(`Gần mức trung bình 1 năm (z=${s})`, `Near the 1-year average (z=${s})`);
}

export function scoreValuation(stats: ValuationStats | null, source: string, asOf: string | null): ScorecardDimension {
  if (!stats) {
    return {
      id: 'valuation',
      status: 'UNAVAILABLE',
      level: null,
      label: null,
      score: null,
      metrics: [],
      explanation: t(
        `Chưa đủ lịch sử giá (cần ít nhất ${MIN_VALUATION_BARS} phiên) để so vị trí giá với quá khứ.`,
        `Not enough price history (at least ${MIN_VALUATION_BARS} sessions) to compare the price with its past.`
      ),
      source,
      asOf: null,
    };
  }
  const p = stats.pct52w;
  let level: ScorecardLevel;
  let label: BriefText;
  if (p >= 80) [level, label] = ['RANGE_HIGH', t('Gần đỉnh 52 tuần', 'Near 52-week high')];
  else if (p <= 20) [level, label] = ['RANGE_LOW', t('Gần đáy 52 tuần', 'Near 52-week low')];
  else [level, label] = ['RANGE_MID', t('Vùng giữa', 'Mid-range')];

  const vi: string[] = [`Giá nằm ở phân vị ${p.toFixed(0)}% trong biên độ 52 tuần (${stats.low52w}–${stats.high52w})`];
  const en: string[] = [`Price sits at the ${p.toFixed(0)}th percentile of its 52-week range (${stats.low52w}–${stats.high52w})`];
  if (stats.pct5y !== null) {
    vi.push(`phân vị ${stats.pct5y.toFixed(0)}% trong 5 năm`);
    en.push(`${stats.pct5y.toFixed(0)}th percentile over 5 years`);
  }
  if (stats.ma200DistPct !== null) {
    const atrVi = stats.ma200DistAtr !== null ? ` (${sgn(stats.ma200DistAtr)} ATR)` : '';
    vi.push(`cách MA200 ${sgn(stats.ma200DistPct)}%${atrVi}`);
    en.push(`${sgn(stats.ma200DistPct)}%${atrVi} from the 200-day average`);
  }
  if (stats.z1y !== null) {
    const z = zLabel(stats.z1y);
    vi.push(z.vi.charAt(0).toLowerCase() + z.vi.slice(1));
    en.push(z.en.charAt(0).toLowerCase() + z.en.slice(1));
  }
  if (stats.monthVsPast) {
    const mv = stats.monthVsPast;
    vi.push(`so với trung bình tháng ${mv.month} của ${mv.years} năm trước: ${sgn(mv.diffPct)}%`);
    en.push(`vs the month-${mv.month} average of ${mv.years} past years: ${sgn(mv.diffPct)}%`);
  }
  const r = (x: number | null, d = 2) => (x === null ? null : Number(x.toFixed(d)));
  return {
    id: 'valuation',
    status: 'OK',
    level,
    label,
    score: Math.round(p),
    metrics: [
      { key: 'pct52w', value: r(p, 1), unit: '%' },
      { key: 'pct5y', value: r(stats.pct5y, 1), unit: '%' },
      { key: 'high52w', value: stats.high52w },
      { key: 'low52w', value: stats.low52w },
      { key: 'ma200DistPct', value: r(stats.ma200DistPct), unit: '%' },
      { key: 'ma200DistAtr', value: r(stats.ma200DistAtr), unit: 'ATR' },
      { key: 'z1y', value: r(stats.z1y) },
      { key: 'monthVsPastPct', value: r(stats.monthVsPast?.diffPct ?? null), unit: '%' },
    ],
    explanation: t(
      `${vi.join('; ')}. Chỉ mô tả vị trí so với lịch sử, không phải dự báo hay mức giá kỳ vọng.`,
      `${en.join('; ')}. This only describes position versus history; it is not a forecast or expected price.`
    ),
    source,
    asOf,
  };
}
