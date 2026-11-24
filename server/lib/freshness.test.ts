import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CADENCE,
  FreshnessAlerter,
  FreshnessTracker,
  classify,
  compactFreshness,
  computeFreshness,
  effectiveAgeMs,
  extractObservation,
  allMarketsClosed,
  calendarsFor,
  holidaysFor,
  weekendMsBetween,
} from './freshness.ts';

const H = 3_600_000;
const D = 24 * H;
// 2026-11-23 is a Monday (UTC).
const MON = Date.UTC(2026, 10, 23, 12);
const FRI = Date.UTC(2026, 10, 20, 12);

test('weekendMsBetween counts Saturday+Sunday only', () => {
  assert.equal(weekendMsBetween(FRI, MON), 2 * D);
  assert.equal(weekendMsBetween(MON, MON + 2 * D), 0);
  assert.equal(weekendMsBetween(MON, MON - 1), 0);
});

test('effectiveAgeMs skips weekends for trading-day sources only', () => {
  assert.equal(effectiveAgeMs(FRI, MON, true), D);
  assert.equal(effectiveAgeMs(FRI, MON, false), 3 * D);
  assert.equal(effectiveAgeMs(MON + H, MON, true), 0);
});

test('classify: FRESH within 1.5x cadence, STALE beyond, UNAVAILABLE when null', () => {
  assert.equal(classify(null, H), 'UNAVAILABLE');
  assert.equal(classify(1.5 * H, H), 'FRESH');
  assert.equal(classify(1.5 * H + 1, H), 'STALE');
});

test('quotes: stale after 1.5x cadence on a weekday, weekend gap does not count, never alertable', () => {
  const mk = (last: number, now: number) =>
    computeFreshness({
      now,
      providers: [{ providerId: 'P', name: 'P', connectionState: 'CONNECTED', credentialsConfigured: true, supportsRealtime: true, lastSuccessfulSyncAt: new Date(last).toISOString() }],
    }).find((r) => r.id === 'quotes:P')!;
  assert.equal(mk(MON - 10 * 60_000, MON).status, 'FRESH');
  assert.equal(mk(MON - 40 * 60_000, MON).status, 'STALE');
  assert.equal(mk(MON - 40 * 60_000, MON).alertable, false);
  // Friday 23:50 -> Monday 00:05: only 10 min before the weekend + 5 min after.
  assert.equal(mk(Date.UTC(2026, 10, 20, 23, 50), Date.UTC(2026, 10, 23, 0, 5)).status, 'FRESH');
});

test('D1 candles: Friday bar is fresh on Monday, 8-day-old bar is stale, other timeframes ignored', () => {
  const rows = computeFreshness({
    now: MON,
    datasets: [
      { instrumentId: 'A', timeframe: 'D1', lastTimestamp: new Date(FRI).toISOString() },
      { instrumentId: 'B', timeframe: 'D1', lastTimestamp: new Date(MON - 8 * D).toISOString() },
      { instrumentId: 'B', timeframe: 'D1', lastTimestamp: new Date(MON - 9 * D).toISOString() },
      { instrumentId: 'C', timeframe: 'H1', lastTimestamp: new Date(MON).toISOString() },
    ],
  });
  assert.equal(rows.find((r) => r.id === 'candles:D1:A')!.status, 'FRESH');
  assert.equal(rows.find((r) => r.id === 'candles:D1:B')!.status, 'STALE');
  assert.equal(rows.find((r) => r.id === 'candles:D1:C'), undefined);
});

test('scheduler jobs: COT weekly thresholds, never-run is UNAVAILABLE, disabled skipped', () => {
  const job = (id: string, last: string | null, enabled = true) => ({ id, enabled, lastRunAt: last, lastSuccessAt: last, nextRunAt: null });
  const rows = computeFreshness({
    now: MON,
    jobs: [job('cot-weekly', new Date(MON - 9 * D).toISOString()), job('macro-eia', null), job('fred-macro', null, false), job('macro-wasde', new Date(MON - 5 * D).toISOString())],
  });
  assert.equal(rows.find((r) => r.id === 'job:cot-weekly')!.status, 'FRESH');
  assert.equal(rows.find((r) => r.id === 'job:macro-eia')!.status, 'UNAVAILABLE');
  assert.equal(rows.find((r) => r.id === 'job:fred-macro'), undefined);
  assert.equal(rows.find((r) => r.id === 'job:macro-wasde')!.status, 'STALE');
  const cot12 = computeFreshness({ now: MON, jobs: [job('cot-weekly', new Date(MON - 12 * D).toISOString())] }).find((r) => r.id === 'job:cot-weekly')!;
  assert.equal(cot12.status, 'STALE');
});

test('FRED cadence per series (daily vs monthly), non-FRED ignored, sorted worst first', () => {
  const rows = computeFreshness({
    now: MON,
    fundamentals: [
      { dataset: 'DGS10', source: 'FRED', publicationTimestamp: new Date(MON).toISOString(), observationDate: '2026-11-04', dataPeriod: 'Daily' },
      { dataset: 'CPIAUCSL', source: 'FRED', publicationTimestamp: new Date(MON).toISOString(), observationDate: '2026-10-01', dataPeriod: '2026-10' },
      { dataset: 'OTHER', source: 'USDA', publicationTimestamp: new Date(MON - 99 * D).toISOString() },
    ],
  });
  assert.equal(rows.find((r) => r.id === 'fred:DGS10')!.status, 'STALE');
  assert.equal(rows.find((r) => r.id === 'fred:CPIAUCSL')!.status, 'FRESH');
  assert.equal(rows.find((r) => r.id === 'fred:OTHER'), undefined);
  const rank = ['UNAVAILABLE', 'STALE', 'FRESH'];
  const idx = rows.map((r) => rank.indexOf(r.status));
  assert.deepEqual(idx, [...idx].sort((a, b) => a - b));
});

test('tracker + extractObservation feed news/weather/fx/domestic rows', () => {
  const tr = new FreshnessTracker();
  const iso = new Date(MON - H).toISOString();
  tr.record('news', extractObservation('news', { items: [{}], retrievedAt: iso }));
  tr.record('weather', extractObservation('weather', { regions: [], retrievedAt: iso })); // empty body: ignored
  assert.equal(extractObservation('fx', { rates: [1], retrievedAt: iso }), iso);
  const rows = computeFreshness({ now: MON, observed: tr.snapshot() });
  assert.equal(rows.find((r) => r.id === 'obs:news')!.status, 'FRESH');
  assert.equal(rows.find((r) => r.id === 'obs:weather')!.status, 'UNAVAILABLE');
  const c = compactFreshness(rows);
  assert.equal(c.counts.FRESH + c.counts.STALE + c.counts.UNAVAILABLE, rows.length);
});

test('alerter: one message per batch, deduped until recovery, retries after failed send', async () => {
  const sent: string[] = [];
  let ok = true;
  const alerter = new FreshnessAlerter({ send: async (t) => (sent.push(t), ok) });
  const at = (ageDays: number) =>
    computeFreshness({ now: MON, jobs: [{ id: 'cot-weekly', enabled: true, lastRunAt: null, lastSuccessAt: new Date(MON - ageDays * D).toISOString(), nextRunAt: null }] });
  assert.ok(CADENCE.cotWeekly.ms === 7 * D);
  assert.deepEqual(await alerter.check(at(12)), []); // STALE but below 2x cadence
  ok = false;
  assert.deepEqual(await alerter.check(at(20)), []); // send failed -> not marked
  assert.equal(sent.length, 1);
  ok = true;
  assert.deepEqual(await alerter.check(at(20)), ['job:cot-weekly']);
  assert.equal(sent.length, 2);
  assert.deepEqual(await alerter.check(at(21)), []); // deduped
  assert.equal(sent.length, 2);
  assert.deepEqual(await alerter.check(at(1)), []); // recovered
  assert.deepEqual(await alerter.check(at(30)), ['job:cot-weekly']); // alerts again after recovery
  assert.equal(sent.length, 3);
});

test('alerter never alerts on non-alertable (on-demand) sources', async () => {
  const sent: string[] = [];
  const alerter = new FreshnessAlerter({ send: async (t) => (sent.push(t), true) });
  const rows = computeFreshness({
    now: MON,
    providers: [{ providerId: 'P', name: 'P', connectionState: 'CONNECTED', credentialsConfigured: true, supportsRealtime: true, lastSuccessfulSyncAt: new Date(MON - 5 * D).toISOString() }],
  });
  assert.deepEqual(await alerter.check(rows), []);
  assert.equal(sent.length, 0);
});

// --- exchange holidays ---
function d1Row(id: string, last: number, now: number) {
  const rows = computeFreshness({ now, datasets: [{ instrumentId: id, timeframe: 'D1', lastTimestamp: new Date(last).toISOString() }] });
  const row = rows.find((r) => r.id === `candles:D1:${id}`);
  assert.ok(row);
  return row;
}

test('US Thanksgiving 2026-11-26 is skipped for CME/CBOT, not for unknown exchange', () => {
  const last = Date.UTC(2026, 10, 25); // Wed
  const now = Date.UTC(2026, 10, 30, 12); // Mon
  assert.ok(holidaysFor('CBOT:ZS', last, now).has('2026-11-26'));
  const r = d1Row('CBOT:ZS', last, now);
  assert.equal(r.effectiveAgeMs, 2.5 * D);
  assert.equal(r.status, 'FRESH');
  const u = d1Row('XYZ:A', last, now);
  assert.equal(u.effectiveAgeMs, 3.5 * D);
  assert.equal(u.status, 'STALE');
});

test('Christmas 2026-12-25 + weekend combo for ICE US softs', () => {
  const last = Date.UTC(2026, 11, 23);
  const now = Date.UTC(2026, 11, 28, 12);
  assert.equal(d1Row('ICE:KC', last, now).effectiveAgeMs, 2.5 * D);
  assert.equal(d1Row('ICE:KC', last, now).status, 'FRESH');
  assert.equal(d1Row('ICE:BRN', last, now).status, 'STALE'); // Brent: no sourced calendar -> weekend-only
});

test('Tet 2027: projected MXV closure 2027-02-04..10 (Thông báo 11483/TB-BNV) skips the five weekdays', () => {
  const last = Date.UTC(2027, 1, 3); // Wed 03/02, last trading day before Tết
  const now = Date.UTC(2027, 1, 11, 12); // Thu 11/02 noon, first day back
  const h = holidaysFor('MXV:ZSE', last, now);
  for (const d of ['2027-02-04', '2027-02-05', '2027-02-08', '2027-02-09', '2027-02-10']) assert.ok(h.has(d), d);
  assert.ok(!h.has('2027-02-03'));
  assert.ok(!h.has('2027-02-11'));
  // 8.5d elapsed - weekend 2d - 5 holiday weekdays = 1.5d
  assert.equal(d1Row('MXV:ZSE', last, now).effectiveAgeMs, 1.5 * D);
  assert.equal(d1Row('XYZ:ZSE', last, now).effectiveAgeMs, 6.5 * D);
});

test('MXV weekday closure 2027-05-31 is skipped for MXV ids', () => {
  const last = Date.UTC(2027, 4, 28);
  const now = Date.UTC(2027, 5, 1, 12);
  assert.equal(d1Row('MXV:ZSE', last, now).effectiveAgeMs, 1.5 * D);
  assert.equal(d1Row('XYZ:ZSE', last, now).effectiveAgeMs, 2.5 * D);
});

test('unknown exchange and ids without prefix fall back to weekend-only', () => {
  assert.deepEqual(calendarsFor('FOO:BAR'), []);
  assert.deepEqual(calendarsFor('nocolon'), []);
  assert.equal(holidaysFor('nocolon', Date.UTC(2026, 10, 25), Date.UTC(2026, 10, 30)).size, 0);
  assert.equal(effectiveAgeMs(FRI, MON, true, new Set()), D);
  assert.equal(effectiveAgeMs(FRI, MON, true, new Set(['2026-11-23'])), D / 2); // Monday holiday: its 12h also removed
});

test('quotes are not stale while every market is closed (weekend)', () => {
  const sat = Date.UTC(2026, 10, 28, 12);
  assert.equal(allMarketsClosed(sat), true);
  const rows = computeFreshness({
    now: sat,
    providers: [{ providerId: 'p', name: 'P', connectionState: 'CONNECTED', credentialsConfigured: true, supportsRealtime: true, lastSuccessfulSyncAt: new Date(Date.UTC(2026, 10, 20, 12)).toISOString() }],
  });
  assert.equal(rows.find((r) => r.id === 'quotes:p')?.status, 'FRESH');
});
