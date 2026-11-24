/**
 * Pure, deterministic sentence templates for the "Phân tích chi tiết" brief.
 *
 * Every builder takes plain numbers (already computed by existing engines) and returns a BriefSection.
 * Rules (project policy):
 * - Neutral and descriptive: describes what the numbers show, never says buy/sell/entry/target/stop.
 * - Every fact carries source, quality and as-of; a missing input is reported as missing, never filled.
 * - No network, no clock: callers pass everything in, so the logic is unit-testable with fixed inputs.
 */
import type {
  BriefFact,
  BriefFactQuality,
  BriefSection,
  BriefSectionId,
  BriefSectionStatus,
  BriefText,
} from '../../../src/shared/types/brief.ts';

export type Lang = 'vi' | 'en';

// ---------------------------------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------------------------------

const LOCALE: Record<Lang, string> = { vi: 'vi-VN', en: 'en-US' };

export function fmtNum(n: number, digits: number, lang: Lang): string {
  return new Intl.NumberFormat(LOCALE[lang], {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

export function fmtSigned(n: number, digits: number, lang: Lang): string {
  const s = fmtNum(Math.abs(n), digits, lang);
  return n > 0 ? `+${s}` : n < 0 ? `−${s}` : s;
}

/** Fraction → percent text (0.0123 → "1,23%" / "1.23%"). */
export function fmtPct(fraction: number, digits: number, lang: Lang, signed = false): string {
  const v = fraction * 100;
  return `${signed ? fmtSigned(v, digits, lang) : fmtNum(v, digits, lang)}%`;
}

/** YYYY-MM-DD (or ISO timestamp) → dd/mm/yyyy (vi) or yyyy-mm-dd (en). */
export function fmtDate(iso: string, lang: Lang): string {
  const d = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return iso;
  if (lang === 'en') return d;
  const [y, m, dd] = d.split('-');
  return `${dd}/${m}/${y}`;
}

/** Number of decimals implied by a tick size (0.25 → 2, 0.1 → 1, 0.005 → 3), at least `min`. */
export function decimalsForTick(tick: number | null | undefined, min = 2): number {
  if (!tick || !Number.isFinite(tick) || tick <= 0) return min;
  const s = String(tick);
  const exp = /e-(\d+)$/.exec(s);
  if (exp) return Math.max(min, Number(exp[1]));
  const dot = s.indexOf('.');
  return Math.max(min, dot < 0 ? 0 : s.length - dot - 1);
}

const both = (fn: (lang: Lang) => string): BriefText => ({ vi: fn('vi'), en: fn('en') });
const txt = (vi: string, en: string): BriefText => ({ vi, en });
const join = (parts: BriefText[]): BriefText => ({
  vi: parts.map((p) => p.vi).filter(Boolean).join(' '),
  en: parts.map((p) => p.en).filter(Boolean).join(' '),
});

function numFact(
  label: BriefText,
  value: number | null | undefined,
  digits: number,
  meta: { unit?: string | null; source: string; quality: BriefFactQuality; asOf: string | null; freshness?: string | null },
  format?: (v: number, lang: Lang) => string
): BriefFact {
  const ok = value !== null && value !== undefined && Number.isFinite(value);
  return {
    label,
    value: ok ? both((l) => (format ? format(value as number, l) : fmtNum(value as number, digits, l))) : null,
    raw: ok ? (value as number) : null,
    unit: meta.unit ?? null,
    source: meta.source,
    quality: meta.quality,
    freshness: meta.freshness ?? null,
    asOf: meta.asOf,
  };
}

function textFact(
  label: BriefText,
  value: BriefText | string | null,
  meta: { unit?: string | null; source: string; quality: BriefFactQuality; asOf: string | null; freshness?: string | null }
): BriefFact {
  return {
    label,
    value: value === null ? null : typeof value === 'string' ? txt(value, value) : value,
    unit: meta.unit ?? null,
    source: meta.source,
    quality: meta.quality,
    freshness: meta.freshness ?? null,
    asOf: meta.asOf,
  };
}

function section(
  id: BriefSectionId,
  status: BriefSectionStatus,
  facts: BriefFact[],
  plainText: BriefText,
  missingReason: BriefText | null = null
): BriefSection {
  return { id, status, facts, plainText, whatItMeans: WHAT_IT_MEANS[id], missingReason };
}

export interface BuiltSection {
  section: BriefSection;
  /** One-sentence takeaway for "Tóm tắt nhanh" (null when the section has nothing to say). */
  headline: BriefText | null;
}

const SECTION_TITLES: Record<BriefSectionId, BriefText> = {
  price: txt('Giá & biến động hôm nay', 'Price & today’s move'),
  trend: txt('Xu hướng', 'Trend'),
  momentum: txt('Động lượng', 'Momentum'),
  risk: txt('Mức biến động & rủi ro', 'Volatility & risk'),
  seasonality: txt('Mùa vụ', 'Seasonality'),
  cot: txt('Dòng tiền lớn (COT)', 'Large traders (COT)'),
  termStructure: txt('Cấu trúc kỳ hạn', 'Term structure'),
  contract: txt('Thông số hợp đồng & MXV', 'Contract specs & MXV'),
  missing: txt('Dữ liệu còn thiếu', 'Missing data'),
};

const WHAT_IT_MEANS: Record<BriefSectionId, BriefText> = {
  price: txt(
    'Giá hiện tại được so với giá đóng cửa của phiên trước. Nguồn miễn phí thường bị trễ 10–30 phút. Để biết mức thay đổi hôm nay là lớn hay nhỏ, ta so nó với biên độ dao động trung bình một ngày (ATR).',
    'The current price is compared with the previous session’s close. Free sources are usually delayed 10–30 minutes. To judge whether today’s move is large or small, it is compared with the average daily range (ATR).'
  ),
  trend: txt(
    'Đường trung bình động (MA) là giá trung bình của N phiên gần nhất, giúp làm mượt dao động hằng ngày. MA50 ≈ 2–3 tháng (trung hạn), MA200 ≈ 10 tháng (dài hạn). Giá nằm trên MA thường được mô tả là xu hướng đi lên, nằm dưới là đi xuống. Đây là mô tả quá khứ, không dự báo tương lai.',
    'A moving average (MA) is the average price of the last N sessions and smooths daily noise. MA50 ≈ 2–3 months (medium term), MA200 ≈ 10 months (long term). Price above the MA is usually described as an uptrend, below as a downtrend. It describes the past; it does not predict the future.'
  ),
  momentum: txt(
    'RSI (0–100) đo tốc độ tăng/giảm của giá trong 14 phiên. Trên 70 thường gọi là "quá mua", dưới 30 là "quá bán" — nghĩa là giá đã chạy nhanh, không có nghĩa giá sắp đảo chiều. Thị trường có xu hướng mạnh có thể giữ RSI cao/thấp rất lâu.',
    'RSI (0–100) measures how fast price has risen or fallen over 14 sessions. Above 70 is often called "overbought", below 30 "oversold" — meaning price moved fast, not that it is about to reverse. Strongly trending markets can keep RSI high or low for a long time.'
  ),
  risk: txt(
    '1 "tick" là bước giá nhỏ nhất; mỗi tick tương ứng một số tiền cố định trên mỗi hợp đồng. ATR (Average True Range) là biên độ dao động trung bình một ngày. Nhân ATR với giá trị tick cho biết một ngày "bình thường" có thể làm lãi/lỗ khoảng bao nhiêu tiền trên 1 hợp đồng. Mức sụt giảm lớn nhất (drawdown) cho biết giá từng rơi sâu nhất bao nhiêu % từ đỉnh.',
    'A "tick" is the smallest price step; each tick is worth a fixed amount per contract. ATR (Average True Range) is the average daily range. ATR times the tick value shows roughly how much money a "normal" day can move one contract. Maximum drawdown shows the deepest % fall from a peak.'
  ),
  seasonality: txt(
    'Mùa vụ xem giá thường tăng hay giảm vào từng tháng trong các năm trước (do vụ trồng, thu hoạch, nhu cầu theo mùa). Cần ít nhất 3 năm dữ liệu; mẫu vẫn nhỏ nên chỉ để tham khảo — năm nay có thể khác hoàn toàn.',
    'Seasonality looks at whether price tended to rise or fall in each calendar month in past years (planting, harvest, seasonal demand). It needs at least 3 years of data; the sample is still small, so treat it as context only — this year can differ completely.'
  ),
  cot: txt(
    'Báo cáo COT của CFTC (Mỹ) công bố hằng tuần vị thế của các nhóm lớn. "Managed Money" là các quỹ đầu cơ; "Producer/Merchant" là nhà sản xuất/thương mại (thường phòng hộ). Mua ròng = số hợp đồng mua nhiều hơn bán. COT index (0–100) cho biết vị thế ròng hiện tại nằm ở đâu so với mức thấp nhất (0) và cao nhất (100) trong một giai đoạn. Số liệu là vị thế chốt ngày thứ Ba, công bố thứ Sáu.',
    'The CFTC (US) COT report shows the weekly positions of large trader groups. "Managed Money" are speculative funds; "Producer/Merchant" are producers and merchants (usually hedging). Net long = more long than short contracts. The COT index (0–100) shows where the current net position sits between the lowest (0) and highest (100) of a look-back window. Positions are as of Tuesday and published on Friday.'
  ),
  termStructure: txt(
    'Cấu trúc kỳ hạn so sánh giá các hợp đồng đáo hạn ở các tháng khác nhau. Contango: kỳ hạn xa đắt hơn kỳ hạn gần (thường do chi phí lưu kho). Backwardation: kỳ hạn gần đắt hơn (thường khi hàng giao ngay đang khan hiếm). Cần giá đóng cửa của ít nhất 2 hợp đồng cụ thể cùng một ngày.',
    'Term structure compares prices of contracts expiring in different months. Contango: later months are more expensive than nearby (often storage costs). Backwardation: nearby is more expensive (often when prompt supply is tight). It needs closes of at least 2 specific contracts on the same day.'
  ),
  contract: txt(
    'Thông số hợp đồng cho biết 1 hợp đồng tương ứng bao nhiêu hàng, bước giá nhỏ nhất và giá trị mỗi bước giá. Hợp đồng tương lai có ngày hết hạn: trước ngày đó người giữ vị thế phải đóng hoặc chuyển sang kỳ hạn sau. Sở Giao dịch Hàng hóa Việt Nam (MXV) liên thông nhiều hợp đồng quốc tế với mã riêng.',
    'Contract specs say how much of the commodity one contract represents, the smallest price step and what each step is worth. Futures expire: before the last trading day a position must be closed or rolled to a later month. The Mercantile Exchange of Vietnam (MXV) lists many international contracts under its own codes.'
  ),
  missing: txt(
    'Ứng dụng không tự điền số liệu khi thiếu. Mục này liệt kê phần nào chưa có dữ liệu, lý do, và cách bổ sung (nhập CSV, đồng bộ COT…).',
    'The app never fills in missing numbers. This lists what has no data yet, why, and how to add it (CSV import, COT sync…).'
  ),
};

// ---------------------------------------------------------------------------------------------------
// Price & today's move
// ---------------------------------------------------------------------------------------------------

export interface PriceInput {
  price: number | null;
  unit: string;
  decimals: number;
  quoteStatus: string;
  quoteSource: string;
  quoteQuality: BriefFactQuality;
  quoteAsOf: string | null;
  quoteDelayMinutes?: number | null;
  prevClose: number | null;
  prevCloseDate: string | null;
  historySource: string;
  historyQuality: BriefFactQuality;
  /** ATR(14) in price units, to put the move in context. */
  atr: number | null;
  /** Why no quote is available. */
  quoteReason?: string | null;
}

export function classifyMoveVsAtr(change: number, atr: number): 'SMALL' | 'NORMAL' | 'LARGE' {
  const r = Math.abs(change) / atr;
  if (r < 0.5) return 'SMALL';
  if (r <= 1.5) return 'NORMAL';
  return 'LARGE';
}

export function buildPriceSection(p: PriceInput): BuiltSection {
  const d = p.decimals;
  const facts: BriefFact[] = [];
  const quoteMeta = { unit: p.unit, source: p.quoteSource, quality: p.quoteQuality, asOf: p.quoteAsOf, freshness: p.quoteStatus };
  const histMeta = { unit: p.unit, source: p.historySource, quality: p.historyQuality, asOf: p.prevCloseDate, freshness: 'HISTORICAL' };
  facts.push(numFact(txt('Giá gần nhất', 'Latest price'), p.price, d, quoteMeta));
  facts.push(numFact(txt('Giá đóng cửa phiên trước', 'Previous close'), p.prevClose, d, histMeta));

  if (p.price === null) {
    const reason = txt(
      `Chưa có giá: ${p.quoteReason ?? 'không có nguồn giá nào trả về dữ liệu.'}`,
      `No price: ${p.quoteReason ?? 'no source returned a price.'}`
    );
    return { section: section('price', 'UNAVAILABLE', facts, reason, reason), headline: null };
  }

  const delay =
    p.quoteStatus === 'DELAYED' && p.quoteDelayMinutes
      ? txt(` (trễ khoảng ${p.quoteDelayMinutes} phút)`, ` (delayed ~${p.quoteDelayMinutes} min)`)
      : p.quoteStatus === 'STALE'
        ? txt(' (giá cũ — thị trường có thể đang đóng cửa)', ' (stale — the market may be closed)')
        : p.quoteStatus === 'HISTORICAL'
          ? txt(' (giá đóng cửa từ dữ liệu lịch sử, không phải giá trực tiếp)', ' (close from stored history, not a live price)')
          : txt('', '');
  if (p.prevClose === null || p.prevClose <= 0) {
    const plain = join([
      both((l) => (l === 'vi' ? `Giá gần nhất: ${fmtNum(p.price!, d, l)} ${p.unit}` : `Latest price: ${fmtNum(p.price!, d, l)} ${p.unit}`)),
      txt(`${delay.vi}.`, `${delay.en}.`),
      txt('Chưa có giá đóng cửa phiên trước để so sánh.', 'No previous close is available for comparison.'),
    ]);
    const reason = txt('Thiếu giá đóng cửa phiên trước (chưa có dữ liệu ngày).', 'Previous close missing (no daily history).');
    return { section: section('price', 'PARTIAL', facts, plain, reason), headline: null };
  }

  const change = p.price - p.prevClose;
  const changePct = change / p.prevClose;
  facts.push(
    numFact(txt('Thay đổi so với phiên trước', 'Change vs previous close'), change, d, { ...quoteMeta, quality: 'DERIVED' }, (v, l) => fmtSigned(v, d, l)),
    numFact(txt('Thay đổi (%)', 'Change (%)'), changePct, 2, { ...quoteMeta, unit: null, quality: 'DERIVED' }, (v, l) => fmtPct(v, 2, l, true))
  );

  const dirVi = change > 0 ? 'tăng' : change < 0 ? 'giảm' : 'đi ngang';
  const dirEn = change > 0 ? 'up' : change < 0 ? 'down' : 'unchanged';
  const first = both((l) =>
    l === 'vi'
      ? `Giá ${fmtNum(p.price!, d, l)} ${p.unit}${delay.vi}, ${dirVi}${change !== 0 ? ` ${fmtNum(Math.abs(change), d, l)} (${fmtPct(Math.abs(changePct), 2, l)})` : ''} so với giá đóng cửa phiên ${fmtDate(p.prevCloseDate ?? '', l)}.`
      : `Price ${fmtNum(p.price!, d, l)} ${p.unit}${delay.en}, ${dirEn}${change !== 0 ? ` ${fmtNum(Math.abs(change), d, l)} (${fmtPct(Math.abs(changePct), 2, l)})` : ''} vs the ${fmtDate(p.prevCloseDate ?? '', l)} close.`
  );
  const parts = [first];
  let status: BriefSectionStatus = 'OK';
  let missing: BriefText | null = null;
  if (p.atr !== null && p.atr > 0) {
    const cls = classifyMoveVsAtr(change, p.atr);
    facts.push(numFact(txt('Biên độ trung bình 1 ngày (ATR 14)', 'Average daily range (ATR 14)'), p.atr, d, { ...histMeta, quality: 'DERIVED' }));
    parts.push(
      cls === 'SMALL'
        ? txt('Mức thay đổi này nhỏ hơn nửa biên độ dao động trung bình một ngày — một phiên khá yên.', 'This move is less than half the average daily range — a fairly quiet session.')
        : cls === 'NORMAL'
          ? txt('Mức thay đổi này tương đương biên độ dao động thường ngày.', 'This move is in line with the usual daily range.')
          : txt('Mức thay đổi này lớn hơn rõ rệt so với biên độ dao động thường ngày.', 'This move is clearly larger than the usual daily range.')
    );
  } else {
    status = 'PARTIAL';
    missing = txt('Chưa tính được ATR để so sánh mức thay đổi.', 'ATR not available to put the move in context.');
  }
  return { section: section('price', status, facts, join(parts), missing), headline: first };
}

// ---------------------------------------------------------------------------------------------------
// Trend
// ---------------------------------------------------------------------------------------------------

export interface TrendInput {
  close: number | null;
  sma50: number | null;
  sma200: number | null;
  /** SMA50 twenty bars earlier (slope). */
  sma50Prev: number | null;
  /** High/low of the last up-to-252 closes, and how many bars that window has. */
  rangeHigh: number | null;
  rangeLow: number | null;
  rangeBars: number;
  unit: string;
  decimals: number;
  source: string;
  quality: BriefFactQuality;
  asOf: string | null;
}

export type TrendClass = 'UP' | 'DOWN' | 'MIXED_RECOVERING' | 'MIXED_WEAKENING' | 'MIXED';

export function classifyTrend(close: number, sma50: number, sma200: number | null): TrendClass {
  const a50 = close > sma50;
  if (sma200 === null) return a50 ? 'UP' : 'DOWN';
  const a200 = close > sma200;
  if (a50 && a200 && sma50 >= sma200) return 'UP';
  if (!a50 && !a200 && sma50 <= sma200) return 'DOWN';
  if (a50 && !a200) return 'MIXED_RECOVERING';
  if (!a50 && a200) return 'MIXED_WEAKENING';
  return 'MIXED';
}

function classifySlope(now: number, before: number): 'RISING' | 'FALLING' | 'FLAT' {
  const chg = now / before - 1;
  if (chg > 0.005) return 'RISING';
  if (chg < -0.005) return 'FALLING';
  return 'FLAT';
}

export function buildTrendSection(t: TrendInput): BuiltSection {
  const d = t.decimals;
  const meta = { unit: t.unit, source: t.source, quality: 'DERIVED' as BriefFactQuality, asOf: t.asOf, freshness: 'HISTORICAL' };
  const facts: BriefFact[] = [
    numFact(txt('Giá đóng cửa gần nhất', 'Latest close'), t.close, d, { ...meta, quality: t.quality }),
    numFact(txt('Đường trung bình 50 phiên (MA50)', '50-session moving average (MA50)'), t.sma50, d, meta),
    numFact(txt('Đường trung bình 200 phiên (MA200)', '200-session moving average (MA200)'), t.sma200, d, meta),
  ];
  if (t.close === null || t.sma50 === null) {
    const reason = txt(
      'Cần ít nhất 50 phiên dữ liệu ngày để tính đường trung bình 50 phiên.',
      'At least 50 daily sessions are needed for the 50-session average.'
    );
    return { section: section('trend', 'UNAVAILABLE', facts, reason, reason), headline: null };
  }
  const cls = classifyTrend(t.close, t.sma50, t.sma200);
  const dist50 = t.close / t.sma50 - 1;
  facts.push(numFact(txt('Khoảng cách giá so với MA50', 'Distance from MA50'), dist50, 2, { ...meta, unit: null }, (v, l) => fmtPct(v, 2, l, true)));

  const head: BriefText =
    t.sma200 === null
      ? cls === 'UP'
        ? txt('Giá đang trên đường trung bình 50 phiên → xu hướng trung hạn đang đi lên.', 'Price is above its 50-session average → the medium-term trend is up.')
        : txt('Giá đang dưới đường trung bình 50 phiên → xu hướng trung hạn đang đi xuống.', 'Price is below its 50-session average → the medium-term trend is down.')
      : cls === 'UP'
        ? txt('Giá đang trên cả đường trung bình 50 và 200 phiên → xu hướng trung hạn và dài hạn đều đang đi lên.', 'Price is above both its 50- and 200-session averages → medium- and long-term trends are both up.')
        : cls === 'DOWN'
          ? txt('Giá đang dưới cả đường trung bình 50 và 200 phiên → xu hướng trung hạn và dài hạn đều đang đi xuống.', 'Price is below both its 50- and 200-session averages → medium- and long-term trends are both down.')
          : cls === 'MIXED_RECOVERING'
            ? txt('Giá trên đường trung bình 50 phiên nhưng dưới đường 200 phiên → trung hạn đang hồi lên trong khi dài hạn vẫn yếu; xu hướng chưa thống nhất.', 'Price is above its 50-session but below its 200-session average → recovering in the medium term while the long term is still weak; the trend is not aligned.')
            : cls === 'MIXED_WEAKENING'
              ? txt('Giá dưới đường trung bình 50 phiên nhưng vẫn trên đường 200 phiên → trung hạn đang yếu đi trong bối cảnh dài hạn vẫn đi lên.', 'Price is below its 50-session but above its 200-session average → weakening in the medium term within a long-term uptrend.')
              : txt('Vị trí của giá so với các đường trung bình đang lẫn lộn → chưa có xu hướng rõ ràng.', 'Price versus its averages is mixed → no clear trend.');
  const parts: BriefText[] = [head];
  if (t.sma50Prev !== null && t.sma50Prev > 0) {
    const slope = classifySlope(t.sma50, t.sma50Prev);
    parts.push(
      slope === 'RISING'
        ? txt('Đường MA50 đang dốc lên so với 20 phiên trước.', 'MA50 is sloping up versus 20 sessions ago.')
        : slope === 'FALLING'
          ? txt('Đường MA50 đang dốc xuống so với 20 phiên trước.', 'MA50 is sloping down versus 20 sessions ago.')
          : txt('Đường MA50 gần như đi ngang so với 20 phiên trước.', 'MA50 is roughly flat versus 20 sessions ago.')
    );
  }
  if (t.rangeHigh !== null && t.rangeLow !== null && t.rangeHigh > t.rangeLow && t.rangeBars >= 20) {
    const pos = (t.close - t.rangeLow) / (t.rangeHigh - t.rangeLow);
    const windowVi = t.rangeBars >= 250 ? '52 tuần' : `${t.rangeBars} phiên có dữ liệu`;
    const windowEn = t.rangeBars >= 250 ? '52-week' : `${t.rangeBars}-session`;
    facts.push(
      numFact(txt(`Cao nhất ${windowVi}`, `${windowEn} high`), t.rangeHigh, d, meta),
      numFact(txt(`Thấp nhất ${windowVi}`, `${windowEn} low`), t.rangeLow, d, meta),
      numFact(txt('Vị trí trong biên độ (0% = đáy, 100% = đỉnh)', 'Position in range (0% = low, 100% = high)'), pos, 0, { ...meta, unit: null }, (v, l) => fmtPct(v, 0, l))
    );
    parts.push(
      both((l) =>
        l === 'vi'
          ? `Giá đang ở khoảng ${fmtPct(pos, 0, l)} của biên độ ${windowVi} (${fmtNum(t.rangeLow!, d, l)}–${fmtNum(t.rangeHigh!, d, l)}).`
          : `Price sits at about ${fmtPct(pos, 0, l)} of its ${windowEn} range (${fmtNum(t.rangeLow!, d, l)}–${fmtNum(t.rangeHigh!, d, l)}).`
      )
    );
  }
  const status: BriefSectionStatus = t.sma200 === null ? 'PARTIAL' : 'OK';
  const missing =
    t.sma200 === null
      ? txt('Chưa đủ 200 phiên dữ liệu để xét xu hướng dài hạn (MA200).', 'Fewer than 200 sessions: long-term trend (MA200) not assessed.')
      : null;
  return { section: section('trend', status, facts, join(parts.slice(0, 3)), missing), headline: head };
}

// ---------------------------------------------------------------------------------------------------
// Momentum
// ---------------------------------------------------------------------------------------------------

export interface MomentumInput {
  rsi14: number | null;
  /** Simple return over the last 20 / 60 sessions (fractions). */
  ret20: number | null;
  ret60: number | null;
  source: string;
  asOf: string | null;
}

export type RsiZone = 'OVERBOUGHT' | 'LEANING_UP' | 'BALANCED' | 'LEANING_DOWN' | 'OVERSOLD';

export function classifyRsi(rsi: number): RsiZone {
  if (rsi >= 70) return 'OVERBOUGHT';
  if (rsi > 55) return 'LEANING_UP';
  if (rsi >= 45) return 'BALANCED';
  if (rsi > 30) return 'LEANING_DOWN';
  return 'OVERSOLD';
}

export function rsiSentence(rsi: number): BriefText {
  const zone = classifyRsi(rsi);
  const v = (l: Lang) => fmtNum(rsi, 0, l);
  switch (zone) {
    case 'OVERBOUGHT':
      return both((l) =>
        l === 'vi'
          ? `RSI ${v(l)}: giá tăng nhanh trong các phiên gần đây, vùng thường gọi là "quá mua" — đây không phải tín hiệu bán.`
          : `RSI ${v(l)}: price has risen fast in recent sessions, a zone often called "overbought" — this is not a sell signal.`
      );
    case 'OVERSOLD':
      return both((l) =>
        l === 'vi'
          ? `RSI ${v(l)}: giá giảm nhanh trong các phiên gần đây, vùng thường gọi là "quá bán" — đây không phải tín hiệu mua.`
          : `RSI ${v(l)}: price has fallen fast in recent sessions, a zone often called "oversold" — this is not a buy signal.`
      );
    case 'LEANING_UP':
      return both((l) =>
        l === 'vi'
          ? `RSI ${v(l)}: lực tăng đang nhỉnh hơn lực giảm trong khoảng 14 phiên gần đây.`
          : `RSI ${v(l)}: up-moves have outweighed down-moves over the last ~14 sessions.`
      );
    case 'LEANING_DOWN':
      return both((l) =>
        l === 'vi'
          ? `RSI ${v(l)}: lực giảm đang nhỉnh hơn lực tăng trong khoảng 14 phiên gần đây.`
          : `RSI ${v(l)}: down-moves have outweighed up-moves over the last ~14 sessions.`
      );
    default:
      return both((l) =>
        l === 'vi'
          ? `RSI ${v(l)}: lực tăng và lực giảm gần như cân bằng.`
          : `RSI ${v(l)}: up- and down-moves are roughly balanced.`
      );
  }
}

export function buildMomentumSection(m: MomentumInput): BuiltSection {
  const meta = { unit: null, source: m.source, quality: 'DERIVED' as BriefFactQuality, asOf: m.asOf, freshness: 'HISTORICAL' };
  const facts: BriefFact[] = [
    numFact(txt('RSI 14 phiên', 'RSI (14)'), m.rsi14, 1, meta),
    numFact(txt('Thay đổi giá 20 phiên (~1 tháng)', '20-session change (~1 month)'), m.ret20, 2, meta, (v, l) => fmtPct(v, 2, l, true)),
    numFact(txt('Thay đổi giá 60 phiên (~3 tháng)', '60-session change (~3 months)'), m.ret60, 2, meta, (v, l) => fmtPct(v, 2, l, true)),
  ];
  if (m.rsi14 === null) {
    const reason = txt('Cần ít nhất 15 phiên dữ liệu ngày để tính RSI.', 'At least 15 daily sessions are needed for RSI.');
    return { section: section('momentum', 'UNAVAILABLE', facts, reason, reason), headline: null };
  }
  const head = rsiSentence(m.rsi14);
  const parts = [head];
  if (m.ret20 !== null) {
    parts.push(
      both((l) =>
        l === 'vi'
          ? `Trong khoảng 1 tháng (20 phiên), giá ${m.ret20! >= 0 ? 'tăng' : 'giảm'} ${fmtPct(Math.abs(m.ret20!), 1, l)}${m.ret60 !== null ? `; khoảng 3 tháng (60 phiên): ${fmtPct(m.ret60, 1, l, true)}` : ''}.`
          : `Over ~1 month (20 sessions) price is ${m.ret20! >= 0 ? 'up' : 'down'} ${fmtPct(Math.abs(m.ret20!), 1, l)}${m.ret60 !== null ? `; over ~3 months (60 sessions): ${fmtPct(m.ret60, 1, l, true)}` : ''}.`
      )
    );
  }
  const status: BriefSectionStatus = m.ret20 === null || m.ret60 === null ? 'PARTIAL' : 'OK';
  return {
    section: section(
      'momentum',
      status,
      facts,
      join(parts),
      status === 'PARTIAL' ? txt('Chưa đủ 60 phiên để tính thay đổi 3 tháng.', 'Fewer than 60 sessions for the 3-month change.') : null
    ),
    headline: head,
  };
}

// ---------------------------------------------------------------------------------------------------
// Volatility & risk
// ---------------------------------------------------------------------------------------------------

export interface RiskInput {
  price: number | null;
  atr14: number | null;
  tickSize: number | null;
  tickValue: number | null;
  currency: string;
  unit: string;
  decimals: number;
  /** Annualized 20-session realized volatility (fraction) and the median of that series over ~1 year. */
  vol20: number | null;
  volMedian: number | null;
  maxDrawdown: { value: number; peakT: string; troughT: string; recovered: boolean } | null;
  historyFrom: string | null;
  historyTo: string | null;
  source: string;
  specSource: string;
  asOf: string | null;
}

export function classifyVolRegime(vol: number, median: number): 'HIGH' | 'LOW' | 'NORMAL' {
  const r = vol / median;
  if (r > 1.25) return 'HIGH';
  if (r < 0.8) return 'LOW';
  return 'NORMAL';
}

export function buildRiskSection(r: RiskInput): BuiltSection {
  const d = r.decimals;
  const derived = { source: r.source, quality: 'DERIVED' as BriefFactQuality, asOf: r.asOf, freshness: 'HISTORICAL' };
  const spec = { source: r.specSource, quality: 'REFERENCE' as BriefFactQuality, asOf: null };
  const facts: BriefFact[] = [];
  const specOk = r.tickSize !== null && r.tickValue !== null && r.tickSize > 0;
  const perUnit = specOk ? r.tickValue! / r.tickSize! : null; // money per 1.0 price unit per contract
  facts.push(
    numFact(txt('Bước giá nhỏ nhất (1 tick)', 'Minimum tick'), r.tickSize, decimalsForTick(r.tickSize, 0), { ...spec, unit: r.unit }),
    numFact(txt('Giá trị 1 tick / hợp đồng', 'Tick value per contract'), r.tickValue, 2, { ...spec, unit: r.currency })
  );
  const atrMoney = r.atr14 !== null && perUnit !== null ? r.atr14 * perUnit : null;
  facts.push(
    numFact(txt('Biên độ trung bình 1 ngày (ATR 14)', 'Average daily range (ATR 14)'), r.atr14, d, { ...derived, unit: r.unit }),
    numFact(txt('ATR quy ra tiền / hợp đồng', 'ATR in money per contract'), atrMoney, 0, { ...derived, unit: r.currency })
  );
  if (r.price !== null && perUnit !== null) {
    facts.push(numFact(txt('Giá trị danh nghĩa 1 hợp đồng', 'Notional value of one contract'), r.price * perUnit, 0, { ...derived, unit: r.currency }));
  }
  facts.push(numFact(txt('Biến động thực tế 20 phiên (năm hoá)', '20-session realized volatility (annualized)'), r.vol20, 1, { ...derived, unit: null }, (v, l) => fmtPct(v, 1, l)));
  if (r.maxDrawdown) {
    facts.push(numFact(txt('Mức sụt giảm lớn nhất từ đỉnh', 'Maximum drawdown'), r.maxDrawdown.value, 1, { ...derived, unit: null, asOf: r.maxDrawdown.troughT }, (v, l) => fmtPct(v, 1, l)));
  }

  const parts: BriefText[] = [];
  if (specOk) {
    parts.push(
      both((l) =>
        l === 'vi'
          ? `1 tick = ${fmtNum(r.tickSize!, decimalsForTick(r.tickSize, 0), l)} ${r.unit} = ${fmtNum(r.tickValue!, 2, l)} ${r.currency}/hợp đồng${atrMoney !== null ? `; biến động trung bình 1 ngày ≈ ${fmtNum(r.atr14!, d, l)} ${r.unit} ≈ ${fmtNum(atrMoney, 0, l)} ${r.currency}/hợp đồng` : ''}.`
          : `1 tick = ${fmtNum(r.tickSize!, decimalsForTick(r.tickSize, 0), l)} ${r.unit} = ${fmtNum(r.tickValue!, 2, l)} ${r.currency} per contract${atrMoney !== null ? `; the average daily move ≈ ${fmtNum(r.atr14!, d, l)} ${r.unit} ≈ ${fmtNum(atrMoney, 0, l)} ${r.currency} per contract` : ''}.`
      )
    );
  }
  if (r.vol20 !== null && r.volMedian !== null && r.volMedian > 0) {
    const reg = classifyVolRegime(r.vol20, r.volMedian);
    parts.push(
      both((l) => {
        const v = fmtPct(r.vol20!, 0, l);
        const med = fmtPct(r.volMedian!, 0, l);
        if (l === 'vi') {
          return reg === 'HIGH'
            ? `Mức biến động hiện tại (${v}/năm) cao hơn mức thường thấy (trung vị ${med}) → giá đang dao động mạnh hơn bình thường.`
            : reg === 'LOW'
              ? `Mức biến động hiện tại (${v}/năm) thấp hơn mức thường thấy (trung vị ${med}) → giá đang dao động êm hơn bình thường.`
              : `Mức biến động hiện tại (${v}/năm) gần mức thường thấy (trung vị ${med}).`;
        }
        return reg === 'HIGH'
          ? `Current volatility (${v}/yr) is above its usual level (median ${med}) → price is swinging more than normal.`
          : reg === 'LOW'
            ? `Current volatility (${v}/yr) is below its usual level (median ${med}) → price is calmer than normal.`
            : `Current volatility (${v}/yr) is close to its usual level (median ${med}).`;
      })
    );
  }
  if (r.maxDrawdown && r.historyFrom && r.historyTo) {
    parts.push(
      both((l) =>
        l === 'vi'
          ? `Trong dữ liệu từ ${fmtDate(r.historyFrom!, l)} đến ${fmtDate(r.historyTo!, l)}, giá từng giảm sâu nhất ${fmtPct(Math.abs(r.maxDrawdown!.value), 1, l)} từ đỉnh (${fmtDate(r.maxDrawdown!.peakT, l)} → ${fmtDate(r.maxDrawdown!.troughT, l)}).`
          : `Between ${fmtDate(r.historyFrom!, l)} and ${fmtDate(r.historyTo!, l)}, the deepest fall from a peak was ${fmtPct(Math.abs(r.maxDrawdown!.value), 1, l)} (${fmtDate(r.maxDrawdown!.peakT, l)} → ${fmtDate(r.maxDrawdown!.troughT, l)}).`
      )
    );
  }
  const haveHistory = r.atr14 !== null;
  const status: BriefSectionStatus = haveHistory && specOk && r.vol20 !== null ? 'OK' : haveHistory || specOk ? 'PARTIAL' : 'UNAVAILABLE';
  const missing: BriefText | null =
    status === 'OK'
      ? null
      : !haveHistory
        ? txt('Chưa có dữ liệu giá ngày để tính ATR, biến động và drawdown.', 'No daily history for ATR, volatility and drawdown.')
        : !specOk
          ? txt('Thông số tick của hợp đồng chưa được xác minh nên không quy đổi ra tiền.', 'Tick specs are not verified, so no money conversion.')
          : txt('Chưa đủ dữ liệu để tính biến động thực tế.', 'Not enough data for realized volatility.');
  const plain = parts.length ? join(parts) : (missing ?? txt('', ''));
  return { section: section('risk', status, facts, plain, missing), headline: parts[0] ?? null };
}

// ---------------------------------------------------------------------------------------------------
// Seasonality
// ---------------------------------------------------------------------------------------------------

export interface SeasonalMonth {
  month: number;
  count: number;
  mean: number | null;
  pctPositive: number | null;
}

export interface SeasonalityInput {
  ok: boolean;
  yearsCovered: number;
  /** Approximate years of daily history available (for the missing-data message). */
  yearsAvailable: number;
  reason: string | null;
  current: SeasonalMonth | null;
  next: SeasonalMonth | null;
  source: string;
  asOf: string | null;
  /** Qualitative note from the commodity profile (reference text, not computed). */
  profileNote: string | null;
}

const MONTH_VI = (m: number) => `tháng ${m}`;
const MONTH_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function monthSentence(m: SeasonalMonth, l: Lang): string {
  const up = Math.round((m.pctPositive ?? 0) * m.count);
  if (l === 'vi') {
    return `Trong ${m.count} năm có dữ liệu, ${MONTH_VI(m.month)} có ${up}/${m.count} năm giá tăng, thay đổi trung bình ${fmtPct(m.mean ?? 0, 1, l, true)}.`;
  }
  return `In ${m.count} years of data, ${MONTH_EN[m.month - 1]} rose in ${up} of ${m.count} years, with an average change of ${fmtPct(m.mean ?? 0, 1, l, true)}.`;
}

export function buildSeasonalitySection(s: SeasonalityInput): BuiltSection {
  const facts: BriefFact[] = [];
  if (s.profileNote) {
    facts.push(textFact(txt('Ghi chú mùa vụ (hồ sơ hàng hoá, không phải số liệu tính)', 'Seasonal note (commodity profile, not computed)'), s.profileNote, { source: 'Instrument Master — commodity profile', quality: 'REFERENCE', asOf: null }));
  }
  if (!s.ok || !s.current) {
    const reason = both((l) =>
      l === 'vi'
        ? `Cần ít nhất 3 năm dữ liệu giá ngày để thống kê mùa vụ; hiện có khoảng ${fmtNum(s.yearsAvailable, 1, l)} năm. Có thể nhập file CSV lịch sử dài hơn ở mục "Nhập dữ liệu".`
        : `Seasonality needs at least 3 years of daily prices; about ${fmtNum(s.yearsAvailable, 1, l)} years are available. A longer CSV history can be added under "Data import".`
    );
    return { section: section('seasonality', 'UNAVAILABLE', facts, reason, reason), headline: null };
  }
  const meta = { unit: null, source: s.source, quality: 'DERIVED' as BriefFactQuality, asOf: s.asOf, freshness: 'HISTORICAL' };
  const addMonth = (m: SeasonalMonth) => {
    facts.push(
      numFact(both((l) => (l === 'vi' ? `Thay đổi trung bình ${MONTH_VI(m.month)}` : `Average ${MONTH_EN[m.month - 1]} change`)), m.mean, 1, meta, (v, l) => fmtPct(v, 1, l, true)),
      numFact(both((l) => (l === 'vi' ? `Tỷ lệ năm tăng giá (${MONTH_VI(m.month)})` : `Share of up years (${MONTH_EN[m.month - 1]})`)), m.pctPositive, 0, meta, (v, l) => `${fmtPct(v, 0, l)} (${Math.round(v * m.count)}/${m.count})`)
    );
  };
  addMonth(s.current);
  const parts: BriefText[] = [both((l) => monthSentence(s.current!, l))];
  if (s.next && s.next.count > 0) {
    addMonth(s.next);
    parts.push(both((l) => monthSentence(s.next!, l)));
  }
  parts.push(txt('Mẫu nhỏ, chỉ mô tả các năm trước — không phải dự báo.', 'Small sample describing past years only — not a forecast.'));
  return { section: section('seasonality', s.yearsCovered >= 5 ? 'OK' : 'PARTIAL', facts, join(parts), s.yearsCovered >= 5 ? null : txt('Dưới 5 năm dữ liệu: thống kê mùa vụ còn rất mỏng.', 'Fewer than 5 years: seasonal statistics are thin.')), headline: null };
}

// ---------------------------------------------------------------------------------------------------
// COT
// ---------------------------------------------------------------------------------------------------

export interface CotInput {
  available: boolean;
  reason: BriefText | null;
  reportDate: string | null;
  expectedReleaseDate: string | null;
  openInterest: number | null;
  mmNet: number | null;
  mmNetPctOi: number | null;
  mmChange: number | null;
  cotIndex: number | null;
  cotIndexWeeks: number | null;
  producerNet: number | null;
  /** Report older than ~17 days. */
  stale: boolean;
  source: string;
  weeksStored: number;
}

export function classifyCotIndex(ci: number): 'NEAR_HIGH' | 'NEAR_LOW' | 'MIDDLE' {
  if (ci >= 80) return 'NEAR_HIGH';
  if (ci <= 20) return 'NEAR_LOW';
  return 'MIDDLE';
}

export function buildCotSection(c: CotInput): BuiltSection {
  if (!c.available || c.mmNet === null) {
    const reason = c.reason ?? txt('Chưa có dữ liệu COT cho hàng hoá này.', 'No COT data for this commodity.');
    return { section: section('cot', 'UNAVAILABLE', [], reason, reason), headline: null };
  }
  const meta = { unit: 'contracts', source: c.source, quality: 'OFFICIAL' as BriefFactQuality, asOf: c.reportDate, freshness: c.stale ? 'STALE' : 'HISTORICAL' };
  const ctr = (l: Lang) => (l === 'vi' ? 'hợp đồng' : 'contracts');
  const facts: BriefFact[] = [
    numFact(txt('Vị thế ròng Managed Money (quỹ đầu cơ)', 'Managed Money net position'), c.mmNet, 0, meta, (v, l) => fmtSigned(v, 0, l)),
    numFact(txt('Vị thế ròng / tổng hợp đồng mở', 'Net / open interest'), c.mmNetPctOi, 1, { ...meta, unit: null, quality: 'DERIVED' }, (v, l) => `${fmtSigned(v, 1, l)}%`),
    numFact(txt('Thay đổi so với tuần trước', 'Change vs previous week'), c.mmChange, 0, { ...meta, quality: 'DERIVED' }, (v, l) => fmtSigned(v, 0, l)),
    numFact(
      both((l) => (l === 'vi' ? `COT index (${c.cotIndexWeeks ?? '—'} tuần, 0–100)` : `COT index (${c.cotIndexWeeks ?? '—'} weeks, 0–100)`)),
      c.cotIndex,
      0,
      { ...meta, unit: null, quality: 'DERIVED' }
    ),
    numFact(txt('Vị thế ròng Producer/Merchant (nhà sản xuất/thương mại)', 'Producer/Merchant net position'), c.producerNet, 0, meta, (v, l) => fmtSigned(v, 0, l)),
    numFact(txt('Tổng hợp đồng mở (OI)', 'Open interest'), c.openInterest, 0, meta),
  ];

  const head = both((l) =>
    l === 'vi'
      ? `Tính đến ${fmtDate(c.reportDate ?? '', l)}, nhóm quỹ đầu cơ đang ${c.mmNet! >= 0 ? 'mua ròng' : 'bán ròng'} ${fmtNum(Math.abs(c.mmNet!), 0, l)} ${ctr(l)}${c.mmNetPctOi !== null ? ` (≈${fmtNum(Math.abs(c.mmNetPctOi), 1, l)}% tổng hợp đồng mở)` : ''}.`
      : `As of ${fmtDate(c.reportDate ?? '', l)}, speculative funds were net ${c.mmNet! >= 0 ? 'long' : 'short'} ${fmtNum(Math.abs(c.mmNet!), 0, l)} ${ctr(l)}${c.mmNetPctOi !== null ? ` (≈${fmtNum(Math.abs(c.mmNetPctOi), 1, l)}% of open interest)` : ''}.`
  );
  const parts: BriefText[] = [head];
  if (c.mmChange !== null && c.mmChange !== 0) {
    parts.push(
      both((l) =>
        l === 'vi'
          ? `So với tuần trước, vị thế ròng ${c.mmChange! > 0 ? 'tăng' : 'giảm'} ${fmtNum(Math.abs(c.mmChange!), 0, l)} ${ctr(l)} (${c.mmChange! > 0 ? 'nghiêng thêm về phía mua' : 'nghiêng thêm về phía bán'}).`
          : `Versus the previous week the net position ${c.mmChange! > 0 ? 'rose' : 'fell'} by ${fmtNum(Math.abs(c.mmChange!), 0, l)} ${ctr(l)} (${c.mmChange! > 0 ? 'shifting toward long' : 'shifting toward short'}).`
      )
    );
  }
  if (c.cotIndex !== null && c.cotIndexWeeks !== null) {
    const cls = classifyCotIndex(c.cotIndex);
    parts.push(
      both((l) =>
        l === 'vi'
          ? `COT index ${fmtNum(c.cotIndex!, 0, l)}/100: vị thế ròng hiện ${cls === 'NEAR_HIGH' ? 'gần mức mua ròng cao nhất' : cls === 'NEAR_LOW' ? 'gần mức thấp nhất (bán ròng nhiều nhất)' : 'ở khoảng giữa'} của ${c.cotIndexWeeks} tuần gần đây.`
          : `COT index ${fmtNum(c.cotIndex!, 0, l)}/100: the net position is ${cls === 'NEAR_HIGH' ? 'near its highest' : cls === 'NEAR_LOW' ? 'near its lowest (most short)' : 'mid-range'} of the last ${c.cotIndexWeeks} weeks.`
      )
    );
  }
  if (c.stale) {
    parts.push(txt('Lưu ý: báo cáo này đã cũ hơn 2 tuần — nên đồng bộ lại ở trang COT.', 'Note: this report is more than 2 weeks old — re-sync on the COT page.'));
  }
  const status: BriefSectionStatus = c.cotIndex === null || c.stale ? 'PARTIAL' : 'OK';
  const missing =
    c.cotIndex === null
      ? both((l) =>
          l === 'vi'
            ? `Chưa đủ lịch sử để tính COT index (đang có ${c.weeksStored} tuần, cần ít nhất 26 tuần liên tục).`
            : `Not enough history for the COT index (${c.weeksStored} weeks stored, at least 26 consecutive needed).`
        )
      : c.stale
        ? txt('Báo cáo COT đã cũ.', 'COT report is stale.')
        : null;
  return { section: section('cot', status, facts, join(parts), missing), headline: head };
}

// ---------------------------------------------------------------------------------------------------
// Term structure
// ---------------------------------------------------------------------------------------------------

export interface TermStructureInput {
  available: boolean;
  reason: BriefText | null;
  shape: 'CONTANGO' | 'BACKWARDATION' | 'MIXED' | 'FLAT' | null;
  valuationDate: string | null;
  points: Array<{ contract: string; price: number; lastTradingDay: string }>;
  unit: string;
  decimals: number;
  source: string;
  quality: BriefFactQuality;
}

export function buildTermStructureSection(t: TermStructureInput): BuiltSection {
  if (!t.available || !t.shape || t.points.length < 2) {
    const reason =
      t.reason ??
      txt(
        'Cần giá đóng cửa của ít nhất 2 hợp đồng kỳ hạn cụ thể trong cùng một ngày (nhập CSV theo từng hợp đồng). Nguồn Yahoo chỉ có hợp đồng liên tục nên không dựng được đường cong.',
        'Needs same-day closes of at least 2 specific contract months (import per-contract CSVs). Yahoo only provides a continuous series, so no curve can be built.'
      );
    return { section: section('termStructure', 'UNAVAILABLE', [], reason, reason), headline: null };
  }
  const facts = t.points.map((p) =>
    numFact(both((l) => (l === 'vi' ? `${p.contract} (hết hạn ${fmtDate(p.lastTradingDay, l)})` : `${p.contract} (last trade ${fmtDate(p.lastTradingDay, l)})`)), p.price, t.decimals, {
      unit: t.unit,
      source: t.source,
      quality: t.quality,
      asOf: t.valuationDate,
      freshness: 'HISTORICAL',
    })
  );
  const near = t.points[0];
  const far = t.points[t.points.length - 1];
  const diff = far.price - near.price;
  const plain =
    t.shape === 'CONTANGO'
      ? both((l) =>
          l === 'vi'
            ? `Kỳ hạn xa đắt hơn kỳ hạn gần (contango): ${far.contract} cao hơn ${near.contract} ${fmtNum(Math.abs(diff), t.decimals, l)} ${t.unit}.`
            : `Later months are priced above nearby (contango): ${far.contract} is ${fmtNum(Math.abs(diff), t.decimals, l)} ${t.unit} above ${near.contract}.`
        )
      : t.shape === 'BACKWARDATION'
        ? both((l) =>
            l === 'vi'
              ? `Kỳ hạn gần đắt hơn kỳ hạn xa (backwardation): ${near.contract} cao hơn ${far.contract} ${fmtNum(Math.abs(diff), t.decimals, l)} ${t.unit} — thường được hiểu là hàng giao sớm đang được trả giá cao hơn.`
              : `Nearby is priced above later months (backwardation): ${near.contract} is ${fmtNum(Math.abs(diff), t.decimals, l)} ${t.unit} above ${far.contract} — usually read as prompt delivery commanding a premium.`
          )
        : t.shape === 'FLAT'
          ? txt('Giá các kỳ hạn gần như bằng nhau (đường cong phẳng).', 'Contract months are priced about the same (flat curve).')
          : txt('Đường cong kỳ hạn lúc lên lúc xuống (hỗn hợp), không theo một hướng.', 'The curve goes up and down (mixed), with no single direction.');
  return { section: section('termStructure', 'OK', facts, plain), headline: plain };
}

// ---------------------------------------------------------------------------------------------------
// Contract specs & MXV
// ---------------------------------------------------------------------------------------------------

export interface ContractInput {
  symbol: string;
  exchange: string;
  contractSize: number | null;
  contractSizeUnit: string | null;
  tickSize: number | null;
  tickValue: number | null;
  currency: string;
  unit: string;
  settlement: string | null;
  verification: string;
  specSource: string;
  tradingHoursIct: string | null;
  contractCycle: string | null;
  mxv: { symbol: string; status: string; source: string | null } | null;
  isMxvListed: boolean;
  nextContract: { code: string; mxvCode: string | null; lastTradingDay: string | null; daysToLastTrade: number | null; ltdSource: string | null } | null;
  chainAsOf: string;
}

export function buildContractSection(c: ContractInput): BuiltSection {
  const spec = { source: c.specSource, quality: 'REFERENCE' as BriefFactQuality, asOf: null, freshness: c.verification };
  const facts: BriefFact[] = [
    numFact(txt('Khối lượng 1 hợp đồng', 'Contract size'), c.contractSize, 0, { ...spec, unit: c.contractSizeUnit }),
    numFact(txt('Bước giá nhỏ nhất', 'Minimum tick'), c.tickSize, decimalsForTick(c.tickSize, 0), { ...spec, unit: c.unit }),
    numFact(txt('Giá trị 1 tick', 'Tick value'), c.tickValue, 2, { ...spec, unit: c.currency }),
  ];
  if (c.settlement) facts.push(textFact(txt('Hình thức thanh toán', 'Settlement'), c.settlement === 'PHYSICAL' ? txt('Giao nhận vật chất', 'Physical delivery') : c.settlement === 'CASH' ? txt('Thanh toán tiền mặt', 'Cash settled') : c.settlement, spec));
  if (c.contractCycle) facts.push(textFact(txt('Các tháng đáo hạn', 'Contract months'), c.contractCycle, spec));
  if (c.tradingHoursIct) facts.push(textFact(txt('Giờ giao dịch (giờ Việt Nam)', 'Trading hours (Vietnam time)'), c.tradingHoursIct, spec));
  facts.push(
    textFact(
      txt('Mã trên MXV', 'MXV code'),
      c.mxv ? `${c.mxv.symbol}` : c.isMxvListed ? null : txt('Chưa niêm yết trên MXV', 'Not listed on MXV'),
      { source: c.mxv?.source ?? 'Instrument Master', quality: 'REFERENCE', asOf: null, freshness: c.mxv?.status ?? null }
    )
  );
  if (c.nextContract) {
    facts.push(
      textFact(txt('Hợp đồng gần nhất', 'Nearest contract'), c.nextContract.mxvCode ? `${c.nextContract.code} / MXV ${c.nextContract.mxvCode}` : c.nextContract.code, {
        source: 'Contract chain (exchange rule)',
        quality: 'DERIVED',
        asOf: c.chainAsOf,
      }),
      textFact(
        txt('Ngày giao dịch cuối (ước tính theo quy tắc sàn)', 'Last trading day (computed from exchange rule)'),
        c.nextContract.lastTradingDay ? both((l) => `${fmtDate(c.nextContract!.lastTradingDay!, l)}${c.nextContract!.daysToLastTrade !== null ? (l === 'vi' ? ` (còn ${c.nextContract!.daysToLastTrade} ngày)` : ` (${c.nextContract!.daysToLastTrade} days)`) : ''}`) : null,
        { source: c.nextContract.ltdSource ?? 'Contract chain', quality: 'DERIVED', asOf: c.chainAsOf }
      )
    );
  }

  const specOk = c.contractSize !== null && c.tickSize !== null && c.tickValue !== null;
  const parts: BriefText[] = [];
  if (specOk) {
    parts.push(
      both((l) =>
        l === 'vi'
          ? `Một hợp đồng ${c.symbol} = ${fmtNum(c.contractSize!, 0, l)} ${c.contractSizeUnit ?? ''}; giá nhảy tối thiểu ${fmtNum(c.tickSize!, decimalsForTick(c.tickSize, 0), l)} ${c.unit}, tương ứng ${fmtNum(c.tickValue!, 2, l)} ${c.currency} mỗi hợp đồng.`
          : `One ${c.symbol} contract = ${fmtNum(c.contractSize!, 0, l)} ${c.contractSizeUnit ?? ''}; the minimum price step is ${fmtNum(c.tickSize!, decimalsForTick(c.tickSize, 0), l)} ${c.unit}, worth ${fmtNum(c.tickValue!, 2, l)} ${c.currency} per contract.`
      )
    );
  }
  if (c.nextContract?.lastTradingDay) {
    parts.push(
      both((l) =>
        l === 'vi'
          ? `Hợp đồng gần nhất ${c.nextContract!.code} có ngày giao dịch cuối ${fmtDate(c.nextContract!.lastTradingDay!, l)}${c.nextContract!.daysToLastTrade !== null ? ` (còn ${c.nextContract!.daysToLastTrade} ngày)` : ''} — ngày tính theo quy tắc sàn, cần đối chiếu lịch chính thức.`
          : `The nearest contract ${c.nextContract!.code} has its last trading day on ${fmtDate(c.nextContract!.lastTradingDay!, l)}${c.nextContract!.daysToLastTrade !== null ? ` (${c.nextContract!.daysToLastTrade} days)` : ''} — computed from the exchange rule; confirm on the official calendar.`
      )
    );
  }
  parts.push(
    c.mxv
      ? txt(`Trên MXV, hàng hoá này giao dịch với mã ${c.mxv.symbol}.`, `On MXV this commodity trades as ${c.mxv.symbol}.`)
      : c.isMxvListed
        ? txt('Có niêm yết trên MXV nhưng chưa có mã đối chiếu đã xác minh.', 'Listed on MXV but no verified code mapping yet.')
        : txt('Hàng hoá này hiện chưa niêm yết trên MXV; dùng làm tham chiếu quốc tế.', 'This commodity is not listed on MXV; it serves as an international reference.')
  );
  const status: BriefSectionStatus = specOk ? (c.nextContract?.lastTradingDay ? 'OK' : 'PARTIAL') : 'PARTIAL';
  return {
    section: section(
      'contract',
      status,
      facts,
      join(parts),
      status === 'OK' ? null : !specOk ? txt('Một số thông số hợp đồng chưa được xác minh.', 'Some contract specs are not verified.') : txt('Chưa tính được ngày hết hạn của hợp đồng gần nhất.', 'Nearest contract expiry could not be computed.')
    ),
    headline: null,
  };
}

// ---------------------------------------------------------------------------------------------------
// Missing data & summary
// ---------------------------------------------------------------------------------------------------

export function buildMissingSection(sections: BriefSection[]): BriefSection {
  const gaps = sections.filter((s) => s.status !== 'OK' && s.id !== 'missing');
  const facts: BriefFact[] = gaps.map((s) => ({
    label: SECTION_TITLES[s.id],
    value: s.missingReason ?? txt('Thiếu một phần dữ liệu.', 'Partly missing.'),
    unit: null,
    source: 'App',
    quality: 'DERIVED',
    freshness: s.status,
    asOf: null,
  }));
  const plain =
    gaps.length === 0
      ? txt('Tất cả các mục đều có dữ liệu.', 'Every section has data.')
      : both((l) =>
          l === 'vi'
            ? `${gaps.length} mục chưa đầy đủ dữ liệu: ${gaps.map((g) => SECTION_TITLES[g.id].vi).join(', ')}. Ứng dụng không tự điền số liệu thiếu.`
            : `${gaps.length} section(s) lack data: ${gaps.map((g) => SECTION_TITLES[g.id].en).join(', ')}. The app never fills in missing numbers.`
        );
  return { id: 'missing', status: gaps.length === 0 ? 'OK' : 'PARTIAL', facts, plainText: plain, whatItMeans: WHAT_IT_MEANS.missing, missingReason: null };
}

/** 3–5 takeaways for "Tóm tắt nhanh", in a fixed order of priority. */
export function buildSummary(built: Partial<Record<BriefSectionId, BuiltSection>>): BriefText[] {
  const order: BriefSectionId[] = ['price', 'trend', 'momentum', 'risk', 'cot', 'termStructure'];
  const out: BriefText[] = [];
  for (const id of order) {
    const h = built[id]?.headline;
    if (h && h.vi && out.length < 5) out.push(h);
  }
  if (out.length < 3) {
    out.push(
      txt(
        'Dữ liệu hiện có còn ít nên phần tóm tắt bị hạn chế — xem mục "Dữ liệu còn thiếu" để biết cách bổ sung.',
        'Limited data, so the summary is short — see "Missing data" for how to add more.'
      )
    );
  }
  return out;
}

export const BRIEF_DISCLAIMER: BriefText = txt(
  'Công cụ nghiên cứu, không phải khuyến nghị mua/bán. Các câu mô tả được tạo tự động từ số liệu theo mẫu cố định.',
  'Research tool, not a buy/sell recommendation. Sentences are generated automatically from the numbers using fixed templates.'
);
