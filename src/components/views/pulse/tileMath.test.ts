import test from 'node:test';
import assert from 'node:assert/strict';
import { deltaDirection, rangePct } from './tileMath';

test('deltaDirection: sign, zero, null, NaN', () => {
  assert.equal(deltaDirection(1.5), 'up');
  assert.equal(deltaDirection(-0.01), 'down');
  assert.equal(deltaDirection(0), 'flat');
  assert.equal(deltaDirection(-0), 'flat');
  assert.equal(deltaDirection(null), 'flat');
  assert.equal(deltaDirection(NaN), 'flat');
});

test('rangePct: position inside, at edges, outside', () => {
  assert.equal(rangePct(5, [0, 10]), 50);
  assert.equal(rangePct(0, [0, 10]), 0);
  assert.equal(rangePct(10, [0, 10]), 100);
  assert.equal(rangePct(15, [0, 10]), 100);
  assert.equal(rangePct(-5, [0, 10]), 0);
});

test('rangePct: flat window is midpoint', () => {
  assert.equal(rangePct(3, [3, 3, 3]), 50);
});

test('rangePct: null for null/NaN value, short or empty windows', () => {
  assert.equal(rangePct(null, [1, 2]), null);
  assert.equal(rangePct(NaN, [1, 2]), null);
  assert.equal(rangePct(1, []), null);
  assert.equal(rangePct(1, [1]), null);
  assert.equal(rangePct(1, [NaN, 1]), null);
});

test('rangePct: ignores NaN points in window', () => {
  assert.equal(rangePct(5, [0, NaN, 10]), 50);
});

test('rangePct: negative prices', () => {
  assert.equal(rangePct(-20, [-40, 0]), 50);
});
