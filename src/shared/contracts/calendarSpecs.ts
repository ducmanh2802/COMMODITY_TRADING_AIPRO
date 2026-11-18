/**
 * Machine-encoded contract calendar rules (listing schedule, last trading day, first notice day).
 *
 * Each encoded rule quotes the exchange text it was derived from (`ruleText`) and its source URL.
 * Listing schedules and LTD texts mirror CONTRACT_CALENDAR_RULES in server/data/instruments.ts
 * (a test asserts they stay in sync). Where an extra rule (mostly first notice day) was added here,
 * the text was read on the cited official page on 2026-11-17.
 *
 * Rules are expressed as: anchor date (in a month relative to the contract month) followed by
 * "n business days before the anchor". When no rule text exists or it is ambiguous the rule is
 * `{ kind: 'UNAVAILABLE', reason }` - never guessed.
 */

import type { HolidayCalendarId } from './holidays/types.ts';

export type CalendarVerification = 'VERIFIED' | 'UNVERIFIED';

export type DateAnchor =
  /** Calendar day `day` of (contract month + monthOffset). `ifNonBusiness: 'PRECEDING'` rolls it back to the previous business day; 'KEEP' uses the calendar day as is (the n-business-days-before step then skips non-business days). */
  | { type: 'CALENDAR_DAY'; monthOffset: number; day: number; ifNonBusiness: 'PRECEDING' | 'KEEP' }
  | { type: 'LAST_BUSINESS_DAY'; monthOffset: number }
  | { type: 'FIRST_BUSINESS_DAY'; monthOffset: number }
  | { type: 'NTH_BUSINESS_DAY'; monthOffset: number; n: number };

export type PostAdjustment =
  /** ICE Brent: if the date is the business day preceding Christmas Day or New Year's Day, use the next preceding business day. */
  'BRENT_CHRISTMAS_NEW_YEAR';

export type EncodedDateRule =
  | {
      kind: 'ENCODED';
      anchor: DateAnchor;
      /** Result = the n-th business day strictly before the anchor (0 = the anchor itself). */
      businessDaysBefore: number;
      postAdjustment?: PostAdjustment;
      ruleText: string;
      sourceUrl: string;
      /** How ambiguous wording was read, and what it was cross-checked against. */
      interpretation?: string;
      /** Business-day calendar the exchange uses (descriptive; the applied holidays come from InstrumentCalendarSpec.holidayCalendars). */
      businessDayCalendar: string;
    }
  | { kind: 'UNAVAILABLE'; reason: string; sourceUrl: string | null };

export type ListingSchedule =
  /** Fixed cycle of months; how far out the exchange lists is not modeled unless maxListed is set. */
  | { type: 'FIXED_MONTHS'; months: number[]; maxListed?: number }
  /**
   * `consecutive` calendar months starting with the current month (month of the as-of date),
   * plus cycle months listed within `withinMonths` months of the current month.
   */
  | {
      type: 'CONSECUTIVE_PLUS_CYCLES';
      consecutive: number;
      cycles: { months: number[]; withinMonths: number }[];
    }
  /** Every calendar month. `horizon` null = listing horizon not verified. */
  | {
      type: 'ALL_MONTHS';
      horizon: { type: 'MONTHS'; months: number } | { type: 'CURRENT_YEAR_PLUS_YEARS'; years: number } | null;
    };

export interface InstrumentCalendarSpec {
  instrumentId: string;
  listedMonthsText: string;
  listing: ListingSchedule;
  lastTradingDay: EncodedDateRule;
  firstNoticeDay: EncodedDateRule;
  /** Bundled holiday calendars applied by default (src/shared/contracts/holidays). Empty = Mon-Fri only. */
  holidayCalendars: HolidayCalendarId[];
  /** Mirrors CONTRACT_CALENDAR_RULES[id].verificationStatus. */
  calendarStatus: CalendarVerification;
  /** Approximations that apply to every computed contract of this instrument. */
  notes: string[];
}

const CBOT_GRAIN_LTD_TEXT = 'Business day prior to the 15th calendar day of the contract month.';
const CME_BUSINESS = 'CME Group business days (US exchange holidays)';
const ICE_US_BUSINESS = 'ICE Futures U.S. business days (US exchange holidays)';
const ICE_EU_BUSINESS = 'ICE Futures Europe business days (London)';

const NO_FND_TEXT =
  'No first-notice-day rule text was read on an official source for this contract; not computed (would be a guess).';

function grainSpec(
  instrumentId: string,
  listedMonthsText: string,
  months: number[],
  sourceUrl: string,
  extraNotes: string[] = []
): InstrumentCalendarSpec {
  return {
    instrumentId,
    listedMonthsText,
    listing: { type: 'FIXED_MONTHS', months },
    lastTradingDay: {
      kind: 'ENCODED',
      anchor: { type: 'CALENDAR_DAY', monthOffset: 0, day: 15, ifNonBusiness: 'KEEP' },
      businessDaysBefore: 1,
      ruleText: CBOT_GRAIN_LTD_TEXT,
      sourceUrl,
      businessDayCalendar: CME_BUSINESS,
    },
    firstNoticeDay: { kind: 'UNAVAILABLE', reason: NO_FND_TEXT, sourceUrl: null },
    holidayCalendars: ['CME_US'],
    calendarStatus: 'VERIFIED',
    notes: [
      'Listing horizon (how many years out CBOT lists this cycle) is not modeled; far contracts may not be listed yet.',
      ...extraNotes,
    ],
  };
}

function thirdLastBusinessDay(ruleText: string, sourceUrl: string): EncodedDateRule {
  return {
    kind: 'ENCODED',
    anchor: { type: 'LAST_BUSINESS_DAY', monthOffset: 0 },
    businessDaysBefore: 2,
    ruleText,
    sourceUrl,
    interpretation: 'Third last business day = 2 business days before the last business day.',
    businessDayCalendar: CME_BUSINESS,
  };
}

// Month numbers for readability.
const F = 1, G = 2, H = 3, J = 4, K = 5, M = 6, N = 7, Q = 8, U = 9, V = 10, X = 11, Z = 12;

export const INSTRUMENT_CALENDAR_SPECS: Record<string, InstrumentCalendarSpec> = {
  'CBOT:ZS': grainSpec(
    'CBOT:ZS',
    'F H K N Q U X (Jan, Mar, May, Jul, Aug, Sep, Nov)',
    [F, H, K, N, Q, U, X],
    'https://www.cmegroup.com/rulebook/CBOT/II/11/11.pdf'
  ),
  'CBOT:ZM': grainSpec(
    'CBOT:ZM',
    'F H K N Q U V Z (Jan, Mar, May, Jul, Aug, Sep, Oct, Dec)',
    [F, H, K, N, Q, U, V, Z],
    'https://www.cmegroup.com/rulebook/CBOT/II/13/13.pdf'
  ),
  'CBOT:ZL': grainSpec(
    'CBOT:ZL',
    'F H K N Q U V Z (Jan, Mar, May, Jul, Aug, Sep, Oct, Dec)',
    [F, H, K, N, Q, U, V, Z],
    'https://www.cmegroup.com/rulebook/CBOT/II/12/12.pdf'
  ),
  'CBOT:ZC': grainSpec(
    'CBOT:ZC',
    'H K N U Z (Mar, May, Jul, Sep, Dec)',
    [H, K, N, U, Z],
    'https://www.cmegroup.com/rulebook/CBOT/I/10.pdf'
  ),
  'CBOT:ZW': grainSpec(
    'CBOT:ZW',
    'H K N U Z (Mar, May, Jul, Sep, Dec)',
    [H, K, N, U, Z],
    'https://www.cmegroup.com/rulebook/CBOT/II/14/14.pdf'
  ),
  'CBOT:ZR': grainSpec(
    'CBOT:ZR',
    'F H K N U X (Jan, Mar, May, Jul, Sep, Nov)',
    [F, H, K, N, U, X],
    'https://www.cmegroup.com/rulebook/CBOT/II/17/17.pdf',
    ['One CME fact card also lists Aug (Q) for rough rice; Aug is NOT included here (rulebook ch.17 cycle used).']
  ),

  'ICE:KC': {
    instrumentId: 'ICE:KC',
    listedMonthsText: 'H K N U Z (Mar, May, Jul, Sep, Dec)',
    listing: { type: 'FIXED_MONTHS', months: [H, K, N, U, Z] },
    lastTradingDay: {
      kind: 'ENCODED',
      anchor: { type: 'LAST_BUSINESS_DAY', monthOffset: 0 },
      businessDaysBefore: 8,
      ruleText:
        'One business day prior to last notice day (last notice day = seven business days prior to the last business day of the delivery month).',
      sourceUrl: 'https://www.ice.com/products/15/Coffee-C-Futures',
      interpretation: 'LND = 7 business days before the last business day; LTD = 1 business day before LND = 8 before the last business day.',
      businessDayCalendar: ICE_US_BUSINESS,
    },
    firstNoticeDay: {
      kind: 'ENCODED',
      anchor: { type: 'FIRST_BUSINESS_DAY', monthOffset: 0 },
      businessDaysBefore: 7,
      ruleText: 'Seven business days prior to first business day of delivery month.',
      sourceUrl: 'https://www.ice.com/products/15/Coffee-C-Futures',
      businessDayCalendar: ICE_US_BUSINESS,
    },
    holidayCalendars: ['ICE_US'],
    calendarStatus: 'VERIFIED',
    notes: ['Listing horizon not modeled; far contracts may not be listed yet.'],
  },

  'ICE:RC': {
    instrumentId: 'ICE:RC',
    listedMonthsText: 'F H K N U X (Jan, Mar, May, Jul, Sep, Nov), ten delivery months available',
    listing: { type: 'FIXED_MONTHS', months: [F, H, K, N, U, X], maxListed: 10 },
    lastTradingDay: {
      kind: 'ENCODED',
      anchor: { type: 'LAST_BUSINESS_DAY', monthOffset: 0 },
      businessDaysBefore: 4,
      ruleText: 'Fourth business day preceding the last business day of the delivery month at 12:30 (London).',
      sourceUrl: 'https://www.ice.com/products/37089079/Robusta-Coffee-Futures',
      businessDayCalendar: ICE_EU_BUSINESS,
    },
    firstNoticeDay: {
      kind: 'ENCODED',
      anchor: { type: 'FIRST_BUSINESS_DAY', monthOffset: 0 },
      businessDaysBefore: 4,
      ruleText: 'Fourth business day preceding the first business day of the delivery month.',
      sourceUrl: 'https://www.ice.com/products/37089079/Robusta-Coffee-Futures',
      businessDayCalendar: ICE_EU_BUSINESS,
    },
    holidayCalendars: ['ICE_EU_SOFTS_LONDON'],
    calendarStatus: 'VERIFIED',
    notes: [
      'Business days = London business days: published England & Wales bank holidays are applied (assumes ICE Europe softs close on every UK bank holiday).',
    ],
  },

  'ICE:SB': {
    instrumentId: 'ICE:SB',
    listedMonthsText: 'H K N V (Mar, May, Jul, Oct)',
    listing: { type: 'FIXED_MONTHS', months: [H, K, N, V] },
    lastTradingDay: {
      kind: 'ENCODED',
      anchor: { type: 'LAST_BUSINESS_DAY', monthOffset: -1 },
      businessDaysBefore: 0,
      ruleText: 'Last business day of the month preceding the delivery month.',
      sourceUrl: 'https://www.ice.com/products/23/Sugar-No-11-Futures',
      businessDayCalendar: ICE_US_BUSINESS,
    },
    firstNoticeDay: {
      kind: 'ENCODED',
      anchor: { type: 'FIRST_BUSINESS_DAY', monthOffset: 0 },
      businessDaysBefore: 0,
      ruleText: 'First business day after last trading day.',
      sourceUrl: 'https://www.ice.com/products/23/Sugar-No-11-Futures',
      interpretation:
        'LTD is the last business day of the prior month, so the first business day after it is the first business day of the delivery month. FND falls AFTER LTD for this contract.',
      businessDayCalendar: ICE_US_BUSINESS,
    },
    holidayCalendars: ['ICE_US'],
    calendarStatus: 'VERIFIED',
    notes: ['Listing horizon not modeled; far contracts may not be listed yet.'],
  },

  'ICE:CC': {
    instrumentId: 'ICE:CC',
    listedMonthsText: 'H K N U Z (Mar, May, Jul, Sep, Dec)',
    listing: { type: 'FIXED_MONTHS', months: [H, K, N, U, Z] },
    lastTradingDay: {
      kind: 'ENCODED',
      anchor: { type: 'LAST_BUSINESS_DAY', monthOffset: 0 },
      businessDaysBefore: 11,
      ruleText:
        'One business day prior to last notice day (last notice day = ten business days prior to last business day of delivery month).',
      sourceUrl: 'https://www.ice.com/products/7/Cocoa-Futures',
      interpretation: 'LND = 10 business days before the last business day; LTD = 1 before LND = 11 before the last business day.',
      businessDayCalendar: ICE_US_BUSINESS,
    },
    firstNoticeDay: {
      kind: 'ENCODED',
      anchor: { type: 'NTH_BUSINESS_DAY', monthOffset: 0, n: 6 },
      businessDaysBefore: 10,
      ruleText: 'Ten business days prior to the sixth business day of delivery month.',
      sourceUrl: 'https://www.ice.com/products/7/Cocoa-Futures',
      businessDayCalendar: ICE_US_BUSINESS,
    },
    holidayCalendars: ['ICE_US'],
    calendarStatus: 'VERIFIED',
    notes: ['Listing horizon not modeled; far contracts may not be listed yet.'],
  },

  'ICE:CT': {
    instrumentId: 'ICE:CT',
    listedMonthsText: 'H K N V Z (Mar, May, Jul, Oct, Dec)',
    listing: { type: 'FIXED_MONTHS', months: [H, K, N, V, Z] },
    lastTradingDay: {
      kind: 'ENCODED',
      anchor: { type: 'LAST_BUSINESS_DAY', monthOffset: 0 },
      businessDaysBefore: 16,
      ruleText: 'Seventeen business days from end of spot month.',
      sourceUrl: 'https://www.ice.com/products/254/Cotton-No-2-Futures',
      interpretation:
        'Read as the 17th business day counting back from the end of the month with the last business day counted as day 1 (= 16 business days before the last business day). Cross-check: CTZ24 expired 2024-12-06 (barchart.com/futures/quotes/CTZ24, third-party), which this reading reproduces with the bundled ICE_US calendar (Christmas 2024-12-25 is a holiday); the alternative reading (17 before) would give 2024-12-05. Mon-Fri only (no holidays) gives 2024-12-09.',
      businessDayCalendar: ICE_US_BUSINESS,
    },
    firstNoticeDay: {
      kind: 'ENCODED',
      anchor: { type: 'FIRST_BUSINESS_DAY', monthOffset: 0 },
      businessDaysBefore: 5,
      ruleText:
        'Five business days before the first delivery day of the spot contract month, which is the first business day of that month.',
      sourceUrl: 'https://www.ice.com/products/254/Cotton-No-2-Futures',
      businessDayCalendar: ICE_US_BUSINESS,
    },
    holidayCalendars: ['ICE_US'],
    calendarStatus: 'VERIFIED',
    notes: ['Listing horizon not modeled; far contracts may not be listed yet.'],
  },

  'COMEX:HG': {
    instrumentId: 'COMEX:HG',
    listedMonthsText:
      'All months (F-Z) consecutively near-term, plus H K N U Z further out (out to 63 months)',
    listing: {
      type: 'CONSECUTIVE_PLUS_CYCLES',
      consecutive: 24,
      cycles: [{ months: [H, K, N, U, Z], withinMonths: 63 }],
    },
    lastTradingDay: thirdLastBusinessDay(
      'Third last business day of the contract month.',
      'https://www.cmegroup.com/education/articles-and-reports/hedging-with-comex-copper-futures'
    ),
    firstNoticeDay: { kind: 'UNAVAILABLE', reason: NO_FND_TEXT, sourceUrl: null },
    holidayCalendars: ['CME_US'],
    calendarStatus: 'UNVERIFIED',
    notes: [
      'Number of consecutive months is UNVERIFIED (CME article: 24, MXV: 37); 24 is used.',
    ],
  },
  'COMEX:GC': {
    instrumentId: 'COMEX:GC',
    listedMonthsText:
      'Current month and next two months; G J Q V within 23 months; M Z further out (approx. 72 months)',
    listing: {
      type: 'CONSECUTIVE_PLUS_CYCLES',
      consecutive: 3,
      cycles: [
        { months: [G, J, Q, V], withinMonths: 23 },
        { months: [M, Z], withinMonths: 72 },
      ],
    },
    lastTradingDay: thirdLastBusinessDay(
      'Third last business day of the delivery month.',
      'https://www.cmegroup.com/trading/metals/files/fact-card-gold-futures-options.pdf'
    ),
    firstNoticeDay: { kind: 'UNAVAILABLE', reason: NO_FND_TEXT, sourceUrl: null },
    holidayCalendars: ['CME_US'],
    calendarStatus: 'VERIFIED',
    notes: ['"Within N months" listing horizons are approximate (counted as month offset <= N from the current month).'],
  },
  'COMEX:SI': {
    instrumentId: 'COMEX:SI',
    listedMonthsText: 'Current month and next two months; F H K U within 23 months; N Z within 60 months',
    listing: {
      type: 'CONSECUTIVE_PLUS_CYCLES',
      consecutive: 3,
      cycles: [
        { months: [F, H, K, U], withinMonths: 23 },
        { months: [N, Z], withinMonths: 60 },
      ],
    },
    lastTradingDay: thirdLastBusinessDay(
      'Third last business day of the delivery month.',
      'https://www.cmegroup.com/content/dam/cmegroup/rulebook/COMEX/1a/112.pdf'
    ),
    firstNoticeDay: { kind: 'UNAVAILABLE', reason: NO_FND_TEXT, sourceUrl: null },
    holidayCalendars: ['CME_US'],
    calendarStatus: 'VERIFIED',
    notes: ['"Within N months" listing horizons are approximate (counted as month offset <= N from the current month).'],
  },
  'NYMEX:PL': {
    instrumentId: 'NYMEX:PL',
    listedMonthsText:
      'Current month and next two months, then quarterly F J N V (Jan, Apr, Jul, Oct) within 15 months',
    listing: {
      type: 'CONSECUTIVE_PLUS_CYCLES',
      consecutive: 3,
      cycles: [{ months: [F, J, N, V], withinMonths: 15 }],
    },
    lastTradingDay: thirdLastBusinessDay(
      'Third last business day of the delivery month.',
      'https://www.cmegroup.com/trading/metals/files/metals-prod-guide-2023.pdf'
    ),
    firstNoticeDay: { kind: 'UNAVAILABLE', reason: NO_FND_TEXT, sourceUrl: null },
    holidayCalendars: ['CME_US'],
    calendarStatus: 'VERIFIED',
    notes: ['"Within N months" listing horizons are approximate (counted as month offset <= N from the current month).'],
  },
  'CME:TIO': {
    instrumentId: 'CME:TIO',
    listedMonthsText: 'Monthly contracts (exact listing horizon not verified)',
    listing: { type: 'ALL_MONTHS', horizon: null },
    lastTradingDay: {
      kind: 'ENCODED',
      anchor: { type: 'LAST_BUSINESS_DAY', monthOffset: 0 },
      businessDaysBefore: 0,
      ruleText:
        'Last business day of the contract month; if a Singapore public holiday, the preceding business day.',
      sourceUrl: 'https://www.cmegroup.com/trading/metals/files/iron-ore-future-and-options.pdf',
      businessDayCalendar: 'CME business days AND Singapore public holidays',
      interpretation: 'Applied as the union of the bundled CME_US (projected) and SG_PUBLIC (published) calendars.',
    },
    firstNoticeDay: {
      kind: 'UNAVAILABLE',
      reason: 'Cash-settled contract: there is no delivery notice period.',
      sourceUrl: 'https://www.cmegroup.com/trading/metals/files/iron-ore-futures-faq.pdf',
    },
    holidayCalendars: ['CME_US', 'SG_PUBLIC'],
    calendarStatus: 'UNVERIFIED',
    notes: ['Listing horizon not verified.'],
  },
  'SGX:FEF': {
    instrumentId: 'SGX:FEF',
    listedMonthsText: 'Monthly contracts; per MXV up to four calendar years from the current year (not verified on sgx.com)',
    listing: { type: 'ALL_MONTHS', horizon: null },
    lastTradingDay: {
      kind: 'ENCODED',
      anchor: { type: 'LAST_BUSINESS_DAY', monthOffset: 0 },
      businessDaysBefore: 0,
      ruleText: 'Last business day of the contract month.',
      sourceUrl: 'https://en.mxv.com.vn/product/metals/iron-ore.html',
      businessDayCalendar: 'SGX business days (Singapore public holidays)',
      interpretation: 'Applied with the bundled SG_PUBLIC (published, Ministry of Manpower) calendar.',
    },
    firstNoticeDay: {
      kind: 'UNAVAILABLE',
      reason: 'Index futures: no delivery notice period in the source.',
      sourceUrl: null,
    },
    holidayCalendars: ['SG_PUBLIC'],
    calendarStatus: 'UNVERIFIED',
    notes: ['Listing horizon not modeled; LTD rule read on the MXV FEF page, not on sgx.com.'],
  },
  'NYMEX:CL': {
    instrumentId: 'NYMEX:CL',
    listedMonthsText: 'All months (F-Z) consecutively for the current year plus the next five years',
    // Horizon disputed (instruments.ts: current year + 5 years; QuantConnect Lean: + 10 years and 2
    // extra months) -> not modeled; every contract carries a "listing horizon not verified" warning.
    listing: { type: 'ALL_MONTHS', horizon: null },
    lastTradingDay: {
      kind: 'ENCODED',
      anchor: { type: 'CALENDAR_DAY', monthOffset: -1, day: 25, ifNonBusiness: 'PRECEDING' },
      businessDaysBefore: 3,
      ruleText:
        'Trading terminates 3 business days before the 25th calendar day of the month prior to the contract month. If the 25th calendar day is not a business day, trading terminates 3 business days prior to the business day preceding the 25th calendar day.',
      sourceUrl: 'https://www.cmegroup.com/markets/energy/crude-oil/light-sweet-crude.contractSpecs.html',
      interpretation:
        'Non-business-day clause per NYMEX rule 200102.F as published on the CME WTI contract-spec page (instruments.ts only references 200102.F). Cross-check: CLZ24 expired 2024-11-20.',
      businessDayCalendar: CME_BUSINESS,
    },
    firstNoticeDay: {
      kind: 'UNAVAILABLE',
      reason:
        'No first-notice-day rule text in the verified source. (Delivery for CL is scheduled after trading terminates; not computed.)',
      sourceUrl: null,
    },
    holidayCalendars: ['CME_US'],
    calendarStatus: 'UNVERIFIED',
    notes: ['Listing horizon UNVERIFIED (5 vs 10 years per different sources); not modeled. LTD rule text itself is from the CME contract-spec page.'],
  },
  'ICE:BRN': {
    instrumentId: 'ICE:BRN',
    listedMonthsText: 'All months (F-Z), up to 156 consecutive months',
    listing: { type: 'ALL_MONTHS', horizon: { type: 'MONTHS', months: 156 } },
    lastTradingDay: {
      kind: 'ENCODED',
      anchor: { type: 'LAST_BUSINESS_DAY', monthOffset: -2 },
      businessDaysBefore: 0,
      postAdjustment: 'BRENT_CHRISTMAS_NEW_YEAR',
      ruleText:
        "Last business day of the second month preceding the contract month (e.g. March expires last business day of January); moved one business day earlier if that day precedes Christmas Day or New Year's Day.",
      sourceUrl: 'https://www.ice.com/products/219/Brent-Crude-Futures',
      interpretation:
        "ICE text: if the day would be (i) the Business Day preceding Christmas Day or (ii) the Business Day preceding New Year's Day, trading ceases on the next preceding Business Day. Implemented as: if no business day lies strictly between the date and Dec 25 / Jan 1, step back one business day. In practice this moves every February contract (expiring end-December). Cross-check: Feb-2025 Brent expired 2024-12-30, not 2024-12-31 (S&P Global Platts subscriber note 17 Dec 2024).",
      businessDayCalendar: ICE_EU_BUSINESS,
    },
    firstNoticeDay: {
      kind: 'UNAVAILABLE',
      reason: 'EFP delivery with cash-settlement option against the ICE Brent Index; no notice day in the source.',
      sourceUrl: 'https://www.ice.com/products/219/Brent-Crude-Futures',
    },
    holidayCalendars: [],
    calendarStatus: 'VERIFIED',
    notes: [
      'ICE Futures Europe ENERGY holiday schedule is not bundled (Brent trades on several UK bank holidays, so UK bank holidays are NOT applied): business days are Mon-Fri only - confirm on the ICE expiry calendar.',
    ],
  },
  'NYMEX:NG': {
    instrumentId: 'NYMEX:NG',
    listedMonthsText: 'Monthly contracts (exact listing horizon not verified)',
    listing: { type: 'ALL_MONTHS', horizon: null },
    lastTradingDay: {
      kind: 'ENCODED',
      anchor: { type: 'CALENDAR_DAY', monthOffset: 0, day: 1, ifNonBusiness: 'KEEP' },
      businessDaysBefore: 3,
      ruleText:
        'Third business day prior to the first calendar day of the delivery month; if the listed expiration day becomes a holiday, the business day immediately prior.',
      sourceUrl: 'https://www.cmegroup.com/notices/ser/2017/02/SER-7852.pdf',
      businessDayCalendar: CME_BUSINESS,
    },
    firstNoticeDay: { kind: 'UNAVAILABLE', reason: NO_FND_TEXT, sourceUrl: null },
    holidayCalendars: ['CME_US'],
    calendarStatus: 'UNVERIFIED',
    notes: ['Listing horizon not verified; LTD rule from a 2017 SER.'],
  },
};

export function getCalendarSpec(instrumentId: string): InstrumentCalendarSpec | null {
  return Object.prototype.hasOwnProperty.call(INSTRUMENT_CALENDAR_SPECS, instrumentId)
    ? INSTRUMENT_CALENDAR_SPECS[instrumentId]
    : null;
}
