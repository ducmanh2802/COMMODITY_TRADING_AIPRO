import test from 'node:test';
import assert from 'node:assert/strict';
import { tabKeyTarget, trapTabTarget } from './focusTrapLogic';

test('trapTabTarget wraps at both ends', () => {
  assert.equal(trapTabTarget(3, 2, false), 0);
  assert.equal(trapTabTarget(3, 0, true), 2);
  assert.equal(trapTabTarget(3, 1, false), -1);
  assert.equal(trapTabTarget(0, 0, false), -1);
  assert.equal(trapTabTarget(3, -1, false), 0);
  assert.equal(trapTabTarget(3, -1, true), 2);
});

test('tabKeyTarget handles arrows, Home, End', () => {
  assert.equal(tabKeyTarget('ArrowRight', 3, 2), 0);
  assert.equal(tabKeyTarget('ArrowLeft', 3, 0), 2);
  assert.equal(tabKeyTarget('Home', 3, 2), 0);
  assert.equal(tabKeyTarget('End', 3, 0), 2);
  assert.equal(tabKeyTarget('a', 3, 0), null);
  assert.equal(tabKeyTarget('ArrowRight', 0, 0), null);
});
