import test from 'node:test';
import assert from 'node:assert/strict';
import type { MarketCandle } from '../../src/shared/types/market.ts';
import {
  classifyCyclePhase,
  computePerformanceHorizonReturns,
  evaluateMultiTimeframeCycle,
} from './cycleEngine.ts';

function buildDailySeries(closes: number[], startIso = '2023-01-01T00:00:00.000Z'): MarketCandle[] {
  const startMs = Date.parse(startIso);
  return closes.map((close, idx) => {
    const ts = new Date(startMs + idx * 86_400_000).toISOString();
    return {
      symbol: 'CBOT:ZC',
      exchange: 'CBOT',
      timeframe: 'D1',
      timestamp: ts,
      retrievedAt: ts,
      open: close * 0.998,
      high: close * 1.006,
      low: close * 0.994,
      close,
      volume: 10_000 + idx * 10,
      openInterest: 50_000,
      isComplete: true,
      source: 'TEST_SERIES',
      status: 'HISTORICAL',
    };
  });
}

test('cycleEngine fails closed when fewer than 20 candles are provided', () => {
  const short = buildDailySeries(Array.from({ length: 12 }, (_, i) => 400 + i));
  const res = evaluateMultiTimeframeCycle({ dailyCandles: short });
  assert.equal(res.primaryPhase, 'DATA_UNAVAILABLE');
  assert.equal(res.timeframes.DAILY.available, false);
  assert.equal(res.returns.y1, null);
  assert.equal(res.returns.y3, null);
});

test('cycleEngine keeps steady linear uptrend in PHASE_3_MARKUP rather than premature PHASE_4_DISTRIBUTION', () => {
  const closes = Array.from({ length: 260 }, (_, i) => 300 + i * 0.45);
  const candles = buildDailySeries(closes);
  const res = evaluateMultiTimeframeCycle({ dailyCandles: candles });
  assert.equal(res.timeframes.DAILY.phase, 'PHASE_3_MARKUP');
  assert.equal(res.timeframes.WEEKLY.phase, 'PHASE_3_MARKUP');
  assert.equal(res.primaryPhase, 'PHASE_3_MARKUP');
});

test('classifyCyclePhase flags PHASE_4_DISTRIBUTION when high percentile rolls over below EMA20', () => {
  const phase = classifyCyclePhase({
    candleCount: 180,
    lastClose: 740,
    ema20: 765,
    ema50: 720,
    ema200: 650,
    rsi14: 69,
    macdHist: -2.4,
    percentile10Y: 88,
    bbWidthRatio: 1.35,
  });
  assert.equal(phase, 'PHASE_4_DISTRIBUTION');
});

test('cycleEngine detects PHASE_1_ACCUMULATION when price compresses near multi-year lows', () => {
  const phase = classifyCyclePhase({
    candleCount: 160,
    lastClose: 385,
    ema20: 388,
    ema50: 410,
    ema200: 460,
    rsi14: 38,
    macdHist: -0.2,
    percentile10Y: 12,
    bbWidthRatio: 0.62,
  });
  assert.equal(phase, 'PHASE_1_ACCUMULATION');
});

test('computePerformanceHorizonReturns returns null when series does not cover the requested span', () => {
  const closes = Array.from({ length: 100 }, (_, i) => 400 + i * 0.2);
  const candles = buildDailySeries(closes);
  const returns = computePerformanceHorizonReturns(candles);
  assert.notEqual(returns.w1, null);
  assert.notEqual(returns.m1, null);
  assert.equal(returns.y1, null);
  assert.equal(returns.y5, null);
  assert.equal(returns.y10, null);
});
