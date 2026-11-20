import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { registerScorecardRoutes } from './scorecard.ts';
import { ScorecardService } from '../services/scorecard/scorecardService.ts';
import { InMemoryCandleRepository } from '../storage/candleRepository.ts';
import { historicalCandleStore } from '../services/candleStore.ts';
import type { InstrumentDefinition } from '../../src/shared/types/instrument.ts';

const inst = {
  id: 'CBOT:ZC',
  exchangeSymbol: 'ZC',
  exchange: 'CBOT',
  productName: 'Corn',
  category: 'AGRICULTURE',
  specification: {},
} as unknown as InstrumentDefinition;

async function withServer(run: (base: string) => Promise<void>): Promise<void> {
  historicalCandleStore.clearAll();
  const service = new ScorecardService({
    findInstrument: async (id) => (id === 'CBOT:ZC' || id === 'ZC' ? inst : null),
    listInstruments: async () => [inst],
    getQuote: async () => {
      throw new Error('no feed');
    },
    candles: new InMemoryCandleRepository(),
    fetchHistory: null,
    getCot: () => null,
  });
  const app = express();
  app.use(express.json());
  registerScorecardRoutes(app, { service, provider: 'rules' });
  const server = await new Promise<import('node:http').Server>((r) => {
    const s = app.listen(0, '127.0.0.1', () => r(s));
  });
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    await new Promise<void>((res) => server.close(() => res()));
  }
}

test('GET /api/scorecard with no data: all dimensions UNAVAILABLE and excluded', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/scorecard`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.count, 1);
    const card = body.scorecards[0];
    assert.equal(card.price.value, null);
    assert.equal(card.price.status, 'UNAVAILABLE');
    assert.equal(card.dataQuality.level, 'UNAVAILABLE');
    assert.equal(card.overall.dimensionsUsed.length, 0);
    assert.equal(card.overall.dimensionsExcluded.length, 7);
    assert.equal(card.overall.trendClarity.score, null);
    assert.equal(card.overall.volatilityRisk.score, null);
    for (const d of card.dimensions) assert.equal(d.status, 'UNAVAILABLE');
    assert.match(card.disclaimer.vi, /không phải khuyến nghị/);
  });
});

test('GET /api/scorecard/:id handles unknown and invalid ids; summary returns the rules narrative by default', async () => {
  await withServer(async (base) => {
    assert.equal((await fetch(`${base}/api/scorecard/NOPE`)).status, 404);
    assert.equal((await fetch(`${base}/api/scorecard/bad%20id`)).status, 400);
    assert.equal((await fetch(`${base}/api/scorecard/ZC`)).status, 200);
    const res = await fetch(`${base}/api/scorecard/ZC/summary`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const body = await res.json();
    assert.equal(body.provider, 'rules');
    assert.ok(body.narrative.vi.length > 0);
    const one = await (await fetch(`${base}/api/scorecard/ZC`)).json();
    assert.equal(one.aiProvider, 'rules');
    assert.equal(one.narrative.provider, 'rules');
  });
});
