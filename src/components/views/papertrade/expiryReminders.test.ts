import test from 'node:test';
import assert from 'node:assert/strict';
import { instrumentExpiry, positionReminder, readWatchKeys, relevantInstruments } from './expiryReminders';

test('ICE:KC has computed events within the window, sorted', () => {
  const r = instrumentExpiry('ICE:KC', 'KC', '2027-02-15', 45);
  assert.equal(r.noCalendar, false);
  assert.ok(r.events.length > 0);
  for (let i = 1; i < r.events.length; i++) assert.ok(r.events[i - 1].daysLeft <= r.events[i].daysLeft);
  assert.ok(r.events.every((e) => e.daysLeft >= 0 && e.daysLeft <= 45));
});

test('instrument without calendar rule', () => {
  const r = instrumentExpiry('NOPE:XX', 'XX', '2027-02-15');
  assert.equal(r.noCalendar, true);
  assert.deepEqual(r.events, []);
});

test('invalid date is safe', () => {
  assert.equal(instrumentExpiry('ICE:KC', 'KC', 'bad').noCalendar, true);
});

test('positionReminder only inside the window', () => {
  const wide = instrumentExpiry('ICE:KC', 'KC', '2027-02-15', 45).events[0];
  assert.ok(wide);
  assert.equal(positionReminder('ICE:KC', 'KC', '2027-02-15', wide.daysLeft)?.date, wide.date);
  if (wide.daysLeft > 0) assert.equal(positionReminder('ICE:KC', 'KC', '2027-02-15', wide.daysLeft - 1), null);
});

test('relevantInstruments dedupes and orders held first', () => {
  const insts = [{ id: 'ICE:KC', exchangeSymbol: 'KC' }, { id: 'CBOT:ZS', exchangeSymbol: 'ZS' }];
  const r = relevantInstruments(insts, ['CBOT:ZS'], ['KC', 'ZS', 'zzz']);
  assert.deepEqual(r.map((x) => [x.inst.id, x.held]), [['CBOT:ZS', true], ['ICE:KC', false]]);
});

test('readWatchKeys is defensive', () => {
  assert.deepEqual(readWatchKeys(null), []);
  assert.deepEqual(readWatchKeys('{bad'), []);
  assert.deepEqual(readWatchKeys(JSON.stringify({ v: 1, items: [{ instrumentId: 'RC' }, { x: 1 }, null] })), ['RC']);
  assert.deepEqual(readWatchKeys(JSON.stringify([{ instrumentId: 'KC' }])), ['KC']);
});
