import type { IsoDate } from '../dates.ts';

/**
 * PUBLISHED: copied from an official published holiday list (the list's URL is `sourceUrl`).
 * PROJECTED: generated from the documented recurrence rules of the calendar; not checked against an
 *            exchange publication for that year (special/unscheduled closures are never projected).
 */
export type HolidayStatus = 'PUBLISHED' | 'PROJECTED';

export interface HolidayEntry {
  date: IsoDate;
  name: string;
  status: HolidayStatus;
  /** Where the date comes from: the published list, or the official page the rule set should be checked against. */
  sourceUrl: string;
}

export type HolidayCalendarId = 'CME_US' | 'ICE_US' | 'ICE_EU_SOFTS_LONDON' | 'SG_PUBLIC';

export interface HolidayCalendar {
  id: HolidayCalendarId;
  name: string;
  /** Inclusive range of calendar years whose holidays are fully listed. Outside it nothing is applied. */
  coverage: { fromYear: number; toYear: number };
  /** Official page for the venue's holiday schedule (what a user should confirm against). */
  officialScheduleUrl: string;
  /** Known limitations that apply to every date of this calendar. */
  notes: string[];
  entries: readonly HolidayEntry[];
}
