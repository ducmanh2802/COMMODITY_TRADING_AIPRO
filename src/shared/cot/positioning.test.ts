import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COT_PERCENTILE_WINDOW, bandOf, computeCotPositioning } from './positioning.ts';

const mk = (nets: number[]) => nets.map((net, i) => ({ date: `d${i}`, net }));

test('empty series', () => {
  const r = computeCotPositioning([]);
  assert.equal(r.n, 0);
  assert.equal(r.percentile, null);
  assert.equal(r.insufficient, true);
});

test('single value: no percentile', () => {
  const r = computeCotPositioning(mk([5]));
  assert.equal(r.n, 1);
  assert.equal(r.latestNet, 5);
  assert.equal(r.percentile, null);
  assert.equal(r.cotIndex, null);
});

test('insufficient data reports actual N', () => {
  const r = computeCotPositioning(mk([1, 2, 3, 4]));
  assert.equal(r.n, 4);
  assert.equal(r.insufficient, true);
  assert.equal(r.cotIndex, 100);
  assert.equal(r.percentile, 87.5);
});

test('full window: uses last 156 only, latest is max', () => {
  const nets = Array.from({ length: 200 }, (_, i) => i);
  const r = computeCotPositioning(mk(nets));
  assert.equal(r.n, COT_PERCENTILE_WINDOW);
  assert.equal(r.insufficient, false);
  assert.equal(r.min, 44);
  assert.equal(r.max, 199);
  assert.equal(r.cotIndex, 100);
  assert.equal(r.band, 'high');
});

test('latest is min: index 0, low band', () => {
  const nets = [...Array.from({ length: 155 }, (_, i) => 100 + i), 0];
  const r = computeCotPositioning(mk(nets));
  assert.equal(r.cotIndex, 0);
  assert.ok((r.percentile ?? 100) < 1);
  assert.equal(r.band, 'low');
});

test('index midpoint', () => {
  const r = computeCotPositioning(mk([0, 10, 5]));
  assert.equal(r.cotIndex, 50);
});

test('zero range -> index null, band null', () => {
  const r = computeCotPositioning(mk([7, 7, 7]));
  assert.equal(r.zeroRange, true);
  assert.equal(r.cotIndex, null);
  assert.equal(r.band, null);
  assert.equal(r.percentile, 50);
});

test('NaN / Infinity ignored', () => {
  const r = computeCotPositioning(mk([1, Number.NaN, 3, Number.POSITIVE_INFINITY, 2]));
  assert.equal(r.n, 3);
  assert.equal(r.latestNet, 2);
  assert.equal(r.cotIndex, 50);
});

test('no look-ahead: earlier prefix result independent of later values', () => {
  const base = mk([3, 9, 1, 4, 6]);
  const a = computeCotPositioning(base);
  const b = computeCotPositioning([...base, ...mk([1000, -1000])].slice(0, 5));
  assert.deepEqual(a, b);
});

test('invalid window falls back to default; bandOf edges', () => {
  assert.equal(computeCotPositioning(mk([1, 2]), 0).windowWeeks, COT_PERCENTILE_WINDOW);
  assert.equal(bandOf(10), 'mid');
  assert.equal(bandOf(9.99), 'low');
  assert.equal(bandOf(90), 'mid');
  assert.equal(bandOf(90.01), 'high');
  assert.equal(bandOf(null), null);
});
