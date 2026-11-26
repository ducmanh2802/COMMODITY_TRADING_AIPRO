import assert from 'node:assert/strict';
import { test } from 'node:test';
import { annualizedRollYield, classifySlope, simulateLongRolls } from './rollYield';

test('classifySlope', () => {
  assert.equal(classifySlope(100, 102), 'CONTANGO');
  assert.equal(classifySlope(100, 98), 'BACKWARDATION');
  assert.equal(classifySlope(100, 100), 'FLAT');
  assert.equal(classifySlope(100, 100.0000001), 'FLAT');
  assert.equal(classifySlope(0, 1), null);
  assert.equal(classifySlope(NaN, 1), null);
});

test('annualizedRollYield formula', () => {
  const y = annualizedRollYield(100, 102, 30, 60);
  assert.ok(y !== null);
  assert.ok(Math.abs(y - (100 / 102 - 1) * (365 / 30)) < 1e-12);
  assert.ok(y < 0);
  const b = annualizedRollYield(102, 100, 30, 60);
  assert.ok(b !== null && b > 0);
});

test('annualizedRollYield guards', () => {
  assert.equal(annualizedRollYield(100, 0, 30, 60), null);
  assert.equal(annualizedRollYield(NaN, 100, 30, 60), null);
  assert.equal(annualizedRollYield(100, 100, 60, 60), null);
  assert.equal(annualizedRollYield(100, 100, 60, 30), null);
  assert.equal(annualizedRollYield(-1, 100, 30, 60), null);
});

test('simulateLongRolls', () => {
  const s = simulateLongRolls(100, 102, 30, 60, 3);
  assert.ok(s);
  assert.equal(s.daysCovered, 90);
  assert.ok(Math.abs(s.total - (Math.pow(100 / 102, 3) - 1)) < 1e-12);
  assert.ok(s.total < 0);
  const g = simulateLongRolls(102, 100, 30, 60, 2);
  assert.ok(g && g.total > 0);
  assert.equal(simulateLongRolls(100, 102, 30, 60, 0), null);
  assert.equal(simulateLongRolls(100, 102, 30, 60, 1.5), null);
  assert.equal(simulateLongRolls(100, 102, 60, 30, 3), null);
  assert.equal(simulateLongRolls(100, NaN, 30, 60, 3), null);
});
