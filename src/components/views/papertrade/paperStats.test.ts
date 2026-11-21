import test from 'node:test';
import assert from 'node:assert/strict';
import { computePerformance, equityCurve, longestLossStreak, maxDrawdown, planTakeaway, type StatTrade } from './paperStats';

const tr = (pnl: number, r: number | null, t: number, over: Partial<StatTrade> = {}): StatTrade => ({ instrumentId: 'ICE:KC', pnlVnd: pnl, rMultiple: r, closedAtMs: t, ...over });

test('equity curve starts at capital and sorts by close time', () => {
  const c = equityCurve([tr(-50, -1, 2), tr(100, 2, 1)], 1000);
  assert.deepEqual(c.map((p) => p.equityVnd), [1000, 1100, 1050]);
});

test('max drawdown finds peak-to-trough', () => {
  const c = equityCurve([tr(200, 1, 1), tr(-100, -1, 2), tr(-100, -1, 3), tr(50, 1, 4)], 1000);
  const dd = maxDrawdown(c);
  assert.equal(dd.vnd, 200);
  assert.equal(dd.pct, 16.67);
  assert.equal(dd.peakIndex, 1);
  assert.equal(dd.troughIndex, 3);
});

test('no drawdown on a rising curve', () => {
  assert.equal(maxDrawdown(equityCurve([tr(10, 1, 1), tr(10, 1, 2)], 100)).vnd, 0);
});

test('longest loss streak', () => {
  assert.equal(longestLossStreak([tr(-1, -1, 1), tr(-1, -1, 2), tr(5, 1, 3), tr(-1, -1, 4)]), 2);
  assert.equal(longestLossStreak([]), 0);
});

test('KPIs', () => {
  const s = computePerformance([tr(300, 2, 1), tr(-100, -1, 2), tr(-100, -1, 3), tr(100, null, 4)], 10_000);
  assert.equal(s.trades, 4);
  assert.equal(s.totalPnlVnd, 200);
  assert.equal(s.winRatePct, 50);
  assert.equal(s.avgWinVnd, 200);
  assert.equal(s.avgLossVnd, -100);
  assert.equal(s.profitFactor, 2);
  assert.equal(s.expectancyR, 0); // (2-1-1)/3
  assert.equal(s.rCount, 3);
  assert.equal(s.tooFew, true);
});

test('profit factor null without losses; empty input safe', () => {
  assert.equal(computePerformance([tr(10, 1, 1)], 100).profitFactor, null);
  const e = computePerformance([], 100);
  assert.equal(e.trades, 0);
  assert.equal(e.expectancyR, null);
  assert.equal(e.avgWinVnd, null);
});

test('plan split only when data exists, and takeaway', () => {
  const none = computePerformance([tr(10, 1, 1)], 100);
  assert.equal(none.onPlan, null);
  assert.equal(none.offPlan, null);
  assert.equal(planTakeaway(none), null);
  const s = computePerformance([tr(10, 1, 1, { onPlan: true }), tr(10, 0.2, 2, { onPlan: true }), tr(-10, -0.6, 3, { onPlan: false })], 100);
  assert.equal(s.onPlan?.trades, 2);
  assert.equal(s.offPlan?.avgR, -0.6);
  assert.deepEqual(planTakeaway(s), { on: 0.6, off: -0.6, better: 'on' });
});

test('byInstrument grouping sorted by pnl', () => {
  const s = computePerformance([tr(10, 1, 1), tr(-30, -1, 2, { instrumentId: 'CBOT:ZS' }), tr(5, 1, 3)], 100);
  assert.deepEqual(s.byInstrument.map((g) => g.key), ['ICE:KC', 'CBOT:ZS']);
  assert.equal(s.byInstrument[0].trades, 2);
});
