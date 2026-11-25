import test from 'node:test';
import assert from 'node:assert/strict';
import { clampScore, qualityDotCount } from './scoreMath';

test('clampScore clamps to 0..100', () => {
  assert.equal(clampScore(50), 50);
  assert.equal(clampScore(-5), 0);
  assert.equal(clampScore(150), 100);
  assert.equal(clampScore(0), 0);
  assert.equal(clampScore(100), 100);
});

test('clampScore: NaN / Infinity do not leak into widths', () => {
  assert.equal(clampScore(NaN), 0);
  assert.equal(clampScore(Infinity), 0);
  assert.equal(clampScore(-Infinity), 0);
});

test('qualityDotCount maps levels', () => {
  assert.equal(qualityDotCount('GOOD'), 3);
  assert.equal(qualityDotCount('LIMITED'), 2);
  assert.equal(qualityDotCount('POOR'), 1);
  assert.equal(qualityDotCount('UNAVAILABLE'), 0);
  assert.equal(qualityDotCount(''), 0);
  assert.equal(qualityDotCount('good'), 0);
});
