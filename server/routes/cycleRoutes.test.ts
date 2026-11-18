import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiApp } from '../app.ts';
import { InMemoryCandleRepository } from '../storage/candleRepository.ts';
import type {
  CommodityProfileDossier,
  CycleMarketOverview,
  DailyResearchReportPayload,
  EightQuestionVerdict,
} from '../../src/shared/types/cycle.ts';

async function startTestServer() {
  const candles = new InMemoryCandleRepository();
  const app = createApiApp({
    candles,
    rateLimit: false,
    adminToken: null,
  });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return { server, baseUrl: `http://127.0.0.1:${port}`, candles };
}

test('Cycle API fails closed cleanly when no OHLCV or live providers are configured', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const res = await fetch(`${baseUrl}/api/cycle/overview`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as CycleMarketOverview;
    assert.equal(body.commodities.length, 21);
    assert.equal(body.marketBreadth.withPriceData, 0);
    assert.equal(body.marketBreadth.unavailableCount, 21);
    assert.ok(body.macroTracker.length === 8);

    const profRes = await fetch(`${baseUrl}/api/cycle/profile/CBOT:ZC`);
    assert.equal(profRes.status, 200);
    const dossier = (await profRes.json()) as CommodityProfileDossier;
    assert.equal(dossier.bottomDetection.status, 'DATA_UNAVAILABLE');
    assert.equal(dossier.tradePlans.longTermCycle.autoExecutionAllowed, false);

    const verdictRes = await fetch(`${baseUrl}/api/cycle/verdict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: 'CBOT:ZC' }),
    });
    assert.equal(verdictRes.status, 200);
    const verdict = (await verdictRes.json()) as EightQuestionVerdict;
    assert.equal(verdict.status, 'DATA_UNAVAILABLE');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Cycle API computes real Bottom Detection & Profile Dossier after importing D1 candles', async () => {
  const { server, baseUrl, candles } = await startTestServer();
  try {
    const startMs = Date.parse('2024-01-01T00:00:00.000Z');
    const rows = Array.from({ length: 120 }, (_, i) => {
      const close = i < 80 ? 520 - i * 1.6 : 392 + (i - 80) * 0.4;
      return {
        timestampMs: startMs + i * 86_400_000,
        open: close - 0.5,
        high: close + 2,
        low: close - 2,
        close,
        volume: 15_000,
        openInterest: 60_000,
      };
    });
    await candles.commitImport(
      {
        id: 'test-zc-dataset-1',
        instrumentId: 'CBOT:ZC',
        contractCode: 'CONTINUOUS',
        timeframe: 'D1',
        continuousAdjustment: 'UNADJUSTED',
        sourceLabel: 'UNIT_TEST_ZC',
        sourceQuality: 'OFFICIAL',
        importedAt: new Date().toISOString(),
        rowCount: rows.length,
        insertedCount: rows.length,
        firstTimestamp: new Date(rows[0].timestampMs).toISOString(),
        lastTimestamp: new Date(rows[rows.length - 1].timestampMs).toISOString(),
        timezone: 'UTC',
        dateFormat: 'YYYY-MM-DD',
        priceUnit: 'US cents/bushel',
        priceUnitDeclared: true,
        checksum: 'test-checksum-zc-1',
        importMode: 'replace',
      },
      rows,
      'replace'
    );

    const profRes = await fetch(`${baseUrl}/api/cycle/profile/CBOT:ZC`);
    assert.equal(profRes.status, 200);
    const dossier = (await profRes.json()) as CommodityProfileDossier;
    assert.equal(dossier.historicalCandlesCount, 120);
    assert.notEqual(dossier.bottomDetection.totalScore, null);
    assert.notEqual(dossier.summary.cyclePhase, 'DATA_UNAVAILABLE');

    const reportRes = await fetch(`${baseUrl}/api/cycle/report`);
    assert.equal(reportRes.status, 200);
    const report = (await reportRes.json()) as DailyResearchReportPayload;
    assert.ok(report.topWatch.length > 0);
    assert.ok(report.vietnamEventsToday.length > 0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
