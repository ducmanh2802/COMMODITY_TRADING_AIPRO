/**
 * Pure scoring math for "Độ sôi động" (T64). Every signal is a measurable fact about daily bars; the sentences
 * only describe, they never recommend. Weights sum to 100.
 */
import type { MarketCandle } from '../../../src/shared/types/market.ts';
import type { RadarBreakoutKind, RadarSignal, RadarSignalId } from '../../../src/shared/types/radar.ts';
import { calculateATR, calculateEMA, calculateRSI } from '../../engines/technicalEngine.ts';
import { percentileRank, realizedVolSeries } from '../marketPulse/math.ts';

export const MAX_POINTS: Record<RadarSignalId, number> = {
  volume: 20,
  volExpansion: 15,
  breakout: 20,
  atrMove: 15,
  momentum: 10,
  cot: 10,
  event: 5,
  cycle: 5,
};
const LABELS: Record<RadarSignalId, string> = {
  volume: 'Khối lượng',
  volExpansion: 'Biến động nở ra',
  breakout: 'Vượt đỉnh/đáy',
  atrMove: 'Biên độ trong ngày',
  momentum: 'Động lượng (RSI)',
  cot: 'Vị thế COT cực đoan',
  event: 'Báo cáo sắp ra',
  cycle: 'Đổi pha chu kỳ',
};

export const fmtVi = (n: number, d = 1): string => n.toFixed(d).replace('.', ',');
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
/** Linear ramp: 0 at/below `lo`, 1 at/above `hi`. */
export const ramp = (x: number, lo: number, hi: number): number => clamp01((x - lo) / (hi - lo));
const r1 = (x: number): number => Math.round(x * 10) / 10;

export interface BarSeries {
  dates: string[];
  high: number[];
  low: number[];
  close: number[];
  volume: (number | null)[];
  candles: MarketCandle[];
}

/** One bar per UTC date, ascending, complete bars with a positive price only. */
export function toBars(candles: MarketCandle[]): BarSeries {
  const byDate = new Map<string, MarketCandle>();
  for (const c of candles) {
    if (c.isComplete === false || !(c.close > 0) || !(c.high > 0) || !(c.low > 0)) continue;
    byDate.set(c.timestamp.slice(0, 10), c);
  }
  const sorted = [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return {
    dates: sorted.map(([d]) => d),
    high: sorted.map(([, c]) => c.high),
    low: sorted.map(([, c]) => c.low),
    close: sorted.map(([, c]) => c.close),
    volume: sorted.map(([, c]) => (c.volume !== null && c.volume > 0 ? c.volume : null)),
    candles: sorted.map(([, c]) => c),
  };
}

/** Volume of the last bar over the mean of the prior 20 bars (needs >= 10 of those with volume). */
export function volumeRatio(volume: (number | null)[]): number | null {
  const n = volume.length;
  const last = volume[n - 1];
  if (n < 11 || last === null || last === undefined) return null;
  const prior = volume.slice(Math.max(0, n - 21), n - 1).filter((v): v is number => v !== null);
  if (prior.length < 10) return null;
  const mean = prior.reduce((a, b) => a + b, 0) / prior.length;
  return mean > 0 ? last / mean : null;
}

/** Realized vol over 5 days relative to 60 days (ratio only). */
export function volExpansionRatio(close: number[]): number | null {
  if (close.length < 62) return null;
  const a = realizedVolSeries(close, 5)[close.length - 1];
  const b = realizedVolSeries(close, 60)[close.length - 1];
  return a !== null && b !== null && b > 0 ? a / b : null;
}

/** Breakouts of the last close against the highest high / lowest low of the PRIOR N bars. */
export function detectBreakouts(bars: Pick<BarSeries, 'high' | 'low' | 'close'>): RadarBreakoutKind[] {
  const n = bars.close.length;
  const out: RadarBreakoutKind[] = [];
  const last = bars.close[n - 1];
  for (const w of [55, 20] as const) {
    if (n < w + 1) continue;
    const hi = Math.max(...bars.high.slice(n - 1 - w, n - 1));
    const lo = Math.min(...bars.low.slice(n - 1 - w, n - 1));
    if (last > hi) out.push(w === 55 ? 'high55' : 'high20');
    else if (last < lo) out.push(w === 55 ? 'low55' : 'low20');
  }
  return out;
}

/** |close - previous close| in units of ATR(14) measured up to the previous bar. */
function atrMoveToday(bars: Pick<BarSeries, 'close' | 'candles'>): { atr: number | null; moves: number | null } {
  const n = bars.close.length;
  if (n < 16) return { atr: null, moves: null };
  const atrs = calculateATR(bars.candles, 14);
  const atrNow = atrs[n - 1] ?? null;
  const atrPrev = atrs[n - 2] ?? null;
  if (atrPrev === null || atrPrev <= 0) return { atr: atrNow, moves: null };
  return { atr: atrNow, moves: Math.abs(bars.close[n - 1] - bars.close[n - 2]) / atrPrev };
}

export type RsiCross = 'up50' | 'down50' | 'up70' | 'down70' | 'down30' | 'up30' | null;
export function rsiCross(prev: number | null, now: number | null): RsiCross {
  if (prev === null || now === null) return null;
  if (prev < 70 && now >= 70) return 'up70';
  if (prev > 30 && now <= 30) return 'down30';
  if (prev >= 70 && now < 70) return 'down70';
  if (prev <= 30 && now > 30) return 'up30';
  if (prev < 50 && now >= 50) return 'up50';
  if (prev >= 50 && now < 50) return 'down50';
  return null;
}
const CROSS_TEXT: Record<Exclude<RsiCross, null>, { pts: number; text: string }> = {
  up70: { pts: 1, text: 'RSI(14) vừa vượt lên trên 70 (vùng nóng theo chỉ báo)' },
  down30: { pts: 1, text: 'RSI(14) vừa xuống dưới 30 (vùng nguội theo chỉ báo)' },
  down70: { pts: 0.7, text: 'RSI(14) vừa hạ xuống dưới 70 sau khi ở vùng cao' },
  up30: { pts: 0.7, text: 'RSI(14) vừa nhích lên trên 30 sau khi ở vùng thấp' },
  up50: { pts: 0.5, text: 'RSI(14) vừa vượt lên trên mốc 50' },
  down50: { pts: 0.5, text: 'RSI(14) vừa xuống dưới mốc 50' },
};

export interface ScoreInput {
  bars: BarSeries;
  cotIndex: number | null;
  /** Label of a major report (WASDE/EIA) within 3 days for this instrument, or null. */
  eventSoon: string | null;
  phaseNow: string | null;
  phasePrev: string | null;
  phaseLabelNow?: string | null;
}

export interface ScoreResult {
  score: number;
  signals: RadarSignal[];
  breakouts: RadarBreakoutKind[];
  changePct: number | null;
  atr: number | null;
  caveats: string[];
}

function sig(id: RadarSignalId, frac: number, value: number | null, reason: string | null): RadarSignal {
  const max = MAX_POINTS[id];
  const active = frac > 0 && reason !== null;
  return {
    id,
    label: LABELS[id],
    points: active ? r1(max * clamp01(frac)) : 0,
    max,
    active,
    value: value === null ? null : Math.round(value * 100) / 100,
    reason: active ? reason : null,
  };
}

export function scoreInstrument(inp: ScoreInput): ScoreResult {
  const { bars } = inp;
  const n = bars.close.length;
  const caveats: string[] = [];

  const vr = volumeRatio(bars.volume);
  if (vr === null) caveats.push('Không đủ dữ liệu khối lượng (nguồn không cung cấp hoặc thiếu phiên), tín hiệu khối lượng bị bỏ qua.');

  const ve = volExpansionRatio(bars.close);
  if (ve === null) caveats.push('Chưa đủ 62 phiên để so biến động 5 phiên với 60 phiên.');

  const breakouts = detectBreakouts(bars);
  const hasH55 = breakouts.includes('high55');
  const hasL55 = breakouts.includes('low55');
  const brFrac = hasH55 || hasL55 ? 1 : breakouts.length > 0 ? 0.6 : 0;
  const brReason = hasH55
    ? 'Giá vượt đỉnh 55 phiên'
    : hasL55
      ? 'Giá thủng đáy 55 phiên'
      : breakouts.includes('high20')
        ? 'Giá vượt đỉnh 20 phiên'
        : breakouts.includes('low20')
          ? 'Giá thủng đáy 20 phiên'
          : null;

  const { atr, moves } = atrMoveToday(bars);

  const rsi = calculateRSI(bars.close, 14);
  const cross = n >= 16 ? rsiCross(rsi[n - 2] ?? null, rsi[n - 1] ?? null) : null;

  const cot = inp.cotIndex;
  if (cot === null) caveats.push('Không có dữ liệu COT cho mã này.');
  const cotExtreme = cot !== null && (cot >= 90 || cot <= 10);

  const phaseChanged = inp.phaseNow !== null && inp.phasePrev !== null && inp.phaseNow !== inp.phasePrev;
  if (inp.phasePrev === null) caveats.push('Chưa có mốc pha chu kỳ trước đó để so sánh (lần tính đầu tiên).');

  const signals: RadarSignal[] = [
    sig('volume', vr === null ? 0 : ramp(vr, 1.2, 3), vr, vr === null ? null : `Khối lượng gấp ${fmtVi(vr)} lần trung bình 20 phiên`),
    sig('volExpansion', ve === null ? 0 : ramp(ve, 1.2, 2.5), ve, ve === null ? null : `Biến động 5 phiên gấp ${fmtVi(ve)} lần biến động 60 phiên`),
    sig('breakout', brFrac, breakouts.length, brReason),
    sig('atrMove', moves === null ? 0 : ramp(moves, 0.8, 2.5), moves, moves === null ? null : `Giá di chuyển ${fmtVi(moves)} lần ATR(14) trong phiên gần nhất`),
    sig('momentum', cross ? CROSS_TEXT[cross].pts : 0, rsi[n - 1] ?? null, cross ? CROSS_TEXT[cross].text : null),
    sig(
      'cot',
      cotExtreme ? 1 : 0,
      cot,
      cot === null ? null : cot >= 90 ? `Chỉ số COT ở ${fmtVi(cot, 0)}/100, vị thế quỹ ở vùng cao nhất gần đây` : `Chỉ số COT ở ${fmtVi(cot, 0)}/100, vị thế quỹ ở vùng thấp nhất gần đây`,
    ),
    sig('event', inp.eventSoon ? 1 : 0, null, inp.eventSoon ? `${inp.eventSoon} trong vòng 3 ngày tới` : null),
    sig('cycle', phaseChanged ? 1 : 0, null, phaseChanged ? `Pha chu kỳ đổi từ "${inp.phasePrev}" sang "${inp.phaseLabelNow ?? inp.phaseNow}"` : null),
  ];

  const score = Math.round(Math.min(100, signals.reduce((a, s) => a + s.points, 0)));
  const changePct = n >= 2 ? (bars.close[n - 1] / bars.close[n - 2] - 1) * 100 : null;
  return { score, signals, breakouts, changePct, atr, caveats };
}

export interface SetupCore {
  direction: 'UP' | 'DOWN';
  conditions: string[];
}

/** Trend + pullback + momentum + volatility alignment (descriptive). Returns null when they do not line up. */
export function detectSetup(bars: Pick<BarSeries, 'close' | 'candles'>): SetupCore | null {
  const close = bars.close;
  const n = close.length;
  if (n < 80) return null;
  const e20 = calculateEMA(close, 20);
  const e50 = calculateEMA(close, 50);
  const a14 = calculateATR(bars.candles, 14);
  const rsi = calculateRSI(close, 14);
  const L = n - 1;
  const x20 = e20[L];
  const x50 = e50[L];
  const x50b = e50[L - 10];
  const atr = a14[L];
  const r = rsi[L];
  if (x20 == null || x50 == null || x50b == null || atr == null || r == null || atr <= 0) return null;
  const up = x20 > x50 && close[L] > x50 && x50 > x50b;
  const down = x20 < x50 && close[L] < x50 && x50 < x50b;
  if (!up && !down) return null;
  const dist = (close[L] - x20) / atr;
  const near = Math.abs(dist) <= 1 && (up ? dist >= -0.2 : dist <= 0.2);
  if (!near) return null;
  if (!(up ? r >= 40 && r <= 65 : r >= 35 && r <= 60)) return null;
  const vols = realizedVolSeries(close, 20);
  const vNow = vols[L];
  const hist = vols.filter((v): v is number => v !== null).slice(-252);
  const pct = vNow !== null ? percentileRank(vNow, hist, 100) : null;
  let volText: string;
  if (pct !== null) {
    if (pct < 20 || pct > 80) return null;
    volText = `biến động vừa phải (biến động 20 phiên ở phân vị ${fmtVi(pct, 0)} so với 1 năm)`;
  } else {
    const ve = volExpansionRatio(close);
    if (ve === null || ve < 0.6 || ve > 1.5) return null;
    volText = `biến động vừa phải (5 phiên bằng ${fmtVi(ve)} lần 60 phiên)`;
  }
  return {
    direction: up ? 'UP' : 'DOWN',
    conditions: [
      `xu hướng ${up ? 'tăng' : 'giảm'} rõ (EMA20 ${up ? 'trên' : 'dưới'} EMA50, EMA50 ${up ? 'dốc lên' : 'dốc xuống'} so với 10 phiên trước)`,
      `vừa ${up ? 'điều chỉnh' : 'hồi lên'} về gần EMA20 (cách ${fmtVi(Math.abs(dist))} ATR)`,
      `RSI(14) ở ${fmtVi(r, 0)}, chưa quá mức`,
      volText,
    ],
  };
}

export function setupDescription(core: SetupCore): string {
  return `${core.direction === 'UP' ? 'Xu hướng tăng rõ, vừa điều chỉnh về gần EMA20' : 'Xu hướng giảm rõ, vừa hồi lên gần EMA20'}, biến động vừa phải`;
}

export function setupRisks(x: { atrMoney: number | null; currency: string | null; eventSoon: string | null }): string[] {
  const out: string[] = [];
  if (x.atrMoney !== null) {
    out.push(`Một nhịp ATR(14) tương đương khoảng ${Math.round(x.atrMoney).toLocaleString('vi-VN')} ${x.currency ?? ''} mỗi hợp đồng (ước tính từ tick value; hãy đối chiếu thông số hợp đồng).`);
  } else {
    out.push('Chưa có thông số hợp đồng đủ tin cậy để quy ATR ra tiền; cần tự kiểm tra giá trị mỗi nhịp biến động.');
  }
  out.push(
    x.eventSoon
      ? `Rủi ro sự kiện: ${x.eventSoon} trong vòng 3 ngày tới, giá có thể biến động mạnh quanh báo cáo.`
      : 'Không thấy báo cáo lớn trong 3 ngày tới theo lịch đã biết; tin bất ngờ vẫn có thể làm giá đảo chiều.',
  );
  out.push('Thiết lập chỉ mô tả điều kiện kỹ thuật tại thời điểm tính, không bảo đảm diễn biến về sau.');
  return out;
}
