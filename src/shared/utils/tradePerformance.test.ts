import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeTradePerformance,
  parseJournalTimestampMs,
  type NormalizedJournalTrade,
} from './tradePerformance.ts';

test('computeTradePerformance handles empty input safely', () => {
  const res = computeTradePerformance([]);
  assert.equal(res.totalTrades, 0);
  assert.equal(res.winCount, 0);
  assert.equal(res.lossCount, 0);
  assert.equal(res.winRatePct, null);
  assert.equal(res.winLossRatio, null);
  assert.equal(res.payoffRatio, null);
  assert.equal(res.profitFactor, null);
  assert.equal(res.maxDrawdown, 0);
  assert.equal(res.maxDrawdownPct, null);
  assert.equal(res.isAtPeak, true);
  assert.deepEqual(res.points, []);
  assert.deepEqual(res.byInstrument, []);
});

test('computeTradePerformance sorts chronologically and calculates win/loss ratios and drawdown', () => {
  const trades: NormalizedJournalTrade[] = [
    // Deliberately out of chronological order
    { id: 't3', symbol: 'ZC', timestampMs: Date.UTC(2026, 2, 5), pnl: -450, rMultiple: -1 },
    { id: 't1', symbol: 'ZW', timestampMs: Date.UTC(2026, 2, 1), pnl: 600, rMultiple: 2 },
    { id: 't4', symbol: 'ZC', timestampMs: Date.UTC(2026, 2, 7), pnl: -150, rMultiple: -0.5 },
    { id: 't2', symbol: 'ZW', timestampMs: Date.UTC(2026, 2, 3), pnl: 400, rMultiple: 1.5 },
    { id: 't5', symbol: 'CL', timestampMs: Date.UTC(2026, 2, 10), pnl: 500, rMultiple: 1.8 },
  ];

  const res = computeTradePerformance(trades);

  assert.equal(res.totalTrades, 5);
  assert.equal(res.winCount, 3);
  assert.equal(res.lossCount, 2);
  assert.equal(res.breakevenCount, 0);
  assert.equal(res.winRatePct, 60);
  assert.equal(res.lossRatePct, 40);
  // 3 wins / 2 losses = 1.5
  assert.equal(res.winLossRatio, 1.5);
  // avgWin = (600 + 400 + 500) / 3 = 500; avgLoss = -300 -> payoffRatio = 1.67
  assert.equal(res.avgWin, 500);
  assert.equal(res.avgLoss, -300);
  assert.equal(res.payoffRatio, 1.67);
  // grossProfit = 1500, grossLoss = 600 -> profitFactor = 2.5
  assert.equal(res.grossProfit, 1500);
  assert.equal(res.grossLoss, 600);
  assert.equal(res.profitFactor, 2.5);
  assert.equal(res.netPnl, 900);
  assert.equal(res.expectancy, 180);
  assert.equal(res.maxWinStreak, 2);
  assert.equal(res.maxLossStreak, 2);

  // Equity sequence: +600 (peak 600), +1000 (peak 1000), +550 (dd -450), +400 (dd -600), +900 (dd -100)
  assert.deepEqual(
    res.points.map((p) => p.id),
    ['t1', 't2', 't3', 't4', 't5']
  );
  assert.deepEqual(
    res.points.map((p) => p.cumulativePnl),
    [600, 1000, 550, 400, 900]
  );
  assert.deepEqual(
    res.points.map((p) => p.drawdown),
    [0, 0, -450, -600, -100]
  );
  assert.equal(res.maxDrawdown, 600);
  // Peak was 1000 without startingCapital -> 600 / 1000 = 60%
  assert.equal(res.maxDrawdownPct, 60);
  assert.equal(res.currentDrawdown, 100);
  assert.equal(res.isAtPeak, false);

  // Instrument aggregation sorted by |netPnl| desc: ZW (+1000), ZC (-600), CL (+500)
  assert.equal(res.byInstrument[0]?.symbol, 'ZW');
  assert.equal(res.byInstrument[0]?.netPnl, 1000);
  assert.equal(res.byInstrument[0]?.winRatePct, 100);
  assert.equal(res.byInstrument[1]?.symbol, 'ZC');
  assert.equal(res.byInstrument[1]?.netPnl, -600);
  assert.equal(res.byInstrument[2]?.symbol, 'CL');
  assert.equal(res.byInstrument[2]?.netPnl, 500);
});

test('computeTradePerformance computes drawdownPct from startingCapital when provided', () => {
  const trades: NormalizedJournalTrade[] = [
    { id: '1', symbol: 'ZC', timestampMs: 1000, pnl: 5_000_000 },
    { id: '2', symbol: 'ZC', timestampMs: 2000, pnl: -10_500_000 },
    { id: '3', symbol: 'ZC', timestampMs: 3000, pnl: 10_500_000 },
  ];

  const res = computeTradePerformance(trades, { startingCapital: 100_000_000 });
  assert.equal(res.maxDrawdown, 10_500_000);
  // Peak equity = 100M + 5M = 105M; 10.5M / 105M = 10%
  assert.equal(res.maxDrawdownPct, 10);
  assert.equal(res.currentDrawdown, 0);
  assert.equal(res.isAtPeak, true);
});

test('computeTradePerformance handles all-wins and breakeven trades without NaN or Infinity', () => {
  const trades: NormalizedJournalTrade[] = [
    { id: '1', symbol: 'GC', timestampMs: 1000, pnl: 250 },
    { id: '2', symbol: 'GC', timestampMs: 2000, pnl: 0 },
  ];

  const res = computeTradePerformance(trades);
  assert.equal(res.winCount, 1);
  assert.equal(res.lossCount, 0);
  assert.equal(res.breakevenCount, 1);
  assert.equal(res.winRatePct, 50);
  assert.equal(res.winLossRatio, null);
  assert.equal(res.payoffRatio, null);
  assert.equal(res.profitFactor, null);
  assert.equal(res.maxDrawdown, 0);
  assert.equal(res.isAtPeak, true);
});

test('parseJournalTimestampMs falls back cleanly from exit to entry timestamp', () => {
  const ms = parseJournalTimestampMs('', '2026-04-01T10:30:00Z');
  assert.equal(ms, Date.UTC(2026, 3, 1, 10, 30, 0));
  assert.equal(parseJournalTimestampMs('invalid', ''), 0);
});
