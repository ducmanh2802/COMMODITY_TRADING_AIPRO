import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSeries, windowStartDate, parseLayout, presetIds } from './compareMath';

test('windowStartDate clamps month end', () => {
  assert.equal(windowStartDate('2026-05-31', '3M'), '2026-02-28');
  assert.equal(windowStartDate('2026-03-15', '1Y'), '2025-03-15');
});

test('normalize rebases to 0 and carries gaps', () => {
  const r = normalizeSeries(
    [
      { id: 'A', points: [{ date: '2026-01-01', close: 100 }, { date: '2026-01-02', close: 110 }, { date: '2026-01-04', close: 120 }] },
      { id: 'B', points: [{ date: '2026-01-01', close: 50 }, { date: '2026-01-03', close: 40 }, { date: '2026-01-04', close: 50 }] },
    ],
    '1M'
  );
  assert.deepEqual(r.dates, ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04']);
  assert.deepEqual((r.series[0].values as number[]).map((v) => Math.round(v)), [0, 10, 10, 20]);
  assert.equal(r.series[1].values[1], 0); // carried
  assert.ok(Math.abs((r.series[1].values[2] as number) + 20) < 1e-9);
  assert.equal(r.series[1].finalPct, 0);
});

test('shared start is the latest first date, no backward extrapolation', () => {
  const r = normalizeSeries(
    [
      { id: 'A', points: [{ date: '2026-01-01', close: 10 }, { date: '2026-01-05', close: 20 }] },
      { id: 'B', points: [{ date: '2026-01-03', close: 5 }, { date: '2026-01-05', close: 10 }] },
    ],
    '1Y'
  );
  assert.equal(r.startDate, '2026-01-03');
  assert.equal(r.series[0].values[0], 0);
  assert.equal(r.series[1].finalPct, 100);
});

test('empty / invalid input', () => {
  assert.equal(normalizeSeries([], '1M').series.length, 0);
  assert.equal(normalizeSeries([{ id: 'x', points: [{ date: '2026-01-01', close: 0 }] }], '1M').series.length, 0);
});

test('parseLayout and presetIds', () => {
  assert.equal(parseLayout('2x2'), '2x2');
  assert.equal(parseLayout('zzz'), '1x1');
  assert.deepEqual(presetIds(['A', 'B', 'C'], ['C', 'A']), ['A', 'C']);
});
