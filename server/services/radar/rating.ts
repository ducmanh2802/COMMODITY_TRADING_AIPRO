/**
 * "Điểm đánh giá" (research rating 0-100): how clean and well-supported an instrument's current trend/setup looks.
 * Pure function of data the radar already collected. It is a research score with listed reasons, never a
 * buy/sell instruction; shorts are as valid as longs on futures, so `direction` says which side the data favours.
 *
 * Weights (sum 100): daily trend 18, weekly trend 8, structure 4, setup quality 20, momentum 15, volatility (ATR%) 8,
 * event risk 7, COT crowding 10, data quality 10. Unavailable components are excluded from the denominator,
 * the rating is capped (100 - 0.5 x missing weight) and confidence is lowered; nothing is fabricated.
 */
import type { RadarRating, RadarRatingComponent } from '../../../src/shared/types/radar.ts';
import { calculateATR, calculateEMA, calculateRSI } from '../../engines/technicalEngine.ts';
import { fmtVi, ramp, volumeRatio, type BarSeries, type SetupCore } from './scoring.ts';

export const RATING_MAX = { trendDaily: 18, trendWeekly: 8, structure: 4, setup: 20, momentum: 15, atr: 8, event: 7, cot: 10, data: 10 } as const;

export interface RatingInput {
  bars: BarSeries;
  setup: SetupCore | null;
  cotIndex: number | null;
  /** Whole days until the next major report affecting this instrument (0 = today), null = none known in window. */
  eventDays: number | null;
  quality: string | null;
  source: string | null;
  /** Days between last bar and today. */
  ageDays?: number;
}

const r1 = (x: number): number => Math.round(x * 10) / 10;
const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
const lastOf = (a: Array<number | null>, back = 0): number | null => a[a.length - 1 - back] ?? null;
const mean = (v: number[]): number => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);

/** Monday (UTC) key of a YYYY-MM-DD date. */
function weekKey(d: string): string {
  const t = new Date(`${d}T00:00:00Z`);
  const dow = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dow);
  return t.toISOString().slice(0, 10);
}
export function weeklyCloses(bars: Pick<BarSeries, 'dates' | 'close'>): number[] {
  const m = new Map<string, number>();
  bars.dates.forEach((d, i) => m.set(weekKey(d), bars.close[i]));
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, c]) => c);
}

/** Daily trend vote in [-1, 1] (price vs EMA20/50/200, EMA stacking, EMA50 slope); null if < 50 bars. */
function dailyTrendScore(close: number[]): { score: number; votes: number } | null {
  const n = close.length;
  if (n < 50) return null;
  const e20 = lastOf(calculateEMA(close, 20));
  const e50arr = calculateEMA(close, 50);
  const e50 = lastOf(e50arr);
  const e50b = lastOf(e50arr, 10);
  const e200 = lastOf(calculateEMA(close, 200));
  const c = close[n - 1];
  if (e20 === null || e50 === null) return null;
  const v: number[] = [c > e20 ? 1 : -1, c > e50 ? 1 : -1, e20 > e50 ? 1 : -1];
  if (e50b !== null) v.push(e50 > e50b ? 1 : -1);
  if (e200 !== null) v.push(c > e200 ? 1 : -1, e50 > e200 ? 1 : -1);
  return { score: mean(v), votes: v.length };
}
/** Weekly trend vote in [-1, 1]; null if < 20 weekly closes. */
function weeklyTrendScore(wc: number[]): number | null {
  if (wc.length < 20) return null;
  const e10a = calculateEMA(wc, 10);
  const e10 = lastOf(e10a);
  const e10b = lastOf(e10a, 4);
  const e20 = lastOf(calculateEMA(wc, 20));
  if (e10 === null || e20 === null) return null;
  const v = [wc[wc.length - 1] > e10 ? 1 : -1, e10 > e20 ? 1 : -1];
  if (e10b !== null) v.push(e10 > e10b ? 1 : -1);
  return mean(v);
}
/** +1 higher highs and higher lows (last 20 vs previous 20 bars), -1 lower both, +-0.5 / 0 otherwise. */
function structureScore(bars: Pick<BarSeries, 'high' | 'low'>): number | null {
  const n = bars.high.length;
  if (n < 40) return null;
  const hi1 = Math.max(...bars.high.slice(n - 20));
  const hi0 = Math.max(...bars.high.slice(n - 40, n - 20));
  const lo1 = Math.min(...bars.low.slice(n - 20));
  const lo0 = Math.min(...bars.low.slice(n - 40, n - 20));
  return ((hi1 > hi0 ? 1 : -1) + (lo1 > lo0 ? 1 : -1)) / 2;
}

/** Reward:risk from structure: stop beyond the 10-bar swing (+0.25 ATR), target at the 55-bar extreme. */
export function setupLevels(bars: Pick<BarSeries, 'high' | 'low' | 'close'>, dir: 1 | -1, atr: number): { stop: number; target: number; rr: number } | null {
  const n = bars.close.length;
  if (n < 30 || !(atr > 0)) return null;
  const c = bars.close[n - 1];
  const stop = dir === 1 ? Math.min(...bars.low.slice(n - 10)) - 0.25 * atr : Math.max(...bars.high.slice(n - 10)) + 0.25 * atr;
  const ext = dir === 1 ? Math.max(...bars.high.slice(Math.max(0, n - 55))) : Math.min(...bars.low.slice(Math.max(0, n - 55)));
  const risk = Math.abs(c - stop);
  const reward = Math.max(0, dir === 1 ? ext - c : c - ext);
  if (!(risk > 0)) return null;
  return { stop, target: ext, rr: reward / risk };
}

function comp(label: string, points: number, max: number, note: string, available = true): RadarRatingComponent {
  return { label, points: available ? r1(clamp(points, 0, max)) : 0, max, note, available };
}

export function gradeOf(rating: number): 'A' | 'B' | 'C' | 'D' {
  return rating >= 75 ? 'A' : rating >= 60 ? 'B' : rating >= 45 ? 'C' : 'D';
}

export function rateInstrument(inp: RatingInput): RadarRating {
  const { bars } = inp;
  const n = bars.close.length;
  const comps: RadarRatingComponent[] = [];

  const daily = dailyTrendScore(bars.close);
  const weekly = weeklyTrendScore(weeklyCloses(bars));
  const struct = structureScore(bars);

  // Direction: the setup's side if one exists, else the daily trend when it is clear enough.
  let dir: 1 | -1 | 0 = 0;
  if (inp.setup) dir = inp.setup.direction === 'UP' ? 1 : -1;
  else if (daily && Math.abs(daily.score) >= 0.4) dir = daily.score > 0 ? 1 : -1;
  const sideWord = dir === 1 ? 'tăng' : dir === -1 ? 'giảm' : '';
  const unclearNote = 'Chưa rõ hướng nên không cộng điểm.';

  // 1-3 trend
  if (!daily) comps.push(comp('Xu hướng ngày', 0, RATING_MAX.trendDaily, 'Chưa đủ 50 phiên để đánh giá xu hướng.', false));
  else if (dir === 0) comps.push(comp('Xu hướng ngày', 0, RATING_MAX.trendDaily, `Giá, EMA20/50/200 chưa đồng thuận (độ đồng thuận ${fmtVi(Math.abs(daily.score), 2)}). ${unclearNote}`));
  else {
    const a = Math.max(0, daily.score * dir);
    comps.push(comp('Xu hướng ngày', RATING_MAX.trendDaily * a, RATING_MAX.trendDaily, `Giá so với EMA20/50/200: ${fmtVi(a * 100, 0)}% tiêu chí ủng hộ phía ${sideWord}${daily.votes < 6 ? ' (thiếu EMA200 nên ít tiêu chí hơn)' : ''}.`));
  }

  if (weekly === null) comps.push(comp('Xu hướng tuần', 0, RATING_MAX.trendWeekly, 'Chưa đủ 20 tuần dữ liệu để dựng xu hướng tuần.', false));
  else if (dir === 0) comps.push(comp('Xu hướng tuần', 0, RATING_MAX.trendWeekly, unclearNote));
  else {
    const a = weekly * dir;
    comps.push(comp('Xu hướng tuần', RATING_MAX.trendWeekly * Math.max(0, a), RATING_MAX.trendWeekly, a > 0.3 ? `Khung tuần cùng chiều ${sideWord} với khung ngày.` : a < -0.3 ? `Khung tuần đi ngược chiều ${sideWord}.` : 'Khung tuần chưa rõ ràng.'));
  }

  if (struct === null) comps.push(comp('Cấu trúc giá', 0, RATING_MAX.structure, 'Chưa đủ 40 phiên để xét đỉnh/đáy.', false));
  else if (dir === 0) comps.push(comp('Cấu trúc giá', 0, RATING_MAX.structure, unclearNote));
  else comps.push(comp('Cấu trúc giá', RATING_MAX.structure * Math.max(0, struct * dir), RATING_MAX.structure, struct * dir >= 1 ? `Đỉnh và đáy 20 phiên ${dir === 1 ? 'cao dần' : 'thấp dần'}.` : struct * dir > 0 ? 'Cấu trúc ủng hộ một nửa.' : 'Cấu trúc không ủng hộ hướng này.'));

  // 4 setup
  const atr = n >= 16 ? lastOf(calculateATR(bars.candles, 14)) : null;
  const vr = volumeRatio(bars.volume);
  if (!inp.setup || dir === 0) {
    comps.push(comp('Chất lượng thiết lập', 0, RATING_MAX.setup, 'Chưa có thiết lập (xu hướng + điều chỉnh về EMA20) đủ điều kiện.'));
  } else {
    const lv = atr !== null ? setupLevels(bars, dir, atr) : null;
    let pts = 0;
    const notes: string[] = [];
    if (lv) {
      pts += 10 * ramp(lv.rr, 1, 3);
      notes.push(`R:R ước tính 1:${fmtVi(lv.rr, 1)} (cắt lỗ tham khảo ${fmtVi(lv.stop, 2)}, mục tiêu ${fmtVi(lv.target, 2)})`);
    } else notes.push('không tính được R:R');
    if (weekly === null) notes.push('chưa kiểm tra được khung tuần');
    else {
      const a = weekly * dir;
      pts += a > 0.3 ? 5 : a >= -0.3 ? 2 : 0;
      notes.push(a > 0.3 ? 'khớp xu hướng tuần' : a >= -0.3 ? 'xu hướng tuần trung tính' : 'ngược xu hướng tuần');
    }
    if (vr === null) notes.push('không có dữ liệu khối lượng để xác nhận');
    else {
      pts += 5 * ramp(vr, 0.8, 1.5);
      notes.push(`khối lượng gấp ${fmtVi(vr, 2)} lần trung bình`);
    }
    comps.push(comp('Chất lượng thiết lập', pts, RATING_MAX.setup, `${notes.join('; ')}.`));
  }

  // 5 momentum
  const rsi = lastOf(calculateRSI(bars.close, 14));
  if (rsi === null) comps.push(comp('Động lượng (RSI)', 0, RATING_MAX.momentum, 'Chưa đủ dữ liệu tính RSI(14).', false));
  else if (dir === 0) comps.push(comp('Động lượng (RSI)', 0, RATING_MAX.momentum, `RSI ${fmtVi(rsi, 0)}. ${unclearNote}`));
  else {
    const x = dir === 1 ? rsi : 100 - rsi; // strength from the favoured side
    let f: number;
    if (x >= 45 && x <= 68) f = 1;
    else if (x > 68) f = 1 - 0.55 * ramp(x, 68, 75) - 0.32 * ramp(x, 75, 85);
    else f = 0.4 + 0.6 * ramp(x, 30, 45);
    comps.push(comp('Động lượng (RSI)', RATING_MAX.momentum * f, RATING_MAX.momentum, x > 75 ? `RSI ${fmtVi(rsi, 0)} đã quá nóng theo hướng ${sideWord}.` : x < 40 ? `RSI ${fmtVi(rsi, 0)} yếu so với hướng ${sideWord}.` : `RSI ${fmtVi(rsi, 0)} khỏe mạnh, chưa cực đoan.`));
  }

  // 6 ATR%
  const atrPct = atr !== null ? (atr / bars.close[n - 1]) * 100 : null;
  if (atrPct === null) comps.push(comp('Biến động (ATR%)', 0, RATING_MAX.atr, 'Chưa đủ dữ liệu tính ATR(14).', false));
  else {
    const f = atrPct <= 2 ? 1 : atrPct <= 4 ? 1 - 0.5 * ramp(atrPct, 2, 4) : 0.5 - 0.5 * ramp(atrPct, 4, 6);
    comps.push(comp('Biến động (ATR%)', RATING_MAX.atr * f, RATING_MAX.atr, `ATR(14) bằng ${fmtVi(atrPct, 2)}% giá${atrPct > 4 ? ': biến động lớn, rủi ro mỗi nhịp cao' : ''}.`));
  }

  // 7 event
  if (inp.eventDays === null) comps.push(comp('Sự kiện sắp tới', RATING_MAX.event, RATING_MAX.event, 'Không có báo cáo lớn trong 3 ngày tới theo lịch đã biết.'));
  else if (inp.eventDays <= 1) comps.push(comp('Sự kiện sắp tới', 0, RATING_MAX.event, 'Báo cáo lớn trong vòng 24 giờ: giá có thể giật mạnh.'));
  else comps.push(comp('Sự kiện sắp tới', 4, RATING_MAX.event, `Báo cáo lớn sau ${inp.eventDays} ngày.`));

  // 8 COT
  const cot = inp.cotIndex;
  if (cot === null) comps.push(comp('Vị thế COT', 0, RATING_MAX.cot, 'Không có dữ liệu COT cho mã này.', false));
  else {
    const crowdedLong = cot >= 90;
    const crowdedShort = cot <= 10;
    const same = (dir === 1 && crowdedLong) || (dir === -1 && crowdedShort);
    const nearSame = (dir === 1 && cot >= 80) || (dir === -1 && cot <= 20);
    if (same) comps.push(comp('Vị thế COT', 0, RATING_MAX.cot, `COT ${fmtVi(cot, 0)}/100: quỹ đã dồn vị thế cùng phía ${sideWord}, dễ bị đảo chiều.`));
    else if (dir === 0 && (crowdedLong || crowdedShort)) comps.push(comp('Vị thế COT', 5, RATING_MAX.cot, `COT ${fmtVi(cot, 0)}/100 ở vùng cực đoan.`));
    else if (nearSame) comps.push(comp('Vị thế COT', 5, RATING_MAX.cot, `COT ${fmtVi(cot, 0)}/100: vị thế khá đông phía ${sideWord}.`));
    else comps.push(comp('Vị thế COT', RATING_MAX.cot, RATING_MAX.cot, `COT ${fmtVi(cot, 0)}/100: chưa quá đông.`));
  }

  // 9 data quality
  const q = `${inp.quality ?? ''} ${inp.source ?? ''}`.toUpperCase();
  let dp = 10;
  let dn = 'Nguồn chính thức/chất lượng cao.';
  if (q.includes('STALE')) {
    dp = 2;
    dn = 'Dữ liệu đã cũ (STALE).';
  } else if (q.includes('HISTORICAL')) {
    dp = 5;
    dn = 'Chỉ có dữ liệu lịch sử, không có giá trực tiếp.';
  } else if (q.includes('UNOFFICIAL') || q.includes('YAHOO')) {
    dp = 6;
    dn = 'Nguồn không chính thức (UNOFFICIAL), có thể chậm hoặc sai lệch.';
  } else if (!inp.quality) {
    dp = 8;
    dn = 'Không rõ chất lượng nguồn dữ liệu.';
  }
  if ((inp.ageDays ?? 0) > 3 && dp > 3) {
    dp = 3;
    dn += ` Phiên cuối cách ${inp.ageDays} ngày.`;
  }
  comps.push(comp('Chất lượng dữ liệu', dp, RATING_MAX.data, dn));

  const availMax = comps.filter((c) => c.available).reduce((a, c) => a + c.max, 0);
  const missingMax = 100 - availMax;
  const sum = comps.reduce((a, c) => a + c.points, 0);
  let rating = availMax > 0 ? (sum / availMax) * 100 : 0;
  rating = Math.min(rating, 100 - 0.5 * missingMax);
  rating = Math.round(clamp(rating, 0, 100));

  const confidence: RadarRating['confidence'] = missingMax >= 18 || dp <= 3 ? 'THẤP' : missingMax > 0 || dp < 10 ? 'TRUNG BÌNH' : 'CAO';
  return {
    rating,
    grade: gradeOf(rating),
    direction: dir === 1 ? 'TĂNG' : dir === -1 ? 'GIẢM' : 'CHƯA RÕ',
    components: comps,
    confidence,
  };
}
