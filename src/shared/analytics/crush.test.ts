import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardCrush, crushSeasonal, crushSeries, crushZScore } from './crush';

test('boardCrush matches hand calculation', () => {
  // 400*0.022 + 50*0.11 - 1200/100 = 8.8 + 5.5 - 12 = 2.3
  assert.ok(Math.abs((boardCrush(400, 50, 1200) as number) - 2.3) < 1e-9);
});

test('boardCrush guards bad input', () => {
  assert.equal(boardCrush(NaN, 50, 1200), null);
  assert.equal(boardCrush(400, 0, 1200), null);
  assert.equal(boardCrush(400, 50, -1), null);
});

test('crushSeries intersects timestamps and reports drops', () => {
  const zm = [{ t: '2024-01-01', v: 400 }, { t: '2024-01-02', v: 410 }];
  const zl = [{ t: '2024-01-02', v: 50 }, { t: '2024-01-03', v: 51 }];
  const zs = [{ t: '2024-01-02', v: 1200 }];
  const r = crushSeries(zm, zl, zs);
  assert.deepEqual(r.timestamps, ['2024-01-02']);
  assert.ok(Math.abs(r.values[0] - (410 * 0.022 + 5.5 - 12)) < 1e-9);
  assert.equal(r.dropped.ZM, 1);
  assert.equal(crushSeries([], zl, zs).values.length, 0);
});

test('crushZScore: guards and value', () => {
  assert.equal(crushZScore([1, 2], 3).status, 'INSUFFICIENT_DATA');
  assert.equal(crushZScore([1, NaN, 3], 3).status, 'INVALID_INPUT');
  assert.equal(crushZScore([1, 2, 3], 2).status, 'INVALID_INPUT');
  assert.equal(crushZScore([2, 2, 2, 2], 4).status, 'ZERO_VARIANCE');
  const r = crushZScore([1, 2, 3, 4, 5], 5);
  assert.equal(r.status, 'OK');
  assert.ok(Math.abs((r.z as number) - 2 / Math.sqrt(2.5)) < 1e-9);
  // only the trailing window counts
  assert.equal(crushZScore([100, 1, 2, 3, 4, 5], 5).z, r.z);
});

test('crushSeasonal averages per month and counts years', () => {
  const s = crushSeasonal(['2023-01-10', '2024-01-10', '2024-03-05', 'bad'], [1, 3, 5, 9]);
  assert.equal(s.months[0].avg, 2);
  assert.equal(s.months[0].n, 2);
  assert.equal(s.months[2].avg, 5);
  assert.equal(s.months[1].avg, null);
  assert.equal(s.years, 2);
});
