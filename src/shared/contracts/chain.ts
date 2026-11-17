import { calendarDaysBetween, isIsoDate, shiftMonth, toDayNumber, type IsoDate } from './dates.ts';
import { getCalendarSpec, type CalendarVerification, type ListingSchedule } from './calendarSpecs.ts';
import { applyDateRule, type ContractDateOptions, type ContractDateResult } from './expiry.ts';
import { formatContractCode, monthToMonthCode, type MonthCode } from './monthCodes.ts';

export interface ChainContract {
  /** Exchange code with 2-digit year, e.g. ZCH27. */
  code: string;
  /** MXV code (MXV root + month + 2-digit year) when an MXV root is known, e.g. ZCEH27. */
  mxvCode: string | null;
  root: string;
  monthCode: MonthCode;
  month: number;
  year: number;
  /** YYYY-MM */
  contractMonth: string;
  lastTradingDay: ContractDateResult;
  firstNoticeDay: ContractDateResult;
  /** Calendar days from asOf to the computed last trading day (null if unavailable). */
  calendarDaysToLastTrade: number | null;
  calendarStatus: CalendarVerification;
  warnings: string[];
}

export type ContractChainResult =
  | {
      status: 'OK';
      instrumentId: string;
      asOf: IsoDate;
      requestedCount: number;
      contracts: ChainContract[];
      listedMonthsText: string;
      calendarStatus: CalendarVerification;
      notes: string[];
      warnings: string[];
    }
  | { status: 'UNAVAILABLE'; instrumentId: string; reason: string }
  | { status: 'INVALID_INPUT'; instrumentId: string; reason: string };

export interface ContractChainInput extends ContractDateOptions {
  instrumentId: string;
  /** Exchange root symbol, e.g. 'ZC'. */
  root: string;
  /** MXV root symbol, e.g. 'ZCE'; null if no verified MXV mapping. */
  mxvRoot?: string | null;
  asOf: IsoDate;
  count: number;
  /**
   * Live verification status from the Instrument Master (CONTRACT_CALENDAR_RULES). The stricter of
   * this and the encoded spec's status is used, so a downgrade in the data file takes effect here.
   */
  calendarStatus?: CalendarVerification;
}

/** Hard cap on months scanned forward (16 years) so a bad schedule cannot loop forever. */
const MAX_SCAN_MONTHS = 16 * 12;

interface ListingCheck {
  listed: boolean;
  /** true when the month is past the listing horizon (scan can stop). */
  beyondHorizon: boolean;
  warning?: string;
}

function checkListing(
  schedule: ListingSchedule,
  offset: number,
  month: number,
  year: number,
  asOfYear: number
): ListingCheck {
  switch (schedule.type) {
    case 'FIXED_MONTHS':
      return { listed: schedule.months.includes(month), beyondHorizon: false };
    case 'CONSECUTIVE_PLUS_CYCLES': {
      if (offset < schedule.consecutive) return { listed: true, beyondHorizon: false };
      const maxWithin = Math.max(...schedule.cycles.map((c) => c.withinMonths));
      const cycle = schedule.cycles.find((c) => c.months.includes(month) && offset <= c.withinMonths);
      return {
        listed: Boolean(cycle),
        beyondHorizon: offset > maxWithin,
        warning: cycle
          ? `Listed via the ${cycle.withinMonths}-month cycle rule; whether this month is already listed near the horizon is approximate.`
          : undefined,
      };
    }
    case 'ALL_MONTHS': {
      const h = schedule.horizon;
      if (h === null) {
        return { listed: true, beyondHorizon: false, warning: 'Listing horizon not verified; this contract may not be listed yet.' };
      }
      const inside = h.type === 'MONTHS' ? offset < h.months : year <= asOfYear + h.years;
      return { listed: inside, beyondHorizon: !inside };
    }
  }
}

/**
 * Next `count` contracts that are listed and not yet past their last trading day as of `asOf`
 * (a contract whose computed LTD equals asOf is still included - it trades that day).
 */
export function buildContractChain(input: ContractChainInput): ContractChainResult {
  const { instrumentId, asOf, count } = input;
  if (!isIsoDate(asOf)) {
    return { status: 'INVALID_INPUT', instrumentId, reason: 'asOf must be a valid YYYY-MM-DD date.' };
  }
  if (!Number.isInteger(count) || count < 1 || count > 120) {
    return { status: 'INVALID_INPUT', instrumentId, reason: 'count must be an integer between 1 and 120.' };
  }
  const spec = getCalendarSpec(instrumentId);
  if (!spec) {
    return { status: 'UNAVAILABLE', instrumentId, reason: `No calendar rule is encoded for ${instrumentId}.` };
  }

  const calendarStatus: CalendarVerification =
    spec.calendarStatus === 'UNVERIFIED' || input.calendarStatus === 'UNVERIFIED' ? 'UNVERIFIED' : 'VERIFIED';
  const [asOfYear, asOfMonth] = asOf.split('-').map(Number);
  const asOfDay = toDayNumber(asOf);
  const contracts: ChainContract[] = [];
  const warnings: string[] = [];
  const maxListed = spec.listing.type === 'FIXED_MONTHS' ? spec.listing.maxListed : undefined;
  const limit = maxListed !== undefined ? Math.min(count, maxListed) : count;
  if (maxListed !== undefined && count > maxListed) {
    warnings.push(`Only ${maxListed} delivery months are listed at a time for this instrument; returning ${maxListed}.`);
  }

  for (let offset = 0; offset < MAX_SCAN_MONTHS && contracts.length < limit; offset++) {
    const { year, month } = shiftMonth(asOfYear, asOfMonth, offset);
    const listing = checkListing(spec.listing, offset, month, year, asOfYear);
    if (listing.beyondHorizon && spec.listing.type === 'ALL_MONTHS') break;
    if (!listing.listed) {
      if (listing.beyondHorizon) break;
      continue;
    }

    const opts = { holidays: input.holidays };
    const ltd = applyDateRule(spec.lastTradingDay, year, month, calendarStatus, opts, spec.holidayCalendars);
    const fnd = applyDateRule(spec.firstNoticeDay, year, month, calendarStatus, opts, spec.holidayCalendars);
    const entryWarnings: string[] = listing.warning ? [listing.warning] : [];

    if (ltd.status === 'COMPUTED') {
      if (toDayNumber(ltd.date) < asOfDay) continue; // already expired
    } else {
      // Cannot tell whether the contract has expired; keep only months not before asOf's month.
      entryWarnings.push('Last trading day unavailable; expiry filtering used the contract month only.');
    }

    const code = formatContractCode(input.root, month, year, 2);
    contracts.push({
      code,
      mxvCode: input.mxvRoot ? formatContractCode(input.mxvRoot, month, year, 2) : null,
      root: input.root,
      monthCode: monthToMonthCode(month),
      month,
      year,
      contractMonth: `${year}-${String(month).padStart(2, '0')}`,
      lastTradingDay: ltd,
      firstNoticeDay: fnd,
      calendarDaysToLastTrade: ltd.status === 'COMPUTED' ? calendarDaysBetween(asOf, ltd.date) : null,
      calendarStatus,
      warnings: entryWarnings,
    });
  }

  if (contracts.length < limit) {
    warnings.push(`Only ${contracts.length} contract(s) fall inside the encoded listing horizon.`);
  }
  if (calendarStatus === 'UNVERIFIED') {
    warnings.push('Calendar rule is UNVERIFIED in the Instrument Master; every contract is marked calendarStatus UNVERIFIED.');
  }

  return {
    status: 'OK',
    instrumentId,
    asOf,
    requestedCount: count,
    contracts,
    listedMonthsText: spec.listedMonthsText,
    calendarStatus,
    notes: spec.notes,
    warnings,
  };
}
