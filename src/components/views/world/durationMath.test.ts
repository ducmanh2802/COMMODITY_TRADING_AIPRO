import test from 'node:test';
import assert from 'node:assert/strict';
import { shortDuration, splitMinutes } from './durationMath';

test('shortDuration: hours + padded minutes', () => {
  assert.equal(shortDuration(226, 'g', 'p'), '3g46');
  assert.equal(shortDuration(60, 'g', 'p'), '1g00');
  assert.equal(shortDuration(125, 'g', 'p'), '2g05');
});

test('shortDuration: under an hour uses minutes only', () => {
  assert.equal(shortDuration(46, 'g', 'p'), '46p');
  assert.equal(shortDuration(0, 'g', 'p'), '0p');
  assert.equal(shortDuration(59, 'g', 'p'), '59p');
});

test('shortDuration: multi-day totals stay in hours', () => {
  assert.equal(shortDuration(60 * 49 + 7, 'g', 'p'), '49g07');
});

test('splitMinutes: negative, NaN and fractions are safe', () => {
  assert.deepEqual(splitMinutes(-30), { h: 0, m: 0 });
  assert.deepEqual(splitMinutes(NaN), { h: 0, m: 0 });
  assert.deepEqual(splitMinutes(Infinity), { h: 0, m: 0 });
  assert.deepEqual(splitMinutes(61.9), { h: 1, m: 1 });
});
