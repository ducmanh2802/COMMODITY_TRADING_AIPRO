import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeCot,
  cotIndexSeries,
  detectWeeklyGaps,
  expectedReleaseDate,
  type CotPositionsRow,
} from './analytics.ts';

function weeks(start: string, n: number, skip: number[] = []): string[] {
  const out: string[] = [];
  const t0 = Date.parse(`${start}T00:00:00Z`);
  for (let i = 0; i < n; i += 1) {
    if (skip.includes(i)) continue;
    out.push(new Date(t0 + i * 7 * 86_400_000).toISOString().slice(0, 10));
  }
  return out;
}

function legacyRows(dates: string[], nets: number[], oi = 1000): CotPositionsRow[] {
  return dates.map((d, i) => ({
    reportDate: d,
    openInterest: oi,
    positions: {
      // net = long - short; keep long/short non-negative
      nonCommercial: { long: 500 + nets[i], short: 500, spread: 10 },
      commercial: { long: 400, short: 400 + nets[i], spread: null },
      nonReportables: { long: 90, short: 90, spread: null },
    },
  }));
}

test('expectedReleaseDate: Tuesday as-of → following Friday', () => {
  assert.equal(expectedReleaseDate('2026-11-10'), '2026-11-13');
  assert.equal(expectedReleaseDate('2026-11-09'), '2026-11-13'); // Monday as-of (holiday week)
  assert.equal(expectedReleaseDate('2026-11-13'), '2026-11-20'); // a Friday maps to the next Friday
});

test('COT Index math on hand-built numbers', () => {
  const dates = weeks('2026-01-06', 6);
  const nets = [10, 20, 30, 40, 50, 25];
  const { values } = cotIndexSeries(dates, nets, 4);
  // First 3 points have < 4 reports in window → null.
  assert.deepEqual(values.slice(0, 3), [null, null, null]);
  // i=3: window [10,20,30,40] → (40-10)/(30) = 100
  assert.equal(values[3], 100);
  // i=4: window [20,30,40,50] → 100
  assert.equal(values[4], 100);
  // i=5: window [30,40,50,25] → (25-25)/(50-25) = 0
  assert.equal(values[5], 0);

  const mid = cotIndexSeries(weeks('2026-01-06', 4), [0, 100, 50, 25], 4).values[3];
  assert.equal(mid, 25);
});

test('COT Index is null for a flat window and for windows that span a gap', () => {
  const flat = cotIndexSeries(weeks('2026-01-06', 4), [5, 5, 5, 5], 4);
  assert.equal(flat.values[3], null);
  assert.equal(flat.flatWindows, 1);

  // Week index 2 missing → windows containing it hold only 3 of 4 reports.
  const dates = weeks('2026-01-06', 8, [2]);
  const nets = [1, 2, 4, 5, 6, 7, 8];
  const { values } = cotIndexSeries(dates, nets, 4);
  // dates: w0 w1 w3 w4 w5 w6 w7. Window ending w4 = {w1,w3,w4} → 3 reports → null; w5 = {w3,w4,w5} null.
  // Window ending w6 = {w3,w4,w5,w6} (index 5) → complete; nets 4,5,6,7 → 100.
  assert.deepEqual(values.slice(0, 5), [null, null, null, null, null]);
  assert.equal(values[5], 100);
  // Tolerating 1 missing week makes the window ending w4 computable.
  const tolerant = cotIndexSeries(dates, nets, 4, 1).values;
  assert.notEqual(tolerant[3], null);
});

test('detectWeeklyGaps reports missing weeks and irregular intervals', () => {
  assert.deepEqual(detectWeeklyGaps(weeks('2026-01-06', 5)), []);
  const gaps = detectWeeklyGaps(['2026-01-06', '2026-01-13', '2026-02-03', '2026-02-09', '2026-02-17']);
  assert.equal(gaps.length, 3);
  assert.deepEqual(gaps[0], {
    after: '2026-01-13',
    before: '2026-02-03',
    days: 21,
    missingWeeks: 2,
    kind: 'MISSING_WEEKS',
  });
  assert.equal(gaps[1].kind, 'IRREGULAR_INTERVAL');
  assert.equal(gaps[1].missingWeeks, null);
  assert.equal(gaps[2].days, 8);
});

test('analyzeCot: net, %OI, week-over-week (null across gaps), status', () => {
  const dates = weeks('2026-01-06', 5, [3]);
  const rows = legacyRows(dates, [100, 150, 120, 200]);
  const res = analyzeCot(rows, 'LEGACY', { lookbackWeeks: 4 });
  assert.equal(res.gaps.length, 1);
  assert.equal(res.gaps[0].missingWeeks, 1);
  const nc = res.rows.map((r) => r.categories.nonCommercial!);
  assert.deepEqual(nc.map((c) => c.net), [100, 150, 120, 200]);
  assert.deepEqual(nc.map((c) => c.netPctOi), [10, 15, 12, 20]);
  assert.deepEqual(nc.map((c) => c.netChangeWoW), [null, 50, -30, null]); // no WoW across the gap
  assert.deepEqual(res.rows[0].categories.commercial!.net, -100);
  // Only 4 weeks span with one missing → no complete 4-week window → INSUFFICIENT_DATA, rows still returned.
  assert.equal(res.status, 'INSUFFICIENT_DATA');
  assert.ok(res.warnings.some((w) => w.includes('gap')));
  assert.equal(res.rows[0].expectedReleaseDate, '2026-01-09');
});

test('analyzeCot: OK with complete window; default lookback 156 → INSUFFICIENT_DATA on short history', () => {
  const dates = weeks('2026-01-06', 6);
  const rows = legacyRows(dates, [10, 20, 30, 40, 50, 25]);
  const ok = analyzeCot(rows, 'LEGACY', { lookbackWeeks: 4 });
  assert.equal(ok.status, 'OK');
  assert.equal(ok.latest!.categories.nonCommercial!.cotIndex, 0);
  // Commercial net is the mirror image → index 100.
  assert.equal(ok.latest!.categories.commercial!.cotIndex, 100);

  const short = analyzeCot(rows, 'LEGACY');
  assert.equal(short.lookbackWeeks, 156);
  assert.equal(short.status, 'INSUFFICIENT_DATA');
  assert.ok(short.rows.every((r) => r.categories.nonCommercial!.cotIndex === null));
});

test('analyzeCot fails closed on invalid input', () => {
  const rows = legacyRows(weeks('2026-01-06', 3), [1, 2, 3]);
  assert.equal(analyzeCot([...rows].reverse(), 'LEGACY', { lookbackWeeks: 4 }).status, 'INVALID_INPUT');
  assert.equal(analyzeCot(rows, 'DISAGGREGATED', { lookbackWeeks: 4 }).status, 'INVALID_INPUT');
  assert.equal(analyzeCot(rows, 'LEGACY', { lookbackWeeks: 2 }).status, 'INVALID_INPUT');
  const bad = structuredClone(rows);
  bad[1].openInterest = Number.NaN;
  assert.equal(analyzeCot(bad, 'LEGACY', { lookbackWeeks: 4 }).status, 'INVALID_INPUT');
  assert.equal(analyzeCot([], 'LEGACY', { lookbackWeeks: 4 }).status, 'INSUFFICIENT_DATA');
});
