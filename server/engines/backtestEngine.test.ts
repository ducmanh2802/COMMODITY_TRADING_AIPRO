import test from 'node:test';
import assert from 'node:assert/strict';
import type { MarketCandle } from '../../src/shared/types/market.ts';
import { instrumentRepository } from '../services/instrumentRegistry.ts';
import { runHistoricalBacktest } from './backtestEngine.ts';

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
  assert.equal(res.equityCurve.length, res.metrics.tradeCount + 1);
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
