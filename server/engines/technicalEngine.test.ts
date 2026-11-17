import test from 'node:test';
import assert from 'node:assert/strict';
import type { MarketCandle } from '../../src/shared/types/market.ts';
import {
  analyzeTechnicalSnapshot,
  calculateADX,
  calculateATR,
  calculateBollingerBands,
  calculateEMA,
  calculateMACD,
  calculatePivotPoints,
  calculateRSI,
  calculateSMA,
  calculateVWAP,
  detectMarketStructure,
} from './technicalEngine.ts';

function makeSeries(closes: number[], incompleteLast = false): MarketCandle[] {
  const startMs = Date.parse('2026-10-01T00:00:00Z');
  return closes.map((close, idx) => {
    const open = idx === 0 ? close - 0.5 : closes[idx - 1];
    const high = Math.max(open, close) + 1.2;
    const low = Math.min(open, close) - 1.0;
    return {
      symbol: 'GC',
      exchange: 'COMEX',
      timeframe: 'H4',
      timestamp: new Date(startMs + idx * 4 * 3600_000).toISOString(),
      retrievedAt: '2026-11-17T00:00:00Z',
      open,
      high,
      low,
      close,
      volume: 1000 + idx * 10,
      openInterest: 50000,
      isComplete: incompleteLast && idx === closes.length - 1 ? false : true,
      source: 'CSV_HISTORICAL',
      status: 'HISTORICAL',
    };
  });
}

test('SMA and EMA match standard mathematical definitions', () => {
  const values = [10, 11, 12, 13, 14];
  const sma3 = calculateSMA(values, 3);
  assert.equal(sma3[0], null);
  assert.equal(sma3[1], null);
  assert.equal(sma3[2], 11);
  assert.equal(sma3[3], 12);
  assert.equal(sma3[4], 13);

  const ema3 = calculateEMA(values, 3);
  assert.equal(ema3[2], 11); // SMA seed
  // k = 2/(3+1) = 0.5 => ema[3] = 13*0.5 + 11*0.5 = 12
  assert.equal(ema3[3], 12);
  // ema[4] = 14*0.5 + 12*0.5 = 13
  assert.equal(ema3[4], 13);
});

test('RSI, MACD, Bollinger Bands, ATR, ADX, VWAP, and Pivot Points compute deterministically', () => {
  const closes = Array.from({ length: 65 }, (_, i) => 2000 + i * 2 + Math.sin(i * 0.6) * 3);
  const candles = makeSeries(closes);

  const rsi = calculateRSI(closes, 14);
  const lastRsi = rsi[rsi.length - 1]!;
  assert.ok(lastRsi > 50 && lastRsi <= 100);

  const macd = calculateMACD(closes);
  assert.ok(macd.macd[macd.macd.length - 1] !== null);
  assert.ok(macd.signal[macd.signal.length - 1] !== null);
  assert.ok(macd.histogram[macd.histogram.length - 1] !== null);

  const bb = calculateBollingerBands(closes, 20, 2);
  const idx = closes.length - 1;
  assert.ok(bb.upper[idx]! > bb.middle[idx]!);
  assert.ok(bb.middle[idx]! > bb.lower[idx]!);

  const atr = calculateATR(candles, 14);
  assert.ok(atr[idx]! > 0);

  const adx = calculateADX(candles, 14);
  assert.ok(adx.adx[idx]! > 0 && adx.plusDI[idx]! > adx.minusDI[idx]!);

  const vwap = calculateVWAP(candles);
  assert.ok(vwap[idx]! > 0);

  const pivots = calculatePivotPoints(110, 100, 108);
  assert.equal(pivots.pivot, 106);
  assert.equal(pivots.r1, 112);
  assert.equal(pivots.s1, 102);
});

test('detectMarketStructure distinguishes confirmed vs unconfirmed swings without look-ahead repainting', () => {
  // Construct clear peaks and troughs
  const closes = [
    100, 102, 105, 110, 106, 103, 100, // confirmed swing high around idx 3
    98, 95, 99, 103, 107, 112, 115, // confirmed swing low around idx 8, high near idx 13
    111, 108, 104, 109, 114, 118, 116, // trailing unconfirmed swing around idx 19
  ];
  const candles = makeSeries(closes);
  const structure = detectMarketStructure(candles, 3);

  assert.ok(structure.confirmedSwings.length > 0);
  assert.ok(structure.confirmedSwings.every((s) => s.confirmed === true && s.index <= candles.length - 4));
  assert.ok(structure.unconfirmedSwings.every((s) => s.confirmed === false && s.index > candles.length - 4));
});

test('analyzeTechnicalSnapshot excludes incomplete trailing candle and fails closed on empty candles', () => {
  const emptySnap = analyzeTechnicalSnapshot([], 'GC', 'COMEX', 'H4');
  assert.equal(emptySnap.status, 'UNAVAILABLE');
  assert.equal(emptySnap.lastClose, null);

  const closes = Array.from({ length: 60 }, (_, i) => 100 + i);
  const withIncomplete = makeSeries(closes, true);
  const snap = analyzeTechnicalSnapshot(withIncomplete, 'GC', 'COMEX', 'H4');
  assert.equal(snap.hasIncompleteTrailingCandle, true);
  assert.equal(snap.completeCandleCount, 59);
  assert.equal(snap.lastClose, closes[58]); // Did NOT use incomplete bar 59
});
