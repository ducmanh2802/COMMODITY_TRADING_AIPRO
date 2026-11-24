/**
 * Calendar-date helpers for contract calendars (pure, timezone-free).
 *
 * Dates are ISO calendar dates `YYYY-MM-DD` with no time-of-day and no timezone: an exchange
 * "business day" is a calendar date in the exchange's own zone, so all arithmetic is done on
 * UTC-midnight day numbers purely as a calendar device.
 *
 * Business days: Monday-Friday, minus a holiday list. Exchange holiday lists live in ./holidays
 * (bundled, each date marked PUBLISHED or PROJECTED with its source) and are applied by expiry.ts.
 */

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export type IsoDate = string;

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string') return false;
  const m = ISO_DATE_RE.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  return d <= daysInMonth(y, mo);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Days since 1970-01-01 for an ISO date. Throws on invalid input. */
export function toDayNumber(date: IsoDate): number {
  if (!isIsoDate(date)) throw new RangeError(`Invalid ISO date: ${String(date)}`);
  const [y, m, d] = date.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

function fromDayNumber(day: number): IsoDate {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

export function makeDate(year: number, month: number, day: number): IsoDate {
  const s = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (!isIsoDate(s)) throw new RangeError(`Invalid calendar date ${year}-${month}-${day}`);
  return s;
}

export function addCalendarDays(date: IsoDate, days: number): IsoDate {
  return fromDayNumber(toDayNumber(date) + days);
}

export function calendarDaysBetween(from: IsoDate, to: IsoDate): number {
  return toDayNumber(to) - toDayNumber(from);
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekday(date: IsoDate): number {
  return (((toDayNumber(date) + 4) % 7) + 7) % 7; // 1970-01-01 was a Thursday (4)
}

/** Shift (year, month) by `offset` months; month is 1-12. */
export function shiftMonth(year: number, month: number, offset: number): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + offset;
  return { year: Math.floor(idx / 12), month: (((idx % 12) + 12) % 12) + 1 };
}

/** UTC calendar date of an ISO-8601 timestamp (e.g. a candle timestamp). Returns null if invalid. */
export function utcDateOfTimestamp(timestamp: string): IsoDate | null {
  const t = Date.parse(timestamp);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

export class BusinessCalendar {
  private readonly holidays: ReadonlySet<string>;

  /** @param holidays extra non-business dates (YYYY-MM-DD). Weekends are always non-business. */
  constructor(holidays: readonly string[] = []) {
    for (const h of holidays) {
      if (!isIsoDate(h)) throw new RangeError(`Invalid holiday date: ${String(h)}`);
    }
    this.holidays = new Set(holidays);
  }

  get hasHolidays(): boolean {
    return this.holidays.size > 0;
  }

  isBusinessDay(date: IsoDate): boolean {
    const wd = weekday(date);
    return wd !== 0 && wd !== 6 && !this.holidays.has(date);
  }

  /** The n-th business day strictly before `date` (n >= 1). n = 0 returns `date` unchanged. */
  businessDaysBefore(date: IsoDate, n: number): IsoDate {
    if (!Number.isInteger(n) || n < 0) throw new RangeError('n must be a non-negative integer');
    let day = toDayNumber(date);
    let remaining = n;
    while (remaining > 0) {
      day -= 1;
      if (this.isBusinessDay(fromDayNumber(day))) remaining -= 1;
    }
    return fromDayNumber(day);
  }

  /** The n-th business day strictly after `date` (n >= 1). n = 0 returns `date` unchanged. */
  businessDaysAfter(date: IsoDate, n: number): IsoDate {
    if (!Number.isInteger(n) || n < 0) throw new RangeError('n must be a non-negative integer');
    let day = toDayNumber(date);
    let remaining = n;
    while (remaining > 0) {
      day += 1;
      if (this.isBusinessDay(fromDayNumber(day))) remaining -= 1;
    }
    return fromDayNumber(day);
  }

  /** `date` if it is a business day, otherwise the closest business day before it. */
  onOrBefore(date: IsoDate): IsoDate {
    return this.isBusinessDay(date) ? date : this.businessDaysBefore(date, 1);
  }

  /** `date` if it is a business day, otherwise the closest business day after it. */
  onOrAfter(date: IsoDate): IsoDate {
    return this.isBusinessDay(date) ? date : this.businessDaysAfter(date, 1);
  }

  lastBusinessDayOfMonth(year: number, month: number): IsoDate {
    return this.onOrBefore(makeDate(year, month, daysInMonth(year, month)));
  }

  firstBusinessDayOfMonth(year: number, month: number): IsoDate {
    return this.onOrAfter(makeDate(year, month, 1));
  }

  /** n-th business day of the month (n >= 1), counting the first business day as 1. */
  nthBusinessDayOfMonth(year: number, month: number, n: number): IsoDate {
    if (!Number.isInteger(n) || n < 1) throw new RangeError('n must be >= 1');
    return this.businessDaysAfter(this.firstBusinessDayOfMonth(year, month), n - 1);
  }
}
