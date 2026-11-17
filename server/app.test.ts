import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApiApp } from './app.ts';
import { historicalCandleStore } from './services/candleStore.ts';

async function withTestServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  historicalCandleStore.clearAll();
  const app = createApiApp();
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

test('POST /api/ai/analyze returns deterministic NO_TRADE when market data is UNAVAILABLE', async () => {
  await withTestServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/ai/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: 'GC', timeframe: 'H4' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.analysis.action, 'NO_TRADE');
    assert.equal(body.analysis.dataQuality.status, 'UNAVAILABLE');
  });
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
    assert.ok(instBody.count >= 16);
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
