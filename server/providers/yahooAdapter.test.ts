import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  classifyYahooFreshness,
  parseYahooDailyCandles,
  YAHOO_CONTRACT_LABEL,
  YAHOO_SYMBOL_MAP,
  YAHOO_USER_AGENT,
  YahooFinanceAdapter,
  yahooUnitConversion,
  type YahooAdapterOptions,
} from './yahooAdapter.ts';
import { ProviderRegistry } from './registry.ts';
import { InMemoryCandleRepository } from '../storage/candleRepository.ts';
import { INITIAL_INSTRUMENTS } from '../data/instruments.ts';
import { historicalCandleStore } from '../services/candleStore.ts';

/** One real response (see __fixtures__/yahoo/README.md for URL and fetch time). */
const FIXTURE_TEXT = readFileSync(
  fileURLToPath(new URL('./__fixtures__/yahoo/ZC_F_5d_1d.json', import.meta.url)),
  'utf8'
);
const fixture = () => JSON.parse(FIXTURE_TEXT);
const FIXTURE_MARKET_TIME_MS = 1794938279 * 1000; // 2026-11-17T17:57:59Z
const MIN = 60_000;

const OTHER_KEYS = [
  'TWELVEDATA_API_KEY',
  'FMP_API_KEY',
  'COMMODITIES_API_KEY',
  'ALPHAVANTAGE_API_KEY',
  'EIA_API_KEY',
  'USDA_API_KEY',
  'MXV_API_KEY',
  'MXV_API_URL',
  'MARKET_DATA_PROVIDER_URL',
  'MARKET_DATA_PROVIDER_KEY',
];

async function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void>): Promise<void> {
  const all: Record<string, string | undefined> = { ...Object.fromEntries(OTHER_KEYS.map((k) => [k, undefined])), ...vars };
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(all)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    await fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

/** ZC fixture re-labelled for another symbol (exchange/currency/price), for multi-symbol tests. */
function variant(symbol: string, exchangeName: string, currency: string, price: number) {
  const body = fixture();
  Object.assign(body.chart.result[0].meta, { symbol, exchangeName, currency, regularMarketPrice: price });
  return body;
}

interface Harness {
  options: YahooAdapterOptions;
  calls: Array<{ url: string; userAgent: string | null }>;
  sleeps: number[];
  clock: { t: number };
}

function harness(
  respond: (url: string, callIndex: number) => Response | Promise<Response>,
  startMs = FIXTURE_MARKET_TIME_MS + 12 * MIN
): Harness {
  const calls: Harness['calls'] = [];
  const sleeps: number[] = [];
  const clock = { t: startMs };
  const fetchFn: typeof fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({ url, userAgent: headers.get('user-agent') });
    return respond(url, calls.length - 1);
  };
  return {
    calls,
    sleeps,
    clock,
    options: {
      fetchFn,
      now: () => clock.t,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock.t += ms;
      },
    },
  };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

test('disabled by default: no fetch, UNAVAILABLE quote, UNCONFIGURED health, registry ignores Yahoo', async () => {
  await withEnv({ YAHOO_ENABLED: undefined }, async () => {
    const h = harness(() => json(fixture()));
    const adapter = new YahooFinanceAdapter(h.options);
    const q = await adapter.getQuote('ZC');
    assert.equal(q.status, 'UNAVAILABLE');
    assert.equal(q.price, null);
    assert.match(q.statusReason ?? '', /YAHOO_ENABLED=true/);
    const candles = await adapter.getCandles('ZC');
    assert.equal(candles.candles.length, 0);
    const health = await adapter.getProviderStatus();
    assert.equal(health.connectionState, 'UNCONFIGURED');
    assert.equal(health.sourceQuality, 'UNOFFICIAL');

    const registry = new ProviderRegistry({ yahoo: h.options });
    const zc = INITIAL_INSTRUMENTS.find((i) => i.exchangeSymbol === 'ZC')!;
    const rq = await registry.getQuoteForInstrument(zc);
    assert.notEqual(rq.sourceQuality, 'UNOFFICIAL');
    assert.equal(h.calls.length, 0, 'no request may leave the server while disabled');
  });

  await withEnv({ YAHOO_ENABLED: 'yes' }, async () => {
    const h = harness(() => json(fixture()));
    const q = await new YahooFinanceAdapter(h.options).getQuote('ZC');
    assert.equal(q.status, 'UNAVAILABLE', 'only the literal "true" enables the adapter');
    assert.equal(h.calls.length, 0);
  });
});

test('real ZC=F fixture: price in cents/bushel with market timestamp, DELAYED → STALE, never CURRENT', async () => {
  await withEnv({ YAHOO_ENABLED: 'true' }, async () => {
    const h = harness(() => json(fixture()));
    const adapter = new YahooFinanceAdapter(h.options);
    const q = await adapter.getQuote('ZC');
    assert.equal(h.calls.length, 1);
    assert.match(h.calls[0].url, /^https:\/\/query1\.finance\.yahoo\.com\/v8\/finance\/chart\/ZC%3DF\?range=1d&interval=1d$/);
    assert.equal(h.calls[0].userAgent, YAHOO_USER_AGENT);
    assert.equal(q.price, 448.75, 'Yahoo USX (cents) == our cents/bushel: no conversion');
    assert.equal(q.unit, 'cents/bushel');
    assert.equal(q.timestamp, '2026-11-17T17:57:59.000Z', 'regularMarketTime, not retrieval time');
    assert.equal(q.status, 'DELAYED');
    assert.equal(q.delayMinutes, 10);
    assert.equal(q.sourceQuality, 'UNOFFICIAL');
    assert.equal(q.contract, YAHOO_CONTRACT_LABEL);
    assert.equal(q.source, 'YAHOO_UNOFFICIAL:ZC=F');
    assert.equal(q.bid, null);
    assert.equal(q.ask, null);
    assert.equal(q.openInterest, null);
    assert.equal(q.volume, 168915);

    // Cached for 60 s: no second request.
    h.clock.t += 30_000;
    const cached = await adapter.getQuote('ZC');
    assert.equal(h.calls.length, 1, 'served from cache');
    assert.equal(cached.status, 'DELAYED');

    // Beyond delay (10 min) + margin (15 min): same market timestamp is now STALE.
    h.clock.t = FIXTURE_MARKET_TIME_MS + 26 * MIN;
    const later = await adapter.getQuote('ZC');
    assert.equal(h.calls.length, 2, 'cache expired → refetched');
    assert.equal(later.status, 'STALE');
    assert.equal(later.price, 448.75);
    assert.equal(later.timestamp, q.timestamp);
  });
});

test('freshness thresholds account for the declared exchange delay', () => {
  const ts = '2026-11-17T17:00:00.000Z';
  const at = (minutes: number) => Date.parse(ts) + minutes * MIN;
  assert.equal(classifyYahooFreshness(ts, 10, at(0)), 'DELAYED', 'even a zero-age Yahoo quote is never CURRENT');
  assert.equal(classifyYahooFreshness(ts, 10, at(25)), 'DELAYED');
  assert.equal(classifyYahooFreshness(ts, 10, at(25.1)), 'STALE');
  assert.equal(classifyYahooFreshness(ts, 30, at(44)), 'DELAYED');
  assert.equal(classifyYahooFreshness(ts, 30, at(46)), 'STALE');
  assert.equal(classifyYahooFreshness(null, 10, at(0)), 'UNAVAILABLE');
  assert.equal(classifyYahooFreshness(ts, 10, at(-1)), 'INVALID', 'future market timestamp');
  // Outside the reported trading period the last price is STALE even if recent.
  const period = { start: at(-600) / 1000, end: at(5) / 1000 };
  assert.equal(classifyYahooFreshness(ts, 10, at(6), period), 'STALE');
  assert.equal(classifyYahooFreshness(ts, 10, at(4), period), 'DELAYED');
});

test('unit conversion: cents vs dollars per symbol, explicit refusal otherwise', async () => {
  assert.deepEqual(yahooUnitConversion('USX', 'cents/bushel'), { ok: true, factor: 1, note: 'Yahoo USX matches cents/bushel; no conversion.' });
  const toUsd = yahooUnitConversion('USX', 'USD/lb');
  assert.ok(toUsd.ok && toUsd.factor === 0.01);
  const toCents = yahooUnitConversion('USD', 'cents/lb');
  assert.ok(toCents.ok && toCents.factor === 100);
  assert.equal(yahooUnitConversion('EUR', 'USD/MT').ok, false);
  assert.equal(yahooUnitConversion(undefined, 'USD/MT').ok, false);
  assert.equal(yahooUnitConversion('USD', 'index points').ok, false);

  // Every mapped symbol's recorded Yahoo currency is consistent with our quotationUnit (factor 1).
  for (const [sym, m] of Object.entries(YAHOO_SYMBOL_MAP)) {
    const inst = INITIAL_INSTRUMENTS.find((i) => i.exchangeSymbol === sym);
    assert.ok(inst, `instrument ${sym} exists`);
    const conv = yahooUnitConversion(m.expectedCurrency, inst.specification.quotationUnit);
    assert.ok(conv.ok && conv.factor === 1, `${sym}: Yahoo ${m.expectedCurrency} vs ${inst.specification.quotationUnit}`);
  }

  // Runtime: Yahoo changing ZC=F to USD (unit no longer confirmed) is refused, not guessed.
  await withEnv({ YAHOO_ENABLED: 'true' }, async () => {
    const h = harness(() => json(variant('ZC=F', 'CBT', 'USD', 4.4875)));
    const q = await new YahooFinanceAdapter(h.options).getQuote('ZC');
    assert.equal(q.status, 'INVALID');
    assert.equal(q.price, null);
    assert.match(q.statusReason ?? '', /currency "USD", expected "USX"/);

    const h2 = harness(() => json(variant('ZC=F', 'NYM', 'USX', 448)));
    const q2 = await new YahooFinanceAdapter(h2.options).getQuote('ZC');
    assert.equal(q2.status, 'INVALID');
    assert.match(q2.statusReason ?? '', /exchange "NYM", expected "CBT"/);
  });
});

test('unsupported instruments (RC, BRN, TIO, CT) are refused with a reason and never fetched', async () => {
  await withEnv({ YAHOO_ENABLED: 'true' }, async () => {
    const h = harness(() => json(fixture()));
    const adapter = new YahooFinanceAdapter(h.options);
    for (const sym of ['RC', 'BRN', 'TIO', 'CT']) {
      const q = await adapter.getQuote(sym);
      assert.equal(q.status, 'UNAVAILABLE', sym);
      assert.equal(q.price, null);
      assert.match(q.statusReason ?? '', /^DATA_UNAVAILABLE — UNSUPPORTED|UNSUPPORTED/, sym);
      const inst = INITIAL_INSTRUMENTS.find((i) => i.exchangeSymbol === sym)!;
      assert.equal(adapter.supports(inst), false);
    }
    assert.match(YahooFinanceAdapter.unsupportedReason('RC'), /404/);
    assert.match(YahooFinanceAdapter.unsupportedReason('JRU'), /Rubber/);
    assert.equal(h.calls.length, 0);
  });
});

test('polite rate limit (≤1 req/s, serialised) and retry with backoff on 429/5xx', async () => {
  await withEnv({ YAHOO_ENABLED: 'true' }, async () => {
    const h = harness((url) =>
      url.includes('CL%3DF') ? json(variant('CL=F', 'NYM', 'USD', 86.38)) : json(fixture())
    );
    const adapter = new YahooFinanceAdapter(h.options);
    const [zc, cl] = await Promise.all([adapter.getQuote('ZC'), adapter.getQuote('CL')]);
    assert.equal(zc.price, 448.75);
    assert.equal(cl.price, 86.38);
    assert.equal(cl.unit, 'USD/barrel');
    assert.equal(cl.delayMinutes, 30);
    assert.equal(h.calls.length, 2);
    assert.deepEqual(h.sleeps, [1000], 'second request waited for the 1 s spacing');

    // 429 (Retry-After 2 s) → 503 (backoff 2^1 s) → 200.
    const r = harness((_url, i) =>
      i === 0 ? json({}, 429, { 'retry-after': '2' }) : i === 1 ? json({}, 503) : json(fixture())
    );
    const q = await new YahooFinanceAdapter(r.options).getQuote('ZC');
    assert.equal(q.price, 448.75);
    assert.equal(r.calls.length, 3);
    assert.deepEqual(r.sleeps, [2000, 2000]);

    // Persistent 5xx: gives up after maxRetries, fails closed.
    const f = harness(() => json({}, 500));
    const failing = new YahooFinanceAdapter({ ...f.options, maxRetries: 2, backoffBaseMs: 500 });
    const fq = await failing.getQuote('ZC');
    assert.equal(fq.status, 'UNAVAILABLE');
    assert.equal(fq.price, null);
    assert.match(fq.statusReason ?? '', /HTTP 500 after 3 attempt/);
    assert.equal(f.calls.length, 3);
    // backoff 500 → rate-limit top-up 500 (1 s spacing still applies to retries) → backoff 1000.
    assert.deepEqual(f.sleeps, [500, 500, 1000]);
    assert.equal((await failing.getProviderStatus()).connectionState, 'DEGRADED');

    // 404 is not retried.
    const n = harness(() => json({ chart: { result: null, error: { code: 'Not Found', description: 'No data found' } } }, 404));
    const nq = await new YahooFinanceAdapter(n.options).getQuote('ZC');
    assert.equal(nq.status, 'UNAVAILABLE');
    assert.equal(n.calls.length, 1);
  });
});

test('daily candles from the real fixture: exchange-local dates, in-progress session bar dropped', () => {
  const zc = INITIAL_INSTRUMENTS.find((i) => i.exchangeSymbol === 'ZC')!;
  const result = fixture().chart.result[0];
  const during = parseYahooDailyCandles(result, zc, YAHOO_SYMBOL_MAP.ZC, FIXTURE_MARKET_TIME_MS);
  assert.ok(during.ok);
  assert.deepEqual(
    during.candles.map((c) => [c.timestamp, c.close]),
    [
      ['2026-11-12T00:00:00.000Z', 442.5],
      ['2026-11-13T00:00:00.000Z', 445.5],
      ['2026-11-16T00:00:00.000Z', 448.75],
    ]
  );
  assert.equal(during.dropped, 1);
  assert.ok(during.candles.every((c) => c.openInterest === null && c.status === 'HISTORICAL'));

  const after = parseYahooDailyCandles(result, zc, YAHOO_SYMBOL_MAP.ZC, Date.parse('2026-11-18T06:00:00Z'));
  assert.ok(after.ok);
  assert.equal(after.candles.length, 4);
});

test('registry: Yahoo is last in the live chain; STALE fallback; syncAll persists a VENDOR_YAHOO series', async () => {
  await withEnv({ YAHOO_ENABLED: 'true' }, async () => {
    const zc = INITIAL_INSTRUMENTS.find((i) => i.exchangeSymbol === 'ZC')!;
    const h = harness(() => json(fixture()));
    const registry = new ProviderRegistry({ yahoo: h.options });
    const q = await registry.getQuoteForInstrument(zc);
    assert.equal(q.status, 'DELAYED');
    assert.equal(q.sourceQuality, 'UNOFFICIAL');
    assert.equal(q.price, 448.75);

    // Market closed / beyond delay margin: last price shown as STALE with its timestamp.
    const s = harness(() => json(fixture()), FIXTURE_MARKET_TIME_MS + 3 * 60 * MIN);
    const staleRegistry = new ProviderRegistry({ yahoo: s.options });
    const sq = await staleRegistry.getQuoteForInstrument(zc);
    assert.equal(sq.status, 'STALE');
    assert.equal(sq.price, 448.75);
    assert.equal(sq.timestamp, '2026-11-17T17:57:59.000Z');

    const health = await registry.getAllHealth();
    const yahoo = health.find((p) => p.providerId === 'YAHOO_UNOFFICIAL');
    assert.ok(yahoo);
    assert.equal(yahoo.dataStatus, 'DELAYED');

    const repo = new InMemoryCandleRepository();
    const d = harness((url) => {
      assert.match(url, /range=2y&interval=1d$/);
      return json(fixture());
    }, Date.parse('2026-11-18T06:00:00Z'));
    const syncRegistry = new ProviderRegistry({ candles: repo, yahoo: d.options });
    const res = await syncRegistry.syncAll({ symbol: 'ZC' });
    const outcome = res.outcomes.find((o) => o.providerId === 'YAHOO_UNOFFICIAL');
    assert.equal(outcome?.status, 'CONNECTED');
    const persisted = res.persistence.find((p) => p.providerId === 'YAHOO_UNOFFICIAL');
    assert.equal(persisted?.status, 'PERSISTED');
    assert.equal(persisted?.contractCode, 'VENDOR_YAHOO');
    assert.equal(persisted?.rowsWritten, 4);
    const [ds] = await repo.listDatasets({ instrumentId: 'CBOT:ZC' });
    assert.equal(ds.contractCode, 'VENDOR_YAHOO');
    assert.equal(ds.sourceQuality, 'UNOFFICIAL');
    assert.equal(ds.priceUnit, 'cents/bushel');
  });
});

test('quotes are stale-while-revalidate: slow Yahoo never blocks, one refresh per symbol, labels stay honest', async () => {
  await withEnv({ YAHOO_ENABLED: 'true' }, async () => {
    // Earlier tests persist ZC candles into the process-wide store; start from a truly cold cache.
    historicalCandleStore.clearAll();
    const zc = INITIAL_INSTRUMENTS.find((i) => i.exchangeSymbol === 'ZC')!;
    let release!: () => void;
    let gate = new Promise<void>((r) => (release = r));
    const h = harness(async () => {
      await gate;
      return json(fixture());
    });
    const registry = new ProviderRegistry({ yahoo: h.options, yahooQuoteWaitMs: 20 });

    // Cold cache, Yahoo hanging: answer quickly without a price, never DELAYED/CURRENT.
    const started = performance.now();
    const [a, b] = await Promise.all([registry.getQuoteForInstrument(zc), registry.getQuoteForInstrument(zc)]);
    assert.ok(performance.now() - started < 1000, 'did not wait for Yahoo');
    for (const q of [a, b]) {
      assert.equal(q.price, null);
      assert.notEqual(q.status, 'DELAYED');
      assert.notEqual(q.status, 'CURRENT');
    }
    assert.equal(h.calls.length, 1, 'concurrent requests share one background refresh');

    // Refresh lands in the background; the next read is served from cache.
    release();
    await registry.waitForBackgroundRefreshes();
    const warm = await registry.getQuoteForInstrument(zc);
    assert.equal(warm.status, 'DELAYED');
    assert.equal(warm.price, 448.75);
    assert.equal(h.calls.length, 1);

    // TTL expired and the market timestamp is now beyond delay + margin: the cached price is returned
    // immediately, re-labelled STALE (not DELAYED), while a refresh runs in the background.
    gate = new Promise<void>((r) => (release = r));
    h.clock.t = FIXTURE_MARKET_TIME_MS + 40 * MIN;
    const stale = await registry.getQuoteForInstrument(zc);
    assert.equal(stale.status, 'STALE');
    assert.equal(stale.price, 448.75);
    assert.equal(stale.timestamp, '2026-11-17T17:57:59.000Z', 'market timestamp, not retrieval time');
    assert.match(stale.statusReason ?? '', /refreshing in background/);
    assert.equal(h.calls.length, 2);
    release();
    await registry.waitForBackgroundRefreshes();
  });
});

test('failed background refresh backs off instead of refetching on every request', async () => {
  await withEnv({ YAHOO_ENABLED: 'true' }, async () => {
    const zc = INITIAL_INSTRUMENTS.find((i) => i.exchangeSymbol === 'ZC')!;
    const h = harness(() => json({}, 500));
    const adapter = new YahooFinanceAdapter({ ...h.options, maxRetries: 0 });
    const first = await adapter.getQuoteStaleWhileRevalidate(zc, 1000);
    assert.equal(first.quote.price, null);
    assert.equal(h.calls.length, 1);
    const second = await adapter.getQuoteStaleWhileRevalidate(zc, 1000);
    assert.equal(second.quote.price, null);
    assert.match(second.quote.statusReason ?? '', /paused after failure/);
    assert.equal(h.calls.length, 1, 'no new request during the back-off window');
    h.clock.t += 61_000;
    await adapter.getQuoteStaleWhileRevalidate(zc, 1000);
    assert.equal(h.calls.length, 2, 'retried after one TTL');
  });
});
