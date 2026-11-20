/** Fixed-template wording for T56. Descriptive only: no forecast, no buy/sell language. */
import type { ConeBand, DText, DriverEventFlag, DriverPartId } from '../../../src/shared/types/drivers.ts';

export const DRIVERS_DISCLAIMER: DText = {
  vi: 'Công cụ nghiên cứu, không phải khuyến nghị mua/bán. Thống kê mô tả từ dữ liệu quá khứ và kịch bản theo biến động lịch sử; không phải dự báo giá.',
  en: 'Research tool, not buy/sell advice. Descriptive statistics from past data and scenarios based on historical volatility; not a price forecast.',
};

export const fmtVi = (n: number, d = 1): string => n.toFixed(d).replace('.', ',');
export const fmtEn = (n: number, d = 1): string => n.toFixed(d);
const both = (n: number, d: number) => ({ vi: fmtVi(n, d), en: fmtEn(n, d) });

const GROUP_LABEL: Record<string, DText> = {
  AGRICULTURE: { vi: 'cả nhóm nông sản', en: 'the whole agriculture group' },
  SOFT_COMMODITIES: { vi: 'cả nhóm hàng mềm', en: 'the whole softs group' },
  METALS: { vi: 'cả nhóm kim loại', en: 'the whole metals group' },
  ENERGY: { vi: 'cả nhóm năng lượng', en: 'the whole energy group' },
};

const PART_LABEL: Record<Exclude<DriverPartId, 'group'>, DText> = {
  usd: { vi: 'biến động của đồng USD', en: 'moves in the US dollar' },
  rates: { vi: 'thay đổi lợi suất trái phiếu Mỹ 10 năm', en: 'changes in the US 10-year yield' },
  own: { vi: 'yếu tố riêng của mã này', en: 'factors specific to this instrument' },
};

/** Rounds a share (0..1+) to the nearest 5%, capped at 100. */
export const roundShare = (share: number): number => Math.min(100, Math.round((share * 100) / 5) * 5);

export interface SentenceInput {
  name: string;
  category: string;
  days: 1 | 5 | 20;
  /** true when the horizon ends today (UTC). */
  endsToday: boolean;
  endDate: string;
  totalPct: number;
  parts: { id: DriverPartId; pct: number; share: number | null }[];
  events: DriverEventFlag[];
}

export function attributionSentence(x: SentenceInput): DText {
  const dir = x.totalPct < 0 ? { vi: 'giảm', en: 'fell' } : x.totalPct > 0 ? { vi: 'tăng', en: 'rose' } : { vi: 'đi ngang', en: 'was flat' };
  const when =
    x.days === 1
      ? x.endsToday
        ? { vi: 'Hôm nay', en: 'Today' }
        : { vi: `Phiên ${x.endDate}`, en: `Session ${x.endDate}` }
      : { vi: `${x.days} phiên qua`, en: `Over the last ${x.days} sessions` };
  const abs = Math.abs(x.totalPct);
  const head =
    dir.vi === 'đi ngang'
      ? { vi: `${when.vi} ${x.name} đi ngang`, en: `${when.en} ${x.name} was flat` }
      : { vi: `${when.vi} ${x.name} ${dir.vi} ${fmtVi(abs, 1)}%`, en: `${when.en} ${x.name} ${dir.en} ${fmtEn(abs, 1)}%` };
  let vi = head.vi;
  let en = head.en;
  const same = x.parts.filter((p) => p.share !== null && p.share >= 0.25 && Math.sign(p.pct) === Math.sign(x.totalPct));
  if (dir.vi !== 'đi ngang' && same.length > 0) {
    const top = same.reduce((a, b) => (Math.abs(b.pct) > Math.abs(a.pct) ? b : a));
    const pct = roundShare(top.share ?? 0);
    const lab = top.id === 'group' ? (GROUP_LABEL[x.category] ?? GROUP_LABEL.AGRICULTURE) : PART_LABEL[top.id];
    vi += `: khoảng ${pct}% đi cùng ${top.id === 'group' ? lab.vi : `${lab.vi}`}`;
    en += `: about ${pct}% moved with ${lab.en}`;
  } else if (dir.vi !== 'đi ngang') {
    vi += ': chưa có yếu tố nào giải thích rõ phần lớn mức này';
    en += ': no single factor clearly explains most of it';
  }
  if (x.events.length > 0) {
    const labels = [...new Set(x.events.map((e) => e.label))];
    const dedup = (k: 'vi' | 'en') => [...new Set(labels.map((l) => l[k]))].join(', ');
    vi += `; trong kỳ có ${dedup('vi')}`;
    en += `; in this window: ${dedup('en')}`;
  }
  return { vi: `${vi}.`, en: `${en}.` };
}

export function coneSentence(days: 5 | 21, b80: ConeBand): DText {
  const span = days === 5 ? { vi: '1 tuần', en: '1 week' } : { vi: '1 tháng', en: '1 month' };
  const lo = both(b80.lo, 2);
  const hi = both(b80.hi, 2);
  return {
    vi: `Theo biến động lịch sử, khoảng 80% trường hợp giá sau ${span.vi} nằm trong ${lo.vi}–${hi.vi}. Đây không phải dự báo.`,
    en: `Based on historical volatility, about 80% of cases put the price after ${span.en} within ${lo.en}-${hi.en}. This is not a forecast.`,
  };
}

export function seasonalityHitText(up: number, years: number): DText {
  return { vi: `tăng ${up}/${years} năm`, en: `up in ${up} of ${years} years` };
}

/** Words that must never appear in generated sentences (buy/sell/recommendation/forecast language). */
export const FORBIDDEN_WORDS = /\b(mua|bán|nên|khuyến nghị|buy|sell|should|recommend|will rise|will fall|sẽ tăng|sẽ giảm)\b/i;
