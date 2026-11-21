import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXCHANGE_SCHEDULES, exchangeStatus, offsetFromVietnamHours, sessionsInVietnam } from './exchangeHours.ts';

const sched = (id: string) => EXCHANGE_SCHEDULES.find((s) => s.id === id)!;

test('Chicago/London offsets to Vietnam follow daylight saving', () => {
  assert.equal(offsetFromVietnamHours('America/Chicago', new Date('2026-07-15T12:00:00Z')), 12);
  assert.equal(offsetFromVietnamHours('America/Chicago', new Date('2026-01-15T12:00:00Z')), 13);
  assert.equal(offsetFromVietnamHours('Europe/London', new Date('2026-07-15T12:00:00Z')), 6);
  assert.equal(offsetFromVietnamHours('Europe/London', new Date('2026-01-15T12:00:00Z')), 7);
});

test('CBOT day session in Vietnam time shifts with daylight saving', () => {
  const summer = sessionsInVietnam(sched('CBOT'), new Date('2026-07-15T12:00:00Z'));
  const winter = sessionsInVietnam(sched('CBOT'), new Date('2026-01-14T12:00:00Z'));
  assert.ok(summer.some((r) => r.start === '20:30' && r.end === '01:20'));
  assert.ok(winter.some((r) => r.start === '21:30' && r.end === '02:20'));
});

test('ICE Europe Brent opens 07:00 VN in summer, 08:00 VN in winter', () => {
  assert.equal(sessionsInVietnam(sched('ICEEU'), new Date('2026-07-15T12:00:00Z'))[0].start, '07:00');
  assert.equal(sessionsInVietnam(sched('ICEEU'), new Date('2026-01-14T12:00:00Z'))[0].start, '08:00');
});

test('CBOT open on a summer Wednesday morning CT, closed on Saturday', () => {
  assert.equal(exchangeStatus(sched('CBOT'), new Date('2026-07-15T14:00:00Z')).open, true);
  assert.equal(exchangeStatus(sched('CBOT'), new Date('2026-07-18T14:00:00Z')).open, false);
});

test('CBOT between sessions (08:00 CDT) is closed, reopens in 30 minutes', () => {
  const st = exchangeStatus(sched('CBOT'), new Date('2026-07-15T13:00:00Z'));
  assert.equal(st.open, false);
  assert.equal(st.minutesToChange, 30);
});

test('winter: NYMEX closed in the 16:00-17:00 CT break, open after', () => {
  assert.equal(exchangeStatus(sched('NYMEX'), new Date('2026-01-14T22:30:00Z')).open, false);
  assert.equal(exchangeStatus(sched('NYMEX'), new Date('2026-01-14T23:30:00Z')).open, true);
});

test('SGX has no DST: 07:00-16:00 VN Mon-Fri year round', () => {
  for (const d of ['2026-07-15T12:00:00Z', '2026-01-14T12:00:00Z']) {
    const r = sessionsInVietnam(sched('SGX'), new Date(d));
    assert.equal(r[0].start, '07:00');
    assert.equal(r[0].end, '16:00');
    assert.deepEqual(r[0].days, [1, 2, 3, 4, 5]);
  }
});
