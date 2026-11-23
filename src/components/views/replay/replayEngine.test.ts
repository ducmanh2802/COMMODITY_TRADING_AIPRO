import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advance, cancelOrder, checkExit, closeNow, computeStats, createReplay, cursorForDate, cursorRange, equityUsd, finish,
  maxContractsFor, placeOrder, randomCursor, type Bar, type ReplayState,
} from './replayEngine';

const mk = (i: number, o: number, h: number, l: number, c: number): Bar => ({ t: new Date(Date.UTC(2020, 0, 1 + i)).toISOString(), o, h, l, c });
const flat = (n: number): Bar[] => Array.from({ length: n }, (_, i) => mk(i, 100, 101, 99, 100));
/** bars 0..2 flat at 100, then custom future. cursor starts at 2. */
function setup(future: Bar[], pv = 10): ReplayState {
  return createReplay([...flat(3), ...future], 2, pv);
}
const long = { side: 'LONG' as const, stop: 95, target: 110, contracts: 2 };

test('cursor range / random / date', () => {
  assert.equal(cursorRange(219), null);
  assert.deepEqual(cursorRange(220), { min: 99, max: 99 });
  assert.deepEqual(cursorRange(400), { min: 99, max: 279 });
  assert.equal(randomCursor(219), null);
  assert.equal(randomCursor(400, () => 0), 99);
  assert.equal(randomCursor(400, () => 0.999999), 279);
  const bars = Array.from({ length: 400 }, (_, i) => mk(i, 1, 1, 1, 1));
  assert.equal(cursorForDate(bars, '1990-01-01'), 99);
  assert.equal(cursorForDate(bars, '2099-01-01'), 279);
  assert.equal(cursorForDate(bars, bars[150].t.slice(0, 10)), 150);
});

test('order validation', () => {
  const s = setup(flat(5));
  assert.equal(placeOrder(s, { ...long, stop: 101 }).error, 'BAD_LEVELS');
  assert.equal(placeOrder(s, { ...long, target: 99 }).error, 'BAD_LEVELS');
  assert.equal(placeOrder(s, { ...long, stop: NaN }).error, 'STOP_TARGET_REQUIRED');
  assert.equal(placeOrder(s, { ...long, contracts: 0 }).error, 'BAD_CONTRACTS');
  assert.equal(placeOrder(s, { ...long, contracts: 1.5 }).error, 'BAD_CONTRACTS');
  assert.equal(placeOrder(s, { side: 'SHORT', stop: 95, target: 110, contracts: 1 }).error, 'BAD_LEVELS');
  assert.equal(placeOrder(s, { side: 'SHORT', stop: 105, target: 90, contracts: 1 }).error, undefined);
  assert.equal(placeOrder(s, long).error, undefined);
});

test('fills at next bar open, not current close', () => {
  let s = setup([mk(3, 102, 103, 101, 102), mk(4, 102, 103, 101, 102)]);
  s = placeOrder(s, long).state;
  assert.equal(s.position, null);
  s = advance(s);
  assert.equal(s.position?.entry, 102);
  assert.equal(s.position?.riskUsd, 7 * 10 * 2);
  assert.equal(s.pending, null);
});

test('target hit, long: R and USD', () => {
  let s = setup([mk(3, 100, 100, 100, 100), mk(4, 100, 111, 100, 110), mk(5, 100, 100, 100, 100)]);
  s = placeOrder(s, long).state;
  s = advance(s);
  assert.ok(s.position);
  s = advance(s);
  assert.equal(s.position, null);
  const t = s.closed[0];
  assert.equal(t.reason, 'TARGET');
  assert.equal(t.exit, 110);
  assert.equal(t.pnlUsd, 10 * 10 * 2);
  assert.equal(t.r, 2);
  assert.equal(equityUsd(s), 10_000 + 200);
});

test('stop hit, short', () => {
  let s = setup([mk(3, 100, 100.5, 99.5, 100), mk(4, 100, 106, 99, 105)]);
  s = placeOrder(s, { side: 'SHORT', stop: 105, target: 90, contracts: 1 }).state;
  s = advance(s);
  s = advance(s);
  const t = s.closed[0];
  assert.equal(t.reason, 'STOP');
  assert.equal(t.exit, 105);
  assert.equal(t.pnlUsd, -50);
  assert.equal(t.r, -1);
});

test('both stop and target inside one bar: stop first', () => {
  let s = setup([mk(3, 100, 100, 100, 100), mk(4, 100, 120, 90, 100)]);
  s = placeOrder(s, long).state;
  s = advance(s);
  s = advance(s);
  assert.equal(s.closed[0].reason, 'STOP');
  assert.equal(s.closed[0].r, -1);
  const shortPos = { side: 'SHORT' as const, entry: 100, stop: 105, target: 95, contracts: 1, entryIdx: 0, riskUsd: 5 };
  assert.equal(checkExit(shortPos, mk(0, 100, 106, 94, 100))?.reason, 'STOP');
});

test('stop/target can hit on the fill bar itself (after open)', () => {
  let s = setup([mk(3, 100, 100, 94, 96), mk(4, 100, 100, 100, 100)]);
  s = placeOrder(s, long).state;
  s = advance(s);
  assert.equal(s.position, null);
  assert.equal(s.closed[0].entryIdx, 3);
  assert.equal(s.closed[0].exitIdx, 3);
  assert.equal(s.closed[0].reason, 'STOP');
});

test('gap through stop fills at open (worse); gap over target fills at open (better)', () => {
  let s = setup([mk(3, 100, 100, 100, 100), mk(4, 90, 92, 88, 91), mk(5, 100, 100, 100, 100)]);
  s = placeOrder(s, long).state;
  s = advance(s);
  s = advance(s);
  assert.equal(s.closed[0].exit, 90);
  assert.equal(s.closed[0].r, (-10 * 10 * 2) / 100);
  let u = setup([mk(3, 100, 100, 100, 100), mk(4, 115, 118, 114, 116), mk(5, 100, 100, 100, 100)]);
  u = placeOrder(u, long).state;
  u = advance(u);
  u = advance(u);
  assert.equal(u.closed[0].exit, 115);
  assert.equal(u.closed[0].reason, 'TARGET');
});

test('pending order cancelled if open gaps beyond stop/target', () => {
  let s = setup([mk(3, 90, 91, 89, 90), mk(4, 90, 90, 90, 90)]);
  s = placeOrder(s, long).state;
  s = advance(s);
  assert.equal(s.position, null);
  assert.equal(s.pending, null);
  assert.equal(s.closed.length, 0);
  assert.equal(s.events[0].type, 'CANCELLED');
});

test('manual close at last visible close; unrealised equity', () => {
  let s = setup([mk(3, 100, 104, 100, 104), mk(4, 104, 104, 104, 104)]);
  s = placeOrder(s, long).state;
  s = advance(s);
  assert.equal(equityUsd(s), 10_000 + 4 * 10 * 2);
  s = closeNow(s);
  assert.equal(s.closed[0].reason, 'MANUAL');
  assert.equal(s.closed[0].exit, 104);
  assert.equal(s.closed[0].pnlUsd, 80);
  assert.equal(closeNow(s), s);
});

test('cancelOrder, only one position at a time', () => {
  let s = setup(flat(5));
  s = placeOrder(s, long).state;
  assert.equal(cancelOrder(s).pending, null);
  s = advance(s);
  assert.equal(placeOrder(s, long).error, 'HAS_POSITION');
});

test('runs to the end: auto-finish flattens position', () => {
  let s = setup([mk(3, 100, 101, 99, 100), mk(4, 100, 101, 99, 102)]);
  s = placeOrder(s, long).state;
  s = advance(s);
  s = advance(s);
  assert.equal(s.finished, true);
  assert.equal(s.closed[0].reason, 'END');
  assert.equal(s.closed[0].exit, 102);
  assert.equal(advance(s), s);
  assert.equal(placeOrder(s, long).error, 'FINISHED');
});

test('finish early drops pending', () => {
  let s = setup(flat(5));
  s = placeOrder(s, long).state;
  s = finish(s);
  assert.equal(s.finished, true);
  assert.equal(s.pending, null);
});

test('stats: R, win rate, discipline', () => {
  let s = setup([mk(3, 100, 100, 100, 100), mk(4, 100, 111, 100, 100), mk(5, 100, 100, 100, 100), mk(6, 100, 100, 94, 95), mk(7, 100, 100, 100, 100)], 10);
  s = advance(placeOrder(s, long).state);
  s = advance(s); // +2R win, risk 100 USD
  s = advance(placeOrder(s, { side: 'LONG', stop: 95, target: 110, contracts: 5 }).state); // risk 250 > 200: undisciplined
  s = advance(s); // stop: -250
  const st = computeStats(s.closed);
  assert.equal(st.trades, 2);
  assert.equal(st.wins, 1);
  assert.equal(st.winRate, 50);
  assert.equal(st.totalR, 1);
  assert.equal(st.disciplinePct, 50);
  assert.equal(st.pnlUsd, -50);
  assert.deepEqual(computeStats([]), { trades: 0, wins: 0, winRate: null, totalR: 0, pnlUsd: 0, disciplinePct: null });
});

test('maxContractsFor respects 2% of 10,000', () => {
  assert.equal(maxContractsFor(100, 95, 10), 4);
  assert.equal(maxContractsFor(100, 100, 10), 0);
  assert.equal(maxContractsFor(100, 50, 10), 0);
});

test('createReplay guards', () => {
  assert.throws(() => createReplay(flat(3), 5, 1));
  assert.throws(() => createReplay(flat(3), 1, 0));
});
