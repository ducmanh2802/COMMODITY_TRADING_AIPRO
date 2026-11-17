import test from 'node:test';
import assert from 'node:assert/strict';
import type { MarketCandle } from '../../src/shared/types/market.ts';
import { instrumentRepository } from '../services/instrumentRegistry.ts';
import { PERIODS_PER_YEAR, runHistoricalBacktest, sharpeFromEquity, type BacktestConfig } from './backtestEngine.ts';

function makeBacktestCandles(count: number): MarketCandle[] {
  const startMs = Date.parse('2026-06-01T00:00:00Z');
  return Array.from({ length: count }, (_, i) => {
    const wave = i < 65 ? 2000 + i * 2 : 2130 + (i - 65) * 3;
    const open = wave - 1;
    const close = wave;
    return {
      symbol: 'GC',
      exchange: 'COMEX',
      timeframe: 'H4',
      timestamp: new Date(startMs + i * 4 * 3600_000).toISOString(),
      retrievedAt: '2026-11-17T00:00:00Z',
      open,
      high: close + 2,
      low: open - 1.5,
      close,
      volume: 1200,
      openInterest: 45000,
      isComplete: true,
      source: 'CSV_HISTORICAL',
      status: 'HISTORICAL',
    };
  });
}

test('runHistoricalBacktest executes trades without look-ahead bias and computes metrics', async () => {
  const gold = await instrumentRepository.findBySymbol('GC');
  assert.ok(gold);
  const candles = makeBacktestCandles(110);

  const res = runHistoricalBacktest(candles, {
    instrument: gold,
    strategyId: 'TREND_FOLLOWING',
    timeframe: 'H4',
    initialEquity: 50000,
    contractsPerTrade: 1,
    commissionPerContract: 5,
    slippageTicks: 1,
    rolloverIntervalBars: 20,
    rolloverCostPerContract: 5,
  });

  assert.equal(res.valid, true);
  assert.ok(res.metrics.tradeCount >= 1);
  // Mark-to-market curve: one point per simulated bar (warmup excluded).
  assert.equal(res.equityCurve.length, candles.length - 55);
  assert.ok(res.disclosure && res.metricDefinitions.length > 0);
  // Every trade must open on a timestamp strictly after warmup
  assert.ok(res.trades[0].entryTimestamp > candles[55].timestamp);
});

test('runHistoricalBacktest fails closed on insufficient candle history', async () => {
  const gold = await instrumentRepository.findBySymbol('GC');
  assert.ok(gold);
  const res = runHistoricalBacktest(makeBacktestCandles(10), {
    instrument: gold,
    strategyId: 'TREND_FOLLOWING',
    timeframe: 'H4',
    initialEquity: 50000,
    contractsPerTrade: 1,
    commissionPerContract: 5,
    slippageTicks: 1,
  });
  assert.equal(res.valid, false);
  assert.match(res.error ?? '', /Insufficient/i);
});

async function baseConfig(overrides: Partial<BacktestConfig> = {}): Promise<BacktestConfig> {
  const gold = await instrumentRepository.findBySymbol('GC');
  assert.ok(gold);
  return {
    instrument: gold,
    strategyId: 'TREND_FOLLOWING',
    timeframe: 'H4',
    initialEquity: 50000,
    contractsPerTrade: 2,
    commissionPerContract: 5,
    slippageTicks: 1,
    ...overrides,
  };
}

test('fills happen at the OPEN of the bar after the signal bar, plus/minus slippage', async () => {
  const candles = makeBacktestCandles(140);
  const cfg = await baseConfig();
  const res = runHistoricalBacktest(candles, cfg);
  assert.ok(res.trades.length >= 1);
  const tick = cfg.instrument.specification.minimumTickSize!;
  for (const t of res.trades) {
    const k = candles.findIndex((c) => c.timestamp === t.signalTimestamp);
    assert.ok(k >= 0);
    assert.equal(t.entryTimestamp, candles[k + 1].timestamp, 'entry is the next bar');
    const expected = t.direction === 'LONG' ? candles[k + 1].open + tick : candles[k + 1].open - tick;
    assert.ok(Math.abs(t.entryPrice - expected) < 1e-9, `entry ${t.entryPrice} vs next open ${expected}`);
  }
});

test('no look-ahead: changing future bars never changes results up to the change point', async () => {
  const candles = makeBacktestCandles(140);
  const cfg = await baseConfig();
  const base = runHistoricalBacktest(candles, cfg);
  for (const cut of [80, 100, 120]) {
    const altered = candles.map((c, i) =>
      i < cut ? c : { ...c, open: c.open * 0.7, high: c.high * 0.7, low: c.low * 0.7, close: c.close * 0.7 }
    );
    const alt = runHistoricalBacktest(altered, cfg);
    const cutTs = candles[cut].timestamp;
    const prefix = (r: typeof base) => r.equityCurve.filter((p) => p.timestamp < cutTs);
    assert.deepEqual(prefix(alt), prefix(base), `equity before bar ${cut}`);
    const closedBefore = (r: typeof base) => r.trades.filter((t) => t.exitTimestamp < cutTs);
    assert.deepEqual(closedBefore(alt), closedBefore(base), `trades closed before bar ${cut}`);
  }
});

test('commission, slippage and roll costs are charged exactly and reconcile with net profit', async () => {
  const candles = makeBacktestCandles(140);
  // Same slippage in both runs (it moves fill prices and therefore stop/target levels); only cash costs differ.
  const free = runHistoricalBacktest(candles, await baseConfig({ commissionPerContract: 0 }));
  const cfg = await baseConfig({ rolloverIntervalBars: 2, rolloverCostPerContract: 7 });
  const costly = runHistoricalBacktest(candles, cfg);
  assert.equal(costly.trades.length, free.trades.length, 'costs do not change signals here');
  const qty = cfg.contractsPerTrade;
  const tickValue = cfg.instrument.specification.tickValue!;
  assert.equal(costly.metrics.totalCommission, 2 * 5 * qty * costly.trades.length);
  assert.equal(costly.metrics.totalSlippageCost, 2 * 1 * tickValue * qty * costly.trades.length);
  assert.ok(costly.metrics.rollCount > 0, 'roll interval produced rolls');
  const perRoll = 7 * qty + 2 * 5 * qty + 2 * tickValue * qty;
  assert.ok(Math.abs(costly.metrics.totalRollCosts - perRoll * costly.metrics.rollCount) < 1e-6);
  // Rolls keep the position open (no extra trades) and the cost difference reconciles exactly.
  const diff = free.metrics.netProfit - costly.metrics.netProfit;
  const expected = costly.metrics.totalCommission + costly.metrics.totalRollCosts;
  assert.ok(Math.abs(diff - expected) < 1e-6, `diff ${diff} vs costs ${expected}`);
  const sumNet = costly.trades.reduce((a, t) => a + t.netPnl, 0);
  assert.ok(Math.abs(sumNet - costly.metrics.netProfit) < 1e-6, 'trade net P&L sums to net profit');
  assert.ok(costly.trades.every((t) => t.exitReason !== ('ROLLOVER_CLOSE' as string)));
});

test('sharpeFromEquity follows the documented formula', () => {
  assert.equal(sharpeFromEquity([100], 252), null);
  assert.equal(sharpeFromEquity([100, 101, 102.01], 252), null); // constant 1% returns -> stdev 0
  const eq = [100, 101, 100, 102];
  const r = [0.01, 100 / 101 - 1, 0.02];
  const mean = r.reduce((a, b) => a + b, 0) / 3;
  const sd = Math.sqrt(r.reduce((a, x) => a + (x - mean) ** 2, 0) / 2);
  assert.ok(Math.abs(sharpeFromEquity(eq, 252)! - (mean / sd) * Math.sqrt(252)) < 1e-12);
  assert.equal(PERIODS_PER_YEAR.D1, 252);
});
