import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDataFreshness, formatTimestampInZone } from './time';

test('evaluateDataFreshness returns UNAVAILABLE when market timestamp is null or missing', () => {
  assert.equal(evaluateDataFreshness(null, 1_700_000_000_000), 'UNAVAILABLE');
  assert.equal(evaluateDataFreshness(undefined, 1_700_000_000_000), 'UNAVAILABLE');
});

test('evaluateDataFreshness returns INVALID for malformed or future timestamps', () => {
  const now = Date.parse('2026-11-17T08:00:00Z');
  assert.equal(evaluateDataFreshness('not-a-date', now), 'INVALID');
  assert.equal(evaluateDataFreshness('2026-11-17T08:05:00Z', now), 'INVALID');
});

test('evaluateDataFreshness classifies CURRENT, DELAYED, and STALE strictly by market timestamp age', () => {
  const now = Date.parse('2026-11-17T08:00:00Z');
  assert.equal(evaluateDataFreshness('2026-11-17T07:59:30Z', now), 'CURRENT');
  assert.equal(evaluateDataFreshness('2026-11-17T07:55:00Z', now), 'DELAYED');
  assert.equal(evaluateDataFreshness('2026-11-17T07:00:00Z', now), 'STALE');
});

test('formatTimestampInZone formats UTC ISO string in Asia/Ho_Chi_Minh (+07:00)', () => {
  const formatted = formatTimestampInZone('2026-11-17T01:00:00Z', 'Asia/Ho_Chi_Minh');
  assert.match(formatted, /17\/11\/2026/);
  assert.match(formatted, /08:00:00/);
});
