import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { FundamentalRepository } from './fundamentalRepository.ts';
import { FundamentalStore } from '../services/fundamentalService.ts';
import { registerWeatherRoutes } from '../routes/weather.ts';

type Rec = Parameters<FundamentalStore['addRecord']>[0];
const rec = (over: Partial<Rec> = {}): Rec => ({
  dataset: 'FRED_DGS10',
  source: 'FRED',
  publicationTimestamp: '2026-11-20T00:00:00.000Z',
  observationDate: '2026-11-19',
  dataPeriod: '2026-11-19',
  category: 'MACRO',
  actualValue: 4.25,
  previousValue: null,
  forecastValue: null,
  unit: '%',
  revisionStatus: 'FINAL',
  impactAssessment: 'SIDEWAYS',
  ...over,
});

function tmpDb(): { file: string; done: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), 'fund-'));
  return { file: path.join(dir, 'market.db'), done: () => rmSync(dir, { recursive: true, force: true }) };
}

test('persistence round-trip and restart load', () => {
  const { file, done } = tmpDb();
  try {
    const repo1 = new FundamentalRepository(file);
    const s1 = new FundamentalStore();
    s1.attachPersistence(repo1);
    s1.addRecord(rec());
    s1.addRecord(rec({ dataset: 'EIA_CRUDE_STOCKS', source: 'EIA', category: 'EIA_INVENTORIES', actualValue: 421.5, unit: 'MMbbl' }));
    s1.addRecord(rec()); // idempotent upsert
    assert.equal(repo1.count(), 2);
    repo1.close();

    const repo2 = new FundamentalRepository(file); // "restart"
    const s2 = new FundamentalStore();
    assert.equal(s2.attachPersistence(repo2, { nowMs: Date.parse('2026-11-24') }), 2);
    const list = s2.listRecords({ nowMs: Date.parse('2026-11-24') });
    assert.equal(list.length, 2);
    assert.equal(list.find((r) => r.dataset === 'FRED_DGS10')?.actualValue, 4.25);
    assert.equal(list.find((r) => r.dataset === 'EIA_CRUDE_STOCKS')?.unit, 'MMbbl');
    repo2.close();
  } finally {
    done();
  }
});

test('null values are preserved, never stored as 0', () => {
  const repo = new FundamentalRepository(':memory:');
  const s = new FundamentalStore();
  s.attachPersistence(repo);
  s.addRecord(rec({ actualValue: null, previousValue: null }));
  const [loaded] = repo.loadAll();
  assert.equal(loaded.actualValue, null);
  assert.equal(loaded.previousValue, null);
  assert.equal(loaded.forecastValue, null);
  const raw = (repo as unknown as { db: import('node:sqlite').DatabaseSync }).db
    .prepare('SELECT actual_num, actual_text, previous_num, forecast_num FROM fundamental_records')
    .get() as Record<string, unknown>;
  assert.deepEqual({ ...raw }, { actual_num: null, actual_text: null, previous_num: null, forecast_num: null });
  // real zero stays zero, string stays string
  s.addRecord(rec({ observationDate: '2026-11-18', dataPeriod: '2026-11-18', actualValue: 0, previousValue: 'n/a' }));
  const zero = repo.loadAll().find((r) => r.observationDate === '2026-11-18');
  assert.equal(zero?.actualValue, 0);
  assert.equal(zero?.previousValue, 'n/a');
});

test('loaded old data is labeled STALE; fresh data is not', () => {
  const repo = new FundamentalRepository(':memory:');
  const s1 = new FundamentalStore();
  s1.attachPersistence(repo);
  s1.addRecord(rec({ dataset: 'EIA_CRUDE_STOCKS', source: 'EIA', category: 'EIA_INVENTORIES', publicationTimestamp: '2026-09-01T00:00:00.000Z', observationDate: '2026-08-28' }));
  s1.addRecord(rec({ publicationTimestamp: '2026-11-23T00:00:00.000Z', observationDate: '2026-11-20', category: 'MACRO' }));
  const s2 = new FundamentalStore();
  s2.attachPersistence(repo, { nowMs: Date.parse('2026-11-24') });
  const list = s2.listRecords({ nowMs: Date.parse('2026-11-24') });
  assert.equal(list.find((r) => r.dataset === 'EIA_CRUDE_STOCKS')?.freshnessStatus, 'STALE');
  assert.equal(list.find((r) => r.dataset === 'FRED_DGS10')?.freshnessStatus, 'HISTORICAL');
});

test('prune removes rows beyond retention only', () => {
  const repo = new FundamentalRepository(':memory:');
  const s = new FundamentalStore();
  s.attachPersistence(repo);
  s.addRecord(rec({ observationDate: '2015-01-01', dataPeriod: '2015-01-01', publicationTimestamp: '2015-01-02T00:00:00.000Z' }));
  s.addRecord(rec());
  assert.equal(repo.prune(Date.parse('2026-11-24'), 365 * 5), 1);
  assert.equal(repo.count(), 1);
});

test('persistence failure does not break the store', () => {
  const repo = new FundamentalRepository(':memory:');
  const s = new FundamentalStore();
  s.attachPersistence(repo);
  repo.close();
  assert.doesNotThrow(() => s.addRecord(rec()));
  assert.equal(s.listRecords().length, 1);
});

test('weather route: provider failure with no stale copy -> 200 UNAVAILABLE JSON, not 500', async () => {
  const app = express();
  registerWeatherRoutes(app, { service: { getRegions: async () => { throw new Error('boom: secret detail'); } } });
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/weather/regions`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { status: string; reason: string; regions: unknown[]; retrievedAt: string };
    assert.equal(body.status, 'UNAVAILABLE');
    assert.match(body.reason, /DATA_UNAVAILABLE/);
    assert.ok(!body.reason.includes('secret'));
    assert.deepEqual(body.regions, []);
    assert.ok(Number.isFinite(Date.parse(body.retrievedAt)));
  } finally {
    server.close();
  }
});
