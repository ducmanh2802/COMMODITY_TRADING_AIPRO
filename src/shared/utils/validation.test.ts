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
