import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApiApp, type CreateApiAppOptions } from './app.ts';
import { ProviderRegistry } from './providers/registry.ts';
import { InMemoryCandleRepository } from './storage/candleRepository.ts';
import { historicalCandleStore } from './services/candleStore.ts';

async function withTestServer(
  run: (baseUrl: string) => Promise<void>,
  options?: CreateApiAppOptions
): Promise<void> {
  historicalCandleStore.clearAll();
  // Always inject an in-memory candle store so tests never open the real data/market.db.
  const app = createApiApp({ candles: new InMemoryCandleRepository(), ...options });
  const server = await new Promise<import('node:http').Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    const addr = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${addr.port}`);
  } finally {
    historicalCandleStore.clearAll();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test('GET /api/health returns 200 with Asia/Ho_Chi_Minh timezone and honest capability flags', async () => {
  await withTestServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'OK');
    assert.equal(body.timezone, 'Asia/Ho_Chi_Minh');
    assert.equal(body.capabilities.firebaseConfigured, true);
    assert.equal(body.capabilities.marketDataProvidersConnected, 0);
    assert.equal(body.capabilities.marketDataOverallStatus, 'UNAVAILABLE');
  });
});

test('GET /api/market/quotes fails closed with DATA_UNAVAILABLE when no feed or CSV is loaded', async () => {
  await withTestServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/market/quotes`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.overallStatus, 'UNAVAILABLE');
    assert.match(body.notice, /DATA_UNAVAILABLE/);
    for (const q of body.quotes) {
      assert.equal(q.status, 'UNAVAILABLE');
      assert.equal(q.price, null);
    }
  });
});

test('central error handler returns a generic message with request id and logs the full error', async () => {
  const secret = 'db password=hunter2 at /internal/path';
  const logged: unknown[] = [];
  const throwingProviders = new ProviderRegistry();
  throwingProviders.getAllHealth = async () => {
    throw new Error(secret);
  };
  await withTestServer(
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/health`);
      assert.equal(res.status, 500);
      const text = await res.text();
      assert.ok(!text.includes('hunter2'), 'response must not leak the error message');
      const body = JSON.parse(text);
      assert.equal(body.error, 'INTERNAL_SERVER_ERROR');
      assert.equal(body.message, 'An unexpected server error occurred.');
      assert.equal(typeof body.requestId, 'string');
      assert.ok(body.requestId.length > 0);
      assert.equal(res.headers.get('x-request-id'), body.requestId);
      assert.equal(logged.length, 1);
      assert.ok(logged[0] instanceof Error && logged[0].message === secret);
    },
    {
      providers: throwingProviders,
      logError: (_message, err) => {
        logged.push(err);
      },
    }
  );
});

test('malformed JSON body returns 400 VALIDATION_ERROR without echoing parser details', async () => {
  await withTestServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"broken": ',
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'VALIDATION_ERROR');
    assert.equal(body.message, 'Malformed JSON request body.');
    assert.equal(typeof body.requestId, 'string');
  });
});

test('unknown /api route returns 404 JSON', async () => {
  await withTestServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/does-not-exist`);
    assert.equal(res.status, 404);
    assert.match(res.headers.get('content-type') ?? '', /application\/json/);
    const body = await res.json();
    assert.equal(body.error, 'NOT_FOUND');
  });
});

test('GET /api/market/quotes/:symbol returns 404 for unknown and 400 for invalid symbols', async () => {
  await withTestServer(async (baseUrl) => {
    const unknownRes = await fetch(`${baseUrl}/api/market/quotes/NOTREAL123`);
    assert.equal(unknownRes.status, 404);
    const unknownBody = await unknownRes.json();
    assert.equal(unknownBody.error, 'INSTRUMENT_NOT_FOUND');

    const invalidRes = await fetch(`${baseUrl}/api/market/quotes/${encodeURIComponent('bad$symbol!')}`);
    assert.equal(invalidRes.status, 400);
    const invalidBody = await invalidRes.json();
    assert.equal(invalidBody.error, 'VALIDATION_ERROR');

    const tooLongRes = await fetch(`${baseUrl}/api/market/quotes/${'A'.repeat(25)}`);
    assert.equal(tooLongRes.status, 400);
  });
});

test('GET /api/market/quotes/:symbol for a known symbol fails closed with null price', async () => {
  await withTestServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/market/quotes/ZS`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.quote.status, 'UNAVAILABLE');
    assert.equal(body.quote.price, null);
    assert.equal(body.quote.source, 'CME_GROUP');
  });
});

test('security headers are set and X-Powered-By is disabled', async () => {
  await withTestServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/architecture`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), null);
    assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.equal(res.headers.get('x-powered-by'), null);
    assert.equal(
      res.headers.get('content-security-policy'),
      "frame-ancestors 'self' https://*.google.com https://localhost.corp.google.com:26001; base-uri 'self'; object-src 'none'; form-action 'self'"
    );
  });
});

test('rate limiter returns 429 with Retry-After after the configured limit', async () => {
  await withTestServer(
    async (baseUrl) => {
      for (let i = 0; i < 3; i += 1) {
        const ok = await fetch(`${baseUrl}/api/architecture`);
        assert.equal(ok.status, 200);
        await ok.arrayBuffer();
      }
      const limited = await fetch(`${baseUrl}/api/architecture`);
      assert.equal(limited.status, 429);
      const retryAfter = Number(limited.headers.get('retry-after'));
      assert.ok(Number.isInteger(retryAfter) && retryAfter >= 1 && retryAfter <= 60);
      const body = await limited.json();
      assert.equal(body.error, 'RATE_LIMITED');
    },
    { rateLimit: { windowMs: 60_000, max: 3 } }
  );
});

test('rate limiter can be disabled via options', async () => {
  await withTestServer(
    async (baseUrl) => {
      for (let i = 0; i < 5; i += 1) {
        const res = await fetch(`${baseUrl}/api/architecture`);
        assert.equal(res.status, 200);
        await res.arrayBuffer();
      }
    },
    { rateLimit: false }
  );
});

test('provider registry routes each exchange to its explicit provider and fails closed otherwise', () => {
  const registry = new ProviderRegistry();
  const expected: Record<string, string> = {
    CBOT: 'CME_GROUP',
    CME: 'CME_GROUP',
    COMEX: 'CME_GROUP',
    NYMEX: 'NYMEX_ENERGY',
    ICE: 'ICE_FUTURES',
    MXV: 'MXV_OFFICIAL',
  };
  for (const [exchange, providerId] of Object.entries(expected)) {
    assert.equal(registry.getProviderForExchange(exchange)?.providerId, providerId, exchange);
  }
  assert.equal(registry.getProviderForExchange('LME'), null);
  assert.equal(registry.getProviderForExchange(''), null);
});

test('provider registry rejects routing to unregistered or unsupported providers', () => {
  assert.throws(() => new ProviderRegistry({ routing: { LME: 'CME_GROUP' } }), /does not declare support/);
  assert.throws(
    () => new ProviderRegistry({ configs: [], routing: { CME: 'CME_GROUP' } }),
    /unregistered provider/
  );
});

test('POST /api/ai/analyze is UNAVAILABLE (no model call, no fabricated text) without verified data', async () => {
  let calls = 0;
  await withTestServer(
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/ai/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: 'GC', timeframe: 'H4' }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.analysis.status, 'UNAVAILABLE');
      assert.equal(body.analysis.unavailableReason, 'NO_VERIFIED_DATA');
      assert.equal(body.analysis.summary, '');
      assert.equal(body.analysis.action, undefined);
      assert.equal(calls, 0);
    },
    {
      aiAnalyst: {
        cot: null,
        apiKey: 'test-key',
        modelClient: { model: 'fake', generate: async () => { calls += 1; return '{}'; } },
      },
    }
  );
});

test('POST /api/ai/analyze without GEMINI key returns UNAVAILABLE NO_API_KEY', async () => {
  await withTestServer(
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/ai/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: 'GC', timeframe: 'H4', language: 'en' }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.analysis.status, 'UNAVAILABLE');
      assert.equal(body.analysis.unavailableReason, 'NO_API_KEY');
      assert.ok(Array.isArray(body.analysis.inputs));
    },
    { aiAnalyst: { cot: null, apiKey: '' } }
  );
});

test('POST /api/ai/recommend-lessons validates payload, returns NO_API_KEY, and serves mock model results', async () => {
  const payload = {
    language: 'vi',
    searchedCommodities: [{ symbol: 'ZC', name: 'Ngô CBOT', category: 'AGRICULTURE', count: 3 }],
    openPositions: [{ symbol: 'RC', name: 'Cà phê Robusta', category: 'SOFT_COMMODITIES', side: 'SHORT', contracts: 2 }],
    candidates: [
      {
        id: 'l3-coffee',
        title: 'Nông sản: cà phê arabica và robusta',
        objective: 'Phân biệt arabica (KC) và robusta (RC)',
        levelNumber: 3,
        levelTitle: 'Cấp 3',
        instrumentIds: ['ICE:KC', 'ICE:RC'],
        done: false,
        matchedSymbols: ['RC'],
      },
    ],
    maxResults: 4,
  };

  await withTestServer(
    async (baseUrl) => {
      const badRes = await fetch(`${baseUrl}/api/ai/recommend-lessons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: 'vi', candidates: [] }),
      });
      assert.equal(badRes.status, 400);

      const res = await fetch(`${baseUrl}/api/ai/recommend-lessons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.result.status, 'UNAVAILABLE');
      assert.equal(body.result.unavailableReason, 'NO_API_KEY');
    },
    { lessonRecommender: { apiKey: '' } }
  );

  await withTestServer(
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/ai/recommend-lessons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.result.status, 'OK');
      assert.equal(body.result.recommendations.length, 1);
      assert.equal(body.result.recommendations[0].lessonId, 'l3-coffee');
    },
    {
      lessonRecommender: {
        modelClient: {
          model: 'gemini-4-hydrogen',
          generate: async () =>
            JSON.stringify({
              headline: 'Ưu tiên bài học về Robusta theo vị thế mở.',
              recommendations: [
                {
                  lessonId: 'l3-coffee',
                  reason: 'Bạn đang giữ vị thế Short RC nên cần ôn lại quy cách ICE Robusta.',
                  matchedSymbols: ['RC'],
                  priority: 'HIGH',
                },
              ],
            }),
        },
      },
    }
  );
});

test('CSV import unlocks technicals, scanner, and backtesting end-to-end', async () => {
  await withTestServer(async (baseUrl) => {
    const startMs = Date.parse('2026-08-01T00:00:00Z');
    const rows = ['timestamp,open,high,low,close,volume,openInterest'];
    for (let i = 0; i < 85; i++) {
      const close = 2400 + i * 2.5 + Math.sin(i * 0.5) * 3;
      const open = close - 1.5;
      const high = Math.max(open, close) + 1.2;
      const low = Math.min(open, close) - 1.2;
      rows.push(
        `${new Date(startMs + i * 4 * 3600_000).toISOString()},${open.toFixed(2)},${high.toFixed(2)},${low.toFixed(2)},${close.toFixed(2)},1200,45000`
      );
    }

    const importRes = await fetch(`${baseUrl}/api/market/candles/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: 'GC',
        timeframe: 'H4',
        csvContent: rows.join('\n'),
      }),
    });
    assert.equal(importRes.status, 201);

    const techRes = await fetch(`${baseUrl}/api/technical/GC?timeframe=H4`);
    assert.equal(techRes.status, 200);
    const techBody = await techRes.json();
    assert.equal(techBody.snapshot.status, 'HISTORICAL');
    assert.ok(techBody.snapshot.ema.ema20 > techBody.snapshot.ema.ema50);

    const scanRes = await fetch(`${baseUrl}/api/scanner/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tradingStyle: 'SWING',
        timeframe: 'H4',
        minRiskReward: 1.2,
        minSetupScore: 50,
      }),
    });
    assert.equal(scanRes.status, 200);
    const scanBody = await scanRes.json();
    assert.ok(scanBody.opportunities.length >= 1);
    assert.ok(scanBody.unavailableInstruments.length >= 10);

    const btRes = await fetch(`${baseUrl}/api/backtest/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: 'GC',
        strategyId: 'TREND_FOLLOWING',
        timeframe: 'H4',
        initialEquity: 50000,
        contractsPerTrade: 1,
      }),
    });
    assert.equal(btRes.status, 200);
    const btBody = await btRes.json();
    assert.equal(btBody.valid, true);
  });
});

test('POST /api/risk/calculate enforces verified contract specs and FX rules', async () => {
  await withTestServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/risk/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: 'GC',
        accountEquity: 100000,
        accountCurrency: 'USD',
        riskPercentagePerTrade: 1,
        dailyLossLimitPct: 3,
        maxOpenPositions: 4,
        currentOpenPositions: 0,
        maxPortfolioRiskPct: 5,
        currentOpenRiskPct: 0,
        maxContractsPerInstrument: 5,
        entryPrice: 2650,
        stopLossPrice: 2645,
        takeProfitPrice: 2660,
        commissionPerContract: 5,
        exchangeFeePerContract: 3,
        brokerageFeePerContract: 2,
        slippageTicks: 0,
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.valid, true);
    assert.equal(body.recommendedContracts, 1);
  });
});

test('GET /api/instruments includes MXV-focused profiles and API symbol mappings; sync and FX fail closed when unconfigured', async () => {
  await withTestServer(async (baseUrl) => {
    const instRes = await fetch(`${baseUrl}/api/instruments?marketScope=MXV`);
    assert.equal(instRes.status, 200);
    const instBody = await instRes.json();
    // Merge note: owner expected >= 16 MXV-listed; the verified master has no MXV listing for CL, BRN, NG,
    // TIO (MXV FEF links to SGX, not CME TIO), so the MXV scope is 14 verified + owner-added JRU = 15.
    assert.ok(instBody.count >= 15);
    assert.ok(instBody.instruments.every((i: { isMvxListed: boolean }) => i.isMvxListed));
    const robusta = instBody.instruments.find(
      (i: { exchangeSymbol: string }) => i.exchangeSymbol === 'RC'
    );
    assert.ok(robusta);
    assert.ok(robusta.commodityProfile?.vietnameseName.includes('Robusta'));
    assert.ok(robusta.providerMappings?.commoditiesApiSymbol);

    const syncRes = await fetch(`${baseUrl}/api/providers/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeframe: 'D1' }),
    });
    assert.equal(syncRes.status, 200);
    const syncBody = await syncRes.json();
    assert.equal(syncBody.totalCandlesDatasetsAdded, 0);
    assert.ok(Array.isArray(syncBody.outcomes));

    const fxRes = await fetch(`${baseUrl}/api/market/fx/usdvnd`);
    assert.equal(fxRes.status, 200);
    const fxBody = await fxRes.json();
    assert.equal(fxBody.status, 'UNAVAILABLE');
    assert.equal(fxBody.rate, null);
  });
});

test('engines read SQLite-imported CONTINUOUS candles first (/api/data/import -> /api/technical)', async () => {
  await withTestServer(async (baseUrl) => {
    const rows = ['Date,Open,High,Low,Close,Volume'];
    const start = Date.parse('2025-01-01T00:00:00Z');
    for (let i = 0; i < 260; i++) {
      const close = 2000 + i;
      const d = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
      rows.push(`${d},${close - 1},${close + 2},${close - 2},${close},100`);
    }
    const importRes = await fetch(`${baseUrl}/api/data/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instrumentId: 'COMEX:GC',
        contractCode: 'CONTINUOUS',
        continuousAdjustment: 'UNADJUSTED',
        timeframe: 'D1',
        timezone: 'America/New_York',
        sourceLabel: 'test fixture',
        sourceQuality: 'USER_PROVIDED',
        csv: rows.join('\n'),
      }),
    });
    assert.equal(importRes.status, 201, await importRes.clone().text());

    const candlesRes = await fetch(`${baseUrl}/api/market/candles/GC?timeframe=D1`);
    assert.equal(candlesRes.status, 200);
    const candlesBody = await candlesRes.json();
    assert.equal(candlesBody.origin, 'SQLITE');
    assert.equal(candlesBody.status, 'HISTORICAL');
    assert.equal(candlesBody.candles.length, 260);

    const techRes = await fetch(`${baseUrl}/api/technical/GC?timeframe=D1`);
    assert.equal(techRes.status, 200);
    const techBody = await techRes.json();
    assert.equal(techBody.snapshot.status, 'HISTORICAL');
  });
});

test('owner mutating endpoints are admin-guarded (non-loopback without token -> 403)', async () => {
  await withTestServer(
    async (baseUrl) => {
      for (const [method, path] of [
        ['POST', '/api/market/candles/import'],
        ['DELETE', '/api/market/candles'],
        ['POST', '/api/providers/sync'],
        ['POST', '/api/fundamental/records'],
      ] as const) {
        const res = await fetch(`${baseUrl}${path}`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: method === 'POST' ? '{}' : undefined,
        });
        assert.equal(res.status, 403, `${method} ${path}`);
        await res.arrayBuffer();
      }
    },
    { adminToken: null, adminIsLoopback: () => false }
  );
});

test('compute routes have their own per-IP budget (429 + Retry-After, window reset, others unaffected)', async () => {
  let t = 1_000_000;
  await withTestServer(
    async (baseUrl) => {
      const hit = (path: string) =>
        fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      for (let i = 0; i < 3; i++) assert.notEqual((await hit('/api/risk/calculate')).status, 429);
      const blocked = await hit('/api/risk/calculate');
      assert.equal(blocked.status, 429);
      assert.ok(Number(blocked.headers.get('retry-after')) >= 1);
      assert.equal((await blocked.json()).error, 'RATE_LIMITED');
      // separate budgets per route
      assert.notEqual((await hit('/api/scanner/scan')).status, 429);
      assert.notEqual((await hit('/api/portfolio/analyze')).status, 429);
      assert.equal((await fetch(`${baseUrl}/api/health`)).status, 200);
      t += 60_001;
      assert.notEqual((await hit('/api/risk/calculate')).status, 429);
    },
    { rateLimit: false, computeRateLimit: { max: 3, windowMs: 60_000, now: () => t } }
  );
});
