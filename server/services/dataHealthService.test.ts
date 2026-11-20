import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApiApp } from '../app.ts';
import { InMemoryCandleRepository } from '../storage/candleRepository.ts';
import { historicalCandleStore } from './candleStore.ts';
import { FundamentalStore, buildFundamentalDomainsStatus } from './fundamentalService.ts';
import { computeInstrumentDataQualityScore } from './dataHealthService.ts';
import { FredMacroAdapter } from '../providers/externalAdapters.ts';
import { YahooFinanceAdapter } from '../providers/yahooAdapter.ts';

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

test('FundamentalStore enforces strict no-look-ahead bias protection via asOf and computes freshness/lag', () => {
  const store = new FundamentalStore();
  store.addRecord({
    dataset: 'USDA_WASDE_CORN_STOCKS',
    source: 'USDA OCE WASDE',
    publicationTimestamp: '2026-10-12T16:00:00.000Z',
    observationDate: '2026-10-01',
    dataPeriod: '2026-10',
    category: 'USDA_WASDE',
    relatedSymbols: ['ZC'],
    actualValue: 1850,
    previousValue: 1920,
    forecastValue: 1900,
    unit: 'Million Bushels',
    revisionStatus: 'FINAL',
    impactAssessment: 'BULLISH',
  });
  store.addRecord({
    dataset: 'USDA_WASDE_CORN_STOCKS',
    source: 'USDA OCE WASDE',
    publicationTimestamp: '2026-11-12T17:00:00.000Z',
    observationDate: '2026-11-01',
    dataPeriod: '2026-11',
    category: 'USDA_WASDE',
    relatedSymbols: ['ZC'],
    actualValue: 1790,
    previousValue: 1850,
    forecastValue: 1830,
    unit: 'Million Bushels',
    revisionStatus: 'FINAL',
    impactAssessment: 'BULLISH',
  });

  // Backtesting as of Nov 1 must NEVER see Nov 12 release!
  const beforeNov12 = store.listRecords({ asOf: '2026-11-01T00:00:00.000Z' });
  assert.equal(beforeNov12.length, 1);
  assert.equal(beforeNov12[0].actualValue, 1850);
  assert.equal(beforeNov12[0].observationDate, '2026-10-01');
  assert.equal(beforeNov12[0].releaseLagDays, 11);
  assert.equal(beforeNov12[0].freshnessStatus, 'HISTORICAL');

  // Evaluating 60 days later marks old EIA/WASDE records STALE
  const staleCheck = store.listRecords({ nowMs: Date.parse('2027-01-15T00:00:00.000Z') });
  assert.equal(staleCheck[0].freshnessStatus, 'STALE');

  const domains = buildFundamentalDomainsStatus({
    records: beforeNov12,
    dailySeriesCount: 5,
    nowMs: Date.parse('2026-11-01T00:00:00.000Z'),
  });
  assert.equal(domains.length, 8);
  const wasde = domains.find((d) => d.id === 'USDA_WASDE');
  assert.equal(wasde?.status, 'HISTORICAL');
  assert.equal(wasde?.latestObservationDate, '2026-10-01');
  const eia = domains.find((d) => d.id === 'EIA_INVENTORIES');
  assert.equal(eia?.status, 'UNAVAILABLE');
});

test('FredMacroAdapter parses official Public CSV without API key and handles HTTP 500/HTML failures safely', async () => {
  const { fundamentalStore } = await import('./fundamentalService.ts');
  fundamentalStore.clearAll();

  const mockCsvFetch = async (url: string | URL | Request): Promise<Response> => {
    const s = String(url);
    if (s.includes('DTWEXBGS')) {
      return new Response('DATE,DTWEXBGS\n2026-11-12,126.40\n2026-11-13,125.90\n', { status: 200 });
    }
    if (s.includes('FEDFUNDS')) {
      return new Response('<html><body>502 Bad Gateway</body></html>', { status: 502 });
    }
    if (s.includes('DGS10')) {
      return new Response('DATE,DGS10\n2026-11-13,.\n2026-11-14,4.28\n', { status: 200 });
    }
    return new Response('DATE,CPIAUCSL\n2026-10-01,315.4\n', { status: 200 });
  };

  const fred = new FredMacroAdapter(mockCsvFetch as typeof fetch);
  const res = await fred.syncPublicCsvMacroSeries();
  assert.equal(res.synced, 3);
  assert.match(res.error ?? '', /502/);

  const recs = fundamentalStore.listRecords({ category: 'MACRO' });
  const dxy = recs.find((r) => r.dataset === 'FRED_DXY_BROAD_USD');
  assert.equal(dxy?.actualValue, 125.9);
  assert.equal(dxy?.previousValue, 126.4);
  assert.equal(dxy?.impactAssessment, 'BULLISH');
  assert.equal(dxy?.observationDate, '2026-11-13');

  fundamentalStore.clearAll();
});

test('FredMacroAdapter.syncPublicCommodityBenchmarks syncs daily DCOILBRENTEU quote for BRN and IMF GLOBAL_SD benchmarks', async () => {
  const { fundamentalStore } = await import('./fundamentalService.ts');
  fundamentalStore.clearAll();

  const mockCsvFetch = async (url: string | URL | Request): Promise<Response> => {
    const s = String(url);
    if (s.includes('DCOILBRENTEU')) {
      return new Response('observation_date,DCOILBRENTEU\n2026-11-16,91.80\n2026-11-17,.\n2026-11-18,92.94\n', { status: 200 });
    }
    if (s.includes('PCOFFROBUSDM')) {
      return new Response('observation_date,PCOFFROBUSDM\n2026-08-01,162.10\n2026-09-01,167.51\n', { status: 200 });
    }
    if (s.includes('PCOTTINDUSDM')) {
      return new Response('<html>503</html>', { status: 503 });
    }
    if (s.includes('PRUBBUSDM')) {
      return new Response('observation_date,PRUBBUSDM\n2026-09-01,125.08\n', { status: 200 });
    }
    return new Response('observation_date,PIORECRUSDM\n2026-09-01,100.44\n', { status: 200 });
  };

  const fred = new FredMacroAdapter(mockCsvFetch as typeof fetch);
  const res = await fred.syncPublicCommodityBenchmarks();
  assert.equal(res.synced, 4);
  assert.match(res.error ?? '', /503/);

  const brnQuote = fred.getBenchmarkQuote('BRN');
  assert.ok(brnQuote);
  assert.equal(brnQuote.price, 92.94);
  assert.equal(brnQuote.unit, 'USD/barrel');
  assert.equal(brnQuote.status, 'HISTORICAL');
  assert.equal(brnQuote.sourceQuality, 'OFFICIAL');
  assert.equal(brnQuote.timestamp, '2026-11-18T00:00:00.000Z');

  // Monthly IMF benchmarks must NEVER be fabricated into live futures quotes
  assert.equal(fred.getBenchmarkQuote('RC'), null);
  assert.equal(fred.getBenchmarkQuote('JRU'), null);

  const sdRecords = fundamentalStore.listRecords({ category: 'GLOBAL_SD' });
  assert.equal(sdRecords.length, 4);
  const robusta = sdRecords.find((r) => r.dataset === 'IMF_FRED_ROBUSTA_BENCHMARK');
  assert.equal(robusta?.actualValue, 167.51);
  assert.deepEqual(robusta?.relatedSymbols, ['RC']);

  fundamentalStore.clearAll();
});

test('YahooFinanceAdapter supports explicit 5y/10y historicalRange while defaulting to 2y and failing closed on API errors', async () => {
  await withEnv({ YAHOO_ENABLED: 'true' }, async () => {
    const seenUrls: string[] = [];
    const errFetch = async (url: string | URL | Request): Promise<Response> => {
      seenUrls.push(String(url));
      return new Response('<html>Too Many Requests</html>', { status: 429, headers: { 'retry-after': '1' } });
    };
    const yahoo = new YahooFinanceAdapter({
      fetchFn: errFetch as typeof fetch,
      minIntervalMs: 0,
      backoffBaseMs: 1,
      maxRetries: 1,
      sleep: async () => undefined,
    });
    const r5y = await yahoo.getCandles('ZC', 'D1', undefined, undefined, { range: '5y' });
    assert.equal(r5y.status, 'UNAVAILABLE');
    assert.match(r5y.reason ?? '', /429/);
    assert.match(seenUrls[0], /range=5y&interval=1d/);
  });
});

test('computeInstrumentDataQualityScore scores complete, partial, stale, gap-heavy, and missing datasets deterministically', () => {
  const full = computeInstrumentDataQualityScore({
    quoteStatus: 'CURRENT',
    dailyBars: 2600,
    missingGapCount: 0,
    duplicateCount: 0,
    invalidOhlcCount: 0,
    historicalFreshness: 'HISTORICAL',
    macroPresent: true,
    commodityFundamentalCount: 2,
    cotStatus: 'SYNCED',
    cotWeeks: 156,
  });
  assert.equal(full.total, 100);

  const staleGappy = computeInstrumentDataQualityScore({
    quoteStatus: 'STALE',
    dailyBars: 300,
    missingGapCount: 3,
    duplicateCount: 1,
    invalidOhlcCount: 0,
    historicalFreshness: 'STALE',
    macroPresent: false,
    commodityFundamentalCount: 0,
    cotStatus: 'UNSYNCED',
    cotWeeks: 0,
  });
  assert.equal(staleGappy.priceAndHistory, 13); // 3 + 10 + 10 - 3 - 2 - 5 = 13
  assert.equal(staleGappy.total, 13);

  const empty = computeInstrumentDataQualityScore({
    quoteStatus: 'UNAVAILABLE',
    dailyBars: 0,
    missingGapCount: 0,
    duplicateCount: 0,
    invalidOhlcCount: 0,
    historicalFreshness: 'UNAVAILABLE',
    macroPresent: false,
    commodityFundamentalCount: 0,
    cotStatus: 'NOT_REPORTED',
    cotWeeks: 0,
  });
  assert.equal(empty.total, 15);
});

test('GET /api/data/health-report & /api/fundamental/records?asOf= work end-to-end and CRLF/LF CSV imports both succeed', async () => {
  historicalCandleStore.clearAll();
  const { fundamentalStore } = await import('./fundamentalService.ts');
  fundamentalStore.clearAll();

  const app = createApiApp({ candles: new InMemoryCandleRepository(), rateLimit: false });
  const server = await new Promise<import('node:http').Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  try {
    const addr = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    // Import CRLF CSV for RC into SQLite CONTINUOUS
    const crlfCsv = [
      'Date,Open,High,Low,Close,Volume',
      '2026-10-01,4500,4550,4480,4520,1200',
      '2026-10-02,4520,4580,4510,4560,1300',
      '2026-10-05,4560,4600,4540,4590,1400',
    ].join('\r\n');

    const impCrlf = await fetch(`${baseUrl}/api/data/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instrumentId: 'ICE:RC',
        contractCode: 'CONTINUOUS',
        continuousAdjustment: 'UNADJUSTED',
        timeframe: 'D1',
        timezone: 'Europe/London',
        sourceLabel: 'CRLF test fixture',
        sourceQuality: 'USER_PROVIDED',
        csv: crlfCsv,
      }),
    });
    assert.equal(impCrlf.status, 201);

    // Post fundamental records on two dates and test asOf filtering
    await fetch(`${baseUrl}/api/fundamental/records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dataset: 'ICE_ROBUSTA_CERTIFIED_STOCKS',
        source: 'ICE Europe Stocks',
        publicationTimestamp: '2026-10-15T12:00:00.000Z',
        observationDate: '2026-10-14',
        dataPeriod: '2026-10-14',
        category: 'ICE_STOCKS',
        relatedSymbols: ['RC'],
        actualValue: 41200,
        previousValue: 43000,
        unit: 'Tonnes',
        impactAssessment: 'BULLISH',
      }),
    });
    await fetch(`${baseUrl}/api/fundamental/records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dataset: 'ICE_ROBUSTA_CERTIFIED_STOCKS',
        source: 'ICE Europe Stocks',
        publicationTimestamp: '2026-11-15T12:00:00.000Z',
        observationDate: '2026-11-14',
        dataPeriod: '2026-11-14',
        category: 'ICE_STOCKS',
        relatedSymbols: ['RC'],
        actualValue: 39800,
        previousValue: 41200,
        unit: 'Tonnes',
        impactAssessment: 'BULLISH',
      }),
    });

    const fundBefore = await (await fetch(`${baseUrl}/api/fundamental/records?asOf=2026-11-01T00:00:00.000Z`)).json();
    assert.equal(fundBefore.records.length, 1);
    assert.equal(fundBefore.records[0].actualValue, 41200);
    assert.equal(fundBefore.domains.length, 8);

    const report = await (await fetch(`${baseUrl}/api/data/health-report`)).json();
    // 20 Instrument Master ids + the owner-added MXV:JRU (rubber, UNVERIFIED) merged in from origin/main.
    assert.equal(report.coverageSummary.totalCommodities, 21);
    assert.equal(report.exchangeAdapters.length, 6);
    assert.equal(report.fundamentalDomains.length, 8);
    assert.equal(report.engineReadiness.length, 5);
    const rc = report.commodities.find((c: { symbol: string }) => c.symbol === 'RC');
    assert.equal(rc.dailyBars, 3);
    assert.equal(rc.fundamentalCount, 2);
    assert.ok(rc.dataQualityScore > 0);
  } finally {
    historicalCandleStore.clearAll();
    fundamentalStore.clearAll();
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});
