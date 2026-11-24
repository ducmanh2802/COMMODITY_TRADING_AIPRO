import test from 'node:test';
import assert from 'node:assert/strict';
import { COOL_OFF_DEFAULTS, coolOffTradesFromState, evaluateCoolOff, vnDayIndex, type CoolOffTrade } from './coolOff';

const H = 3600_000;
// 2026-11-24 10:00 Vietnam time = 03:00 UTC.
const T0 = Date.UTC(2026, 10, 24, 3, 0, 0);
const BASE = 100_000_000;
const tr = (pnlVnd: number, closedAtMs: number, baseVnd = BASE): CoolOffTrade => ({ pnlVnd, closedAtMs, baseVnd });

test('no trades → unlocked', () => {
  const r = evaluateCoolOff([], T0);
  assert.equal(r.locked, false);
  assert.equal(r.reason, null);
  assert.equal(r.until, null);
  assert.equal(r.stats.lossStreak, 0);
});

test('3 consecutive small losses lock for 24h from the 3rd close', () => {
  const trades = [tr(-100_000, T0), tr(-100_000, T0 + H), tr(-100_000, T0 + 2 * H)];
  const r = evaluateCoolOff(trades, T0 + 3 * H);
  assert.equal(r.locked, true);
  assert.equal(r.reason, 'streak');
  assert.equal(r.until, T0 + 2 * H + COOL_OFF_DEFAULTS.lockMs);
  assert.equal(r.stats.lossStreak, 3);
  assert.equal(r.stats.triggeredAtMs, T0 + 2 * H);
});

test('a win breaks the streak', () => {
  const trades = [tr(-100_000, T0), tr(-100_000, T0 + H), tr(50_000, T0 + 2 * H), tr(-100_000, T0 + 3 * H)];
  const r = evaluateCoolOff(trades, T0 + 4 * H);
  assert.equal(r.locked, false);
  assert.equal(r.stats.lossStreak, 1);
});

test('lock expires after 24h', () => {
  const trades = [tr(-1, T0), tr(-1, T0 + H), tr(-1, T0 + 2 * H)];
  assert.equal(evaluateCoolOff(trades, T0 + 2 * H + 24 * H - 1).locked, true);
  assert.equal(evaluateCoolOff(trades, T0 + 2 * H + 24 * H).locked, false);
});

test('daily loss of -3% locks even without a streak', () => {
  const trades = [tr(-2_000_000, T0), tr(500_000, T0 + H), tr(-1_500_000, T0 + 2 * H)];
  const r = evaluateCoolOff(trades, T0 + 3 * H);
  assert.equal(r.locked, true);
  assert.equal(r.reason, 'dailyLoss');
  assert.equal(r.until, T0 + 2 * H + 24 * H);
  assert.equal(r.stats.todayPnlVnd, -3_000_000);
  assert.ok(Math.abs(r.stats.todayPnlPct + 3) < 1e-9);
});

test('-2.9% day does not lock', () => {
  const r = evaluateCoolOff([tr(-2_900_000, T0)], T0 + H);
  assert.equal(r.locked, false);
});

test('daily loss resets at Vietnam midnight (UTC+7), not UTC midnight', () => {
  // 23:30 VN on the 24th = 16:30 UTC; 00:30 VN on the 25th = 17:30 UTC (same UTC day).
  const late = Date.UTC(2026, 10, 24, 16, 30);
  const early = Date.UTC(2026, 10, 24, 17, 30);
  assert.notEqual(vnDayIndex(late), vnDayIndex(early));
  const r = evaluateCoolOff([tr(-2_000_000, late), tr(-1_500_000, early)], early + H);
  assert.equal(r.locked, false);
  assert.equal(r.stats.todayPnlVnd, -1_500_000);
});

test('a newer trigger restarts the 24h', () => {
  const trades = [tr(-1, T0), tr(-1, T0 + H), tr(-1, T0 + 2 * H), tr(-1, T0 + 5 * H)];
  const r = evaluateCoolOff(trades, T0 + 6 * H);
  assert.equal(r.until, T0 + 5 * H + 24 * H);
});

test('unsorted input and future trades are handled', () => {
  const trades = [tr(-1, T0 + 2 * H), tr(-1, T0), tr(-1, T0 + H), tr(-1, T0 + 100 * H)];
  const r = evaluateCoolOff(trades, T0 + 3 * H);
  assert.equal(r.locked, true);
  assert.equal(r.stats.lossStreak, 3);
});

test('coolOffTradesFromState uses each session starting capital', () => {
  const out = coolOffTradesFromState({
    sessions: [{ id: 's1', startingCapitalVnd: 10 }, { id: 's2', startingCapitalVnd: 20 }],
    trades: [{ sessionId: 's2', pnlVnd: -1, closedAtMs: 5 }, { sessionId: 'gone', pnlVnd: -1, closedAtMs: 6 }],
  });
  assert.deepEqual(out, [{ pnlVnd: -1, closedAtMs: 5, baseVnd: 20 }, { pnlVnd: -1, closedAtMs: 6, baseVnd: 0 }]);
});
