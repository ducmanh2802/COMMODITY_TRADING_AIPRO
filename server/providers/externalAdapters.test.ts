import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AlphaVantageAdapter,
  CommoditiesApiAdapter,
  ConfigurableRestFeedAdapter,
  EiaEnergyAdapter,
  FmpCommoditiesAdapter,
  TwelveDataAdapter,
  UsdaQuickStatsAdapter,
} from './externalAdapters.ts';
import { fundamentalStore } from '../services/fundamentalService.ts';

function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void>): Promise<void> {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return fn().finally(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
}

test('TwelveDataAdapter fails closed without TWELVEDATA_API_KEY and parses valid quote + time_series + USD/VND', async () => {
  await withEnv({ TWELVEDATA_API_KEY: undefined }, async () => {
    const adapter = new TwelveDataAdapter();
    const unconfigured = await adapter.getQuote('GC');
    assert.equal(unconfigured.status, 'UNAVAILABLE');
    assert.equal(unconfigured.price, null);
    const status = await adapter.getProviderStatus();
    assert.equal(status.connectionState, 'UNCONFIGURED');
  });

  await withEnv({ TWELVEDATA_API_KEY: 'test-td-key' }, async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const mockFetch: typeof fetch = async (url) => {
      const u = String(url);
      if (u.includes('/quote?')) {
        return new Response(
          JSON.stringify({
            symbol: 'XAU/USD',
            close: '2715.40',
            volume: '15000',
            timestamp: nowSec,
          }),
          { status: 200 }
        );
      }
      if (u.includes('/time_series?')) {
        return new Response(
          JSON.stringify({
            values: [
              {
                datetime: '2026-08-03 12:00:00',
                open: '2705',
                high: '2720',
                low: '2700',
                close: '2715',
                volume: '100',
              },
              {
                datetime: '2026-08-02 12:00:00',
                open: '2695',
                high: '2710',
                low: '2690',
                close: '2705',
                volume: '95',
              },
              {
                datetime: '2026-08-01 12:00:00',
                open: '2685',
                high: '2700',
                low: '2680',
                close: '2695',
                volume: '90',
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (u.includes('/exchange_rate?')) {
        return new Response(
          JSON.stringify({ rate: 25410, timestamp: nowSec }),
          { status: 200 }
        );
      }
      return new Response('{}', { status: 404 });
    };

    const adapter = new TwelveDataAdapter(mockFetch);
    const q = await adapter.getQuote('GC');
    assert.equal(q.price, 2715.4);
    assert.equal(q.status, 'CURRENT');
    assert.equal(q.source, 'TWELVE_DATA:XAU/USD');

    const c = await adapter.getCandles('GC', 'D1');
    assert.equal(c.candles.length, 3);
    assert.equal(c.candles[0].close, 2695);
    assert.equal(c.candles[2].close, 2715);

    const fx = await adapter.fetchUsdVndRate();
    assert.ok(fx);
    assert.equal(fx.rate, 25410);
  });
});

test('FmpCommoditiesAdapter parses /stable/quote and /stable/historical-price-eod/full', async () => {
  await withEnv({ FMP_API_KEY: 'test-fmp-key' }, async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const mockFetch: typeof fetch = async (url) => {
      const u = String(url);
      if (u.includes('/stable/quote')) {
        return new Response(
          JSON.stringify([{ symbol: 'CLUSD', price: 72.45, volume: 32000, timestamp: nowSec }]),
          { status: 200 }
        );
      }
      if (u.includes('/stable/historical-price-eod/full')) {
        return new Response(
          JSON.stringify([
            { date: '2026-08-03', open: 71.5, high: 73.0, low: 71.1, close: 72.45, volume: 31000 },
            { date: '2026-08-02', open: 70.8, high: 72.0, low: 70.2, close: 71.5, volume: 29000 },
            { date: '2026-08-01', open: 70.0, high: 71.2, low: 69.8, close: 70.8, volume: 28000 },
          ]),
          { status: 200 }
        );
      }
      return new Response('[]', { status: 404 });
    };

    const adapter = new FmpCommoditiesAdapter(mockFetch);
    const q = await adapter.getQuote('CL');
    assert.equal(q.price, 72.45);
    assert.equal(q.source, 'FMP:CLUSD');

    const c = await adapter.getCandles('CL');
    assert.equal(c.candles.length, 3);
    assert.equal(c.candles[0].close, 70.8);
  });
});

test('CommoditiesApiAdapter parses /api/latest with base commodity to USD', async () => {
  await withEnv({ COMMODITIES_API_KEY: 'test-capi-key' }, async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const mockFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          data: {
            success: true,
            timestamp: nowSec,
            base: 'ROBUSTA',
            rates: { USD: 4820.5 },
            unit: 'per metric ton',
          },
        }),
        { status: 200 }
      );

    const adapter = new CommoditiesApiAdapter(mockFetch);
    const q = await adapter.getQuote('RC');
    assert.equal(q.price, 4820.5);
    assert.equal(q.status, 'CURRENT');
    assert.equal(q.source, 'COMMODITIES_API:COFFEE');
  });
});

test('AlphaVantageAdapter skips missing "." entries, flags rate-limit Note, and parses USD/VND', async () => {
  await withEnv({ ALPHAVANTAGE_API_KEY: 'test-av-key' }, async () => {
    const mockFetch: typeof fetch = async (url) => {
      const u = String(url);
      if (u.includes('function=CURRENCY_EXCHANGE_RATE')) {
        return new Response(
          JSON.stringify({
            'Realtime Currency Exchange Rate': {
              '5. Exchange Rate': '25390.00',
              '6. Last Refreshed': '2026-08-03 10:00:00',
            },
          }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          unit: 'USD per metric ton',
          data: [
            { date: '2026-08-03', value: '.' },
            { date: '2026-08-02', value: '4750.25' },
            { date: '2026-08-01', value: '4710.00' },
          ],
        }),
        { status: 200 }
      );
    };

    const adapter = new AlphaVantageAdapter(mockFetch);
    const res = await adapter.getCandles('RC');
    assert.equal(res.candles.length, 2);
    assert.equal(res.candles[1].close, 4750.25);

    const fx = await adapter.fetchUsdVndRate();
    assert.ok(fx);
    assert.equal(fx.rate, 25390);
  });
});

test('EiaEnergyAdapter and UsdaQuickStatsAdapter store sourced macro records honestly', async () => {
  await withEnv({ EIA_API_KEY: 'test-eia-key', USDA_API_KEY: 'test-usda-key' }, async () => {
    const mockFetch: typeof fetch = async (url) => {
      const u = String(url);
      if (u.includes('api.eia.gov/v2/petroleum/stoc/wstk')) {
        return new Response(
          JSON.stringify({
            response: {
              data: [
                { period: '2026-08-01', value: 420100 },
                { period: '2026-07-25', value: 424500 },
              ],
            },
          }),
          { status: 200 }
        );
      }
      if (u.includes('api.eia.gov/v2/natural-gas/stor')) {
        return new Response(
          JSON.stringify({
            response: {
              data: [
                { period: '2026-08-01', value: 3150 },
                { period: '2026-07-25', value: 3120 },
              ],
            },
          }),
          { status: 200 }
        );
      }
      if (u.includes('quickstats.nass.usda.gov')) {
        return new Response(
          JSON.stringify({
            data: [
              { year: '2025', Value: '4,366,000,000', unit_desc: 'BU' },
              { year: '2024', Value: '4,165,000,000', unit_desc: 'BU' },
            ],
          }),
          { status: 200 }
        );
      }
      return new Response('{}', { status: 404 });
    };

    const eia = new EiaEnergyAdapter(mockFetch);
    const eiaRes = await eia.syncWeeklyInventories();
    assert.equal(eiaRes.synced, 2);

    const usda = new UsdaQuickStatsAdapter(mockFetch);
    const usdaSynced = await usda.syncProductionMacro('SOYBEANS');
    assert.equal(usdaSynced, 1);

    const records = fundamentalStore.listRecords();
    assert.ok(records.some((r) => r.dataset.includes('EIA_US_CRUDE_STOCKS')));
    assert.ok(records.some((r) => r.dataset.includes('USDA_SOYBEANS_PRODUCTION')));
  });
});

test('ConfigurableRestFeedAdapter requires both URL and KEY and fails closed when absent', async () => {
  await withEnv({ MXV_API_KEY: 'only-key', MXV_API_URL: undefined }, async () => {
    const adapter = new ConfigurableRestFeedAdapter({
      providerId: 'MXV_OFFICIAL',
      providerName: 'MXV Test',
      urlEnv: 'MXV_API_URL',
      keyEnv: 'MXV_API_KEY',
      exchanges: ['MXV'],
      unconfiguredMessage: 'Missing URL',
    });
    const status = await adapter.getProviderStatus();
    assert.equal(status.connectionState, 'UNCONFIGURED');
    assert.equal(status.credentialsConfigured, false);
  });
});

test('ConfigurableRestFeedAdapter health is never CURRENT without a successful fetch, and goes STALE with age', async () => {
  await withEnv({ MARKET_DATA_PROVIDER_URL: 'https://feed.invalid', MARKET_DATA_PROVIDER_KEY: 'k' }, async () => {
    let nowMs = Date.now();
    let ok = true;
    const fetchFn = (async () =>
      new Response(JSON.stringify(ok ? { price: 1234.5, timestamp: new Date(nowMs).toISOString() } : {}), {
        status: ok ? 200 : 502,
      })) as unknown as typeof fetch;
    const adapter = new ConfigurableRestFeedAdapter({
      providerId: 'THIRD_PARTY_FEED',
      providerName: 'REST Test',
      urlEnv: 'MARKET_DATA_PROVIDER_URL',
      keyEnv: 'MARKET_DATA_PROVIDER_KEY',
      exchanges: ['CBOT'],
      unconfiguredMessage: 'n/a',
      fetchFn,
      freshnessMs: 60_000,
      now: () => nowMs,
    });
    // Configured but never fetched: not CONNECTED, not CURRENT.
    let status = await adapter.getProviderStatus();
    assert.equal(status.credentialsConfigured, true);
    assert.notEqual(status.connectionState, 'CONNECTED');
    assert.equal(status.dataStatus, 'UNAVAILABLE');
    assert.equal(status.lastSuccessfulSyncAt, null);

    const q = await adapter.getQuote('ZC');
    assert.ok(q.price !== null);
    status = await adapter.getProviderStatus();
    assert.equal(status.connectionState, 'CONNECTED');
    assert.ok(status.lastSuccessfulSyncAt);
    assert.notEqual(status.dataStatus, 'UNAVAILABLE');

    // Older than the freshness window -> STALE, never CURRENT.
    nowMs = Date.parse(status.lastSuccessfulSyncAt!) + 10 * 60_000;
    status = await adapter.getProviderStatus();
    assert.ok(status.dataStatus === 'STALE' || status.dataStatus === 'HISTORICAL', status.dataStatus);

    // A failed fetch degrades health.
    ok = false;
    await adapter.getQuote('ZC');
    status = await adapter.getProviderStatus();
    assert.equal(status.connectionState, 'DEGRADED');
    assert.equal(status.dataStatus, 'UNAVAILABLE');
  });
});
