import assert from 'node:assert/strict';
import test from 'node:test';
import { closenessPct, distancePct, evaluateZone, isInZone, parseWatchlist, removeItem, serializeWatchlist, upsertItem, type WatchItem, type WatchZone } from './watchlist';

const range: WatchZone = { kind: 'range', low: 430, high: 440 };
const up: WatchZone = { kind: 'level', level: 100, direction: 'up' };
const down: WatchZone = { kind: 'level', level: 100, direction: 'down' };

test('isInZone handles range and directional levels', () => {
  assert.equal(isInZone(435, range), true);
  assert.equal(isInZone(441, range), false);
  assert.equal(isInZone(100, up), true);
  assert.equal(isInZone(99, up), false);
  assert.equal(isInZone(100, down), true);
  assert.equal(isInZone(101, down), false);
});

test('distancePct is 0 inside and relative to price outside', () => {
  assert.equal(distancePct(435, range), 0);
  assert.ok(Math.abs((distancePct(400, range) ?? 0) - 7.5) < 1e-9);
  assert.ok(Math.abs((distancePct(450, range) ?? 0) - (10 / 450) * 100) < 1e-9);
  assert.equal(distancePct(NaN, range), null);
  assert.equal(closenessPct(0), 100);
  assert.equal(closenessPct(50), 0);
  assert.equal(closenessPct(null), 0);
});

test('evaluateZone: silent baseline, enter once, hysteresis before leaving', () => {
  assert.deepEqual(evaluateZone(null, 435, range), { inZone: true, entered: false, left: false });
  assert.deepEqual(evaluateZone(false, 435, range), { inZone: true, entered: true, left: false });
  assert.deepEqual(evaluateZone(true, 436, range), { inZone: true, entered: false, left: false });
  // just above high but within the 0.2% hysteresis: still counted as inside
  assert.deepEqual(evaluateZone(true, 440.5, range), { inZone: true, entered: false, left: false });
  assert.deepEqual(evaluateZone(true, 445, range), { inZone: false, entered: false, left: true });
  assert.equal(evaluateZone(false, 439, range).entered, true);
  assert.deepEqual(evaluateZone(true, NaN, range), { inZone: true, entered: false, left: false });
});

test('parseWatchlist: envelope, legacy array, garbage, dedupe, sanitising', () => {
  const item: WatchItem = { instrumentId: 'RC', note: 'cho gia ve 440', zone: range, createdAt: '2026-01-01T00:00:00.000Z', lastTriggeredAt: null, inZone: null };
  assert.deepEqual(parseWatchlist(serializeWatchlist([item])), [item]);
  assert.deepEqual(parseWatchlist(JSON.stringify([item])), [item]);
  assert.deepEqual(parseWatchlist('not json'), []);
  assert.deepEqual(parseWatchlist(null), []);
  assert.deepEqual(parseWatchlist('{"items":"x"}'), []);
  const messy = JSON.stringify({ items: [{ instrumentId: ' ' }, { instrumentId: 'KC', note: 5, zone: { low: 5, high: 'x' }, createdAt: 'bad' }, { instrumentId: 'KC' }, null] });
  const out = parseWatchlist(messy);
  assert.equal(out.length, 1);
  assert.equal(out[0].note, '');
  assert.equal(out[0].zone, null);
  assert.equal(out[0].createdAt, new Date(0).toISOString());
  const swapped = parseWatchlist(JSON.stringify([{ instrumentId: 'A', zone: { low: 9, high: 3 } }]));
  assert.deepEqual(swapped[0].zone, { kind: 'range', low: 3, high: 9 });
});

test('upsertItem / removeItem', () => {
  const a: WatchItem = { instrumentId: 'A', note: '', zone: null, createdAt: '2026-01-01T00:00:00.000Z', lastTriggeredAt: null, inZone: null };
  let l = upsertItem([], a);
  l = upsertItem(l, { ...a, note: 'x' });
  assert.equal(l.length, 1);
  assert.equal(l[0].note, 'x');
  assert.deepEqual(removeItem(l, 'A'), []);
});
