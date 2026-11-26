import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateMarginCall, statusAt, type MarginSimInput } from './marginCall';

// Illustrative numbers only: equity 3000, 2 contracts, init 1500, maint 1200 -> maintReq 2400, tick 12.5 -> 25/tick.
const base: MarginSimInput = { equity: 3000, contracts: 2, initialPerContract: 1500, maintPerContract: 1200, tickValue: 12.5, adverseTicks: 0, liquidationShare: 0.5 };

test('no move: ok, no call', () => {
  const r = simulateMarginCall(base);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.maintReq, 2400);
  assert.equal(r.finalStatus, 'ok');
  assert.equal(r.callTick, null);
  assert.equal(r.topUp, 0);
});

test('call triggers at first tick where equity < maintenance', () => {
  const r = simulateMarginCall({ ...base, adverseTicks: 40 });
  assert.ok(r.ok);
  if (!r.ok) return;
  // 600 buffer / 25 = 24 ticks -> equity exactly 2400 (not below); tick 25 -> 2375 < 2400.
  assert.equal(r.callTick, 25);
  assert.equal(r.path[24].status, 'ok');
  assert.equal(r.path[25].status, 'call');
});

test('top-up restores initial requirement', () => {
  const r = simulateMarginCall({ ...base, adverseTicks: 30 });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.finalEquity, 2250);
  assert.equal(r.finalStatus, 'call');
  assert.equal(r.topUp, 3000 - 2250);
});

test('forced liquidation at or below liquidation level', () => {
  const r = simulateMarginCall({ ...base, adverseTicks: 100 });
  assert.ok(r.ok);
  if (!r.ok) return;
  // level 1200 -> (3000-1200)/25 = 72 ticks exactly.
  assert.equal(r.liquidationTick, 72);
  assert.equal(r.finalStatus, 'liquidate');
  assert.equal(r.topUp, 0);
});

test('thresholds beyond the simulated move are not reported', () => {
  const r = simulateMarginCall({ ...base, adverseTicks: 10 });
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.liquidationTick, null);
});

test('already below maintenance at tick 0', () => {
  const r = simulateMarginCall({ ...base, equity: 2000, adverseTicks: 0 });
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.callTick, 0);
});

test('validation refuses bad input', () => {
  assert.equal(simulateMarginCall({ ...base, contracts: 0 }).ok, false);
  assert.equal(simulateMarginCall({ ...base, contracts: 1.5 }).ok, false);
  assert.equal(simulateMarginCall({ ...base, tickValue: 0 }).ok, false);
  assert.equal(simulateMarginCall({ ...base, maintPerContract: 2000 }).ok, false);
  assert.equal(simulateMarginCall({ ...base, equity: Number.NaN }).ok, false);
  assert.equal(simulateMarginCall({ ...base, liquidationShare: 2 }).ok, false);
});

test('statusAt', () => {
  assert.equal(statusAt(-5, 100, 50), 'liquidate');
  assert.equal(statusAt(80, 100, 50), 'call');
  assert.equal(statusAt(100, 100, 50), 'ok');
});
