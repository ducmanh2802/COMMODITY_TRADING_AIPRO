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
