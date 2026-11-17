import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryCandleRepository } from '../storage/candleRepository.ts';
import { INITIAL_INSTRUMENTS } from '../data/instruments.ts';
import type { MarketCandle } from '../../src/shared/types/market.ts';
import { createProviderCandlePersister, UNVERIFIED_PROVIDER_UNIT } from './syncPersistence.ts';

function candle(ts: string, close: number): MarketCandle {
  return {
    symbol: 'XAU/USD',
    exchange: 'COMEX',
    timeframe: 'D1',
    timestamp: ts,
    retrievedAt: '2026-11-18T00:00:00.000Z',
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: null,
    openInterest: null,
    isComplete: true,
    source: 'TWELVE_DATA',
    status: 'HISTORICAL',
  } as MarketCandle;
}

test('provider sync candles persist as a VENDOR_* dataset with per-provider sourceQuality, append-only', async () => {
  const repo = new InMemoryCandleRepository();
  const persist = createProviderCandlePersister(repo, () => new Date('2026-11-18T01:00:00.000Z'));
  const gold = INITIAL_INSTRUMENTS.find((i) => i.id === 'COMEX:GC')!;
  const first = await persist({
    providerId: 'TWELVE_DATA',
    providerName: 'Twelve Data',
    instrument: gold,
    timeframe: 'D1',
    candles: [candle('2026-11-16T00:00:00.000Z', 2000), candle('2026-11-17T00:00:00.000Z', 2010)],
  });
  assert.equal(first.status, 'PERSISTED');
  assert.equal(first.rowsWritten, 2);
  const [ds] = await repo.listDatasets({ instrumentId: 'COMEX:GC' });
  assert.equal(ds.contractCode, 'VENDOR_TWELVE_DATA');
  assert.equal(ds.sourceQuality, 'UNOFFICIAL');
  assert.equal(ds.priceUnit, UNVERIFIED_PROVIDER_UNIT);
  assert.match(ds.sourceLabel, /Twelve Data API sync \(provider symbol XAU\/USD\)/);

  // Re-sync: one new bar appended, a conflicting old bar is NOT overwritten.
  const second = await persist({
    providerId: 'TWELVE_DATA',
    providerName: 'Twelve Data',
    instrument: gold,
    timeframe: 'D1',
    candles: [candle('2026-11-17T00:00:00.000Z', 2999), candle('2026-11-18T00:00:00.000Z', 2020)],
  });
  assert.equal(second.status, 'PERSISTED');
  assert.equal(second.rowsWritten, 1);
  assert.equal(second.conflicts, 1);
  const { rows } = await repo.queryCandles({ instrumentId: 'COMEX:GC', contractCode: 'VENDOR_TWELVE_DATA', timeframe: 'D1' });
  assert.deepEqual(rows.map((r) => r.close), [2000, 2010, 2020]);

  // Unmapped provider -> skipped, never guessed.
  const skipped = await persist({ providerId: 'CME_GROUP', providerName: 'x', instrument: gold, timeframe: 'D1', candles: [candle('2026-11-18T00:00:00.000Z', 1)] });
  assert.equal(skipped.status, 'SKIPPED');
});
