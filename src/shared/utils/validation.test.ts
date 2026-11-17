import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createUnavailableQuote,
  validateCandleSeries,
  validateMarketQuote,
} from './validation';
import type { MarketCandle } from '../types/market';

test('createUnavailableQuote fails closed with null prices and UNAVAILABLE status', () => {
  const quote = createUnavailableQuote({
    symbol: 'ZCE',
    exchange: 'MXV',
    contractMonth: null,
    currency: 'USD',
    unit: 'MT',
    source: 'MXV_OFFICIAL',
    reason: 'No authorized MXV provider connected.',
  });

  assert.equal(quote.status, 'UNAVAILABLE');
  assert.equal(quote.price, null);
  assert.equal(quote.volume, null);
  assert.equal(quote.openInterest, null);

  const check = validateMarketQuote(quote);
  assert.equal(check.valid, false);
  assert.equal(check.status, 'UNAVAILABLE');
});

test('validateMarketQuote rejects inverted bid/ask spread and missing timestamp', () => {
  const result = validateMarketQuote({
    symbol: 'GC',
    exchange: 'COMEX',
    contractMonth: '2026-12',
    price: 2650.5,
    bid: 2651.0,
    ask: 2650.0,
    volume: 1200,
    openInterest: 45000,
    currency: 'USD',
    unit: 'troy oz',
    source: 'CME_GROUP',
    timestamp: null,
    retrievedAt: '2026-11-17T08:00:00Z',
    status: 'CURRENT',
  });

  assert.equal(result.valid, false);
  assert.equal(result.status, 'INVALID');
  assert.ok(result.errors.length >= 2);
});

test('validateCandleSeries rejects duplicate timestamps, out-of-order candles, and invalid OHLC', () => {
  const baseCandle: MarketCandle = {
    symbol: 'CL',
    exchange: 'NYMEX',
    timeframe: 'H1',
    timestamp: '2026-11-17T06:00:00Z',
    retrievedAt: '2026-11-17T07:00:00Z',
    open: 70,
    high: 72,
    low: 69,
    close: 71,
    volume: 100,
    openInterest: 500,
    isComplete: true,
    source: 'CSV_HISTORICAL',
    status: 'HISTORICAL',
  };

  // Valid series passes
  const validRes = validateCandleSeries([
    baseCandle,
    { ...baseCandle, timestamp: '2026-11-17T07:00:00Z' },
  ]);
  assert.equal(validRes.valid, true);
  assert.equal(validRes.validCandles.length, 2);

  // Duplicate timestamp fails closed
  const dupRes = validateCandleSeries([baseCandle, baseCandle]);
  assert.equal(dupRes.valid, false);
  assert.equal(dupRes.status, 'INVALID');

  // Out-of-order fails closed
  const oooRes = validateCandleSeries([
    { ...baseCandle, timestamp: '2026-11-17T07:00:00Z' },
    baseCandle,
  ]);
  assert.equal(oooRes.valid, false);

  // Invalid OHLC (high < close) fails closed
  const badOhlc = validateCandleSeries([{ ...baseCandle, high: 70.5, close: 71 }]);
  assert.equal(badOhlc.valid, false);
  assert.equal(badOhlc.status, 'INVALID');
});

// Illustrative CLK20-style bars around 2020-04-20 (May WTI settled at −37.63 that day).
const clBar = (timestamp: string, open: number, high: number, low: number, close: number): MarketCandle => ({
  symbol: 'CLK20',
  exchange: 'NYMEX',
  timeframe: 'D1',
  timestamp,
  retrievedAt: '2026-11-17T07:00:00Z',
  open,
  high,
  low,
  close,
  volume: 250000,
  openInterest: 100000,
  isComplete: true,
  source: 'CSV_HISTORICAL',
  status: 'HISTORICAL',
});
const clSeries = [
  clBar('2020-04-17T00:00:00Z', 19.8, 20.4, 17.31, 18.27),
  clBar('2020-04-20T00:00:00Z', 17.73, 17.85, -40.32, -37.63),
  // high raised to 10.01 so the bar is OHLC-consistent (WIP fixture had high 1 < close 10.01).
  clBar('2020-04-21T00:00:00Z', -14, 10.01, -16.74, 10.01),
];

test('validateCandleSeries rejects non-positive prices by default (CL 2020-04-20 style bar)', () => {
  const res = validateCandleSeries(clSeries);
  assert.equal(res.valid, false);
  assert.equal(res.status, 'INVALID');
  assert.deepEqual(res.validCandles, []);
  assert.equal(res.errors.length, 2);
  assert.match(res.errors[0], /^Candle\[1\].*non-positive price.*allowNonPositivePrices/);
  assert.match(res.errors[1], /^Candle\[2\]/);
});

test('validateCandleSeries accepts non-positive prices with allowNonPositivePrices and warns per bar', () => {
  const res = validateCandleSeries(clSeries, { allowNonPositivePrices: true });
  assert.equal(res.valid, true, res.errors.join('; '));
  assert.equal(res.validCandles.length, 3);
  assert.equal(res.warnings.length, 2);
  assert.match(res.warnings[0], /^Candle\[1\] non-positive price at 2020-04-20/);
  assert.match(res.warnings[1], /^Candle\[2\] non-positive price/);

  // Positive-only series: no warnings either way.
  assert.deepEqual(validateCandleSeries([clSeries[0]], { allowNonPositivePrices: true }).warnings, []);
  assert.deepEqual(validateCandleSeries([clSeries[0]]).warnings, []);
});

test('allowNonPositivePrices keeps OHLC relationship, finiteness and volume/OI checks', () => {
  const opt = { allowNonPositivePrices: true };
  // high below close
  assert.equal(validateCandleSeries([clBar('2020-04-20T00:00:00Z', -1, -5, -40, -3)], opt).valid, false);
  // non-finite prices
  assert.equal(validateCandleSeries([clBar('2020-04-20T00:00:00Z', -1, Infinity, -40, -3)], opt).valid, false);
  assert.equal(validateCandleSeries([clBar('2020-04-20T00:00:00Z', NaN, 1, -40, -3)], opt).valid, false);
  // negative volume / OI
  assert.equal(validateCandleSeries([{ ...clSeries[1], volume: -1 }], opt).valid, false);
  assert.equal(validateCandleSeries([{ ...clSeries[1], openInterest: -5 }], opt).valid, false);
});

test('back-adjusted continuous series that drifts below zero is accepted with the flag', () => {
  const base = clBar('2001-11-15T00:00:00Z', -2.1, -1.4, -2.6, -1.8);
  const res = validateCandleSeries(
    [
      { ...base, symbol: 'CL:CONTINUOUS' },
      { ...base, symbol: 'CL:CONTINUOUS', timestamp: '2001-11-16T00:00:00Z', open: -1.8, high: 0, low: -2, close: 0 },
      { ...base, symbol: 'CL:CONTINUOUS', timestamp: '2001-11-19T00:00:00Z', open: 0.1, high: 0.9, low: 0.05, close: 0.8 },
    ],
    { allowNonPositivePrices: true }
  );
  assert.equal(res.valid, true);
  assert.equal(res.warnings.length, 2, 'zero counts as non-positive');
});
