import test from 'node:test';
import assert from 'node:assert/strict';
import { CALENDAR_PAGE, groupByDay, impactDots, nextPageCount } from './calendarGroups';
import { getZonedParts } from '../../shared/utils/vietnamCalendar';
import { VIETNAM_TIMEZONE } from '../../shared/utils/time';

test('groupByDay: empty input', () => {
  assert.deepEqual(groupByDay([]), []);
});

test('groupByDay groups consecutive same-day events, keeps order', () => {
  const ev = [
    { dateIso: '2026-03-01', id: 'a' },
    { dateIso: '2026-03-01', id: 'b' },
    { dateIso: '2026-03-02', id: 'c' },
  ];
  const g = groupByDay(ev);
  assert.equal(g.length, 2);
  assert.deepEqual(g[0].items.map((e) => e.id), ['a', 'b']);
  assert.equal(g[1].dateIso, '2026-03-02');
});

test('groupByDay: ICT midnight boundary splits days (UTC 16:59 vs 17:00)', () => {
  const a = new Date('2026-03-01T16:59:00Z'); // 23:59 ICT on 03-01
  const b = new Date('2026-03-01T17:00:00Z'); // 00:00 ICT on 03-02
  const evs = [a, b].map((d) => ({ dateIso: getZonedParts(d, VIETNAM_TIMEZONE).dateIso }));
  assert.deepEqual(evs.map((e) => e.dateIso), ['2026-03-01', '2026-03-02']);
  assert.equal(groupByDay(evs).length, 2);
});

test('getZonedParts: UTC date differs from ICT date after 17:00 UTC; year rollover', () => {
  const p = getZonedParts(new Date('2025-12-31T18:30:00Z'), VIETNAM_TIMEZONE);
  assert.equal(p.dateIso, '2026-01-01');
  assert.equal(p.hour, 1);
  assert.equal(p.minute, 30);
  const q = getZonedParts(new Date('2026-03-01T16:59:59Z'), VIETNAM_TIMEZONE);
  assert.equal(q.hour, 23);
  assert.equal(q.minute, 59);
});

test('today highlight compares ICT dateIso, not UTC', () => {
  const now = new Date('2026-03-01T20:00:00Z'); // 03:00 ICT on 03-02
  const today = getZonedParts(now, VIETNAM_TIMEZONE).dateIso;
  assert.equal(today, '2026-03-02');
  assert.notEqual(now.toISOString().slice(0, 10), today);
});

test('impactDots: HIGH=3, other=2', () => {
  assert.equal(impactDots('HIGH'), 3);
  assert.equal(impactDots('MEDIUM'), 2);
  assert.equal(impactDots('LOW'), 2);
  assert.equal(impactDots(''), 2);
});

test('nextPageCount: paging by 12 and "Xem thêm" count', () => {
  assert.equal(CALENDAR_PAGE, 12);
  assert.equal(nextPageCount(30, 12), 12);
  assert.equal(nextPageCount(30, 24), 6);
  assert.equal(nextPageCount(30, 30), 0);
  assert.equal(nextPageCount(5, 12), 0);
  assert.equal(nextPageCount(0, 12), 0);
});
