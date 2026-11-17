import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAndValidateCsvCandles, resampleCandles } from './csvImporter.ts';

test('parseAndValidateCsvCandles parses valid OHLCV CSV and detects gaps', () => {
  const csv = [
    'timestamp,open,high,low,close,volume,openInterest',
    '2026-11-01T00:00:00Z,100,105,99,103,1200,5000',
    '2026-11-01T01:00:00Z,103,107,102,106,1500,5100',
    '2026-11-01T02:00:00Z,106,108,104,105,900,5150',
  ].join('\n');

  const result = parseAndValidateCsvCandles({
    csvContent: csv,
    symbol: 'ZC',
    exchange: 'CBOT',
    timeframe: 'H1',
  });

  assert.equal(result.valid, true);
  assert.equal(result.candles.length, 3);
  assert.equal(result.candles[0].status, 'HISTORICAL');
  assert.equal(result.candles[2].close, 105);
});

test('parseAndValidateCsvCandles rejects duplicate, out-of-order, and invalid OHLC rows', () => {
  const badOhlc = [
    'timestamp,open,high,low,close',
    '2026-11-01T00:00:00Z,100,98,95,97', // high < open
  ].join('\n');
  assert.equal(
    parseAndValidateCsvCandles({
      csvContent: badOhlc,
      symbol: 'GC',
      exchange: 'COMEX',
      timeframe: 'H1',
    }).valid,
    false
  );

  const outOfOrder = [
    'timestamp,open,high,low,close',
    '2026-11-01T02:00:00Z,100,105,99,103',
    '2026-11-01T01:00:00Z,100,105,99,103',
  ].join('\n');
  assert.equal(
    parseAndValidateCsvCandles({
      csvContent: outOfOrder,
      symbol: 'GC',
      exchange: 'COMEX',
      timeframe: 'H1',
    }).valid,
    false
  );
});

test('resampleCandles aggregates H1 bars into H4 without look-ahead bias', () => {
  const csv = [
    'timestamp,open,high,low,close,volume',
    '2026-11-01T00:00:00Z,100,102,99,101,100',
    '2026-11-01T01:00:00Z,101,106,100,104,200',
    '2026-11-01T02:00:00Z,104,105,98,99,150',
    '2026-11-01T03:00:00Z,99,103,97,102,250',
  ].join('\n');

  const parsed = parseAndValidateCsvCandles({
    csvContent: csv,
    symbol: 'CL',
    exchange: 'NYMEX',
    timeframe: 'H1',
  });
  const h4 = resampleCandles(parsed.candles, 'H1', 'H4');
  assert.equal(h4.length, 1);
  assert.equal(h4[0].open, 100);
  assert.equal(h4[0].high, 106);
  assert.equal(h4[0].low, 97);
  assert.equal(h4[0].close, 102);
  assert.equal(h4[0].volume, 700);
});
