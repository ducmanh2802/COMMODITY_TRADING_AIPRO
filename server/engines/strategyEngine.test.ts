import test from 'node:test';
import assert from 'node:assert/strict';
import type { MarketCandle } from '../../src/shared/types/market.ts';
import { analyzeTechnicalSnapshot } from './technicalEngine.ts';
import { evaluateAllStrategies, evaluateStrategy } from './strategyEngine.ts';

function makeUptrendCandles(count: number): MarketCandle[] {
  const startMs = Date.parse('2026-09-01T00:00:00Z');
  return Array.from({ length: count }, (_, i) => {
    const close = 100 + i * 1.2 + (i * i) * 0.02;
    const open = close - 1.0;
    return {
      symbol: 'GC',
      exchange: 'COMEX',
      timeframe: 'H4',
      timestamp: new Date(startMs + i * 4 * 3600_000).toISOString(),
      retrievedAt: '2026-11-17T00:00:00Z',
      open,
      high: close + 0.8,
      low: open - 0.6,
      close,
      volume: 1500,
      openInterest: 40000,
      isComplete: true,
      source: 'CSV_HISTORICAL',
      status: 'HISTORICAL',
    };
  });
}

test('Strategy Engine fails closed when market data is UNAVAILABLE', () => {
  const snap = analyzeTechnicalSnapshot([], 'GC', 'COMEX', 'H4');
  const signals = evaluateAllStrategies(snap, [], 'H4');
  assert.equal(signals.length, 8);
  for (const sig of signals) {
    assert.equal(sig.confirmationStatus, 'UNAVAILABLE');
    assert.equal(sig.direction, 'NONE');
    assert.equal(sig.stopLoss, null);
  }
});

test('TREND_FOLLOWING and MACD_MOMENTUM confirm LONG on validated strong uptrend', () => {
  const candles = makeUptrendCandles(80);
  const snap = analyzeTechnicalSnapshot(candles, 'GC', 'COMEX', 'H4');
  const trendSig = evaluateStrategy('TREND_FOLLOWING', snap, candles);
  assert.equal(trendSig.confirmationStatus, 'CONFIRMED');
  assert.equal(trendSig.direction, 'LONG');
  assert.ok(trendSig.stopLoss !== null && trendSig.stopLoss < snap.lastClose!);
  assert.ok(trendSig.takeProfits.length === 2 && trendSig.takeProfits[0] > snap.lastClose!);

  const macdSig = evaluateStrategy('MACD_MOMENTUM', snap, candles);
  assert.equal(macdSig.confirmationStatus, 'CONFIRMED');
  assert.equal(macdSig.direction, 'LONG');
});
