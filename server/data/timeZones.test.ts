import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidTimeZone, zonedWallTimeToUtc, type WallTime } from './timeZones.ts';

const w = (year: number, month: number, day: number, hour: number, minute = 0, second = 0): WallTime => ({ year, month, day, hour, minute, second });
const iso = (r: ReturnType<typeof zonedWallTimeToUtc>): string => {
  assert.ok(r.ok, 'expected ok conversion');
  return new Date(r.utcMs).toISOString();
};

test('isValidTimeZone: accepts IANA ids, rejects junk', () => {
  assert.equal(isValidTimeZone('America/Chicago'), true);
  assert.equal(isValidTimeZone('Asia/Ho_Chi_Minh'), true);
  assert.equal(isValidTimeZone('UTC'), true);
  for (const bad of ['', '   ', 'Mars/Olympus', 'Chicago', 'GMT+99']) assert.equal(isValidTimeZone(bad), false, bad);
  assert.equal(isValidTimeZone(undefined as unknown as string), false);
});

test('zonedWallTimeToUtc: standard vs daylight offsets in America/Chicago', () => {
  assert.equal(iso(zonedWallTimeToUtc(w(2026, 1, 15, 8, 30), 'America/Chicago')), '2026-01-15T14:30:00.000Z'); // CST -6
  assert.equal(iso(zonedWallTimeToUtc(w(2026, 7, 15, 8, 30), 'America/Chicago')), '2026-07-15T13:30:00.000Z'); // CDT -5
});

test('zonedWallTimeToUtc: no-DST zones are always unambiguous (Asia/Ho_Chi_Minh, UTC)', () => {
  assert.equal(iso(zonedWallTimeToUtc(w(2026, 3, 8, 2, 30), 'Asia/Ho_Chi_Minh')), '2026-03-07T19:30:00.000Z');
  assert.equal(iso(zonedWallTimeToUtc(w(2026, 11, 1, 1, 30), 'UTC')), '2026-11-01T01:30:00.000Z');
});

test('zonedWallTimeToUtc: US spring-forward gap is NONEXISTENT, edges are fine', () => {
  // 2026-03-08: 02:00 -> 03:00 in America/New_York
  assert.deepEqual(zonedWallTimeToUtc(w(2026, 3, 8, 2, 30), 'America/New_York'), { ok: false, reason: 'NONEXISTENT_LOCAL_TIME' });
  assert.deepEqual(zonedWallTimeToUtc(w(2026, 3, 8, 2, 0), 'America/New_York'), { ok: false, reason: 'NONEXISTENT_LOCAL_TIME' });
  assert.equal(iso(zonedWallTimeToUtc(w(2026, 3, 8, 1, 59, 59), 'America/New_York')), '2026-03-08T06:59:59.000Z');
  assert.equal(iso(zonedWallTimeToUtc(w(2026, 3, 8, 3, 0), 'America/New_York')), '2026-03-08T07:00:00.000Z');
});

test('zonedWallTimeToUtc: US fall-back overlap is AMBIGUOUS, edges are fine', () => {
  // 2026-11-01: 02:00 EDT -> 01:00 EST, so 01:00-01:59 occurs twice
  assert.deepEqual(zonedWallTimeToUtc(w(2026, 11, 1, 1, 30), 'America/New_York'), { ok: false, reason: 'AMBIGUOUS_LOCAL_TIME' });
  assert.deepEqual(zonedWallTimeToUtc(w(2026, 11, 1, 1, 0), 'America/New_York'), { ok: false, reason: 'AMBIGUOUS_LOCAL_TIME' });
  assert.equal(iso(zonedWallTimeToUtc(w(2026, 11, 1, 0, 59, 59), 'America/New_York')), '2026-11-01T04:59:59.000Z');
  assert.equal(iso(zonedWallTimeToUtc(w(2026, 11, 1, 2, 0), 'America/New_York')), '2026-11-01T07:00:00.000Z');
});

test('zonedWallTimeToUtc: Europe/London transitions differ from US dates', () => {
  // 2026-03-29 01:00 GMT -> 02:00 BST ; 2026-10-25 02:00 BST -> 01:00 GMT
  assert.deepEqual(zonedWallTimeToUtc(w(2026, 3, 29, 1, 30), 'Europe/London'), { ok: false, reason: 'NONEXISTENT_LOCAL_TIME' });
  assert.deepEqual(zonedWallTimeToUtc(w(2026, 10, 25, 1, 30), 'Europe/London'), { ok: false, reason: 'AMBIGUOUS_LOCAL_TIME' });
  // US already on DST while London not yet (2026-03-15)
  assert.equal(iso(zonedWallTimeToUtc(w(2026, 3, 15, 9, 0), 'America/New_York')), '2026-03-15T13:00:00.000Z');
  assert.equal(iso(zonedWallTimeToUtc(w(2026, 3, 15, 9, 0), 'Europe/London')), '2026-03-15T09:00:00.000Z');
});

test('zonedWallTimeToUtc: midnight, leap day and year boundary', () => {
  assert.equal(iso(zonedWallTimeToUtc(w(2028, 2, 29, 0, 0), 'America/Chicago')), '2028-02-29T06:00:00.000Z');
  assert.equal(iso(zonedWallTimeToUtc(w(2026, 12, 31, 23, 59, 59), 'America/Chicago')), '2027-01-01T05:59:59.000Z');
});
