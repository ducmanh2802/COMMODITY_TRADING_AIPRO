import test from 'node:test';
import assert from 'node:assert/strict';
import { isIsoDate, weekday } from '../dates.ts';
import { INSTRUMENT_CALENDAR_SPECS } from '../calendarSpecs.ts';
import { HOLIDAY_CALENDARS, easterSunday, projectUsExchangeHolidays, resolveHolidays } from './index.ts';

test('every bundled holiday entry is a valid, unique, in-coverage date with status and https source', () => {
  for (const cal of Object.values(HOLIDAY_CALENDARS)) {
    const seen = new Set<string>();
    assert.ok(cal.entries.length > 0, cal.id);
    assert.ok(cal.coverage.fromYear <= cal.coverage.toYear, cal.id);
    for (const e of cal.entries) {
      assert.ok(isIsoDate(e.date), `${cal.id} ${e.date}`);
      assert.ok(!seen.has(e.date), `${cal.id} duplicate ${e.date}`);
      seen.add(e.date);
      const y = Number(e.date.slice(0, 4));
      assert.ok(y >= cal.coverage.fromYear && y <= cal.coverage.toYear, `${cal.id} ${e.date} outside coverage`);
      assert.ok(e.status === 'PUBLISHED' || e.status === 'PROJECTED');
      assert.match(e.sourceUrl, /^https:\/\//);
      assert.ok(e.name.length > 0);
    }
    // Every covered year has at least one holiday (no silently empty years).
    for (let y = cal.coverage.fromYear; y <= cal.coverage.toYear; y++) {
      assert.ok(cal.entries.some((e) => e.date.startsWith(`${y}-`)), `${cal.id} has no entries for ${y}`);
    }
  }
});

test('US projection: weekday-only, 10 per year from 2022 (Juneteenth), New Year on Saturday not observed', () => {
  assert.equal(easterSunday(2024), '2024-03-31');
  assert.equal(easterSunday(2025), '2025-04-20');
  assert.equal(easterSunday(2027), '2027-03-28');
  for (let y = 2018; y <= 2030; y++) {
    const hs = projectUsExchangeHolidays(y, 'https://example.invalid');
    for (const h of hs) assert.ok(weekday(h.date) !== 0 && weekday(h.date) !== 6, `${h.date} is a weekend`);
    const ny = `${y}-01-01`;
    const expected = (y >= 2022 ? 10 : 9) - (weekday(ny) === 6 ? 1 : 0);
    assert.equal(hs.length, expected, String(y));
  }
  // NYSE published schedule (nyse.com/markets/hours-calendars, read 2026-11-18) for 2026-2028.
  const nyse: Record<number, string[]> = {
    2026: ['2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25'],
    2027: ['2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24'],
    2028: ['2028-01-17', '2028-02-21', '2028-04-14', '2028-05-29', '2028-06-19', '2028-07-04', '2028-09-04', '2028-11-23', '2028-12-25'],
  };
  for (const [y, dates] of Object.entries(nyse)) {
    assert.deepEqual(projectUsExchangeHolidays(Number(y), 'x').map((h) => h.date), dates, y);
  }
  // 2024 dates that drive the CLF25 / CTZ24 tests.
  const us2024 = projectUsExchangeHolidays(2024, 'x').map((h) => h.date);
  assert.ok(us2024.includes('2024-11-28') && us2024.includes('2024-12-25'));
});

test('published lists contain known anchor dates (UK gov.uk, Singapore MOM)', () => {
  const uk = HOLIDAY_CALENDARS.ICE_EU_SOFTS_LONDON.entries;
  assert.ok(uk.every((e) => e.status === 'PUBLISHED'));
  for (const d of ['2024-12-25', '2024-12-26', '2025-08-25', '2026-12-28', '2022-09-19']) {
    assert.ok(uk.some((e) => e.date === d), d);
  }
  const sg = HOLIDAY_CALENDARS.SG_PUBLIC.entries;
  assert.ok(sg.every((e) => e.status === 'PUBLISHED' && e.sourceUrl.startsWith('https://data.gov.sg/datasets/')));
  for (const d of ['2024-02-12', '2025-03-31', '2026-11-09', '2027-02-08']) {
    assert.ok(sg.some((e) => e.date === d), d);
  }
  // US calendars are never claimed as PUBLISHED.
  assert.ok(HOLIDAY_CALENDARS.CME_US.entries.every((e) => e.status === 'PROJECTED'));
  assert.ok(HOLIDAY_CALENDARS.ICE_US.entries.every((e) => e.status === 'PROJECTED'));
});

test('resolveHolidays drops weekends, merges calendars and reports uncovered years', () => {
  const r = resolveHolidays(['CME_US', 'SG_PUBLIC'], 2026, 2026);
  assert.ok(!r.dates.includes('2026-11-08')); // Sunday Deepavali dropped, observed Monday kept
  assert.ok(r.dates.includes('2026-11-09'));
  assert.ok(r.dates.includes('2026-11-26'));
  assert.deepEqual(r.uncoveredYears, []);
  assert.deepEqual(resolveHolidays(['SG_PUBLIC'], 2027, 2029).uncoveredYears, [2028, 2029]);
});

test('every encoded instrument declares its bundled holiday calendars explicitly', () => {
  for (const spec of Object.values(INSTRUMENT_CALENDAR_SPECS)) {
    assert.ok(Array.isArray(spec.holidayCalendars), spec.instrumentId);
    for (const id of spec.holidayCalendars) assert.ok(HOLIDAY_CALENDARS[id], `${spec.instrumentId} -> ${id}`);
  }
  assert.deepEqual(INSTRUMENT_CALENDAR_SPECS['ICE:BRN'].holidayCalendars, []);
});
