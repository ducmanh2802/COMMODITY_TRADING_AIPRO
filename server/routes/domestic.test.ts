import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { registerDomesticRoutes } from './domestic.ts';
import { SqliteDomesticRepository } from '../domestic/repository.ts';
import type { ICandleRepository } from '../storage/candleRepository.ts';

const DAY = 86400000;

async function withServer(fn: (base: string) => Promise<void>) {
  const repo = new SqliteDomesticRepository(':memory:');
  const candles = {
    queryCandles: async () => ({
      rows: [{ timestampMs: Date.parse('2026-11-19T00:00:00Z'), open: 1, high: 1, low: 1, close: 4000, volume: null, openInterest: null, datasetId: 'd' }],
      totalInRange: 1,
      truncated: false,
    }),
  } as unknown as ICandleRepository;
  const macro = {
    getFx: async () => ({
      items: [{ id: 'USDVND_VCB', value: 25000, asOf: '2026-11-20', sourceName: 'VCB', sourceUrl: 'https://vcb.example/fx', status: 'DELAYED' }],
    }),
  };
  const app = express();
  registerDomesticRoutes(app, { repo, candles, macro, now: () => new Date(Date.parse('2026-11-21T00:00:00Z') + 0 * DAY) });
  const server = app.listen(0);
  try {
    await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.close();
    repo.close();
  }
}

test('empty overview, then manual entry computes basis', async () => {
  await withServer(async (base) => {
    const empty = await (await fetch(`${base}/api/domestic-prices`)).json();
    assert.equal(empty.items.find((i: { commodity: string }) => i.commodity === 'coffee').latest, null);

    const bad = await fetch(`${base}/api/domestic-prices`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entries: [{ commodity: 'coffee', price: 95000, date: '2026-11-20', source: 'X' }] }),
    });
    assert.equal(bad.status, 400);

    const ok = await fetch(`${base}/api/domestic-prices`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        entries: [{ commodity: 'coffee', region: 'Dak Lak', price: 95000, unit: 'VND/kg', date: '2026-11-20', source: 'Bao X', sourceUrl: 'https://e.com/a' }],
      }),
    });
    assert.equal(ok.status, 200);
    const data = await (await fetch(`${base}/api/domestic-prices`)).json();
    const coffee = data.items.find((i: { commodity: string }) => i.commodity === 'coffee');
    assert.equal(coffee.latest.quality, 'MANUAL');
    assert.equal(coffee.intl.vndPerKg, 100000);
    assert.equal(coffee.basis.basisVndPerKg, -5000);
    assert.equal(coffee.history.length, 1);
    assert.equal(data.items.find((i: { commodity: string }) => i.commodity === 'pepper').basis, null);
  });
});
