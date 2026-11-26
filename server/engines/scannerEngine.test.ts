import test from 'node:test';
import assert from 'node:assert/strict';
import type { InstrumentDefinition } from '../../src/shared/types/instrument.ts';
import type { MarketCandle } from '../../src/shared/types/market.ts';
import { runTradeScanner, type ScannerCandleLookup, type ScannerFilterConfig } from './scannerEngine.ts';

function inst(over: Partial<InstrumentDefinition> & { exchangeSymbol: string }): InstrumentDefinition {
  return {
    id: over.exchangeSymbol,
    productName: over.exchangeSymbol,
    category: 'AGRICULTURE',
    exchange: 'CBOT',
    contractMonth: null,
    contractYear: null,
    isMvxListed: false,
    specification: {} as InstrumentDefinition['specification'],
    mxvMapping: null,
    enabled: true,
    ...over,
  };
}

const cfg: ScannerFilterConfig = { tradingStyle: 'SWING', timeframe: 'D1', minRiskReward: 1, minSetupScore: 0 };

function candle(i: number, over: Partial<MarketCandle> = {}): MarketCandle {
  const ts = new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString();
  return {
    symbol: 'X', exchange: 'CBOT', timeframe: 'D1', timestamp: ts, retrievedAt: ts,
    open: 100, high: 101, low: 99, close: 100, volume: 1000, openInterest: null,
    isComplete: true, source: 'TEST', status: 'DELAYED', ...over,
  };
}

test('scanner: disabled, wrong-category and wrong-exchange instruments are skipped without lookup', () => {
  const seen: string[] = [];
  const lookup: ScannerCandleLookup = (i) => {
    seen.push(i.exchangeSymbol);
    return { candles: [], status: 'UNAVAILABLE', meta: null };
  };
  const list = [
    inst({ exchangeSymbol: 'OFF', enabled: false }),
    inst({ exchangeSymbol: 'GC', category: 'METALS', exchange: 'COMEX' }),
    inst({ exchangeSymbol: 'ZC' }),
  ];
  const r = runTradeScanner(list, { ...cfg, category: 'AGRICULTURE', exchange: 'CBOT' }, lookup);
  assert.deepEqual(seen, ['ZC']);
  assert.deepEqual(r.unavailableInstruments.map((u) => u.symbol), ['ZC']);
  assert.equal(r.opportunities.length, 0);
});

test('scanner: UNAVAILABLE / INVALID / empty candle results are reported with a reason, never invented', () => {
  const results: Record<string, ReturnType<ScannerCandleLookup>> = {
    A: { candles: [], status: 'UNAVAILABLE', meta: null, reason: 'no file' },
    B: { candles: [candle(0)], status: 'INVALID', meta: null },
    C: { candles: [], status: 'DELAYED', meta: null },
  };
  const r = runTradeScanner(['A', 'B', 'C'].map((s) => inst({ exchangeSymbol: s })), cfg, (i) => results[i.exchangeSymbol]);
  assert.deepEqual(r.unavailableInstruments, [
    { symbol: 'A', exchange: 'CBOT', reason: 'no file' },
    { symbol: 'B', exchange: 'CBOT', reason: 'DATA_UNAVAILABLE' },
    { symbol: 'C', exchange: 'CBOT', reason: 'DATA_UNAVAILABLE' },
  ]);
  assert.deepEqual(r.opportunities, []);
});

test('scanner: malformed candles (high < low, NaN) become unavailable instead of throwing', () => {
  const bad = [candle(0), candle(1, { high: 90, low: 110 }), candle(2, { close: Number.NaN })];
  const r = runTradeScanner([inst({ exchangeSymbol: 'ZC' })], cfg, () => ({ candles: bad, status: 'DELAYED', meta: null }));
  assert.equal(r.opportunities.length, 0);
  assert.equal(r.unavailableInstruments.length, 1);
  assert.equal(r.unavailableInstruments[0].symbol, 'ZC');
});

test('scanner: empty instrument list and echo of config', () => {
  const r = runTradeScanner([], cfg, () => {
    throw new Error('lookup must not be called');
  });
  assert.deepEqual(r.opportunities, []);
  assert.deepEqual(r.unavailableInstruments, []);
  assert.equal(r.tradingStyle, 'SWING');
  assert.equal(r.timeframe, 'D1');
  assert.ok(!Number.isNaN(Date.parse(r.scannedAt)));
});

test('scanner: flat market never produces a confirmed opportunity at strict thresholds', () => {
  const flat = Array.from({ length: 260 }, (_, i) => candle(i));
  const r = runTradeScanner(
    [inst({ exchangeSymbol: 'ZC' })],
    { ...cfg, minSetupScore: 101, minRiskReward: 99, maxVolatilityAtrPct: 50 },
    () => ({ candles: flat, status: 'DELAYED', meta: null })
  );
  assert.deepEqual(r.opportunities, []);
});
