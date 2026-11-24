import test from 'node:test';
import assert from 'node:assert/strict';
import { nyWallToUtcMs, relevantKinds, upcomingEventRisk, usFederalHolidays, vietnamTimeLabel } from './eventRisk.ts';

const at = (iso: string) => Date.parse(iso);

test('relevantKinds maps symbols to report kinds', () => {
  assert.deepEqual(relevantKinds('CL'), ['EIA_PETROLEUM']);
  assert.deepEqual(relevantKinds('ng'), ['EIA_NATGAS']);
  assert.deepEqual(relevantKinds('ZC'), ['WASDE', 'USDA_EXPORT_SALES']);
  assert.deepEqual(relevantKinds('GC'), []);
  assert.deepEqual(relevantKinds('RC'), []);
});

test('nyWallToUtcMs is DST aware', () => {
  // EST (UTC-5) in winter, EDT (UTC-4) in summer
  assert.equal(new Date(nyWallToUtcMs('2026-12-02', 10, 30)).toISOString(), '2026-12-02T15:30:00.000Z');
  assert.equal(new Date(nyWallToUtcMs('2026-07-15', 10, 30)).toISOString(), '2026-07-15T14:30:00.000Z');
});

test('federal holidays include Columbus and Veterans Day, exclude Good Friday', () => {
  const h = usFederalHolidays(2026);
  assert.ok(h.has('2026-10-12'));
  assert.ok(h.has('2026-11-11'));
  assert.ok(h.has('2026-11-26'));
  assert.ok(!h.has('2026-04-03')); // Good Friday 2026
});

test('EIA petroleum: normal Wednesday 10:30 ET within 24h', () => {
  // Tue 2026-12-01 12:00 ET = 17:00Z; report Wed 2026-12-02 15:30Z
  const r = upcomingEventRisk({ symbol: 'CL', nowMs: at('2026-12-01T17:00:00Z') });
  assert.equal(r.length, 1);
  assert.equal(r[0].kind, 'EIA_PETROLEUM');
  assert.equal(r[0].status, 'rule');
  assert.equal(r[0].atIso, '2026-12-02T15:30:00.000Z');
  assert.equal(r[0].hoursUntil, 22.5);
  assert.equal(vietnamTimeLabel(r[0].atMs), '22:30 02/12');
});

test('EIA petroleum: outside 24h and after release -> nothing', () => {
  assert.equal(upcomingEventRisk({ symbol: 'CL', nowMs: at('2026-11-30T12:00:00Z') }).length, 0);
  assert.equal(upcomingEventRisk({ symbol: 'CL', nowMs: at('2026-12-02T16:00:00Z') }).length, 0);
});

test('EIA petroleum: Monday holiday shifts to Thursday, marked estimated', () => {
  // Labor Day 2026-09-07 (Mon). Wed 09-09 -> Thu 09-10 11:00 EDT = 15:00Z
  const r = upcomingEventRisk({ symbol: 'CL', nowMs: at('2026-09-09T20:00:00Z') });
  assert.equal(r.length, 1);
  assert.equal(r[0].status, 'estimated');
  assert.equal(r[0].atIso, '2026-09-10T15:00:00.000Z');
  assert.equal(upcomingEventRisk({ symbol: 'CL', nowMs: at('2026-09-08T20:00:00Z') }).length, 0);
});

test('EIA nat gas: Thanksgiving Thursday -> Wednesday 12:00 ET estimated', () => {
  const r = upcomingEventRisk({ symbol: 'NG', nowMs: at('2026-11-24T20:00:00Z') });
  assert.equal(r.length, 1);
  assert.equal(r[0].kind, 'EIA_NATGAS');
  assert.equal(r[0].status, 'estimated');
  assert.equal(r[0].atIso, '2026-11-25T17:00:00.000Z');
});

test('WASDE uses official dates when provided', () => {
  const now = at('2026-12-09T20:00:00Z');
  const r = upcomingEventRisk({ symbol: 'ZS', nowMs: now, wasdeOfficialDates: ['2026-12-10'] });
  const w = r.find((x) => x.kind === 'WASDE');
  assert.ok(w);
  assert.equal(w.status, 'official');
  assert.equal(w.atIso, '2026-12-10T17:00:00.000Z');
  // Official list known but empty -> no WASDE is invented
  assert.equal(upcomingEventRisk({ symbol: 'ZS', nowMs: now, wasdeOfficialDates: [] }).some((x) => x.kind === 'WASDE'), false);
});

test('WASDE without official list -> estimated window only', () => {
  const r = upcomingEventRisk({ symbol: 'ZW', nowMs: at('2026-12-09T20:00:00Z'), wasdeOfficialDates: null });
  const w = r.find((x) => x.kind === 'WASDE');
  assert.ok(w);
  assert.equal(w.status, 'estimated');
  assert.equal(upcomingEventRisk({ symbol: 'ZW', nowMs: at('2026-12-20T20:00:00Z') }).some((x) => x.kind === 'WASDE'), false);
});

test('bad input is safe', () => {
  assert.deepEqual(upcomingEventRisk({ symbol: 'CL', nowMs: Number.NaN }), []);
  assert.deepEqual(upcomingEventRisk({ symbol: '', nowMs: Date.now() }), []);
});

test('FOMC/CPI apply to every instrument, from the official lists only', () => {
  // FOMC Dec 8-9, 2026: statement Wed 2026-12-09 14:00 EST = 19:00Z = 02:00 10/12 Vietnam
  const g = upcomingEventRisk({ symbol: 'GC', nowMs: at('2026-12-09T00:00:00Z') });
  assert.equal(g.length, 1);
  assert.equal(g[0].kind, 'FOMC');
  assert.equal(g[0].scope, 'macro');
  assert.equal(g[0].status, 'official');
  assert.equal(g[0].atIso, '2026-12-09T19:00:00.000Z');
  assert.equal(vietnamTimeLabel(g[0].atMs), '02:00 10/12');
  // RC has no instrument-specific report but still gets the macro warning
  assert.deepEqual(upcomingEventRisk({ symbol: 'RC', nowMs: at('2026-12-09T00:00:00Z') }).map((x) => x.kind), ['FOMC']);
  // Day after the published lists end -> nothing invented (no Dec 2027 FOMC printed; CPI list ends 2027-12-10)
  assert.equal(upcomingEventRisk({ symbol: 'GC', nowMs: at('2027-12-14T12:00:00Z'), horizonHours: 24 * 30 }).length, 0);
});

test('macro releases rank after instrument-specific reports', () => {
  // 2026-12-09 20:00Z: CPI Thu 12-10 08:30 EST (13:30Z, same time as Export Sales) is earlier than WASDE 12:00 EST
  // (17:00Z) but listed after both instrument-specific reports
  const r = upcomingEventRisk({ symbol: 'ZS', nowMs: at('2026-12-09T20:00:00Z'), wasdeOfficialDates: ['2026-12-10'] });
  assert.deepEqual(r.map((x) => x.kind), ['USDA_EXPORT_SALES', 'WASDE', 'US_CPI']);
  assert.equal(r[2].atIso, '2026-12-10T13:30:00.000Z');
  assert.equal(r[0].scope, 'instrument');
});

test('FOMC/CPI Vietnam time follows US DST (March and November 2027)', () => {
  const one = (iso: string, kind: string) => upcomingEventRisk({ symbol: 'GC', nowMs: at(iso) }).find((x) => x.kind === kind)!;
  // CPI Wed 2027-03-10 is before DST (starts Sun 03-14): 08:30 EST = 13:30Z = 20:30 VN
  assert.equal(vietnamTimeLabel(one('2027-03-10T00:00:00Z', 'US_CPI').atMs), '20:30 10/03');
  // FOMC Wed 2027-03-17 is after DST start: 14:00 EDT = 18:00Z = 01:00 18/03 VN
  assert.equal(one('2027-03-17T00:00:00Z', 'FOMC').atIso, '2027-03-17T18:00:00.000Z');
  assert.equal(vietnamTimeLabel(one('2027-03-17T00:00:00Z', 'FOMC').atMs), '01:00 18/03');
  // CPI Thu 2027-10-14 in EDT: 12:30Z = 19:30 VN; CPI Wed 2027-11-10 after DST ends (Sun 11-07): 13:30Z = 20:30 VN
  assert.equal(vietnamTimeLabel(one('2027-10-14T00:00:00Z', 'US_CPI').atMs), '19:30 14/10');
  assert.equal(one('2027-11-10T00:00:00Z', 'US_CPI').atIso, '2027-11-10T13:30:00.000Z');
  assert.equal(vietnamTimeLabel(one('2027-11-10T00:00:00Z', 'US_CPI').atMs), '20:30 10/11');
  // FOMC Wed 2027-11-17 (EST): 19:00Z
  assert.equal(one('2027-11-17T00:00:00Z', 'FOMC').atIso, '2027-11-17T19:00:00.000Z');
});
