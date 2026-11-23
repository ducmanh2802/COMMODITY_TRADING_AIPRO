import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid, countCombos, defaultsOf, scanValues, type ParamDef } from './labGrid.ts';

const adx: ParamDef = { key: 'adxMin', label: 'ADX', hint: '', min: 10, max: 40, step: 1, default: 22 };
const sl: ParamDef = { key: 'slAtrMult', label: 'SL', hint: '', min: 0.5, max: 4, step: 0.05, default: 1.5 };

test('scanValues gives up to three step-aligned values inside the bounds', () => {
  assert.deepEqual(scanValues(adx, 22), [19, 22, 25]);
  assert.deepEqual(scanValues(adx, 10), [10, 13]);
  const v = scanValues(sl, 1.5);
  assert.equal(v.length, 3);
  assert.ok(v.every((x) => x >= 0.5 && x <= 4));
  assert.ok(v[0] < 1.5 && v[2] > 1.5);
});

test('buildGrid only includes checked params and combos stay within the 50 cap for <= 3 params', () => {
  const g = buildGrid([adx, sl], defaultsOf([adx, sl]), ['adxMin', 'slAtrMult']);
  assert.deepEqual(Object.keys(g).sort(), ['adxMin', 'slAtrMult']);
  assert.equal(countCombos(g), 9);
  assert.equal(countCombos({}), 1);
  assert.ok(countCombos({ a: [1, 2, 3], b: [1, 2, 3], c: [1, 2, 3] }) <= 50);
});
