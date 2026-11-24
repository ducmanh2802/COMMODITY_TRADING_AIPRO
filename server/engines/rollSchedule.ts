/**
 * Exchange-calendar roll dates for the backtest: for every listed delivery month the roll date is
 * `rollBusinessDaysBefore` business days before the first notice day (when a verified FND rule is
 * encoded) or the last trading day (otherwise). Holidays come from the bundled exchange calendars
 * through applyDateRule, so the arithmetic is identical to the Contracts screen.
 */
import { getCalendarSpec, type EncodedDateRule } from '../../src/shared/contracts/calendarSpecs.ts';
import { applyDateRule } from '../../src/shared/contracts/expiry.ts';
import { toDayNumber, type IsoDate } from '../../src/shared/contracts/dates.ts';

const MAX_ROLL_BUSINESS_DAYS = 30;

export type RollSchedule =
  | {
      source: 'CALENDAR';
      instrumentId: string;
      anchor: 'FND' | 'LTD' | 'MIXED';
      rollBusinessDaysBefore: number;
      dates: IsoDate[];
      calendarStatus: 'VERIFIED' | 'UNVERIFIED';
      notes: string[];
    }
  | { source: 'UNAVAILABLE'; instrumentId: string; reason: string };

function listedMonths(instrumentId: string): number[] | null {
  const spec = getCalendarSpec(instrumentId);
  if (!spec) return null;
  const l = spec.listing;
  if (l.type === 'FIXED_MONTHS') return [...l.months];
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
}

/** Roll dates falling inside [firstDate, lastDate] (inclusive), ascending and unique. */
export function computeRollSchedule(
  instrumentId: string,
  firstDate: IsoDate,
  lastDate: IsoDate,
  rollBusinessDaysBefore = 5
): RollSchedule {
  const spec = getCalendarSpec(instrumentId);
  if (!spec) {
    return { source: 'UNAVAILABLE', instrumentId, reason: `No exchange calendar rule is encoded for ${instrumentId}.` };
  }
  if (!Number.isInteger(rollBusinessDaysBefore) || rollBusinessDaysBefore < 0 || rollBusinessDaysBefore > MAX_ROLL_BUSINESS_DAYS) {
    return { source: 'UNAVAILABLE', instrumentId, reason: `rollBusinessDaysBefore must be an integer 0-${MAX_ROLL_BUSINESS_DAYS}.` };
  }
  const months = listedMonths(instrumentId) ?? [];
  const fndEncoded = spec.firstNoticeDay.kind === 'ENCODED';
  const ltdEncoded = spec.lastTradingDay.kind === 'ENCODED';
  if (!fndEncoded && !ltdEncoded) {
    return { source: 'UNAVAILABLE', instrumentId, reason: 'Neither a first-notice-day nor a last-trading-day rule is encoded.' };
  }

  const startDay = toDayNumber(firstDate);
  const endDay = toDayNumber(lastDate);
  const y0 = Number(firstDate.slice(0, 4)) - 1;
  const y1 = Number(lastDate.slice(0, 4)) + 1;
  const dates = new Set<IsoDate>();
  const anchors = new Set<'FND' | 'LTD'>();
  const notes: string[] = [...spec.notes];

  const shift = (rule: EncodedDateRule): EncodedDateRule =>
    rule.kind === 'ENCODED' ? { ...rule, businessDaysBefore: rule.businessDaysBefore + rollBusinessDaysBefore } : rule;

  for (let year = y0; year <= y1; year++) {
    for (const month of months) {
      const useFnd = fndEncoded;
      const rule = shift(useFnd ? spec.firstNoticeDay : spec.lastTradingDay);
      const res = applyDateRule(rule, year, month, spec.calendarStatus, {}, spec.holidayCalendars);
      if (res.status !== 'COMPUTED') continue;
      const d = toDayNumber(res.date);
      if (d < startDay || d > endDay) continue;
      dates.add(res.date);
      anchors.add(useFnd ? 'FND' : 'LTD');
    }
  }
  if (dates.size === 0) {
    return { source: 'UNAVAILABLE', instrumentId, reason: 'No roll date falls inside the data range.' };
  }
  if (spec.calendarStatus === 'UNVERIFIED') notes.push('Calendar rule is UNVERIFIED in the Instrument Master; roll dates are indicative.');
  return {
    source: 'CALENDAR',
    instrumentId,
    anchor: anchors.size > 1 ? 'MIXED' : (anchors.values().next().value as 'FND' | 'LTD'),
    rollBusinessDaysBefore,
    dates: [...dates].sort(),
    calendarStatus: spec.calendarStatus,
    notes,
  };
}
