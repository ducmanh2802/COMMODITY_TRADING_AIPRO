/**
 * Futures month codes and contract-code parsing/formatting.
 *
 * Contract code grammar: ROOT + MONTH_CODE + YEAR, e.g. `ZCH27`, `CLZ2026`, `ZCEH27` (MXV root ZCE),
 * `ZCH7` (CME Globex single-digit year). The month code is always the letter immediately before the
 * trailing year digits, so the split is unambiguous even when the root itself ends in a month letter.
 *
 * Year resolution (explicit pivot rule):
 * - 4 digits: taken literally.
 * - 2 digits `yy`: the unique year ending in `yy` inside [referenceYear - 80, referenceYear + 19].
 *   (Listings run at most ~13 years out; history goes back decades.) e.g. reference 2026:
 *   `27` -> 2027, `45` -> 2045, `46` -> 1946, `99` -> 1999.
 * - 1 digit `y`: the unique year ending in `y` inside [referenceYear - 2, referenceYear + 7]
 *   (single-digit codes only make sense for currently-listed or just-expired contracts).
 *   e.g. reference 2026: window 2024..2033, so `4` -> 2024, `7` -> 2027, `3` -> 2033.
 * When the year was resolved from fewer than 4 digits, `yearInferred` is true.
 * `referenceYear` defaults to the current UTC year; pass it explicitly for reproducible results.
 */

export const MONTH_CODES = ['F', 'G', 'H', 'J', 'K', 'M', 'N', 'Q', 'U', 'V', 'X', 'Z'] as const;
export type MonthCode = (typeof MONTH_CODES)[number];

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function isMonthCode(value: string): value is MonthCode {
  return (MONTH_CODES as readonly string[]).includes(value);
}

/** Month code -> month number 1-12. */
export function monthCodeToMonth(code: string): number {
  const idx = (MONTH_CODES as readonly string[]).indexOf(code.toUpperCase());
  if (idx < 0) throw new RangeError(`Unknown month code: ${code}`);
  return idx + 1;
}

/** Month number 1-12 -> month code. */
export function monthToMonthCode(month: number): MonthCode {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`Month must be an integer 1-12, got ${month}`);
  }
  return MONTH_CODES[month - 1];
}

export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? '?';
}

/** Extracts month codes from free text such as `'H K N U Z (Mar, May, Jul, Sep, Dec)'`. */
export function parseMonthCodeList(text: string): MonthCode[] {
  const head = text.split('(')[0];
  const tokens = head.split(/[\s,]+/).filter(Boolean);
  const out: MonthCode[] = [];
  for (const t of tokens) {
    if (isMonthCode(t) && !out.includes(t)) out.push(t);
  }
  return out;
}

export interface ParsedContractCode {
  root: string;
  monthCode: MonthCode;
  month: number;
  year: number;
  yearDigits: 1 | 2 | 4;
  yearInferred: boolean;
}

export interface ParseContractCodeOptions {
  referenceYear?: number;
  /** If given, the root must be one of these (case-insensitive). */
  knownRoots?: readonly string[];
}

const CONTRACT_CODE_RE = /^([A-Z0-9]*[A-Z])([FGHJKMNQUVXZ])(\d{1}|\d{2}|\d{4})$/;

function resolveYear(digits: string, referenceYear: number): number {
  if (digits.length === 4) return Number(digits);
  if (digits.length === 2) {
    const yy = Number(digits);
    const lo = referenceYear - 80;
    // Unique year y in [lo, lo + 99] with y % 100 === yy.
    return lo + ((((yy - lo) % 100) + 100) % 100);
  }
  if (digits.length === 1) {
    const y = Number(digits);
    const lo = referenceYear - 2;
    return lo + ((((y - lo) % 10) + 10) % 10);
  }
  throw new RangeError(`Unsupported year digits: ${digits}`);
}

/** Parses a contract code; returns null if it does not match the grammar (or the root is unknown). */
export function parseContractCode(
  code: string,
  options: ParseContractCodeOptions = {}
): ParsedContractCode | null {
  const normalized = code.trim().toUpperCase();
  const m = CONTRACT_CODE_RE.exec(normalized);
  if (!m) return null;
  const [, root, monthCode, digits] = m;
  if (options.knownRoots && !options.knownRoots.some((r) => r.toUpperCase() === root)) return null;
  const referenceYear = options.referenceYear ?? new Date().getUTCFullYear();
  return {
    root,
    monthCode: monthCode as MonthCode,
    month: monthCodeToMonth(monthCode),
    year: resolveYear(digits, referenceYear),
    yearDigits: digits.length as 1 | 2 | 4,
    yearInferred: digits.length !== 4,
  };
}

export function formatContractCode(
  root: string,
  month: number,
  year: number,
  yearDigits: 1 | 2 | 4 = 2
): string {
  if (!/^[A-Z0-9]*[A-Z]$/.test(root)) throw new RangeError(`Invalid root: ${root}`);
  if (!Number.isInteger(year) || year < 1000 || year > 9999) throw new RangeError(`Invalid year: ${year}`);
  const y = String(year).slice(4 - yearDigits);
  return `${root}${monthToMonthCode(month)}${y}`;
}
