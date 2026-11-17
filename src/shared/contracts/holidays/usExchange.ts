/**
 * US exchange holiday PROJECTION (CME Group and ICE Futures U.S. full-closure holidays).
 *
 * The exchanges' own holiday pages could not be fetched from the build environment
 * (cmegroup.com resets the connection; ice.com links PDFs/notices only), so the dates here are
 * generated from the standing US exchange holiday rules and are marked PROJECTED - never PUBLISHED.
 * Cross-check performed on 2026-11-18: the rule set reproduces every date of the NYSE published
 * schedule for 2026, 2027 and 2028 (https://www.nyse.com/markets/hours-calendars), including
 * "Christmas observed Fri 2027-12-24" and "no New Year holiday in 2028 (Jan 1 is a Saturday)".
 *
 * Rules (full closures; early closes are not modeled because they do not change business days):
 *   New Year's Day   Jan 1; Sunday -> Monday Jan 2; Saturday -> NOT observed (Dec 31 stays open)
 *   MLK Day          3rd Monday of January
 *   Presidents Day   3rd Monday of February
 *   Good Friday      Friday before Easter Sunday (Gregorian computus)
 *   Memorial Day     last Monday of May
 *   Juneteenth       Jun 19 from 2022; Saturday -> Friday, Sunday -> Monday
 *   Independence Day Jul 4; Saturday -> Friday, Sunday -> Monday
 *   Labor Day        1st Monday of September
 *   Thanksgiving     4th Thursday of November
 *   Christmas        Dec 25; Saturday -> Friday, Sunday -> Monday
 *
 * NOT included: unscheduled closures (e.g. national days of mourning such as 2018-12-05 and
 * 2025-01-09, where CME/ICE handling differed by product), and product-specific half days.
 */
import { addCalendarDays, daysInMonth, makeDate, weekday, type IsoDate } from '../dates.ts';
import type { HolidayEntry } from './types.ts';

export const US_PROJECTION_FIRST_YEAR = 2018;
export const US_PROJECTION_LAST_YEAR = 2030;

/** Easter Sunday (Gregorian), anonymous Meeus/Jones/Butcher algorithm. */
export function easterSunday(year: number): IsoDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return makeDate(year, month, day);
}

/** n-th (1-based) given weekday (0=Sun) of a month. */
function nthWeekday(year: number, month: number, wd: number, n: number): IsoDate {
  const first = makeDate(year, month, 1);
  const offset = (wd - weekday(first) + 7) % 7;
  return addCalendarDays(first, offset + 7 * (n - 1));
}

function lastWeekday(year: number, month: number, wd: number): IsoDate {
  const last = makeDate(year, month, daysInMonth(year, month));
  return addCalendarDays(last, -((weekday(last) - wd + 7) % 7));
}

/** Saturday -> Friday, Sunday -> Monday. */
function observedFixed(date: IsoDate): IsoDate {
  const wd = weekday(date);
  if (wd === 6) return addCalendarDays(date, -1);
  if (wd === 0) return addCalendarDays(date, 1);
  return date;
}

export function projectUsExchangeHolidays(year: number, sourceUrl: string): HolidayEntry[] {
  const out: { date: IsoDate; name: string }[] = [];
  const ny = makeDate(year, 1, 1);
  if (weekday(ny) === 0) out.push({ date: makeDate(year, 1, 2), name: "New Year's Day (observed)" });
  else if (weekday(ny) !== 6) out.push({ date: ny, name: "New Year's Day" });
  out.push({ date: nthWeekday(year, 1, 1, 3), name: 'Martin Luther King Jr. Day' });
  out.push({ date: nthWeekday(year, 2, 1, 3), name: "Presidents' Day" });
  out.push({ date: addCalendarDays(easterSunday(year), -2), name: 'Good Friday' });
  out.push({ date: lastWeekday(year, 5, 1), name: 'Memorial Day' });
  if (year >= 2022) out.push({ date: observedFixed(makeDate(year, 6, 19)), name: 'Juneteenth' });
  out.push({ date: observedFixed(makeDate(year, 7, 4)), name: 'Independence Day' });
  out.push({ date: nthWeekday(year, 9, 1, 1), name: 'Labor Day' });
  out.push({ date: nthWeekday(year, 11, 4, 4), name: 'Thanksgiving Day' });
  out.push({ date: observedFixed(makeDate(year, 12, 25)), name: 'Christmas Day' });
  return out.map((h) => ({ ...h, status: 'PROJECTED' as const, sourceUrl }));
}

export function projectUsExchangeRange(fromYear: number, toYear: number, sourceUrl: string): HolidayEntry[] {
  const all: HolidayEntry[] = [];
  for (let y = fromYear; y <= toYear; y++) all.push(...projectUsExchangeHolidays(y, sourceUrl));
  return all;
}
