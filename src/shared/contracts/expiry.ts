import { BusinessCalendar, daysInMonth, makeDate, shiftMonth, toDayNumber, type IsoDate } from './dates.ts';
import { resolveHolidays, type HolidayCalendarId, type HolidayEntry } from './holidays/index.ts';
import {
  getCalendarSpec,
  type CalendarVerification,
  type DateAnchor,
  type EncodedDateRule,
} from './calendarSpecs.ts';

export const NO_HOLIDAY_WARNING =
  'Business days are Mon-Fri only; exchange holidays were NOT applied. The official date can be earlier when a holiday falls in the counting window - confirm on the exchange expiry calendar.';
export const CALLER_HOLIDAY_WARNING =
  'Holidays applied from a caller-supplied list; its completeness against the official exchange calendar is not verified.';
export const PROJECTED_HOLIDAY_WARNING =
  "Holidays applied from a PROJECTED calendar (generated from the standing holiday rules, not checked against the exchange's published schedule; unscheduled closures are excluded) - confirm on the exchange expiry calendar.";
export const PUBLISHED_HOLIDAY_NOTE =
  'Holidays applied from bundled PUBLISHED holiday lists (see holidaysInWindow[].sourceUrl).';
export const UNCOVERED_YEAR_WARNING =
  'The bundled holiday calendar does not cover this year; holidays were NOT applied (Mon-Fri only).';

export type HolidaySource = 'BUNDLED' | 'CALLER' | 'NONE';

export type ContractDateResult =
  | {
      status: 'COMPUTED';
      date: IsoDate;
      /** True when a holiday list (bundled or caller-supplied) was applied to the business-day count. */
      holidayAdjusted: boolean;
      holidaySource: HolidaySource;
      /** Bundled calendars used (empty unless holidaySource is BUNDLED). */
      holidayCalendars: HolidayCalendarId[];
      /** PUBLISHED when every bundled holiday in the years used comes from a published list; PROJECTED otherwise; null when none applied. */
      holidayDataStatus: 'PUBLISHED' | 'PROJECTED' | null;
      /** Weekday holidays between the result and the rule anchor (the ones that can move the date), with status and source. */
      holidaysInWindow: HolidayEntry[];
      ruleText: string;
      sourceUrl: string;
      interpretation: string | null;
      businessDayCalendar: string;
      ruleVerification: CalendarVerification;
      warnings: string[];
    }
  | {
      status: 'UNAVAILABLE';
      reason: string;
      sourceUrl: string | null;
    };

export interface ContractDateOptions {
  /** Caller-supplied non-business dates (YYYY-MM-DD); when given they REPLACE the bundled calendars. */
  holidays?: readonly string[];
  /** 'BUNDLED' (default) applies the instrument's bundled exchange calendars; 'NONE' = Mon-Fri only. */
  holidayCalendar?: 'BUNDLED' | 'NONE';
}

function resolveAnchor(anchor: DateAnchor, year: number, month: number, cal: BusinessCalendar): IsoDate {
  const ym = shiftMonth(year, month, anchor.monthOffset);
  switch (anchor.type) {
    case 'CALENDAR_DAY': {
      const d = makeDate(ym.year, ym.month, anchor.day);
      return anchor.ifNonBusiness === 'PRECEDING' ? cal.onOrBefore(d) : d;
    }
    case 'LAST_BUSINESS_DAY':
      return cal.lastBusinessDayOfMonth(ym.year, ym.month);
    case 'FIRST_BUSINESS_DAY':
      return cal.firstBusinessDayOfMonth(ym.year, ym.month);
    case 'NTH_BUSINESS_DAY':
      return cal.nthBusinessDayOfMonth(ym.year, ym.month, anchor.n);
  }
}

/** True when `date` is the last business day before `target` (no business day strictly between). */
function isBusinessDayPreceding(date: IsoDate, target: IsoDate, cal: BusinessCalendar): boolean {
  const d = toDayNumber(date);
  const t = toDayNumber(target);
  if (d >= t) return false;
  return cal.businessDaysAfter(date, 1) >= target;
}

function computeWithCalendar(
  rule: Extract<EncodedDateRule, { kind: 'ENCODED' }>,
  year: number,
  month: number,
  cal: BusinessCalendar
): { date: IsoDate; anchor: IsoDate; windowEnd: IsoDate } {
  const anchor = resolveAnchor(rule.anchor, year, month, cal);
  // Latest calendar day whose holiday status can still move the result (e.g. Christmas for CL's
  // "25th" anchor, or a month-end holiday for "last business day" anchors).
  const ym = shiftMonth(year, month, rule.anchor.monthOffset);
  let windowEnd = anchor;
  if (rule.anchor.type === 'CALENDAR_DAY') windowEnd = makeDate(ym.year, ym.month, rule.anchor.day);
  if (rule.anchor.type === 'LAST_BUSINESS_DAY') windowEnd = makeDate(ym.year, ym.month, daysInMonth(ym.year, ym.month));
  if (windowEnd < anchor) windowEnd = anchor;
  let date = cal.businessDaysBefore(anchor, rule.businessDaysBefore);
  if (rule.postAdjustment === 'BRENT_CHRISTMAS_NEW_YEAR') {
    const [y] = date.split('-').map(Number);
    const christmas = makeDate(y, 12, 25);
    const newYear = makeDate(y + 1, 1, 1);
    if (isBusinessDayPreceding(date, christmas, cal) || isBusinessDayPreceding(date, newYear, cal)) {
      date = cal.businessDaysBefore(date, 1);
    }
  }
  return { date, anchor, windowEnd };
}

function yearOf(d: IsoDate): number {
  return Number(d.slice(0, 4));
}

/**
 * Apply an encoded rule. Holiday precedence: caller list (`options.holidays`) > bundled exchange
 * calendars (`bundledCalendars`, unless `options.holidayCalendar === 'NONE'`) > Mon-Fri only.
 * Bundled calendars are applied only when they cover every year the computation spans (fail closed).
 */
export function applyDateRule(
  rule: EncodedDateRule,
  year: number,
  month: number,
  ruleVerification: CalendarVerification,
  options: ContractDateOptions = {},
  bundledCalendars: readonly HolidayCalendarId[] = []
): ContractDateResult {
  if (rule.kind === 'UNAVAILABLE') {
    return { status: 'UNAVAILABLE', reason: rule.reason, sourceUrl: rule.sourceUrl };
  }
  const warnings: string[] = [];
  let source: HolidaySource = 'NONE';
  let calendars: HolidayCalendarId[] = [];
  let dataStatus: 'PUBLISHED' | 'PROJECTED' | null = null;
  let entries: HolidayEntry[] = [];
  let result: { date: IsoDate; anchor: IsoDate; windowEnd: IsoDate };

  if (options.holidays !== undefined) {
    const cal = new BusinessCalendar(options.holidays);
    result = computeWithCalendar(rule, year, month, cal);
    source = cal.hasHolidays ? 'CALLER' : 'NONE';
    warnings.push(cal.hasHolidays ? CALLER_HOLIDAY_WARNING : NO_HOLIDAY_WARNING);
  } else if (options.holidayCalendar !== 'NONE' && bundledCalendars.length > 0) {
    // Rules reach back at most ~2 months before the contract month, so [year-1, year] suffices.
    const resolved = resolveHolidays(bundledCalendars, year - 1, year);
    const r = computeWithCalendar(rule, year, month, new BusinessCalendar(resolved.dates));
    const spanned = new Set([yearOf(r.date), yearOf(r.windowEnd)]);
    if (resolved.uncoveredYears.some((y) => spanned.has(y))) {
      result = computeWithCalendar(rule, year, month, new BusinessCalendar());
      warnings.push(UNCOVERED_YEAR_WARNING, NO_HOLIDAY_WARNING);
    } else {
      result = r;
      source = 'BUNDLED';
      calendars = [...bundledCalendars];
      entries = resolved.entries.filter((e) => e.date >= r.date && e.date <= r.windowEnd);
      const yearsUsed = resolved.entries.filter((e) => spanned.has(yearOf(e.date)));
      dataStatus = yearsUsed.some((e) => e.status === 'PROJECTED') ? 'PROJECTED' : 'PUBLISHED';
      warnings.push(dataStatus === 'PROJECTED' ? PROJECTED_HOLIDAY_WARNING : PUBLISHED_HOLIDAY_NOTE);
    }
  } else {
    result = computeWithCalendar(rule, year, month, new BusinessCalendar());
    warnings.push(NO_HOLIDAY_WARNING);
  }

  if (ruleVerification === 'UNVERIFIED') {
    warnings.push('The calendar rule for this instrument is UNVERIFIED in the Instrument Master.');
  }
  return {
    status: 'COMPUTED',
    date: result.date,
    holidayAdjusted: source !== 'NONE',
    holidaySource: source,
    holidayCalendars: calendars,
    holidayDataStatus: dataStatus,
    holidaysInWindow: entries,
    ruleText: rule.ruleText,
    sourceUrl: rule.sourceUrl,
    interpretation: rule.interpretation ?? null,
    businessDayCalendar: rule.businessDayCalendar,
    ruleVerification,
    warnings,
  };
}

function unknownInstrument(instrumentId: string): ContractDateResult {
  return {
    status: 'UNAVAILABLE',
    reason: `No calendar rule is encoded for instrument ${instrumentId}.`,
    sourceUrl: null,
  };
}

/** Last trading day of `instrumentId` for contract month (year, month 1-12). */
export function computeLastTradingDay(
  instrumentId: string,
  year: number,
  month: number,
  options: ContractDateOptions = {}
): ContractDateResult {
  const spec = getCalendarSpec(instrumentId);
  if (!spec) return unknownInstrument(instrumentId);
  return applyDateRule(spec.lastTradingDay, year, month, spec.calendarStatus, options, spec.holidayCalendars);
}

/** First notice day of `instrumentId` for contract month (year, month 1-12). */
export function computeFirstNoticeDay(
  instrumentId: string,
  year: number,
  month: number,
  options: ContractDateOptions = {}
): ContractDateResult {
  const spec = getCalendarSpec(instrumentId);
  if (!spec) return unknownInstrument(instrumentId);
  return applyDateRule(spec.firstNoticeDay, year, month, spec.calendarStatus, options, spec.holidayCalendars);
}
