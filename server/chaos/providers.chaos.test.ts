import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AlphaVantageAdapter,
  CommoditiesApiAdapter,
  ConfigurableRestFeedAdapter,
  EiaEnergyAdapter,
  FmpCommoditiesAdapter,
  FredMacroAdapter,
  TwelveDataAdapter,
  UsdaQuickStatsAdapter,
} from '../providers/externalAdapters.ts';
import { YahooFinanceAdapter } from '../providers/yahooAdapter.ts';
import { instrumentRepository } from '../services/instrumentRegistry.ts';
import { FAULTS, jsonFetch, malformedBodies, withEnv, type FetchLike } from './helpers.ts';

const KEYS = {
  TWELVEDATA_API_KEY: 'k1',
  FMP_API_KEY: 'k2',
  COMMODITIES_API_KEY: 'k3',
  ALPHAVANTAGE_API_KEY: 'k4',
  EIA_API_KEY: 'k5',
  USDA_API_KEY: 'k6',
  FRED_API_KEY: 'k7',
  CHAOS_URL: 'https://feed.invalid',
  CHAOS_KEY: 'k8',
};

const restFeed = (f: FetchLike) =>
  new ConfigurableRestFeedAdapter({
    providerId: 'THIRD_PARTY_FEED',
    providerName: 'chaos',
    urlEnv: 'CHAOS_URL',
    keyEnv: 'CHAOS_KEY',
    exchanges: ['CBOT'],
    unconfiguredMessage: 'n/a',
    fetchFn: f,
  });

type Quoter = { name: string; sym: string; build: (f: FetchLike) => { getQuote(s: string): Promise<{ price: number | null; status: string }> } };
const quoters: Quoter[] = [
  { name: 'TwelveData', sym: 'GC', build: (f) => new TwelveDataAdapter(f) },
  { name: 'FMP', sym: 'CL', build: (f) => new FmpCommoditiesAdapter(f) },
  { name: 'CommoditiesApi', sym: 'RC', build: (f) => new CommoditiesApiAdapter(f) },
  { name: 'AlphaVantage', sym: 'RC', build: (f) => new AlphaVantageAdapter(f) },
  { name: 'RestFeed', sym: 'ZC', build: restFeed },
];

const FAIL_STATUSES = new Set(['UNAVAILABLE', 'INVALID', 'STALE']);

for (const q of quoters) {
  for (const fault of FAULTS) {
    test(`chaos ${q.name}.getQuote: ${fault.name} -> no throw, null price, UNAVAILABLE/INVALID`, async () => {
      await withEnv(KEYS, async () => {
        const seen: Array<RequestInit | undefined> = [];
        const quote = await q.build(fault.make(seen)).getQuote(q.sym);
        assert.equal(quote.price, null, `${q.name}/${fault.name} must not fabricate price`);
        assert.ok(FAIL_STATUSES.has(quote.status), `status=${quote.status}`);
        for (const init of seen) assert.ok(init?.signal instanceof AbortSignal, 'every fetch carries an AbortSignal timeout');
        assert.ok(seen.length <= 3, 'retries bounded');
      });
    });
  }
  for (const m of malformedBodies()) {
    test(`chaos ${q.name}.getQuote: malformed ${m.name} -> no fabricated price`, async () => {
      await withEnv(KEYS, async () => {
        const quote = await q.build(jsonFetch(m.body)).getQuote(q.sym);
        if (quote.price !== null) {
          assert.ok(Number.isFinite(quote.price) && quote.price > 0, `bad price leaked: ${quote.price}`);
        }
      });
    });
  }
}

for (const fault of FAULTS) {
  test(`chaos candles (TwelveData/FMP/AlphaVantage/RestFeed): ${fault.name} -> empty candles, not AVAILABLE`, async () => {
    await withEnv(KEYS, async () => {
      const f = fault.make([]);
      const results = [
        await new TwelveDataAdapter(f).getCandles('GC', 'D1'),
        await new FmpCommoditiesAdapter(f).getCandles('CL'),
        await new AlphaVantageAdapter(f).getCandles('RC'),
        await restFeed(f).getCandles('ZC', 'D1'),
      ];
      for (const r of results) {
        assert.equal(r.candles.length, 0);
        assert.ok(FAIL_STATUSES.has(r.status), r.status);
      }
    });
  });
}

test('chaos candles: malformed OHLC numbers never yield bad candles', async () => {
  await withEnv(KEYS, async () => {
    for (const m of malformedBodies()) {
      const f = jsonFetch(m.body);
      for (const r of [
        await new TwelveDataAdapter(f).getCandles('GC', 'D1'),
        await new FmpCommoditiesAdapter(f).getCandles('CL'),
        await new AlphaVantageAdapter(f).getCandles('RC'),
      ]) {
        for (const c of r.candles) {
          assert.ok([c.open, c.high, c.low, c.close].every((n) => Number.isFinite(n) && n > 0), `${m.name}: bad candle`);
        }
      }
    }
  });
});

test('chaos FRED sync: null/empty/NaN observation values never become 0', async () => {
  await withEnv(KEYS, async () => {
    for (const value of [null, '', '.', 'NaN', undefined]) {
      const f = jsonFetch({ observations: [{ date: '2026-11-01', value }, { date: '2026-10-01', value }] });
      const r = await new FredMacroAdapter(f).syncMacroSeries();
      assert.equal(r.synced, 0, `value=${String(value)} must not be stored`);
    }
  });
});

for (const fault of FAULTS) {
  test(`chaos sync (FRED/EIA/USDA): ${fault.name} -> synced 0, no throw`, async () => {
    await withEnv(KEYS, async () => {
      const f = fault.make([]);
      assert.equal((await new FredMacroAdapter(f).syncMacroSeries()).synced, 0);
      assert.equal((await new FredMacroAdapter(f).syncPublicCsvMacroSeries()).synced, 0);
      assert.equal((await new FredMacroAdapter(f).syncPublicCommodityBenchmarks()).synced, 0);
      assert.equal((await new EiaEnergyAdapter(f).syncWeeklyInventories()).synced, 0);
      assert.equal(await new UsdaQuickStatsAdapter(f).syncProductionMacro('CORN'), 0);
      const eia = await new EiaEnergyAdapter(f).getCandles('CL');
      assert.equal(eia.candles.length, 0);
    });
  });
}

test('chaos FRED CSV: junk rows (negative/zero/NaN/empty) are not stored', async () => {
  await withEnv(KEYS, async () => {
    for (const v of ['-5', '0', 'NaN', '']) {
      const f = (async () => new Response(`observation_date,X\n2026-11-01,${v}\n`, { status: 200 })) as unknown as FetchLike;
      const r = await new FredMacroAdapter(f).syncPublicCommodityBenchmarks();
      assert.equal(r.synced, 0, `csv value "${v}"`);
    }
  });
});

// ---- Yahoo (opt-in) ----
const yahooInst = async () => (await instrumentRepository.findBySymbol('ZC'))!;

for (const fault of FAULTS) {
  test(`chaos Yahoo: ${fault.name} -> UNAVAILABLE, bounded retries, signal+UA set, no poisoned cache`, async () => {
    await withEnv({ YAHOO_ENABLED: 'true' }, async () => {
      const seen: Array<RequestInit | undefined> = [];
      const adapter = new YahooFinanceAdapter({
        fetchFn: fault.make(seen),
        sleep: async () => {},
        minIntervalMs: 0,
        maxRetries: 2,
        backoffBaseMs: 1,
      });
      const q = await adapter.getQuoteForInstrument(await yahooInst());
      assert.equal(q.price, null);
      assert.ok(FAIL_STATUSES.has(q.status), q.status);
      assert.ok(seen.length <= 40, `retries bounded, got ${seen.length}`);
      const afterFirst = seen.length;
      for (const init of seen) {
        assert.ok(init?.signal instanceof AbortSignal);
        const ua = String((init?.headers as Record<string, string>)?.['User-Agent'] ?? '');
        assert.ok(ua.length > 0 && !/@|windows|users[\\/]/i.test(ua), ua);
      }
      const q2 = await adapter.getQuoteForInstrument(await yahooInst());
      assert.equal(q2.price, null);
      assert.ok(seen.length - afterFirst <= 3, `outage must back off, 2nd call sent ${seen.length - afterFirst}`);
      const candles = await adapter.getCandles('ZC', 'D1');
      assert.equal(candles.candles.length, 0);
    });
  });
}

test('chaos Yahoo: malformed chart meta (NaN/null/negative/zero price) -> no price, not cached', async () => {
  await withEnv({ YAHOO_ENABLED: 'true' }, async () => {
    const now = Math.floor(Date.now() / 1000);
    for (const price of [Number.NaN, null, -1, 0, 'abc']) {
      const body = {
        chart: {
          result: [{ meta: { symbol: 'ZC=F', exchangeName: 'CBT', currency: 'USX', regularMarketPrice: price, regularMarketTime: now }, timestamp: [], indicators: { quote: [{}] } }],
          error: null,
        },
      };
      const adapter = new YahooFinanceAdapter({ fetchFn: jsonFetch(body), sleep: async () => {}, minIntervalMs: 0, useBatch: false });
      const q = await adapter.getQuoteForInstrument(await yahooInst());
      assert.equal(q.price, null, `price=${String(price)}`);
      const again = await adapter.getQuoteForInstrument(await yahooInst());
      assert.equal(again.price, null);
    }
  });
});

test('chaos Yahoo: disabled -> zero fetches', async () => {
  await withEnv({ YAHOO_ENABLED: undefined }, async () => {
    let n = 0;
    const adapter = new YahooFinanceAdapter({
      fetchFn: (async () => {
        n++;
        return new Response('{}');
      }) as unknown as FetchLike,
    });
    const q = await adapter.getQuoteForInstrument(await yahooInst());
    assert.equal(q.price, null);
    assert.equal(n, 0);
  });
});
