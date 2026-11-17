/**
 * Bundled exchange holiday calendars used for last-trading-day / first-notice-day arithmetic.
 *
 *  CME_US               CME Group (CBOT/NYMEX/COMEX) - PROJECTED from US exchange holiday rules
 *  ICE_US               ICE Futures U.S. softs       - PROJECTED from the same US rule set
 *  ICE_EU_SOFTS_LONDON  ICE Futures Europe softs (London robusta) - PUBLISHED UK bank holidays
 *  SG_PUBLIC            Singapore public holidays (SGX / CME iron ore rule) - PUBLISHED by MOM
 *
 * ICE Futures Europe ENERGY (Brent) is deliberately NOT mapped to UK bank holidays: Brent trades on
 * several UK bank holidays and ICE's energy holiday schedule could not be sourced, so Brent dates
 * stay Mon-Fri with an explicit warning.
 */
import { isIsoDate, type IsoDate } from '../dates.ts';
import type { HolidayCalendar, HolidayCalendarId, HolidayEntry } from './types.ts';
import { projectUsExchangeRange, US_PROJECTION_FIRST_YEAR, US_PROJECTION_LAST_YEAR } from './usExchange.ts';
import {
  SG_DATASET_URL_PREFIX,
  SG_PUBLIC_HOLIDAYS,
  UK_BANK_HOLIDAYS_ENGLAND_WALES,
  UK_BANK_HOLIDAYS_SOURCE,
} from './publishedData.ts';

export * from './types.ts';
export { easterSunday, projectUsExchangeHolidays } from './usExchange.ts';

const CME_HOLIDAY_PAGE = 'https://www.cmegroup.com/tools-information/holiday-calendar.html';
const ICE_HOLIDAY_PAGE = 'https://www.ice.com/holiday-hours';

function yearsOf(entries: readonly HolidayEntry[]): { fromYear: number; toYear: number } {
  const years = entries.map((e) => Number(e.date.slice(0, 4)));
  return { fromYear: Math.min(...years), toYear: Math.max(...years) };
}

const UK_ENTRIES: HolidayEntry[] = UK_BANK_HOLIDAYS_ENGLAND_WALES.map(([date, name]) => ({
  date,
  name,
  status: 'PUBLISHED',
  sourceUrl: UK_BANK_HOLIDAYS_SOURCE,
}));

const SG_ENTRIES: HolidayEntry[] = SG_PUBLIC_HOLIDAYS.map(([date, name, datasetId]) => ({
  date,
  name,
  status: 'PUBLISHED',
  sourceUrl: `${SG_DATASET_URL_PREFIX}${datasetId}/view`,
}));

export const HOLIDAY_CALENDARS: Record<HolidayCalendarId, HolidayCalendar> = {
  CME_US: {
    id: 'CME_US',
    name: 'CME Group US holidays (CBOT, NYMEX, COMEX)',
    coverage: { fromYear: US_PROJECTION_FIRST_YEAR, toYear: US_PROJECTION_LAST_YEAR },
    officialScheduleUrl: CME_HOLIDAY_PAGE,
    notes: [
      'PROJECTED from US exchange holiday rules; the CME holiday page could not be fetched to verify. Unscheduled closures (e.g. days of mourning) are not included.',
    ],
    entries: projectUsExchangeRange(US_PROJECTION_FIRST_YEAR, US_PROJECTION_LAST_YEAR, CME_HOLIDAY_PAGE),
  },
  ICE_US: {
    id: 'ICE_US',
    name: 'ICE Futures U.S. holidays (softs)',
    coverage: { fromYear: US_PROJECTION_FIRST_YEAR, toYear: US_PROJECTION_LAST_YEAR },
    officialScheduleUrl: ICE_HOLIDAY_PAGE,
    notes: [
      'PROJECTED from US exchange holiday rules; ICE publishes holiday hours as notices/PDFs which were not verified. Unscheduled closures are not included.',
    ],
    entries: projectUsExchangeRange(US_PROJECTION_FIRST_YEAR, US_PROJECTION_LAST_YEAR, ICE_HOLIDAY_PAGE),
  },
  ICE_EU_SOFTS_LONDON: {
    id: 'ICE_EU_SOFTS_LONDON',
    name: 'ICE Futures Europe softs - England & Wales bank holidays',
    coverage: yearsOf(UK_ENTRIES),
    officialScheduleUrl: ICE_HOLIDAY_PAGE,
    notes: [
      'Dates are the UK Government published bank holidays; that ICE Futures Europe softs close on every England & Wales bank holiday is an assumption to confirm on the ICE holiday schedule.',
    ],
    entries: UK_ENTRIES,
  },
  SG_PUBLIC: {
    id: 'SG_PUBLIC',
    name: 'Singapore public holidays (Ministry of Manpower)',
    coverage: yearsOf(SG_ENTRIES),
    officialScheduleUrl: 'https://www.mom.gov.sg/employment-practices/public-holidays',
    notes: ['Published by the Singapore Ministry of Manpower; weekend holidays carry their published observed Monday.'],
    entries: SG_ENTRIES,
  },
};

export function getHolidayCalendar(id: HolidayCalendarId): HolidayCalendar {
  return HOLIDAY_CALENDARS[id];
}

export interface ResolvedHolidays {
  calendars: HolidayCalendarId[];
  /** Weekday holidays only (weekends are non-business anyway), deduplicated, sorted. */
  dates: IsoDate[];
  entries: HolidayEntry[];
  /** Years requested but outside some calendar's coverage. */
  uncoveredYears: number[];
}

/** Union of the given calendars' holidays for years [fromYear, toYear]. */
export function resolveHolidays(
  ids: readonly HolidayCalendarId[],
  fromYear: number,
  toYear: number
): ResolvedHolidays {
  const byDate = new Map<string, HolidayEntry>();
  const uncovered = new Set<number>();
  for (const id of ids) {
    const cal = HOLIDAY_CALENDARS[id];
    for (let y = fromYear; y <= toYear; y++) {
      if (y < cal.coverage.fromYear || y > cal.coverage.toYear) uncovered.add(y);
    }
    for (const e of cal.entries) {
      const y = Number(e.date.slice(0, 4));
      if (y < fromYear || y > toYear || !isIsoDate(e.date)) continue;
      const wd = new Date(`${e.date}T00:00:00Z`).getUTCDay();
      if (wd === 0 || wd === 6) continue;
      const prev = byDate.get(e.date);
      // A PROJECTED entry never hides a PUBLISHED one for the same date.
      if (!prev || (prev.status === 'PROJECTED' && e.status === 'PUBLISHED')) byDate.set(e.date, e);
    }
  }
  const entries = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  return {
    calendars: [...ids],
    dates: entries.map((e) => e.date),
    entries,
    uncoveredYears: [...uncovered].sort((a, b) => a - b),
  };
}
