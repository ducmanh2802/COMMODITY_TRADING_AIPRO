import test from 'node:test';
import assert from 'node:assert/strict';
import { cumulativeReturn, differences, drawdown, logReturns, simpleReturns, totalReturn } from './returns';
import type { SeriesPoint } from './core';

const day = (i: number) => new Date(Date.UTC(2024, 0, 1 + i)).toISOString();
const ser = (vs: number[]): SeriesPoint[] => vs.map((v, i) => ({ t: day(i), v }));
const near = (a: number | null, b: number, tol = 1e-12) => {
  assert.ok(a !== null && Math.abs(a - b) <= tol, `expected ${b}, got ${a}`);
};

test('simple and log returns (hand-computed)', () => {
  const s = ser([100, 110, 99]);
  const r = simpleReturns(s);
  assert.equal(r.values[0], null);
  near(r.values[1], 0.1);
  near(r.values[2], -0.1);
  const l = logReturns(s);
  near(l.values[1], Math.log(1.1));
  near(l.values[2], Math.log(0.9));
});

test('cumulative / total return', () => {
  const c = cumulativeReturn(ser([50, 60, 45, 75]));
  assert.deepEqual(c.values.map((x) => Number((x as number).toFixed(12))), [0, 0.2, -0.1, 0.5]);
  near(totalReturn(ser([50, 60, 45, 75])).value, 0.5);
  assert.equal(totalReturn(ser([50])).status, 'INSUFFICIENT_DATA');
});

test('drawdown series and max drawdown on a constructed path', () => {
  const s = ser([100, 120, 90, 110, 130, 80, 100]);
  const d = drawdown(s);
  assert.equal(d.status, 'OK');
  const expected = [0, 0, -0.25, 110 / 120 - 1, 0, 80 / 130 - 1, 100 / 130 - 1];
  d.values.forEach((v, i) => near(v, expected[i]));
  assert.ok(d.max);
  near(d.max.maxDrawdown, 80 / 130 - 1);
  assert.equal(d.max.peakT, day(4));
  assert.equal(d.max.troughT, day(5));
  assert.equal(d.max.peakValue, 130);
  assert.equal(d.max.troughValue, 80);
  assert.equal(d.max.recoveryT, null);
});

test('drawdown recovery date and monotonic series', () => {
  const d = drawdown(ser([100, 50, 80, 100, 101]));
  near(d.max?.maxDrawdown ?? null, -0.5);
  assert.equal(d.max?.recoveryT, day(3));
  const up = drawdown(ser([1, 2, 3]));
  assert.equal(up.max?.maxDrawdown, 0);
  assert.equal(up.max?.recoveryT, null);
});

test('price-based functions reject non-positive levels; differences accept them', () => {
  assert.equal(simpleReturns(ser([1, 0, 2])).status, 'INVALID_INPUT');
  assert.equal(logReturns(ser([1, -1])).status, 'INVALID_INPUT');
  assert.equal(drawdown(ser([1, -1])).status, 'INVALID_INPUT');
  const d = differences(ser([-2, 1, -3]));
  assert.deepEqual(d.values, [null, 3, -4]);
});

test('returns failure modes: too short, NaN, unsorted', () => {
  assert.equal(simpleReturns(ser([1])).status, 'INSUFFICIENT_DATA');
  assert.equal(logReturns(ser([1, NaN])).status, 'INVALID_INPUT');
  assert.equal(
    simpleReturns([
      { t: day(1), v: 1 },
      { t: day(0), v: 2 },
    ]).status,
    'INVALID_INPUT'
  );
});
