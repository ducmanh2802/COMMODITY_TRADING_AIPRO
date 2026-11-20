import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { InstrumentDefinition } from '../../../src/shared/types/instrument.ts';
import type { MarketCandle } from '../../../src/shared/types/market.ts';
import { InMemoryCandleRepository } from '../../storage/candleRepository.ts';
import { ScorecardService } from './scorecardService.ts';

const inst = { id: 'CBOT:ZC', exchangeSymbol: 'ZC', exchange: 'CBOT', productName: 'Corn', category: 'AGRICULTURE' } as unknown as InstrumentDefinition;
const candles = [1, 2, 3].map((i) => ({ timestamp: `2024-01-0${i}T00:00:00.000Z`, open: i, high: i, low: i, close: i, volume: 1, source: 'YAHOO_UNOFFICIAL', isComplete: true })) as unknown as MarketCandle[];

test('history() never waits for Yahoo; backfill lands later and invalidates the list cache', async () => {
  let release: (() => void) | null = null;
  const svc = new ScorecardService({
    findInstrument: async () => inst,
    listInstruments: async () => [inst],
    getQuote: async () => { throw new Error('no feed'); },
    candles: new InMemoryCandleRepository(),
    fetchHistory: async () => { await new Promise<void>((r) => (release = r)); return { candles } as never; },
    getCot: () => null,
  });
  const h = await svc.history(inst); // returns immediately although fetchHistory hangs
  assert.equal(h.origin, 'NONE');
  let invalidated = false;
  svc.onHistoryBackfilled = () => { invalidated = true; };
  await new Promise((r) => setTimeout(r, 10));
  release!();
  await svc.idle();
  assert.equal(invalidated, true);
  assert.equal((await svc.history(inst)).origin, 'YAHOO');
});
