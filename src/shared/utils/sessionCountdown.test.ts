import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXCHANGE_SCHEDULES } from './exchangeHours';
import {
  buildAllSessionCountdowns,
  computeSessionCountdown,
  splitCountdownSeconds,
} from './sessionCountdown';

const sched = (id: string) => EXCHANGE_SCHEDULES.find((s) => s.id === id)!;

test('splitCountdownSeconds formats HH:MM:SS and extracts days cleanly', () => {
  assert.deepEqual(splitCountdownSeconds(0), {
    totalSeconds: 0,
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    hms: '00:00:00',
  });
  assert.deepEqual(splitCountdownSeconds(-15), {
    totalSeconds: 0,
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    hms: '00:00:00',
  });
  assert.deepEqual(splitCountdownSeconds(3661), {
    totalSeconds: 3661,
    days: 0,
    hours: 1,
    minutes: 1,
    seconds: 1,
    hms: '01:01:01',
  });
  assert.deepEqual(splitCountdownSeconds(2 * 86_400 + 5 * 3600 + 9 * 60 + 42), {
    totalSeconds: 191_382,
    days: 2,
    hours: 5,
    minutes: 9,
    seconds: 42,
    hms: '05:09:42',
  });
});

test('computeSessionCountdown counts down to the exact second synced with Vietnam clock ticks', () => {
  // 2026-07-15T13:00:15Z is 08:00:15 CDT (CBOT daily break 07:45-08:30 CDT), 29m45s before 08:30 CDT reopen (20:30 ICT)
  const t1 = new Date('2026-07-15T13:00:15.250Z');
  const s1 = computeSessionCountdown(sched('CBOT'), t1);
  assert.equal(s1.open, false);
  assert.equal(s1.transition, 'OPENS');
  assert.equal(s1.imminent, true);
  assert.equal(s1.remainingSeconds, 29 * 60 + 45);
  assert.equal(s1.countdown.hms, '00:29:45');
  assert.equal(s1.nextChangeVietnamHm, '20:30');

  // 1 second later decrements by exactly 1 second
  const t2 = new Date('2026-07-15T13:00:16.250Z');
  const s2 = computeSessionCountdown(sched('CBOT'), t2);
  assert.equal(s2.remainingSeconds, 29 * 60 + 44);
  assert.equal(s2.countdown.hms, '00:29:44');

  // Right at reopen 13:30:00Z -> flips to OPEN
  const t3 = new Date('2026-07-15T13:30:00.000Z');
  const s3 = computeSessionCountdown(sched('CBOT'), t3);
  assert.equal(s3.open, true);
  assert.equal(s3.transition, 'CLOSES');
  assert.equal(s3.nextChangeVietnamHm, '01:20');
});

test('buildAllSessionCountdowns computes Vietnam clock, filters OPEN/CLOSED, and picks soonest transitions', () => {
  // 2026-07-15T13:00:00Z -> 20:00:00 ICT (Wednesday evening in VN, morning in US)
  // CBOT is in 30-min break; NYMEX/COMEX/ICEUS/ICEEU/LME are open; SGX (07:00-16:00 ICT) is closed.
  const now = new Date('2026-07-15T13:00:00Z');
  const all = buildAllSessionCountdowns(now, 'ALL');

  assert.equal(all.vietnamClockLabel, '20:00:00 ICT');
  assert.equal(all.vietnamDateIso, '2026-07-15');
  assert.equal(all.totalCount, EXCHANGE_SCHEDULES.length);
  assert.equal(all.openCount + all.closedCount, all.totalCount);
  assert.ok(all.openCount > 0 && all.closedCount > 0);
  assert.equal(all.nextToOpen?.id, 'CBOT');
  assert.equal(all.soonestChange?.id, 'CBOT');
  assert.equal(all.soonestChange?.remainingSeconds, 1800);

  // Open sessions appear before closed sessions in ALL view
  const firstClosedIdx = all.sessions.findIndex((s) => !s.open);
  assert.ok(firstClosedIdx > 0);
  assert.ok(all.sessions.slice(0, firstClosedIdx).every((s) => s.open));
  assert.ok(all.sessions.slice(firstClosedIdx).every((s) => !s.open));

  const openOnly = buildAllSessionCountdowns(now, 'OPEN');
  assert.equal(openOnly.sessions.length, all.openCount);
  assert.ok(openOnly.sessions.every((s) => s.open));

  const closedOnly = buildAllSessionCountdowns(now, 'CLOSED');
  assert.equal(closedOnly.sessions.length, all.closedCount);
  assert.ok(closedOnly.sessions.every((s) => !s.open));
});

test('holiday awareness attaches matching market holiday entry when Vietnam date matches', () => {
  const thanksgiving = new Date('2026-11-26T10:00:00Z');
  const overview = buildAllSessionCountdowns(thanksgiving, 'ALL');
  const cbot = overview.sessions.find((s) => s.id === 'CBOT');
  const lme = overview.sessions.find((s) => s.id === 'LME');
  assert.ok(cbot?.holidayToday !== null);
  assert.equal(cbot?.holidayToday?.id, 'hol-2026-11-26-us');
  assert.equal(lme?.holidayToday, null);
});

test('MXV-only holidays (Tet) do not appear on foreign exchange cards', () => {
  const tet = new Date('2027-02-08T03:00:00Z'); // Monday in Vietnam, MXV-only Tet entry
  const overview = buildAllSessionCountdowns(tet, 'ALL');
  for (const s of overview.sessions) {
    assert.ok(!s.holidayToday?.affectedExchanges.every((ex) => ex === 'MXV'), `${s.id} shows an MXV-only holiday`);
  }
});
