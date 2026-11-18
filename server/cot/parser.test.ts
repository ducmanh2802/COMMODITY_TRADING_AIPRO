import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseCftcCsv, parseCotRecord, normalizeKey } from './parser.ts';
import { COT_MARKET_MAPPINGS, getCotMapping } from './mapping.ts';
import { INITIAL_INSTRUMENTS } from '../data/instruments.ts';

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), 'utf8');

test('normalizeKey maps CFTC text-file headers to Socrata-style names', () => {
  assert.equal(normalizeKey('Report_Date_as_YYYY-MM-DD'), 'report_date_as_yyyy_mm_dd');
  assert.equal(normalizeKey('Swap__Positions_Short_All'), 'swap_positions_short_all');
  assert.equal(normalizeKey(' Total Reportable Positions-Long (All)'), 'total_reportable_positions_long_all');
});

test('parses the real CFTC disaggregated fixture (corn 002602, 2026-11-10)', () => {
  const rows = parseCftcCsv(fixture('cftc_disagg_fut_2026_corn_002602.csv'));
  assert.equal(rows.length, 3);
  const parsed = rows.map((r) => parseCotRecord(r, 'DISAGGREGATED'));
  assert.ok(parsed.every((p) => p.ok));
  const first = parsed[0];
  assert.ok(first.ok);
  const rec = first.record;
  assert.equal(rec.cftcContractMarketCode, '002602');
  assert.equal(rec.reportDate, '2026-11-10');
  assert.equal(rec.marketAndExchangeNames, 'CORN - CHICAGO BOARD OF TRADE');
  assert.equal(rec.openInterest, 1979758);
  assert.deepEqual(rec.positions.producerMerchant, { long: 463839, short: 862967, spread: null });
  assert.deepEqual(rec.positions.swapDealers, { long: 298636, short: 23135, spread: 74284 });
  assert.deepEqual(rec.positions.managedMoney, { long: 243161, short: 265789, spread: 308572 });
  assert.deepEqual(rec.positions.otherReportables, { long: 201297, short: 69594, spread: 210765 });
  assert.deepEqual(rec.positions.nonReportables, { long: 179204, short: 164652, spread: null });
  assert.deepEqual(rec.totalReportable, { long: 1800554, short: 1815106 });
  // Categories reconcile with open interest on both sides in the real data.
  assert.deepEqual(rec.warnings, []);
  assert.deepEqual(
    parsed.map((p) => (p.ok ? p.record.reportDate : null)),
    ['2026-11-10', '2026-11-03', '2026-10-27']
  );
});

test('parses the real CFTC legacy fixture (corn 002602, 2026-11-10)', () => {
  const rows = parseCftcCsv(fixture('cftc_legacy_fut_2026_corn_002602.csv'));
  const p = parseCotRecord(rows[0], 'LEGACY');
  assert.ok(p.ok);
  assert.equal(p.record.reportDate, '2026-11-10');
  assert.equal(p.record.openInterest, 1979758);
  assert.deepEqual(p.record.positions.nonCommercial, { long: 444458, short: 335383, spread: 519337 });
  assert.deepEqual(p.record.positions.commercial, { long: 836759, short: 960386, spread: null });
  assert.deepEqual(p.record.positions.nonReportables, { long: 179204, short: 164652, spread: null });
  assert.deepEqual(p.record.warnings, []);
});

test('accepts Socrata-style keys and floating timestamps (same real values, keys lower-cased)', () => {
  const [row] = parseCftcCsv(fixture('cftc_disagg_fut_2026_corn_002602.csv'));
  const socrataLike: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) socrataLike[k.toLowerCase().replace(/-/g, '_')] = v.trim();
  socrataLike.report_date_as_yyyy_mm_dd = '2026-11-10T00:00:00.000';
  const p = parseCotRecord(socrataLike, 'DISAGGREGATED');
  assert.ok(p.ok);
  assert.equal(p.record.reportDate, '2026-11-10');
  assert.equal(p.record.positions.swapDealers?.short, 23135);
});

test('fails closed on missing / malformed fields and flags inconsistent totals', () => {
  const [row] = parseCftcCsv(fixture('cftc_disagg_fut_2026_corn_002602.csv'));
  const missing = { ...row };
  delete (missing as Record<string, string>)['M_Money_Positions_Short_All'];
  const r1 = parseCotRecord(missing, 'DISAGGREGATED');
  assert.equal(r1.ok, false);

  const r2 = parseCotRecord({ ...row, Open_Interest_All: 'n/a' }, 'DISAGGREGATED');
  assert.equal(r2.ok, false);
  const r3 = parseCotRecord({ ...row, 'Report_Date_as_YYYY-MM-DD': '2026-02-30' }, 'DISAGGREGATED');
  assert.equal(r3.ok, false);
  const r4 = parseCotRecord({ ...row, Prod_Merc_Positions_Long_All: '-5' }, 'DISAGGREGATED');
  assert.equal(r4.ok, false);

  const r5 = parseCotRecord({ ...row, Open_Interest_All: '1979759' }, 'DISAGGREGATED');
  assert.ok(r5.ok);
  assert.equal(r5.record.warnings.length, 2);
});

test('mapping covers all 20 Instrument Master ids with evidence or a NOT_REPORTED reason', () => {
  const ids = INITIAL_INSTRUMENTS.map((i) => i.id).sort();
  assert.equal(ids.length, 20);
  assert.deepEqual(COT_MARKET_MAPPINGS.map((m) => m.instrumentId).sort(), ids);
  for (const m of COT_MARKET_MAPPINGS) {
    if (m.status === 'REPORTED') {
      assert.match(m.cftcContractMarketCode ?? '', /^[0-9A-Z]{6}$/);
      assert.ok(m.evidence?.marketAndExchangeNames);
    } else {
      assert.equal(m.cftcContractMarketCode, null);
      assert.ok((m.notes ?? '').length > 20);
    }
  }
  assert.equal(getCotMapping('CBOT:ZC')?.cftcContractMarketCode, '002602');
  assert.equal(getCotMapping('NYMEX:CL')?.cftcContractMarketCode, '067651');
  assert.equal(getCotMapping('ICE:BRN')?.status, 'NOT_REPORTED');
  assert.equal(getCotMapping('ICE:RC')?.status, 'NOT_REPORTED');
  assert.equal(getCotMapping('CME:TIO')?.status, 'NOT_REPORTED');
});
