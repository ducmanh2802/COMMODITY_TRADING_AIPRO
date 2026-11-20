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

/** "09/2026" for a monthly period (YYYY-MM), "17/11/2026" for a daily one (YYYY-MM-DD). */
export function fmtBenchmarkPeriod(period: string): string {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(period);
  if (!m) return period;
  return m[3] ? `${m[3]}/${m[2]}/${m[1]}` : `${m[2]}/${m[1]}`;
}

/**
 * Plain-language reason for a quote with no live price (replaces raw provider text such as
 * "DATA_UNAVAILABLE — ICE_API_KEY not configured..."). Technical detail stays in `quote.statusReason`
 * and is meant for tooltips only. Null when there is nothing to explain.
 */
export function friendlyQuoteReason(t: TFunction, q: MarketQuote | undefined): string | null {
  if (!q) return null;
  if (q.kind === 'BENCHMARK' && q.benchmark) {
    const key = q.benchmark.periodicity === 'MONTHLY' ? 'fr.reason.BENCHMARK_MONTHLY' : 'fr.reason.BENCHMARK_DAILY';
    return t(key, { period: fmtBenchmarkPeriod(q.benchmark.period) });
  }
  if (q.status === 'UNAVAILABLE' || q.price === null) return t('fr.reason.NO_FREE_SOURCE');
  return null;
}
