import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseOhlcvCsv, parseDecimal, detectDateFormat, tokenizeCsv, type ParseOhlcvOptions } from './csvOhlcvParser.ts';
import { zonedWallTimeToUtc } from './timeZones.ts';

const FIXTURE = new URL('../__fixtures__/synthetic_test_ZC_daily.csv', import.meta.url);

function opts(overrides: Partial<ParseOhlcvOptions> = {}): ParseOhlcvOptions {
  return {
    timeframe: 'D1',
    timezone: 'America/Chicago',
    symbol: 'ZCH25',
    exchange: 'CBOT',
    now: new Date('2026-11-17T00:00:00Z'),
    ...overrides,
  };
}

const iso = (ms: number) => new Date(ms).toISOString();

test('synthetic fixture: MM/DD/YYYY detected, Last→close, OI parsed, preamble reported', () => {
  const r = parseOhlcvCsv(readFileSync(FIXTURE, 'utf8'), opts());
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.bars.length, 30);
  assert.equal(r.dateFormat, 'MM/DD/YYYY');
  assert.equal(r.delimiter, ',');
  assert.equal(r.columns.close, 'Last');
  assert.equal(r.columns.openInterest, 'Open Interest');
  assert.equal(iso(r.bars[0].timestampMs), '2025-01-06T00:00:00.000Z');
  assert.deepEqual(
    [r.bars[0].open, r.bars[0].high, r.bars[0].low, r.bars[0].close, r.bars[0].volume, r.bars[0].openInterest],
    [440.29, 441.92, 435.72, 438.68, 153775, 1500000]
  );
  assert.equal(r.bars[0].line, 3);
  assert.ok(r.warnings.some((w) => w.code === 'PREAMBLE_SKIPPED'));
});

test('BOM, CRLF and semicolon delimiter with declared decimal comma', () => {
  const csv = '﻿Date;Open;High;Low;Close;Volume\r\n2025-01-06;440,25;441,5;439;440;1.234\r\n2025-01-07;440;442;438,75;441;980\r\n';
  const r = parseOhlcvCsv(csv, opts({ decimalSeparator: ',' }));
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.delimiter, ';');
  assert.equal(r.columns.date, 'Date');
  assert.equal(r.bars[0].open, 440.25);
  assert.equal(r.bars[0].high, 441.5);
  assert.equal(r.bars[0].volume, 1234);
  assert.equal(r.bars[1].low, 438.75);
});

test('semicolon file with separators in numbers is rejected unless decimalSeparator is declared', () => {
  const csv = 'Date;Open;High;Low;Close\n2025-01-06;440,25;441,5;439;440\n';
  const r = parseOhlcvCsv(csv, opts());
  assert.equal(r.ok, false);
  assert.match(r.errors[0].message, /declare decimalSeparator/);
  assert.equal(r.errors[0].line, 2);
});

test('quoted fields with thousands separators require a declared decimal separator', () => {
  const csv = '"Date","Open","High","Low","Close","Vol"\n"2025-01-06","1,234.50","1,240.00","1,230.25","1,238.00","5,000"\n';
  const undeclared = parseOhlcvCsv(csv, opts());
  assert.equal(undeclared.ok, false);
  assert.ok(undeclared.errors.every((e) => e.line === 2));
  assert.match(undeclared.errors[0].message, /ambiguous thousands\/decimal/);

  const declared = parseOhlcvCsv(csv, opts({ decimalSeparator: '.' }));
  assert.equal(declared.ok, true, JSON.stringify(declared.errors));
  assert.equal(declared.bars[0].open, 1234.5);
  assert.equal(declared.bars[0].volume, 5000);
});

test('quoted field with embedded newline and "" escape keeps physical line numbers', () => {
  const csv = 'Date,Open,High,Low,Close,Note\n2025-01-06,10,11,9,10,"multi\nline ""note"""\n2025-01-07,10,9,11,10,x\n';
  const tok = tokenizeCsv(csv, ',');
  assert.ok(tok.ok);
  if (tok.ok) assert.equal(tok.records[1].fields[5], 'multi\nline "note"');
  const r = parseOhlcvCsv(csv, opts());
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].line, 4);
  assert.match(r.errors[0].message, /invalid OHLC relationship/);
  assert.ok(r.ignoredColumns.includes('Note'));
});

test('ambiguous day/month dates are rejected with a request to declare the format', () => {
  const csv = 'Date,Open,High,Low,Close\n01/02/2025,10,11,9,10\n02/03/2025,10,11,9,10\n';
  const r = parseOhlcvCsv(csv, opts());
  assert.equal(r.ok, false);
  assert.match(r.errors[0].message, /ambiguous.*Declare dateFormat/i);
});

test('declared MM/DD vs DD/MM give different, correct dates', () => {
  const csv = 'Date,Open,High,Low,Close\n01/02/2025,10,11,9,10\n';
  const mdy = parseOhlcvCsv(csv, opts({ dateFormat: 'MM/DD/YYYY' }));
  const dmy = parseOhlcvCsv(csv, opts({ dateFormat: 'DD/MM/YYYY' }));
  assert.equal(iso(mdy.bars[0].timestampMs), '2025-01-02T00:00:00.000Z');
  assert.equal(iso(dmy.bars[0].timestampMs), '2025-02-01T00:00:00.000Z');
});

test('DD/MM/YYYY detected when a first component exceeds 12; inconsistent files rejected', () => {
  assert.deepEqual(detectDateFormat(['13/01/2025', '14/01/2025']), { ok: true, format: 'DD/MM/YYYY' });
  assert.deepEqual(detectDateFormat(['01/13/2025']), { ok: true, format: 'MM/DD/YYYY' });
  assert.equal(detectDateFormat(['13/01/2025', '01/13/2025']).ok, false);
  assert.equal(detectDateFormat(['2025-01-13', '01/13/2025']).ok, false);
  assert.deepEqual(detectDateFormat(['2025-01-13']), { ok: true, format: 'YYYY-MM-DD' });
});

test('declared format mismatch and invalid calendar dates are row errors with line numbers', () => {
  const csv = 'Date,Open,High,Low,Close\n13/01/2025,10,11,9,10\n2025-02-30,10,11,9,10\n';
  const r = parseOhlcvCsv(csv, opts({ dateFormat: 'MM/DD/YYYY' }));
  assert.equal(r.ok, false);
  assert.deepEqual(
    r.errors.map((e) => e.line),
    [2, 3]
  );
});

test('out-of-order rows are errors unless sort=true (then reported as a warning)', () => {
  const csv = 'Date,Open,High,Low,Close\n2025-01-07,10,11,9,10\n2025-01-06,10,11,9,10\n';
  const strict = parseOhlcvCsv(csv, opts());
  assert.equal(strict.ok, false);
  assert.equal(strict.errors[0].line, 3);
  assert.match(strict.errors[0].message, /out-of-order/);

  const sorted = parseOhlcvCsv(csv, opts({ sort: true }));
  assert.equal(sorted.ok, true);
  assert.equal(iso(sorted.bars[0].timestampMs), '2025-01-06T00:00:00.000Z');
  assert.equal(sorted.bars[0].line, 3);
  assert.ok(sorted.warnings.some((w) => w.code === 'ROWS_SORTED'));
});

test('duplicates, non-positive prices, negative volume and extra fields surface line numbers', () => {
  const csv = [
    'Date,Open,High,Low,Close,Volume',
    '2025-01-06,10,11,9,10,5',
    '2025-01-06,10,11,9,10,5',
    '2025-01-07,0,11,9,10,5',
    '2025-01-08,10,11,9,10,-1',
    '2025-01-09,10,11,9,10,5,7',
    '2025-01-10,10,11,9,,5',
  ].join('\n');
  const r = parseOhlcvCsv(csv, opts());
  assert.equal(r.ok, false);
  const byLine = (n: number) => r.errors.filter((e) => e.line === n).map((e) => e.message).join(' | ');
  assert.match(byLine(3), /duplicate timestamp/);
  assert.match(byLine(4), /Non-positive open/);
  assert.match(byLine(5), /Negative volume/);
  assert.match(byLine(6), /fields but the header has/);
  assert.match(byLine(7), /Missing close/);
  assert.equal(byLine(2), '');
});

test('intraday: wall time converted from declared timezone to UTC; DST gap and overlap rejected', () => {
  const csv = 'Date,Time,Open,High,Low,Close\n2025-03-07,08:30,10,11,9,10\n2025-03-10,08:30,10,11,9,10\n';
  const r = parseOhlcvCsv(csv, opts({ timeframe: 'M30' }));
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(iso(r.bars[0].timestampMs), '2025-03-07T14:30:00.000Z'); // CST, UTC-6
  assert.equal(iso(r.bars[1].timestampMs), '2025-03-10T13:30:00.000Z'); // CDT, UTC-5

  const gap = parseOhlcvCsv('Date,Time,Open,High,Low,Close\n2025-03-09,02:30,10,11,9,10\n', opts({ timeframe: 'M30' }));
  assert.equal(gap.ok, false);
  assert.match(gap.errors[0].message, /does not exist/);

  const overlap = parseOhlcvCsv('Date,Time,Open,High,Low,Close\n2025-11-02,01:30,10,11,9,10\n', opts({ timeframe: 'M30' }));
  assert.equal(overlap.ok, false);
  assert.match(overlap.errors[0].message, /ambiguous/);

  const explicit = parseOhlcvCsv('Datetime,Open,High,Low,Close\n2025-11-02T01:30:00-05:00,10,11,9,10\n', opts({ timeframe: 'M30' }));
  assert.equal(explicit.ok, true);
  assert.equal(iso(explicit.bars[0].timestampMs), '2025-11-02T06:30:00.000Z');

  const missingTime = parseOhlcvCsv('Date,Open,High,Low,Close\n2025-03-07,10,11,9,10\n', opts({ timeframe: 'H1' }));
  assert.equal(missingTime.ok, false);
  assert.match(missingTime.errors[0].message, /requires a time/);
});

test('zonedWallTimeToUtc handles Asia/Ho_Chi_Minh (no DST)', () => {
  const r = zonedWallTimeToUtc({ year: 2025, month: 6, day: 2, hour: 9, minute: 0, second: 0 }, 'Asia/Ho_Chi_Minh');
  assert.deepEqual(r, { ok: true, utcMs: Date.parse('2025-06-02T02:00:00Z') });
});

test('daily bars ignore time-of-day (warned), keep session date at 00:00Z', () => {
  const r = parseOhlcvCsv('Date,Open,High,Low,Close\n2025-01-06 17:00,10,11,9,10\n', opts());
  assert.equal(r.ok, true);
  assert.equal(iso(r.bars[0].timestampMs), '2025-01-06T00:00:00.000Z');
  assert.ok(r.warnings.some((w) => w.code === 'TIME_ON_DAILY_BAR'));
});

test('suspicious data is reported as warnings, never altered: price jump, session gap, weekend', () => {
  const csv = [
    'Date,Open,High,Low,Close',
    '2025-01-06,100,101,99,100',
    '2025-01-07,100,130,99,125', // +25%
    '2025-01-17,125,126,124,125', // 7 weekdays missing
    '2025-01-18,125,126,124,125', // Saturday
  ].join('\n');
  const r = parseOhlcvCsv(csv, opts());
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.bars[1].close, 125);
  const codes = r.warnings.map((w) => w.code);
  assert.ok(codes.includes('PRICE_JUMP'));
  assert.ok(codes.includes('SESSION_GAP'));
  assert.ok(codes.includes('WEEKEND_DATE'));
  assert.equal(r.warnings.find((w) => w.code === 'PRICE_JUMP')?.line, 3);
  assert.equal(r.warnings.find((w) => w.code === 'SESSION_GAP')?.line, 4);
});

test('Barchart-style export: "Time" date column, "Open Int", footer line skipped with warning', () => {
  const csv =
    'Time,Open,High,Low,Last,Change,%Chg,Volume,Open Int\r\n' +
    '01/06/2025,440.00,441.00,439.00,440.50,+0.50,+0.11%,1000,2000\r\n' +
    '01/13/2025,440.50,442.00,440.00,441.00,+0.50,+0.11%,1100,2100\r\n' +
    '"Downloaded from Barchart.com as of 01-14-2025"\r\n';
  const r = parseOhlcvCsv(csv, opts());
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.columns.date, 'Time');
  assert.equal(r.bars[1].openInterest, 2100);
  assert.ok(r.warnings.some((w) => w.code === 'FOOTER_SKIPPED'));
  assert.ok(r.warnings.some((w) => w.code === 'IGNORED_COLUMNS'));
});

test('header problems: missing columns, duplicate aliases, invalid timezone, no header', () => {
  assert.match(parseOhlcvCsv('Date,Close\n2025-01-06,10\n', opts()).errors[0].message, /Missing required column/);
  assert.match(
    parseOhlcvCsv('Date,Open,High,Low,Close,Settle\n2025-01-06,10,11,9,10,10\n', opts()).errors[0].message,
    /Ambiguous header/
  );
  assert.match(parseOhlcvCsv('Date,Open,High,Low,Close\n', opts({ timezone: 'Mars/Base' })).errors[0].message, /IANA/);
  assert.match(parseOhlcvCsv('a,b,c\n1,2,3\n', opts()).errors[0].message, /No header row/);
  assert.match(parseOhlcvCsv('Date,Open,High,Low,Close\n', opts()).errors[0].message, /No data rows/);
});

test('future-dated bars are rejected', () => {
  const r = parseOhlcvCsv('Date,Open,High,Low,Close\n2027-01-04,10,11,9,10\n', opts());
  assert.equal(r.ok, false);
  assert.match(r.errors[0].message, /future/);
});

test('parseDecimal rules', () => {
  assert.deepEqual(parseDecimal('12.5', undefined), { ok: true, value: 12.5 });
  assert.deepEqual(parseDecimal('', undefined), { ok: true, value: null });
  assert.equal(parseDecimal('1,5', undefined).ok, false);
  assert.equal(parseDecimal('1e5', undefined).ok, false);
  assert.equal(parseDecimal('12,34', '.').ok, false);
  assert.deepEqual(parseDecimal('1.234.567,8', ','), { ok: true, value: 1234567.8 });
  assert.equal(parseDecimal('1.23', ',').ok, false);
});
