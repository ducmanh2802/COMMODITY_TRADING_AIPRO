import { BusinessCalendar, makeDate, shiftMonth, toDayNumber, type IsoDate } from './dates.ts';
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

export type ContractDateResult =
  | {
      status: 'COMPUTED';
      date: IsoDate;
      holidayAdjusted: boolean;
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
  /** Non-business dates (YYYY-MM-DD) in addition to weekends; omit when unknown. */
  holidays?: readonly string[];
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

export function applyDateRule(
  rule: EncodedDateRule,
  year: number,
  month: number,
  ruleVerification: CalendarVerification,
  options: ContractDateOptions = {}
): ContractDateResult {
  if (rule.kind === 'UNAVAILABLE') {
    return { status: 'UNAVAILABLE', reason: rule.reason, sourceUrl: rule.sourceUrl };
  }
  const cal = new BusinessCalendar(options.holidays ?? []);
  let date = cal.businessDaysBefore(resolveAnchor(rule.anchor, year, month, cal), rule.businessDaysBefore);

  if (rule.postAdjustment === 'BRENT_CHRISTMAS_NEW_YEAR') {
    const [y] = date.split('-').map(Number);
    const christmas = makeDate(y, 12, 25);
    const newYear = makeDate(y + 1, 1, 1);
    if (isBusinessDayPreceding(date, christmas, cal) || isBusinessDayPreceding(date, newYear, cal)) {
      date = cal.businessDaysBefore(date, 1);
    }
  }

  const warnings = [cal.hasHolidays ? CALLER_HOLIDAY_WARNING : NO_HOLIDAY_WARNING];
  if (ruleVerification === 'UNVERIFIED') {
    warnings.push('The calendar rule for this instrument is UNVERIFIED in the Instrument Master.');
  }
  return {
    status: 'COMPUTED',
    date,
    holidayAdjusted: cal.hasHolidays,
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
  return applyDateRule(spec.lastTradingDay, year, month, spec.calendarStatus, options);
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
  return applyDateRule(spec.firstNoticeDay, year, month, spec.calendarStatus, options);
}
