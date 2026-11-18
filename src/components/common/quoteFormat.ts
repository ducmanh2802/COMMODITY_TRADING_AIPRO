import type { MarketQuote } from '../../shared/types/market';
import { fmtNum, hasKey, type TFunction } from '../../i18n';

const VN_TZ = 'Asia/Ho_Chi_Minh';

/** "HH:mm" in Vietnam time; prefixed with "dd/MM" when the timestamp is not today. Null when unknown. */
export function fmtClock(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const day = (x: Date) => x.toLocaleDateString('en-CA', { timeZone: VN_TZ });
  const hm = d.toLocaleTimeString('vi-VN', { timeZone: VN_TZ, hour: '2-digit', minute: '2-digit', hour12: false });
  if (day(d) === day(new Date())) return hm;
  const dm = d.toLocaleDateString('vi-VN', { timeZone: VN_TZ, day: '2-digit', month: '2-digit' });
  return `${dm} ${hm}`;
}

/** Quote unit in plain words (falls back to the raw unit, then the currency). */
export function plainUnit(t: TFunction, quote: Pick<MarketQuote, 'unit' | 'currency'>): string {
  const k = `fr.unit.${quote.unit}`;
  if (hasKey(k)) return t(k);
  return quote.unit && quote.unit !== 'UNSPECIFIED' ? quote.unit : quote.currency;
}

/** True when the quote carries a real, finite price. */
export function hasPrice(q: MarketQuote | undefined): q is MarketQuote & { price: number } {
  return q?.price !== null && q?.price !== undefined && Number.isFinite(q.price);
}

/** Readable price: locale separators, 2–4 decimals (never rounds away meaningful digits like 5,736). */
export function fmtPrice(price: number): string {
  return fmtNum(price, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}
