import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { MacroService } from '../macro/service.ts';
import { FxService } from '../services/fx/service.ts';
import { NewsService } from '../services/news/service.ts';
import { WeatherService } from '../services/weather/service.ts';
import { BenchmarkSeriesService } from '../services/benchmarkSeries.ts';
import { fetchFredCsv } from '../services/marketPulse/service.ts';
import { CftcClient } from '../cot/client.ts';
import { buildDomesticOverview } from '../domestic/service.ts';
import { getContractD1 } from '../services/yahooContractHistory.ts';
import { getYahooCurve, clearYahooCurveCache } from '../services/yahooCurve.ts';
import { instrumentRepository } from '../services/instrumentRegistry.ts';
import { registerFxRoutes } from '../routes/fx.ts';
import { registerNewsRoutes } from '../routes/news.ts';
import { FAULTS, jsonFetch, withEnv, withGlobalFetch, type FetchLike } from './helpers.ts';

const BAD = new Set(['UNAVAILABLE', 'INVALID', 'STALE']);
const T0 = Date.parse('2026-11-24T00:00:00Z');

// ---------------- MacroService ----------------
for (const fault of FAULTS) {
  test(`chaos MacroService: ${fault.name} -> UNAVAILABLE/null everywhere, failure cached only briefly`, async () => {
    let clock = T0;
    const seen: Array<RequestInit | undefined> = [];
    const svc = new MacroService({
      fetchFn: fault.make(seen) as never,
      env: { EIA_API_KEY: 'k', FAS_API_KEY: 'k', YAHOO_ENABLED: 'true' },
      now: () => new Date(clock),
    });
    const eia = await svc.getEia();
    assert.ok(BAD.has(eia.status), `eia ${eia.status}`);
    assert.ok(eia.items.every((i) => i.value === null));
    const wasde = await svc.getWasde();
    assert.ok(BAD.has(wasde.status), `wasde ${wasde.status}`);
    assert.ok(wasde.keyNumbers.every((k) => k.value === null));
    assert.equal((await svc.getEthanol()).value, null);
    assert.equal((await svc.getExportSales('CORN')).value, null);
    assert.equal((await svc.getErsCosts('CORN')).value, null);
    const fx = await svc.getFx();
    assert.ok(fx.items.every((i) => i.value === null), 'no fx value invented');
    for (const init of seen) assert.ok(init?.signal instanceof AbortSignal);

    // within the 60 s failure TTL: no refetch (bounded retries); afterwards: refetched (not poisoned)
    const n = seen.length;
    await svc.getEia();
    await svc.getFx();
    assert.equal(seen.length, n, 'failure is cached briefly');
    clock += 61_000;
    await svc.getEia();
    assert.ok(seen.length > n, 'failure cache expires');
  });
}

test('chaos MacroService: recovery after failure serves real data (cache not poisoned)', async () => {
  let clock = T0;
  let up = false;
  const fetchFn = (async () =>
    up
      ? new Response(JSON.stringify({ response: { data: [] } }), { status: 200 })
      : new Response('<html>down</html>', { status: 503 })) as unknown as FetchLike;
  const svc = new MacroService({ fetchFn: fetchFn as never, env: { EIA_API_KEY: 'k' }, now: () => new Date(clock) });
  assert.ok(BAD.has((await svc.getEia()).status));
  up = true;
  clock += 61_000;
  const again = await svc.getEia();
  assert.ok(BAD.has(again.status)); // empty payload is still not data
  assert.ok(again.items.every((i) => i.value === null));
});

// ---------------- FxService ----------------
for (const fault of FAULTS) {
  test(`chaos FxService: ${fault.name} -> no throw, all values null with reason, cached briefly`, async () => {
    let clock = T0;
    const seen: Array<RequestInit | undefined> = [];
    const svc = new FxService({ fetchFn: fault.make(seen) as never, now: () => new Date(clock) });
    const rates = await svc.getAllRates();
    assert.ok(rates.length > 0);
    for (const r of rates) {
      assert.equal(r.value, null, `${r.pair} must not fabricate a rate`);
      assert.ok(r.reason && r.reason.length > 0, `${r.pair} needs a reason`);
      assert.equal(r.change1w, null);
      assert.equal(r.spark.length, 0);
    }
    for (const init of seen) assert.ok(init?.signal instanceof AbortSignal);
    const n = seen.length;
    await svc.getAllRates();
    assert.equal(seen.length, n);
    clock += 61_000;
    await svc.getAllRates();
    assert.ok(seen.length > n);
  });
}

test('chaos FxService: one source down does not blank the others', async () => {
  const ecb = `<gesmes:Envelope><Cube><Cube time="2026-11-23"><Cube currency="USD" rate="1.05"/><Cube currency="AUD" rate="1.6"/></Cube></Cube></gesmes:Envelope>`;
  const fetchFn = (async (url: unknown) => {
    const u = String(url);
    if (u.includes('ecb.europa.eu')) return new Response(ecb, { status: 200 });
    throw new TypeError('fetch failed'); // all FRED series down
  }) as unknown as FetchLike;
  const rates = await new FxService({ fetchFn: fetchFn as never, now: () => new Date(T0) }).getAllRates();
  const eur = rates.find((r) => r.pair === 'EURUSD')!;
  assert.equal(eur.value, 1.05);
  assert.ok(rates.filter((r) => r.source === 'FRED').every((r) => r.value === null));
});

async function withServer(register: (app: express.Express) => void, fn: (base: string) => Promise<void>) {
  const app = express();
  register(app);
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    void err;
    res.status(500).json({ error: 'INTERNAL' });
  });
  const server = app.listen(0);
  try {
    await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.close();
  }
}

test('chaos routes: /api/fx/rates and /api/news answer JSON 200 while every upstream is down', async () => {
  const down = FAULTS[0].make([]);
  await withServer(
    (app) => {
      registerFxRoutes(app, { service: new FxService({ fetchFn: down as never }) });
      registerNewsRoutes(app, { service: new NewsService({ fetchText: async () => { throw new Error('down'); } }) });
    },
    async (base) => {
      const fx = await fetch(`${base}/api/fx/rates`);
      assert.equal(fx.status, 200);
      const body = (await fx.json()) as { rates: Array<{ value: number | null }> };
      assert.ok(body.rates.every((r) => r.value === null));
      const news = await fetch(`${base}/api/news`);
      assert.equal(news.status, 200);
      assert.deepEqual(((await news.json()) as { items: unknown[] }).items, []);
    }
  );
});

// ---------------- News ----------------
const RSS_OK = `<rss><channel><item><title>Corn futures rally</title><link>https://example.com/a</link><pubDate>Mon, 23 Nov 2026 10:00:00 GMT</pubDate><description>corn</description></item></channel></rss>`;

for (const payload of ['<html>blocked</html>', '', '[]', '{}', 'not xml at all', '<rss><channel><item><title>x</title><link>javascript:alert(1)</link><pubDate>bad</pubDate></item></channel></rss>']) {
  test(`chaos News: feed body ${JSON.stringify(payload).slice(0, 30)} -> empty items, no throw`, async () => {
    const svc = new NewsService({ fetchText: async () => payload });
    const res = await svc.getNews();
    assert.deepEqual(res.items, []);
  });
}

test('chaos News: total failure does not poison cache; recovery and keep-last-good both work', async () => {
  let clock = T0;
  let mode: 'ok' | 'down' = 'down';
  let calls = 0;
  const svc = new NewsService({
    ttlMs: 1000,
    now: () => clock,
    fetchText: async () => {
      calls++;
      if (mode === 'down') throw new Error('HTTP 500');
      return RSS_OK;
    },
  });
  assert.deepEqual((await svc.getNews()).items, []);
  mode = 'ok';
  clock += 2000;
  const good = await svc.getNews();
  assert.ok(good.items.length >= 1);
  mode = 'down';
  clock += 2000;
  const kept = await svc.getNews();
  assert.deepEqual(kept.items.map((i) => i.id), good.items.map((i) => i.id), 'last good copy kept, never invented');
  assert.ok(calls <= 7 * 3 + 1);
});

test('chaos News: default fetch sends timeout signal and a UA without personal info; summarizer failure tolerated', async () => {
  const seen: Array<RequestInit | undefined> = [];
  await withGlobalFetch(
    (async (_u: unknown, init?: RequestInit) => {
      seen.push(init);
      return new Response(RSS_OK, { status: 200 });
    }) as unknown as FetchLike,
    async () => {
      const svc = new NewsService({ summarizer: async () => { throw new Error('gemini down'); } });
      const res = await svc.getNews();
      assert.ok(res.items.every((i) => i.summaryVi === null));
    }
  );
  assert.ok(seen.length > 0);
  for (const init of seen) {
    assert.ok(init?.signal instanceof AbortSignal);
    const ua = String((init?.headers as Record<string, string>)['User-Agent']);
    assert.ok(ua && !/@|windows|users[\\/]/i.test(ua));
  }
});

// ---------------- Weather (Open-Meteo) ----------------
for (const [name, fetchJson] of [
  ['network error', async () => { throw new TypeError('fetch failed'); }],
  ['HTTP 500', async () => { throw new Error('Open-Meteo HTTP 500'); }],
  ['empty array', async () => []],
  ['empty object', async () => ({})],
  ['null', async () => null],
  ['html string', async () => '<html></html>'],
] as Array<[string, () => Promise<unknown>]>) {
  test(`chaos Weather: ${name} -> rejects (route gives JSON error) or empty regions, never fabricated regions`, async () => {
    const svc = new WeatherService({ fetchJson, store: null, now: () => T0 });
    const res = await svc.getRegions().catch(() => null);
    if (res) assert.equal(res.regions.length, 0);
    // a later healthy call must not be blocked by a poisoned in-flight/cached failure
    const again = await svc.getRegions().catch(() => null);
    if (again) assert.equal(again.regions.length, 0);
  });
}

test('chaos Weather: NaN / null / negative daily values yield no regions', async () => {
  const bad = {
    daily: { time: ['2026-11-24'], precipitation_sum: [Number.NaN], temperature_2m_max: [null], temperature_2m_min: [-999] },
  };
  const svc = new WeatherService({ fetchJson: async () => new Array(200).fill(bad), store: null, now: () => T0 });
  const res = await svc.getRegions().catch(() => null);
  if (res) assert.equal(res.regions.length, 0);
});

// ---------------- Benchmark series (FRED CSV) ----------------
for (const fault of FAULTS) {
  test(`chaos BenchmarkSeries: ${fault.name} -> empty series with honest note, nothing cached`, async () => {
    const seen: Array<RequestInit | undefined> = [];
    const svc = new BenchmarkSeriesService({ fetchFn: fault.make(seen) as never, now: () => T0 });
    const list = svc.list();
    assert.ok(list.length > 0);
    const out = await svc.get(list[0].instrumentId);
    assert.ok(out);
    assert.equal(out!.points.length, 0);
    for (const init of seen) assert.ok(init?.signal instanceof AbortSignal);
  });
}

test('chaos BenchmarkSeries: junk CSV rows (negative/zero/NaN) never become points', async () => {
  const csv = 'observation_date,X\n2026-01-01,-5\n2026-02-01,0\n2026-03-01,NaN\n2026-04-01,.\n2026-05-01,\n';
  const svc = new BenchmarkSeriesService({ fetchFn: (async () => ({ ok: true, status: 200, text: async () => csv })) as never, now: () => T0 });
  const list = svc.list();
  const out = await svc.get(list[0].instrumentId);
  assert.equal(out!.points.length, 0);
});

// ---------------- Market pulse FRED fetcher ----------------
test('chaos MarketPulse fetchFredCsv: failures throw (caller records warning); html/empty -> []', async () => {
  for (const fault of FAULTS) {
    const seen: Array<RequestInit | undefined> = [];
    const r = await withGlobalFetch(fault.make(seen), () => fetchFredCsv('DGS10').then((v) => v, () => 'threw' as const));
    if (r !== 'threw') assert.deepEqual(r, [], fault.name);
    for (const init of seen) assert.ok(init?.signal instanceof AbortSignal);
  }
});

// ---------------- CFTC COT client ----------------
for (const fault of FAULTS) {
  test(`chaos CftcClient: ${fault.name} -> rejects with bounded attempts, never hangs, no records`, async () => {
    const seen: Array<RequestInit | undefined> = [];
    const client = new CftcClient({ fetchImpl: fault.make(seen), sleep: async () => {}, maxAttempts: 3, appToken: null });
    const res = await client.fetchReports({ marketCode: '002602', from: '2026-01-01', reportType: 'DISAGGREGATED' }).then(
      (r) => r,
      () => null
    );
    if (res) assert.equal(res.records.length, 0, 'empty is allowed, invented rows are not');
    assert.ok(seen.length <= 3, `attempts ${seen.length}`);
    for (const init of seen) assert.ok(init?.signal instanceof AbortSignal);
  });
}

// ---------------- Domestic overview ----------------
test('chaos Domestic: FX source throws and candle store throws -> overview without fx/basis, no throw', async () => {
  const repo = {
    latest: () => ({ commodity: 'COFFEE', region: 'DAK_LAK', date: '2026-11-20', price: 100000, unit: 'VND/kg', source: 'manual' }),
    history: () => [{ date: '2026-11-20', price: 100000, unit: 'VND/kg' }],
  };
  const out = await buildDomesticOverview({
    repo: repo as never,
    candles: { queryCandles: async () => { throw new Error('db locked'); } } as never,
    macro: { getFx: async () => { throw new Error('vcb down'); } },
    now: () => new Date(T0),
  });
  assert.equal(out.fx, null);
  assert.ok(out.items.every((i) => i.basis === null && i.intl === null));
});

test('chaos Domestic: NaN / negative / zero VCB rate is ignored (no conversion)', async () => {
  for (const value of [Number.NaN, -1, 0, null]) {
    const out = await buildDomesticOverview({
      repo: { latest: () => null, history: () => [] } as never,
      candles: null,
      macro: { getFx: async () => ({ items: [{ id: 'USDVND_VCB', value, asOf: null, sourceName: 'x', sourceUrl: 'u', status: 'UNAVAILABLE' }] }) },
      now: () => new Date(T0),
    });
    assert.equal(out.fx, null, `value=${String(value)}`);
  }
});

// ---------------- Yahoo helpers (opt-in) ----------------
test('chaos Yahoo contract D1 + curve: every fault -> UNAVAILABLE (never throws, never cached)', async () => {
  await withEnv({ YAHOO_ENABLED: 'true' }, async () => {
    const inst = (await instrumentRepository.findBySymbol('ZC'))!;
    for (const fault of FAULTS) {
      const seen: Array<RequestInit | undefined> = [];
      const d1 = await getContractD1(inst, '2026-12', { fetchFn: fault.make(seen) });
      assert.equal(d1.status, 'UNAVAILABLE', fault.name);
      clearYahooCurveCache();
      const curve = await getYahooCurve(inst, 3, 'UNVERIFIED', { fetchFn: fault.make(seen) });
      assert.equal(curve.status, 'UNAVAILABLE', fault.name);
      for (const init of seen) assert.ok(init?.signal instanceof AbortSignal);
    }
    const n: Array<RequestInit | undefined> = [];
    clearYahooCurveCache();
    const ok = await getYahooCurve(inst, 3, 'UNVERIFIED', { fetchFn: jsonFetch({ chart: { result: [{ meta: { exchangeName: 'CBT', currency: 'USX', instrumentType: 'FUTURE' } }] } }, n) });
    assert.notEqual(ok.status, undefined);
  });
});
