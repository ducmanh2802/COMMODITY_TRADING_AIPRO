import { getLang } from './lang';

/** Display locale for the active UI language. Data stays ISO / plain numbers internally. */
export function displayLocale(): string {
  return getLang() === 'vi' ? 'vi-VN' : 'en-US';
}

/** Format a number for display (vi-VN: 1.234,56). Returns '—' for null/undefined/NaN. */
export function fmtNum(value: number | null | undefined, opts: Intl.NumberFormatOptions = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString(displayLocale(), opts);
}

/** Format a number with a fixed number of decimals. */
export function fmtFixed(value: number | null | undefined, digits: number): string {
  return fmtNum(value, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Format an integer (rounded) with thousands separators. */
export function fmtInt(value: number | null | undefined): string {
  return fmtNum(value === null || value === undefined ? value : Math.round(value), { maximumFractionDigits: 0 });
}

function toDate(value: string | number | Date): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date only, e.g. 18/11/2026. Plain ISO dates (YYYY-MM-DD) are formatted without timezone shift. */
export function fmtDate(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-');
    return getLang() === 'vi' ? `${d}/${m}/${y}` : value;
  }
  const d = toDate(value);
  if (!d) return String(value);
  return d.toLocaleDateString(displayLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Date + time (browser local time), e.g. 18/11/2026 14:05. */
export function fmtDateTime(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const d = toDate(value);
  if (!d) return String(value);
  return d.toLocaleString(displayLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
