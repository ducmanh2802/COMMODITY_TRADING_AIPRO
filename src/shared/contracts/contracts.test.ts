import test from 'node:test';
import assert from 'node:assert/strict';
import type { MarketCandle } from '../types/market.ts';
import { CONTRACT_CALENDAR_RULES, INITIAL_INSTRUMENTS } from '../../../server/data/instruments.ts';
import {
  BusinessCalendar,
  INSTRUMENT_CALENDAR_SPECS,
  MONTH_CODES,
  NO_HOLIDAY_WARNING,
  CALLER_HOLIDAY_WARNING,
  annualizedRollYield,
  buildContinuousSeries,
  buildContractChain,
  buildTermStructure,
  computeFirstNoticeDay,
  computeLastTradingDay,
  formatContractCode,
  monthCodeToMonth,
  monthToMonthCode,
  parseContractCode,
  parseMonthCodeList,
  weekday,
  type ContractDateResult,
} from './index.ts';

function computedDate(r: ContractDateResult): string {
  assert.equal(r.status, 'COMPUTED', r.status === 'UNAVAILABLE' ? r.reason : '');
  return (r as Extract<ContractDateResult, { status: 'COMPUTED' }>).date;
}

// ---------------------------------------------------------------- month codes

test('month codes round-trip for all 12 months', () => {
  assert.deepEqual([...MONTH_CODES], ['F', 'G', 'H', 'J', 'K', 'M', 'N', 'Q', 'U', 'V', 'X', 'Z']);
  for (let m = 1; m <= 12; m++) {
    assert.equal(monthCodeToMonth(monthToMonthCode(m)), m);
  }
  assert.throws(() => monthCodeToMonth('A'));
  assert.throws(() => monthToMonthCode(13));
});

test('parseContractCode handles exchange, 4-digit, MXV and 1-digit codes with the documented pivot', () => {
  assert.deepEqual(parseContractCode('ZCH27', { referenceYear: 2026 }), {
    root: 'ZC', monthCode: 'H', month: 3, year: 2027, yearDigits: 2, yearInferred: true,
  });
  const cl = parseContractCode('CLZ2026', { referenceYear: 2000 });
  assert.equal(cl?.root, 'CL');
  assert.equal(cl?.year, 2026);
  assert.equal(cl?.yearInferred, false);
  assert.equal(parseContractCode('ZCEH27', { referenceYear: 2026 })?.root, 'ZCE');
  assert.equal(parseContractCode('HGH26', { referenceYear: 2026 })?.root, 'HG'); // root ends in a month letter
  assert.equal(parseContractCode('zch7', { referenceYear: 2026 })?.year, 2027);
  assert.equal(parseContractCode('ZCH4', { referenceYear: 2026 })?.year, 2024);
  assert.equal(parseContractCode('ZCH3', { referenceYear: 2026 })?.year, 2033);
  // 2-digit window [ref-80, ref+19]
  assert.equal(parseContractCode('ZCH45', { referenceYear: 2026 })?.year, 2045);
  assert.equal(parseContractCode('ZCH46', { referenceYear: 2026 })?.year, 1946);
  assert.equal(parseContractCode('ZCH99', { referenceYear: 2026 })?.year, 1999);
  // invalid
  assert.equal(parseContractCode('ZC27'), null);
  assert.equal(parseContractCode('ZCA27'), null);
  assert.equal(parseContractCode('ZCH123'), null);
  assert.equal(parseContractCode('ZCH27', { knownRoots: ['ZS'] }), null);

  for (const code of ['ZCH27', 'CLZ26', 'ZCEH27']) {
    const p = parseContractCode(code, { referenceYear: 2026 })!;
    assert.equal(formatContractCode(p.root, p.month, p.year, 2), code);
  }
  assert.equal(formatContractCode('CL', 12, 2026, 4), 'CLZ2026');
  assert.equal(formatContractCode('ZC', 3, 2027, 1), 'ZCH7');
});

// ---------------------------------------------------------------- spec table vs Instrument Master

test('encoded calendar specs stay in sync with CONTRACT_CALENDAR_RULES in server/data/instruments.ts', () => {
  for (const inst of INITIAL_INSTRUMENTS) {
    const rule = CONTRACT_CALENDAR_RULES[inst.id];
    const spec = INSTRUMENT_CALENDAR_SPECS[inst.id];
    assert.ok(rule, `rule for ${inst.id}`);
    assert.ok(spec, `encoded spec for ${inst.id}`);
    assert.equal(spec.listedMonthsText, rule.listedMonths, inst.id);
    assert.equal(spec.calendarStatus, rule.verificationStatus, inst.id);
    if (spec.lastTradingDay.kind === 'ENCODED' && inst.id !== 'NYMEX:CL') {
      // CL uses the fuller CME contract-spec text (instruments.ts only references rule 200102.F).
      assert.equal(spec.lastTradingDay.ruleText, rule.lastTradingDayRule, inst.id);
    }
    if (spec.listing.type === 'FIXED_MONTHS') {
      const letters = parseMonthCodeList(rule.listedMonths);
      assert.deepEqual(spec.listing.months, letters.map(monthCodeToMonth), inst.id);
    }
  }
});

// ---------------------------------------------------------------- business days

test('business calendar basics', () => {
  assert.equal(weekday('2026-11-17'), 2); // Tuesday
  const cal = new BusinessCalendar();
  assert.equal(cal.lastBusinessDayOfMonth(2025, 5), '2025-05-30'); // May 31 2025 = Saturday
  assert.equal(cal.businessDaysBefore('2025-03-17', 1), '2025-03-14');
  assert.equal(new BusinessCalendar(['2025-05-30']).lastBusinessDayOfMonth(2025, 5), '2025-05-29');
});

// ---------------------------------------------------------------- last trading day / FND

// Official CME / ICE expiry-calendar pages could not be fetched from the build environment
// (cmegroup.com refuses connections). Expected dates below were cross-checked against the
// published contract pages cited in each comment; the rule text is from the exchange.

test('CBOT corn LTD: ZCH25 = 2025-03-14 and ZCZ24 = 2024-12-13', () => {
  // ZCH25: March 15 2025 is a Saturday -> business day prior = Fri 14 Mar 2025.
  // Cross-check: barchart.com/futures/quotes/ZCH25 (final trading session 2025-03-14).
  const h25 = computeLastTradingDay('CBOT:ZC', 2025, 3);
  assert.equal(computedDate(h25), '2025-03-14');
  assert.equal(h25.status === 'COMPUTED' && h25.holidayAdjusted, false);
  assert.ok(h25.status === 'COMPUTED' && h25.warnings.includes(NO_HOLIDAY_WARNING));
  assert.ok(h25.status === 'COMPUTED' && h25.sourceUrl.startsWith('https://www.cmegroup.com/'));
  // ZCZ24: Dec 15 2024 is a Sunday -> Fri 13 Dec 2024.
  assert.equal(computedDate(computeLastTradingDay('CBOT:ZC', 2024, 12)), '2024-12-13');
  // Grain FND has no sourced rule text -> UNAVAILABLE, never guessed.
  const fnd = computeFirstNoticeDay('CBOT:ZC', 2025, 3);
  assert.equal(fnd.status, 'UNAVAILABLE');
});

test('NYMEX WTI LTD: CLZ24 = 2024-11-20; CLF25 is holiday-affected (warning, caller holidays fix it)', () => {
  // CLZ24: Nov 25 2024 (Mon) is a business day -> 3 business days prior = Wed 20 Nov 2024.
  // Cross-check: barchart.com/futures/quotes/CLZ24 (expiration 11/20/24).
  assert.equal(computedDate(computeLastTradingDay('NYMEX:CL', 2024, 12)), '2024-11-20');

  // CLF25: the 25th is Christmas Day 2024 (Wed). Mon-Fri only treats it as a business day and gives
  // 2024-12-20, which is NOT the exchange date; the result must say holidays were not applied.
  const raw = computeLastTradingDay('NYMEX:CL', 2025, 1);
  assert.equal(computedDate(raw), '2024-12-20');
  assert.ok(raw.status === 'COMPUTED' && !raw.holidayAdjusted && raw.warnings.includes(NO_HOLIDAY_WARNING));
  // With Christmas supplied as a holiday, the rule ("3 business days prior to the business day
  // preceding the 25th") gives Thu 19 Dec 2024.
  const adj = computeLastTradingDay('NYMEX:CL', 2025, 1, { holidays: ['2024-12-25'] });
  assert.equal(computedDate(adj), '2024-12-19');
  assert.ok(adj.status === 'COMPUTED' && adj.holidayAdjusted && adj.warnings.includes(CALLER_HOLIDAY_WARNING));
});

test('ICE Brent Feb-2025 expiry moves off the business day preceding New Year (2024-12-30)', () => {
  // Cross-check: S&P Global Platts subscriber note (17 Dec 2024): ICE Brent Feb-25 futures expire
  // Dec 30, "rather than the last business day of the month - Dec. 31".
  assert.equal(computedDate(computeLastTradingDay('ICE:BRN', 2025, 2)), '2024-12-30');
  // Mar-2025: last business day of January 2025 = Fri 31 Jan (no adjustment).
  assert.equal(computedDate(computeLastTradingDay('ICE:BRN', 2025, 3)), '2025-01-31');
});

test('ICE cotton CTZ24: LTD and FND match published dates once US holidays are supplied', () => {
  // Cross-check (third party): barchart.com/futures/quotes/CTZ24 - expiration 12/06/24, FND 11/22/24.
  const raw = computeLastTradingDay('ICE:CT', 2024, 12);
  assert.equal(computedDate(raw), '2024-12-09'); // Mon-Fri only: Christmas counted as business day
  assert.ok(raw.status === 'COMPUTED' && raw.warnings.includes(NO_HOLIDAY_WARNING));
  assert.equal(computedDate(computeLastTradingDay('ICE:CT', 2024, 12, { holidays: ['2024-12-25'] })), '2024-12-06');
  assert.equal(computedDate(computeFirstNoticeDay('ICE:CT', 2024, 12)), '2024-11-25');
  assert.equal(computedDate(computeFirstNoticeDay('ICE:CT', 2024, 12, { holidays: ['2024-11-28'] })), '2024-11-22');
});

test('other encoded rules: sugar, coffee, cocoa, metals, natural gas (rule arithmetic)', () => {
  // SB H25: last business day of Feb 2025 = Fri 28 Feb; FND = first business day after = Mon 3 Mar.
  assert.equal(computedDate(computeLastTradingDay('ICE:SB', 2025, 3)), '2025-02-28');
  assert.equal(computedDate(computeFirstNoticeDay('ICE:SB', 2025, 3)), '2025-03-03');
  // KC H25: last business day Mar 2025 = Mon 31; LND = 7 before = Thu 20; LTD = Wed 19.
  assert.equal(computedDate(computeLastTradingDay('ICE:KC', 2025, 3)), '2025-03-19');
  // KC H25 FND: first business day Mar = Mon 3; 7 business days prior = Thu 20 Feb.
  assert.equal(computedDate(computeFirstNoticeDay('ICE:KC', 2025, 3)), '2025-02-20');
  // CC H25: LTD = 11 business days before Mon 31 Mar = Fri 14 Mar.
  assert.equal(computedDate(computeLastTradingDay('ICE:CC', 2025, 3)), '2025-03-14');
  // CC H25 FND: 6th business day of Mar 2025 = Mon 10; 10 business days prior = Mon 24 Feb.
  assert.equal(computedDate(computeFirstNoticeDay('ICE:CC', 2025, 3)), '2025-02-24');
  // RC H25: 4 business days before Mon 31 Mar = Tue 25 Mar.
  assert.equal(computedDate(computeLastTradingDay('ICE:RC', 2025, 3)), '2025-03-25');
  // GC Z24: third last business day of Dec 2024 (31 Tue, 30 Mon, 27 Fri) = 27 Dec.
  assert.equal(computedDate(computeLastTradingDay('COMEX:GC', 2024, 12)), '2024-12-27');
  // NG F25: 3 business days before 1 Jan 2025 (Mon-Fri only) = Fri 27 Dec 2024.
  const ng = computeLastTradingDay('NYMEX:NG', 2025, 1);
  assert.equal(computedDate(ng), '2024-12-27');
  assert.ok(ng.status === 'COMPUTED' && ng.ruleVerification === 'UNVERIFIED');
  assert.equal(computeLastTradingDay('NOPE:XX', 2025, 1).status, 'UNAVAILABLE');
});

// ---------------------------------------------------------------- chain

test('ZC chain from 2026-11-17 lists Z26 H27 K27 N27 U27 with computed LTDs', () => {
  const chain = buildContractChain({ instrumentId: 'CBOT:ZC', root: 'ZC', mxvRoot: 'ZCE', asOf: '2026-11-17', count: 5 });
  assert.equal(chain.status, 'OK');
  if (chain.status !== 'OK') return;
  assert.deepEqual(chain.contracts.map((c) => c.code), ['ZCZ26', 'ZCH27', 'ZCK27', 'ZCN27', 'ZCU27']);
  assert.deepEqual(chain.contracts.map((c) => c.mxvCode), ['ZCEZ26', 'ZCEH27', 'ZCEK27', 'ZCEN27', 'ZCEU27']);
  assert.deepEqual(
    chain.contracts.map((c) => computedDate(c.lastTradingDay)),
    // Dec 15 2026 Tue -> 14; Mar 15 2027 Mon -> Fri 12; May 15 Sat -> 14; Jul 15 Thu -> 14; Sep 15 Wed -> 14
    ['2026-12-14', '2027-03-12', '2027-05-14', '2027-07-14', '2027-09-14']
  );
  assert.equal(chain.contracts[0].calendarDaysToLastTrade, 27);
  assert.ok(chain.contracts.every((c) => c.calendarStatus === 'VERIFIED'));
  assert.ok(chain.contracts.every((c) => c.firstNoticeDay.status === 'UNAVAILABLE'));
});

test('chain includes a contract on its last trading day and drops it the next business day', () => {
  const on = buildContractChain({ instrumentId: 'CBOT:ZC', root: 'ZC', asOf: '2024-12-13', count: 1 });
  const after = buildContractChain({ instrumentId: 'CBOT:ZC', root: 'ZC', asOf: '2024-12-16', count: 1 });
  assert.equal(on.status === 'OK' && on.contracts[0].code, 'ZCZ24');
  assert.equal(after.status === 'OK' && after.contracts[0].code, 'ZCH25');
});

test('CL chain skips the current-month contract that already expired the month before', () => {
  const chain = buildContractChain({ instrumentId: 'NYMEX:CL', root: 'CL', asOf: '2024-11-21', count: 3 });
  assert.equal(chain.status, 'OK');
  if (chain.status !== 'OK') return;
  assert.deepEqual(chain.contracts.map((c) => c.code), ['CLF25', 'CLG25', 'CLH25']);
});

test('UNVERIFIED calendars still compute but every contract is marked UNVERIFIED', () => {
  const chain = buildContractChain({ instrumentId: 'COMEX:HG', root: 'HG', asOf: '2026-11-17', count: 4 });
  assert.equal(chain.status, 'OK');
  if (chain.status !== 'OK') return;
  assert.deepEqual(chain.contracts.map((c) => c.code), ['HGX26', 'HGZ26', 'HGF27', 'HGG27']);
  assert.ok(chain.contracts.every((c) => c.calendarStatus === 'UNVERIFIED'));
  assert.equal(chain.calendarStatus, 'UNVERIFIED');
});

test('GC chain follows the consecutive + cycle listing schedule', () => {
  // asOf 2026-11-17: Nov (LTD Nov 25), Dec, Jan (consecutive 3), then Feb, Apr, Jun, Aug, Oct, Dec...
  const chain = buildContractChain({ instrumentId: 'COMEX:GC', root: 'GC', asOf: '2026-11-17', count: 7 });
  assert.equal(chain.status, 'OK');
  if (chain.status !== 'OK') return;
  assert.deepEqual(chain.contracts.map((c) => c.code), ['GCX26', 'GCZ26', 'GCF27', 'GCG27', 'GCJ27', 'GCM27', 'GCQ27']);
});

test('RC chain is capped at ten listed delivery months', () => {
  const chain = buildContractChain({ instrumentId: 'ICE:RC', root: 'RC', asOf: '2026-11-17', count: 15 });
  assert.equal(chain.status === 'OK' && chain.contracts.length, 10);
});

test('chain rejects bad input', () => {
  assert.equal(buildContractChain({ instrumentId: 'CBOT:ZC', root: 'ZC', asOf: '2026-02-30', count: 3 }).status, 'INVALID_INPUT');
  assert.equal(buildContractChain({ instrumentId: 'CBOT:ZC', root: 'ZC', asOf: '2026-02-03', count: 0 }).status, 'INVALID_INPUT');
  assert.equal(buildContractChain({ instrumentId: 'X:Y', root: 'Y', asOf: '2026-02-03', count: 3 }).status, 'UNAVAILABLE');
});

// ---------------------------------------------------------------- continuous series

function bar(symbol: string, date: string, o: number, h: number, l: number, c: number, volume: number | null = null, oi: number | null = null): MarketCandle {
  return {
    symbol, exchange: 'CBOT', timeframe: 'D1', timestamp: `${date}T00:00:00.000Z`, retrievedAt: '2025-03-10T00:00:00.000Z',
    open: o, high: h, low: l, close: c, volume, openInterest: oi, isComplete: true, source: 'TEST', status: 'HISTORICAL',
  };
}

// Hand-built example. ZCH25 LTD supplied as 2025-03-05 (Wed); roll 1 business day before = 2025-03-04.
// On 2025-03-04: A close 80, B close 100 -> gap +20, ratio 1.25 (exact in binary floating point).
const A = [bar('ZCH25', '2025-03-03', 60, 64, 56, 62, 500, 900), bar('ZCH25', '2025-03-04', 79, 81, 78, 80, 400, 800), bar('ZCH25', '2025-03-05', 82, 83, 81, 82, 300, 700)];
const B = [bar('ZCK25', '2025-03-03', 98, 99, 97, 98, 450, 850), bar('ZCK25', '2025-03-04', 99, 101, 98, 100, 600, 950), bar('ZCK25', '2025-03-05', 101, 103, 100, 102, 700, 1000)];
const DATES = { ZCH25: { lastTradingDay: '2025-03-05' }, ZCK25: { lastTradingDay: '2025-05-14' } };

test('continuous: back-adjusted (difference) and ratio-adjusted math is exact on a 2-contract example', () => {
  const none = buildContinuousSeries({ series: { ZCK25: B, ZCH25: A }, rollRule: { type: 'DAYS_BEFORE_EXPIRY', days: 1 }, adjustment: 'NONE', contractDates: DATES });
  assert.equal(none.status, 'OK');
  if (none.status !== 'OK') return;
  assert.deepEqual(none.contractsUsed, ['ZCH25', 'ZCK25']);
  assert.deepEqual(none.rolls, [{ date: '2025-03-04', from: 'ZCH25', to: 'ZCK25', fromClose: 80, toClose: 100, priceGap: 20, priceRatio: 1.25 }]);
  assert.deepEqual(none.bars.map((b) => [b.date, b.contract, b.close]), [
    ['2025-03-03', 'ZCH25', 62], ['2025-03-04', 'ZCK25', 100], ['2025-03-05', 'ZCK25', 102],
  ]);

  const back = buildContinuousSeries({ series: { ZCH25: A, ZCK25: B }, rollRule: { type: 'DAYS_BEFORE_EXPIRY', days: 1 }, adjustment: 'BACK_ADJUSTED', contractDates: DATES });
  assert.equal(back.status, 'OK');
  if (back.status !== 'OK') return;
  assert.deepEqual([back.bars[0].open, back.bars[0].high, back.bars[0].low, back.bars[0].close], [80, 84, 76, 82]);
  assert.equal(back.bars[0].rawClose, 62);
  assert.equal(back.bars[0].additiveAdjustment, 20);
  assert.deepEqual(back.bars.slice(1).map((b) => b.close), [100, 102]); // latest contract unadjusted

  const ratio = buildContinuousSeries({ series: { ZCH25: A, ZCK25: B }, rollRule: { type: 'DAYS_BEFORE_EXPIRY', days: 1 }, adjustment: 'RATIO_ADJUSTED', contractDates: DATES });
  assert.equal(ratio.status, 'OK');
  if (ratio.status !== 'OK') return;
  assert.deepEqual([ratio.bars[0].open, ratio.bars[0].high, ratio.bars[0].low, ratio.bars[0].close], [75, 80, 70, 77.5]);
  assert.equal(ratio.bars[0].ratioAdjustment, 1.25);
  assert.deepEqual(ratio.bars.slice(1).map((b) => b.close), [100, 102]);
});

test('continuous: refuses a roll date without an overlapping bar in both contracts', () => {
  const bMissing = B.filter((b) => !b.timestamp.startsWith('2025-03-04'));
  const r = buildContinuousSeries({ series: { ZCH25: A, ZCK25: bMissing }, rollRule: { type: 'DAYS_BEFORE_EXPIRY', days: 1 }, adjustment: 'BACK_ADJUSTED', contractDates: DATES });
  assert.equal(r.status, 'INVALID_INPUT');
  assert.match(r.status === 'INVALID_INPUT' ? r.errors.join(' ') : '', /no bar for ZCK25 on that date/);
  // DAYS_BEFORE_FND without FND dates is refused.
  const f = buildContinuousSeries({ series: { ZCH25: A, ZCK25: B }, rollRule: { type: 'DAYS_BEFORE_FND', days: 0 }, adjustment: 'NONE', contractDates: DATES });
  assert.equal(f.status, 'INVALID_INPUT');
});

test('continuous: volume and open-interest crossover, and null fields are refused', () => {
  const vol = buildContinuousSeries({ series: { ZCH25: A, ZCK25: B }, rollRule: { type: 'VOLUME_CROSSOVER' }, adjustment: 'NONE', referenceYear: 2025 });
  assert.equal(vol.status === 'OK' && vol.rolls[0].date, '2025-03-04'); // 600 > 400
  const oi = buildContinuousSeries({ series: { ZCH25: A, ZCK25: B }, rollRule: { type: 'OPEN_INTEREST_CROSSOVER' }, adjustment: 'NONE', referenceYear: 2025 });
  assert.equal(oi.status === 'OK' && oi.rolls[0].date, '2025-03-04'); // 950 > 800
  const nullVol = A.map((b) => ({ ...b, volume: null }));
  const bad = buildContinuousSeries({ series: { ZCH25: nullVol, ZCK25: B }, rollRule: { type: 'VOLUME_CROSSOVER' }, adjustment: 'NONE', referenceYear: 2025 });
  assert.equal(bad.status, 'INVALID_INPUT');
});

test('continuous: ratio adjustment refuses non-positive roll prices', () => {
  const negA = A.map((b) => (b.timestamp.startsWith('2025-03-04') ? { ...b, close: -5 } : b));
  const r = buildContinuousSeries({ series: { ZCH25: negA, ZCK25: B }, rollRule: { type: 'DAYS_BEFORE_EXPIRY', days: 1 }, adjustment: 'RATIO_ADJUSTED', contractDates: DATES });
  assert.equal(r.status, 'INVALID_INPUT');
});

// ---------------------------------------------------------------- term structure

const TS = '2025-01-02T00:00:00.000Z';
// days from 2025-01-02: Mar 14 -> 71, May 14 -> 132, Jul 14 -> 193
const LTD = { H: '2025-03-14', K: '2025-05-14', N: '2025-07-14' };

test('term structure: contango, sorted by expiry, spreads and roll-yield arithmetic', () => {
  const r = buildTermStructure([
    { contract: 'ZCN25', price: 420, timestamp: TS, lastTradingDay: LTD.N },
    { contract: 'ZCH25', price: 400, timestamp: TS, lastTradingDay: LTD.H },
    { contract: 'ZCK25', price: 410, timestamp: TS, lastTradingDay: LTD.K },
  ]);
  assert.equal(r.status, 'OK');
  if (r.status !== 'OK') return;
  assert.equal(r.shape, 'CONTANGO');
  assert.deepEqual(r.points.map((p) => [p.contract, p.daysToExpiry]), [['ZCH25', 71], ['ZCK25', 132], ['ZCN25', 193]]);
  assert.equal(r.spreads[0].spread, -10);
  assert.equal(r.spreads[0].annualizedRollYield, (Math.log(400 / 410) * 365) / 61);
  assert.ok(r.spreads[0].annualizedRollYield! < 0);
  assert.ok(Math.abs(annualizedRollYield(400, 410, 71, 132)! - -0.1477509) < 1e-6);
});

test('term structure: backwardation, mixed, flat labels', () => {
  const back = buildTermStructure([
    { contract: 'H', price: 80, timestamp: TS, lastTradingDay: LTD.H },
    { contract: 'K', price: 78, timestamp: TS, lastTradingDay: LTD.K },
  ]);
  assert.equal(back.status === 'OK' && back.shape, 'BACKWARDATION');
  assert.ok(back.status === 'OK' && back.spreads[0].annualizedRollYield! > 0);
  const mixed = buildTermStructure([
    { contract: 'H', price: 80, timestamp: TS, lastTradingDay: LTD.H },
    { contract: 'K', price: 82, timestamp: TS, lastTradingDay: LTD.K },
    { contract: 'N', price: 81, timestamp: TS, lastTradingDay: LTD.N },
  ]);
  assert.equal(mixed.status === 'OK' && mixed.shape, 'MIXED');
  const flat = buildTermStructure([
    { contract: 'H', price: 80, timestamp: TS, lastTradingDay: LTD.H },
    { contract: 'K', price: 80, timestamp: TS, lastTradingDay: LTD.K },
  ]);
  assert.equal(flat.status === 'OK' && flat.shape, 'FLAT');
});

test('term structure: rejects prices from different dates, expired contracts and single points', () => {
  const r = buildTermStructure([
    { contract: 'H', price: 80, timestamp: TS, lastTradingDay: LTD.H },
    { contract: 'K', price: 82, timestamp: '2025-01-03T00:00:00.000Z', lastTradingDay: LTD.K },
  ]);
  assert.equal(r.status, 'INVALID_INPUT');
  const expired = buildTermStructure([
    { contract: 'Z', price: 80, timestamp: TS, lastTradingDay: '2024-12-13' },
    { contract: 'K', price: 82, timestamp: TS, lastTradingDay: LTD.K },
  ]);
  assert.equal(expired.status, 'INVALID_INPUT');
  assert.equal(buildTermStructure([{ contract: 'H', price: 80, timestamp: TS, lastTradingDay: LTD.H }]).status, 'INVALID_INPUT');
});
