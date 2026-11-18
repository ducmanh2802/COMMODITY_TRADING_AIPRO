import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { registerCotRoutes } from './cot.ts';
import { CotService } from '../cot/service.ts';
import { SqliteCotRepository } from '../cot/repository.ts';
import { CftcFetchError, type CftcClientLike, type CftcFetchRequest } from '../cot/client.ts';
import { parseCftcCsv } from '../cot/parser.ts';

const fixtureRows = (name: string) =>
  parseCftcCsv(readFileSync(fileURLToPath(new URL(`../cot/__fixtures__/${name}`, import.meta.url)), 'utf8'));

class MockClient implements CftcClientLike {
  calls: CftcFetchRequest[] = [];
  fail: number | null = null;
  async fetchReports(req: CftcFetchRequest) {
    this.calls.push(req);
    const sourceUrl = `https://mock.test/${req.reportType}`;
    if (this.fail !== null) throw new CftcFetchError(`CFTC responded HTTP ${this.fail}`, sourceUrl, this.fail, 1);
    const records =
      req.reportType === 'DISAGGREGATED'
        ? fixtureRows('cftc_disagg_fut_2026_corn_002602.csv')
        : fixtureRows('cftc_legacy_fut_2026_corn_002602.csv');
    return { records, sourceUrl, pages: 1, fetchedAt: '2026-11-17T12:00:00.000Z' };
  }
}

/** Stands in for the www.cftc.gov historical-file source (no network in tests). */
class MockFileSource extends MockClient {
  override async fetchReports(req: CftcFetchRequest) {
    const r = await super.fetchReports(req);
    const sourceUrl = `https://www.cftc.gov/files/dea/history/mock_${req.reportType}_2026.zip`;
    return { ...r, sourceUrl, sourceUrls: [sourceUrl], source: 'files' as const };
  }
}

async function withServer(
  run: (base: string, client: MockClient, files: MockFileSource) => Promise<void>,
  sourceMode: 'auto' | 'socrata' | 'files' = 'socrata'
): Promise<void> {
  const client = new MockClient();
  const files = new MockFileSource();
  const repo = new SqliteCotRepository(':memory:');
  const service = new CotService({
    repository: repo,
    client,
    fileSource: files,
    sourceMode,
    now: () => new Date('2026-11-17T12:00:00Z'),
  });
  const app = express();
  app.use('/api', express.json());
  registerCotRoutes(app, { service });
  const server = await new Promise<import('node:http').Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, client, files);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    repo.close();
  }
}

const post = (url: string, body: unknown) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('POST /api/cot/sync validates the body', async () => {
  await withServer(async (base, client) => {
    for (const body of [{}, { instrumentId: 'corn' }, { instrumentId: 'CBOT:ZC', from: '2026-13-01' }, { instrumentId: 'CBOT:ZC', extra: 1 }]) {
      const res = await post(`${base}/api/cot/sync`, body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal((await res.json()).error, 'VALIDATION_ERROR');
    }
    const unknown = await post(`${base}/api/cot/sync`, { instrumentId: 'CBOT:XX' });
    assert.equal(unknown.status, 404);
    assert.equal((await unknown.json()).error, 'INSTRUMENT_NOT_FOUND');
    const brent = await post(`${base}/api/cot/sync`, { instrumentId: 'ICE:BRN' });
    assert.equal(brent.status, 422);
    assert.equal((await brent.json()).error, 'COT_NOT_REPORTED');
    assert.equal(client.calls.length, 0);
  });
});

test('sync → query → health round trip with a mocked CFTC client', async () => {
  await withServer(async (base, client) => {
    const res = await post(`${base}/api/cot/sync`, { instrumentId: 'CBOT:ZC', from: '2026-10-01' });
    assert.equal(res.status, 200);
    const { sync } = await res.json();
    assert.equal(sync.status, 'SUCCESS');
    assert.deepEqual(client.calls.map((c) => [c.reportType, c.marketCode, c.from]), [
      ['DISAGGREGATED', '002602', '2026-10-01'],
      ['LEGACY', '002602', '2026-10-01'],
    ]);
    assert.equal(sync.results[0].inserted, 3);
    assert.equal(sync.results[0].rowsRejected, 0);

    // Second sync without `from` is incremental and idempotent.
    const again = await (await post(`${base}/api/cot/sync`, { instrumentId: 'CBOT:ZC' })).json();
    assert.equal(again.sync.results[0].unchanged, 3);
    assert.equal(client.calls[2].from, '2026-10-13'); // last report 2026-11-10 minus 4 weeks

    const q = await fetch(`${base}/api/cot/CBOT:ZC?type=disaggregated&lookbackWeeks=4`);
    assert.equal(q.status, 200);
    const body = await q.json();
    assert.equal(body.count, 3);
    assert.equal(body.rows[2].reportDate, '2026-11-10');
    assert.equal(body.rows[2].expectedReleaseDate, '2026-11-13');
    assert.match(body.timingNotice, /look-ahead/);
    assert.equal(body.analytics.status, 'INSUFFICIENT_DATA'); // 3 reports < 4-week window
    assert.equal(body.analytics.latest.categories.managedMoney.net, 243161 - 265789);
    assert.equal(body.analytics.latest.categories.managedMoney.netChangeWoW !== null, true);

    const legacy = await (await fetch(`${base}/api/cot/CBOT%3AZC?type=legacy&from=2026-11-01`)).json();
    assert.equal(legacy.count, 2);
    assert.equal(legacy.analytics.rows.length, 2);

    const health = await (await fetch(`${base}/api/cot/health`)).json();
    assert.equal(health.overallStatus, 'CURRENT');
    const zc = health.markets.find((m: { instrumentId: string }) => m.instrumentId === 'CBOT:ZC');
    assert.equal(zc.reports[0].rowCount, 3);
    assert.equal(zc.reports[0].lastSync.status, 'SUCCESS');
    const brn = health.markets.find((m: { instrumentId: string }) => m.instrumentId === 'ICE:BRN');
    assert.equal(brn.status, 'NOT_REPORTED');

    const markets = await (await fetch(`${base}/api/cot/markets`)).json();
    assert.equal(markets.markets.length, 20);
  });
});

test('GET /api/cot/:instrumentId validates query parameters', async () => {
  await withServer(async (base) => {
    for (const qs of ['type=tff', 'from=2026-1-1', 'from=2026-11-10&to=2026-01-01', 'lookbackWeeks=2', 'lookbackWeeks=abc']) {
      const res = await fetch(`${base}/api/cot/CBOT:ZC?${qs}`);
      assert.equal(res.status, 400, qs);
      assert.equal((await res.json()).error, 'VALIDATION_ERROR');
    }
    const bad = await fetch(`${base}/api/cot/not-an-id`);
    assert.equal(bad.status, 400);
    const robusta = await fetch(`${base}/api/cot/ICE:RC`);
    assert.equal(robusta.status, 422);
    const empty = await (await fetch(`${base}/api/cot/COMEX:GC`)).json();
    assert.equal(empty.count, 0);
    assert.equal(empty.analytics.status, 'INSUFFICIENT_DATA');
  });
});

test('upstream failure → 502 UPSTREAM_ERROR and a FAILED sync log entry', async () => {
  await withServer(async (base, client) => {
    client.fail = 403;
    const res = await post(`${base}/api/cot/sync`, { instrumentId: 'NYMEX:CL' });
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.equal(body.error, 'UPSTREAM_ERROR');
    assert.equal(body.sync.results[0].status, 'FAILED');
    assert.equal(client.calls[0].from, '2022-11-17'); // first sync: 4 years back
    const health = await (await fetch(`${base}/api/cot/health`)).json();
    const cl = health.markets.find((m: { instrumentId: string }) => m.instrumentId === 'NYMEX:CL');
    assert.equal(cl.reports[0].lastSync.status, 'FAILED');
    assert.match(cl.reports[0].lastSync.message, /403/);
    assert.equal(health.overallStatus, 'UNAVAILABLE');
  });
});

test('COT_SOURCE=auto: Socrata 403 → falls back to CFTC files once, records the source used', async () => {
  await withServer(async (base, client, files) => {
    client.fail = 403;
    const res = await post(`${base}/api/cot/sync`, { instrumentId: 'CBOT:ZC', from: '2026-10-01' });
    assert.equal(res.status, 200);
    const { sync } = await res.json();
    assert.equal(sync.status, 'SUCCESS');
    // Socrata is tried once; the second report type goes straight to the files.
    assert.equal(client.calls.length, 1);
    assert.equal(files.calls.length, 2);
    for (const r of sync.results) {
      assert.equal(r.source, 'files');
      assert.equal(r.fallbackReason, 'HTTP 403');
      assert.match(r.message, /Socrata unavailable \(HTTP 403\); used CFTC historical files/);
      assert.match(r.sourceUrl, /^https:\/\/www\.cftc\.gov\/files\/dea\/history\//);
    }
    const health = await (await fetch(`${base}/api/cot/health`)).json();
    const zc = health.markets.find((m: { instrumentId: string }) => m.instrumentId === 'CBOT:ZC');
    assert.equal(zc.reports[0].lastSync.source, 'files');
    const q = await (await fetch(`${base}/api/cot/CBOT:ZC?type=disaggregated&lookbackWeeks=4`)).json();
    assert.deepEqual(q.provenance.dataSources, ['files']);
    assert.equal(q.count, 3);

    // Both upstreams down → FAILED with both reasons.
    files.fail = 503;
    const bad = await post(`${base}/api/cot/sync`, { instrumentId: 'NYMEX:CL' });
    assert.equal(bad.status, 502);
    const body = await bad.json();
    assert.match(body.sync.results[0].message, /Socrata unavailable \(HTTP 403\); CFTC files also failed/);
  }, 'auto');
});

test('COT_SOURCE=socrata never touches the file source; files mode never touches Socrata', async () => {
  await withServer(async (base, client, files) => {
    client.fail = 403;
    assert.equal((await post(`${base}/api/cot/sync`, { instrumentId: 'CBOT:ZC' })).status, 502);
    assert.equal(files.calls.length, 0);
  }, 'socrata');
  await withServer(async (base, client, files) => {
    const { sync } = await (await post(`${base}/api/cot/sync`, { instrumentId: 'CBOT:ZC', from: '2026-10-01' })).json();
    assert.equal(sync.results[0].source, 'files');
    assert.equal(sync.results[0].fallbackReason, null);
    assert.equal(client.calls.length, 0);
    assert.equal(files.calls.length, 2);
  }, 'files');
});
