import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { registerBenchmarkRoutes } from './benchmarks.ts';
import {
  BENCHMARK_INSTRUMENTS,
  BenchmarkSeriesService,
  benchmarkDefForInstrument,
  buildBenchmarkSeries,
} from '../services/benchmarkSeries.ts';
import { parseFredCsv } from '../providers/fredBenchmarks.ts';

const CSV: Record<string, string> = {
  PCOFFROBUSDM: 'observation_date,PCOFFROBUSDM\n2026-08-01,162.10\n2026-09-01,.\n2026-10-01,167.51\n',
  DCOILBRENTEU: 'observation_date,DCOILBRENTEU\n2026-11-16,91.80\n2026-11-17,.\n2026-11-18,92.94\n',
  PIORECRUSDM: 'observation_date,PIORECRUSDM\n2026-09-01,105.5\n2026-10-01,107.25\n',
};

function stubFetch(calls: string[]) {
  return async (url: string) => {
    calls.push(url);
    const id = new URL(url).searchParams.get('id') ?? '';
    const body = CSV[id];
    return body
      ? { ok: true, status: 200, text: async () => body }
      : { ok: false, status: 503, text: async () => '' };
  };
}

test('all six benchmark-only instruments map to a series definition', () => {
  assert.deepEqual(Object.keys(BENCHMARK_INSTRUMENTS).sort(), ['CME:TIO', 'ICE:BRN', 'ICE:CT', 'ICE:RC', 'MXV:JRU', 'SGX:FEF']);
  for (const id of Object.keys(BENCHMARK_INSTRUMENTS)) assert.ok(benchmarkDefForInstrument(id), id);
  assert.equal(benchmarkDefForInstrument('CBOT:ZS'), null);
});

test('buildBenchmarkSeries converts robusta cents/lb to USD/MT exactly and keeps native unit', () => {
  const def = benchmarkDefForInstrument('ICE:RC')!;
  const s = buildBenchmarkSeries('ICE:RC', def, parseFredCsv(CSV.PCOFFROBUSDM));
  assert.equal(s.frequency, 'monthly');
  assert.equal(s.unit, 'USD/MT');
  assert.equal(s.nativeUnit, 'cents/lb');
  assert.equal(s.points.length, 2);
  assert.equal(s.points[0].value, Math.round(162.1 * 22.0462262185 * 100) / 100);
  assert.equal(s.lastUpdated, '2026-10-01');
  assert.equal(s.reason, null);
});

test('buildBenchmarkSeries with no observations is empty with a reason', () => {
  const s = buildBenchmarkSeries('ICE:CT', benchmarkDefForInstrument('ICE:CT')!, []);
  assert.deepEqual(s.points, []);
  assert.equal(s.lastUpdated, null);
  assert.ok(s.reason);
});

test('GET /api/benchmarks/:id serves series, 404 for unmapped, empty+reason on upstream failure, caches', async () => {
  const calls: string[] = [];
  const service = new BenchmarkSeriesService({ fetchFn: stubFetch(calls), now: () => 1_000 });
  const app = express();
  registerBenchmarkRoutes(app, { service });
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const list = await (await fetch(`${base}/api/benchmarks`)).json();
    assert.equal(list.items.length, 6);

    const brn = await (await fetch(`${base}/api/benchmarks/ICE:BRN`)).json();
    assert.equal(brn.seriesId, 'DCOILBRENTEU');
    assert.equal(brn.frequency, 'daily');
    assert.equal(brn.unit, 'USD/barrel');
    assert.deepEqual(brn.points, [
      { date: '2026-11-16', value: 91.8 },
      { date: '2026-11-18', value: 92.94 },
    ]);
    assert.equal(brn.lastUpdated, '2026-11-18');
    assert.ok(brn.sourceUrl.endsWith('/DCOILBRENTEU'));

    // iron ore backs both TIO and FEF, fetched once (cache)
    await fetch(`${base}/api/benchmarks/CME:TIO`);
    const fef = await (await fetch(`${base}/api/benchmarks/sgx:fef`)).json();
    assert.equal(fef.points.length, 2);
    assert.equal(calls.filter((c) => c.includes('PIORECRUSDM')).length, 1);

    const rcShort = await (await fetch(`${base}/api/benchmarks/RC`)).json();
    assert.equal(rcShort.instrumentId, 'ICE:RC');
    assert.equal(rcShort.seriesId, 'PCOFFROBUSDM');
    assert.equal(rcShort.points.length, 2);

    const none = await fetch(`${base}/api/benchmarks/CBOT:ZS`);
    assert.equal(none.status, 404);

    // CT is not in the stub -> upstream 503 -> honest empty result, never invented data
    const ct = await (await fetch(`${base}/api/benchmarks/ICE:CT`)).json();
    assert.deepEqual(ct.points, []);
    assert.equal(ct.lastUpdated, null);
    assert.match(ct.reason, /PCOTTINDUSDM/);
  } finally {
    server.close();
  }
});
