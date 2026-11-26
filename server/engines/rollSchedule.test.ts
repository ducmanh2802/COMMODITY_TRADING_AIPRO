import test from 'node:test';
import assert from 'node:assert/strict';
import { computeRollSchedule } from './rollSchedule.ts';

test('computeRollSchedule: dates are ascending, unique, inside the inclusive range', () => {
  const r = computeRollSchedule('COMEX:GC', '2025-03-01', '2025-09-30', 5);
  assert.equal(r.source, 'CALENDAR');
  if (r.source !== 'CALENDAR') return;
  assert.ok(r.dates.length > 0);
  assert.deepEqual(r.dates, [...new Set(r.dates)].sort());
  for (const d of r.dates) assert.ok(d >= '2025-03-01' && d <= '2025-09-30', d);
});

test('computeRollSchedule: no roll date falls on a weekend', () => {
  const r = computeRollSchedule('COMEX:GC', '2023-01-01', '2026-12-31', 3);
  assert.equal(r.source, 'CALENDAR');
  if (r.source !== 'CALENDAR') return;
  for (const d of r.dates) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    assert.ok(dow !== 0 && dow !== 6, `${d} is a weekend`);
  }
});

test('computeRollSchedule: range edges are inclusive (single-day window on a roll date)', () => {
  const full = computeRollSchedule('COMEX:GC', '2025-01-01', '2025-12-31', 5);
  assert.equal(full.source, 'CALENDAR');
  if (full.source !== 'CALENDAR') return;
  const one = full.dates[Math.min(3, full.dates.length - 1)];
  const single = computeRollSchedule('COMEX:GC', one, one, 5);
  assert.equal(single.source, 'CALENDAR');
  if (single.source === 'CALENDAR') assert.deepEqual(single.dates, [one]);
});

test('computeRollSchedule: year-boundary range only returns dates inside the window', () => {
  const r = computeRollSchedule('COMEX:GC', '2025-12-15', '2026-01-31', 5);
  if (r.source === 'CALENDAR') {
    for (const d of r.dates) assert.ok(d >= '2025-12-15' && d <= '2026-01-31', d);
  } else {
    assert.equal(r.source, 'UNAVAILABLE');
  }
});

test('computeRollSchedule: reversed range, tiny range and invalid roll days are UNAVAILABLE', () => {
  assert.equal(computeRollSchedule('COMEX:GC', '2025-12-31', '2025-01-01', 5).source, 'UNAVAILABLE');
  assert.equal(computeRollSchedule('COMEX:GC', '2025-01-01', '2025-01-02', 5).source, 'UNAVAILABLE');
  for (const bad of [-1, 31, 1.5, Number.NaN, Infinity]) {
    const r = computeRollSchedule('COMEX:GC', '2025-01-01', '2025-12-31', bad);
    assert.equal(r.source, 'UNAVAILABLE', `rollBusinessDaysBefore=${bad}`);
  }
  assert.equal(computeRollSchedule('NOPE:XX', '2025-01-01', '2025-12-31').source, 'UNAVAILABLE');
});

test('computeRollSchedule: larger roll offset moves the first roll date earlier or equal (leap year)', () => {
  const a = computeRollSchedule('COMEX:GC', '2024-01-01', '2024-12-31', 1);
  const b = computeRollSchedule('COMEX:GC', '2024-01-01', '2024-12-31', 10);
  assert.equal(a.source, 'CALENDAR');
  assert.equal(b.source, 'CALENDAR');
  if (a.source !== 'CALENDAR' || b.source !== 'CALENDAR') return;
  for (const d of [...a.dates, ...b.dates]) assert.ok(d.startsWith('2024-'));
  assert.ok(b.dates[0] <= a.dates[0]);
});
