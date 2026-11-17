import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarSpread, interCommoditySpread, spreadZScore } from './spreads';
import type { SeriesPoint } from './core';

const day = (i: number) => new Date(Date.UTC(2024, 0, 1 + i)).toISOString();
const ser = (vs: number[], idx?: number[]): SeriesPoint[] => vs.map((v, k) => ({ t: day(idx ? idx[k] : k), v }));
const near = (a: number | null | undefined, b: number, tol = 1e-12) => {
  assert.ok(a !== null && a !== undefined && Math.abs(a - b) <= tol, `expected ${b}, got ${a}`);
};

test('calendar spread near − far and ratio, aligned with drop counts', () => {
  const near_ = ser([10, 11, 12, 13], [0, 1, 2, 3]);
  const far = ser([9, 12, 12.5], [0, 2, 3]);
  const r = calendarSpread(near_, far);
  assert.equal(r.status, 'OK');
  assert.deepEqual(r.timestamps, [day(0), day(2), day(3)]);
  assert.deepEqual(r.dropped, { near: 1, far: 0 });
  near(r.values[0]?.spread, 1);
  near(r.values[0]?.ratio, 10 / 9);
  near(r.values[1]?.spread, 0);
  near(r.values[2]?.spread, 0.5);
  assert.ok(r.warnings.some((w) => /dropped/.test(w)));
});

test('calendar spread: far leg <= 0 → ratio null with warning; invalid input', () => {
  const r = calendarSpread(ser([1, 2]), ser([-1, 2]));
  assert.equal(r.values[0]?.ratio, null);
  near(r.values[0]?.spread, 2);
  assert.ok(r.warnings.some((w) => /ratio undefined/.test(w)));
  assert.equal(calendarSpread(ser([1, NaN]), ser([1, 2])).status, 'INVALID_INPUT');
  assert.equal(calendarSpread(ser([1], [0]), ser([1], [5])).status, 'INSUFFICIENT_DATA');
});

test('inter-commodity spread uses caller coefficients only (crush-style example)', () => {
  // Coefficients are supplied by the caller (illustrative values, not built into the library).
  const meal = ser([400, 410]); // stated unit USD/short ton
  const oil = ser([50, 52]); // stated unit USc/lb
  const beans = ser([12, 12.5]); // stated unit USD/bu
  const r = interCommoditySpread(
    [
      { id: 'ZM', series: meal, coefficient: 0.022, priceUnit: 'USD/short ton' },
      { id: 'ZL', series: oil, coefficient: 0.11, priceUnit: 'USc/lb' },
      { id: 'ZS', series: beans, coefficient: -1, priceUnit: 'USD/bu' },
    ],
    { outputUnit: 'USD/bu' }
  );
  assert.equal(r.status, 'OK');
  near(r.values[0], 0.022 * 400 + 0.11 * 50 - 12, 1e-12); // 8.8 + 5.5 − 12 = 2.3
  near(r.values[1], 0.022 * 410 + 0.11 * 52 - 12.5, 1e-12);
  assert.equal(r.outputUnit, 'USD/bu');
  assert.deepEqual(r.legs.map((l) => l.priceUnit), ['USD/short ton', 'USc/lb', 'USD/bu']);
});

test('inter-commodity spread fails closed without stated units / valid coefficients', () => {
  const a = ser([1, 2]);
  const b = ser([3, 4]);
  const leg = (id: string, s: SeriesPoint[], coefficient: number, priceUnit: string) => ({ id, series: s, coefficient, priceUnit });
  assert.equal(interCommoditySpread([leg('A', a, 1, 'x'), leg('B', b, -1, 'x')], { outputUnit: '' }).status, 'INVALID_INPUT');
  assert.equal(interCommoditySpread([leg('A', a, 1, ''), leg('B', b, -1, 'x')], { outputUnit: 'x' }).status, 'INVALID_INPUT');
  assert.equal(interCommoditySpread([leg('A', a, 0, 'x'), leg('B', b, -1, 'x')], { outputUnit: 'x' }).status, 'INVALID_INPUT');
  assert.equal(interCommoditySpread([leg('A', a, NaN, 'x'), leg('B', b, -1, 'x')], { outputUnit: 'x' }).status, 'INVALID_INPUT');
  assert.equal(interCommoditySpread([leg('A', a, 1, 'x'), leg('A', b, -1, 'x')], { outputUnit: 'x' }).status, 'INVALID_INPUT');
  assert.equal(interCommoditySpread([leg('A', a, 1, 'x')], { outputUnit: 'x' }).status, 'INVALID_INPUT');
  const ok = interCommoditySpread([leg('A', a, 1, 'x'), leg('B', ser([3], [1]), -1, 'x')], { outputUnit: 'x' });
  assert.equal(ok.status, 'OK');
  assert.deepEqual(ok.dropped, { A: 1, B: 0 });
  assert.deepEqual(ok.values, [-1]);
});

test('spread z-score: trailing window incl. current, sample σ (hand-computed)', () => {
  // window 3 on [1,2,3,4,0]: idx2 mean 2, s=1 → z=1; idx3 same → 1; idx4 [3,4,0]: mean 7/3,
  // s² = ((2/3)² + (5/3)² + (7/3)²)/2 = 78/18 → z = (0 − 7/3)/√(78/18)
  const r = spreadZScore(ser([1, 2, 3, 4, 0]), { window: 3 });
  assert.deepEqual(r.values.slice(0, 2), [null, null]);
  near(r.values[2], 1);
  near(r.values[3], 1);
  near(r.values[4], -7 / 3 / Math.sqrt(78 / 18));
  const neg = spreadZScore(ser([-5, -4, -3]), { window: 3 });
  near(neg.values[2], 1);
  const flat = spreadZScore(ser([2, 2, 2]), { window: 3 });
  assert.equal(flat.values[2], null);
  assert.ok(flat.warnings.length === 1);
  assert.equal(spreadZScore(ser([1, 2]), { window: 3 }).status, 'INSUFFICIENT_DATA');
  assert.equal(spreadZScore(ser([1, 2, 3]), { window: 2 }).status, 'INVALID_INPUT');
});
