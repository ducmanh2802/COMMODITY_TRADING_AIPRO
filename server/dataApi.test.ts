import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Request } from 'express';
import { createApiApp, type CreateApiAppOptions } from './app.ts';
import {
  adminAuthStartupWarning,
  createRequireAdminToken,
  isDirectLoopbackRequest,
  tokensMatch,
} from './middleware/adminAuth.ts';
import { instrumentRepository } from './services/instrumentRegistry.ts';
import { InMemoryCandleRepository, type ICandleRepository } from './storage/candleRepository.ts';
import { SqliteCandleRepository } from './storage/sqliteCandleRepository.ts';

// SYNTHETIC TEST FIXTURE — not real market data; used only by tests, never seeded into data/market.db.
const FIXTURE_CSV = readFileSync(new URL('./__fixtures__/synthetic_test_ZC_daily.csv', import.meta.url), 'utf8');

async function withServer(
  candles: ICandleRepository,
  run: (baseUrl: string) => Promise<void>,
  extra: Partial<CreateApiAppOptions> = {}
): Promise<void> {
  // Explicitly loopback-only (no token) unless a test overrides it, so a developer's ADMIN_API_TOKEN
  // does not change test behavior.
  const app = createApiApp({ rateLimit: false, candles, adminToken: null, logWarn: () => {}, ...extra });
  const server = await new Promise<import('node:http').Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

function withTempSqlite(): { repo: SqliteCandleRepository; cleanup: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), 'data-api-test-'));
  const repo = new SqliteCandleRepository(path.join(dir, 'market.db'));
  return {
    repo,
    cleanup: () => {
      repo.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const baseImport = {
  instrumentId: 'ZC',
  contractCode: 'zch25',
  timeframe: 'D1',
  timezone: 'America/Chicago',
  sourceLabel: 'synthetic test fixture',
  sourceQuality: 'USER_PROVIDED',
};

async function postImport(baseUrl: string, body: Record<string, unknown>, headers: Record<string, string> = {}) {
  const res = await fetch(`${baseUrl}/api/data/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function getJson(url: string) {
  const res = await fetch(url);
  return { status: res.status, body: await res.json() };
}

function csvProvider(body: { providers: Array<{ providerId: string }> }) {
  return body.providers.find((p) => p.providerId === 'CSV_HISTORICAL') as Record<string, unknown>;
}

test('import → query roundtrip over HTTP with SQLite; dryRun writes nothing; health flips honestly', async () => {
  const { repo, cleanup } = withTempSqlite();
  try {
    await withServer(repo, async (baseUrl) => {
      const instrument = await instrumentRepository.findBySymbol('ZC');
      assert.ok(instrument);

      let health = await getJson(`${baseUrl}/api/providers/health`);
      assert.equal(csvProvider(health.body).connectionState, 'UNCONFIGURED');
      assert.equal(health.body.overallStatus, 'UNAVAILABLE');

      // dry run
      const dry = await postImport(baseUrl, { ...baseImport, csv: FIXTURE_CSV, dryRun: true });
      assert.equal(dry.status, 200);
      assert.equal(dry.body.status, 'DRY_RUN_OK');
      assert.equal(dry.body.plan.rowsToWrite, 30);
      assert.equal(dry.body.parse.dateFormat, 'MM/DD/YYYY');
      assert.equal(dry.body.parse.dateFormatSource, 'DETECTED');
      assert.equal((await getJson(`${baseUrl}/api/data/datasets`)).body.count, 0);
      const emptyCandles = await getJson(
        `${baseUrl}/api/market/candles?instrumentId=ZC&contractCode=ZCH25&timeframe=D1`
      );
      assert.equal(emptyCandles.status, 200);
      assert.equal(emptyCandles.body.status, 'UNAVAILABLE');
      assert.match(emptyCandles.body.reason, /DATA_UNAVAILABLE/);
      assert.equal(csvProvider((await getJson(`${baseUrl}/api/providers/health`)).body).connectionState, 'UNCONFIGURED');

      // real import
      const imp = await postImport(baseUrl, { ...baseImport, csv: FIXTURE_CSV });
      assert.equal(imp.status, 201, JSON.stringify(imp.body));
      assert.equal(imp.body.status, 'IMPORTED');
      const ds = imp.body.dataset;
      assert.equal(ds.instrumentId, instrument.id);
      assert.equal(ds.contractCode, 'ZCH25');
      assert.equal(ds.rowCount, 30);
      assert.equal(ds.insertedCount, 30);
      assert.equal(ds.priceUnit, instrument.specification.quotationUnit);
      assert.equal(ds.priceUnitDeclared, false);
      assert.equal(ds.continuousAdjustment, 'NONE');
      assert.equal(ds.checksum, createHash('sha256').update(FIXTURE_CSV, 'utf8').digest('hex'));
      assert.equal(ds.firstTimestamp, '2025-01-06T00:00:00.000Z');
      assert.equal(ds.lastTimestamp, '2025-02-17T00:00:00.000Z');
      assert.equal(ds.timezone, 'America/Chicago');

      const list = await getJson(`${baseUrl}/api/data/datasets?instrumentId=${encodeURIComponent(instrument.id)}`);
      assert.equal(list.body.count, 1);
      assert.equal((await getJson(`${baseUrl}/api/data/datasets?instrumentId=ZS`)).body.count, 0);

      const candles = await getJson(
        `${baseUrl}/api/market/candles?instrumentId=ZC&contractCode=ZCH25&timeframe=D1`
      );
      assert.equal(candles.status, 200);
      assert.equal(candles.body.status, 'HISTORICAL');
      assert.equal(candles.body.count, 30);
      assert.equal(candles.body.candles[0].timestamp, '2025-01-06T00:00:00.000Z');
      assert.equal(candles.body.candles[0].close, 438.68);
      assert.equal(candles.body.candles[0].status, 'HISTORICAL');
      assert.equal(candles.body.candles[0].datasetId, ds.id);
      assert.equal(candles.body.provenance.length, 1);
      assert.equal(candles.body.provenance[0].sourceQuality, 'USER_PROVIDED');
      assert.equal(candles.body.provenance[0].checksum, ds.checksum);
      assert.equal(candles.body.priceUnit, ds.priceUnit);

      const ranged = await getJson(
        `${baseUrl}/api/market/candles?instrumentId=ZC&contractCode=ZCH25&timeframe=D1&from=2025-01-13&to=2025-01-17&limit=3`
      );
      assert.equal(ranged.body.totalInRange, 5);
      assert.equal(ranged.body.truncated, true);
      assert.deepEqual(
        ranged.body.candles.map((c: { timestamp: string }) => c.timestamp.slice(0, 10)),
        ['2025-01-15', '2025-01-16', '2025-01-17']
      );

      health = await getJson(`${baseUrl}/api/providers/health`);
      const csv = csvProvider(health.body);
      assert.equal(csv.connectionState, 'CONNECTED');
      assert.equal(csv.dataStatus, 'HISTORICAL');
      assert.match(String(csv.message), /1 dataset\(s\), 30 candle\(s\).*2025-02-17/);
      assert.equal(health.body.overallStatus, 'HISTORICAL', 'historical data must never be reported as CURRENT');

      const apiHealth = await getJson(`${baseUrl}/api/health`);
      assert.equal(apiHealth.body.capabilities.marketDataOverallStatus, 'HISTORICAL');
      assert.equal(apiHealth.body.capabilities.marketDataLiveProvidersConnected, 0);

      // live quotes stay fail-closed
      const quote = await getJson(`${baseUrl}/api/market/quotes/ZC`);
      assert.equal(quote.body.quote.status, 'UNAVAILABLE');
      assert.equal(quote.body.quote.price, null);
      const quotes = await getJson(`${baseUrl}/api/market/quotes`);
      assert.equal(quotes.body.overallStatus, 'UNAVAILABLE');
    });
  } finally {
    cleanup();
  }
});

test('re-import conflict modes over HTTP: reject_conflicts (409), append, replace, identical → NO_CHANGES', async () => {
  await withServer(new InMemoryCandleRepository(), async (baseUrl) => {
    assert.equal((await postImport(baseUrl, { ...baseImport, csv: FIXTURE_CSV })).status, 201);

    const identical = await postImport(baseUrl, { ...baseImport, csv: FIXTURE_CSV });
    assert.equal(identical.status, 200);
    assert.equal(identical.body.status, 'NO_CHANGES');
    assert.ok(identical.body.warnings.some((w: { code: string }) => w.code === 'DUPLICATE_FILE'));

    // change the close on line 4 (2025-01-07) from 441.73 to 441.50, and add one new day
    const modified =
      FIXTURE_CSV.replace('01/07/2025,438.77,444.48,438.55,441.73', '01/07/2025,438.77,444.48,438.55,441.50') +
      '02/18/2025,431.00,432.00,430.00,431.50,100000,1536000\r\n';

    const rejected = await postImport(baseUrl, { ...baseImport, csv: modified });
    assert.equal(rejected.status, 409);
    assert.equal(rejected.body.error, 'REJECTED_CONFLICTS');
    assert.equal(rejected.body.conflicts.length, 1);
    assert.equal(rejected.body.conflicts[0].line, 4);
    assert.equal(rejected.body.conflicts[0].stored.close, 441.73);
    assert.equal(rejected.body.conflicts[0].incoming.close, 441.5);
    const after = await getJson(`${baseUrl}/api/market/candles?instrumentId=ZC&contractCode=ZCH25&timeframe=D1`);
    assert.equal(after.body.count, 30, 'rejected import wrote nothing');

    const dryAppend = await postImport(baseUrl, { ...baseImport, csv: modified, mode: 'append', dryRun: true });
    assert.equal(dryAppend.body.status, 'DRY_RUN_OK');
    assert.equal(dryAppend.body.plan.rowsToWrite, 1);

    const appended = await postImport(baseUrl, { ...baseImport, csv: modified, mode: 'append' });
    assert.equal(appended.status, 201);
    assert.equal(appended.body.dataset.insertedCount, 1);
    assert.ok(appended.body.warnings.some((w: { code: string }) => w.code === 'CONFLICTS_SKIPPED'));
    const afterAppend = await getJson(`${baseUrl}/api/market/candles?instrumentId=ZC&contractCode=ZCH25&timeframe=D1`);
    assert.equal(afterAppend.body.count, 31);
    assert.equal(afterAppend.body.candles[1].close, 441.73, 'append keeps stored value');
    assert.equal(afterAppend.body.provenance.length, 2);

    const replaced = await postImport(baseUrl, { ...baseImport, csv: modified, mode: 'replace' });
    assert.equal(replaced.status, 201);
    assert.ok(replaced.body.warnings.some((w: { code: string }) => w.code === 'SERIES_REPLACED'));
    const afterReplace = await getJson(`${baseUrl}/api/market/candles?instrumentId=ZC&contractCode=ZCH25&timeframe=D1`);
    assert.equal(afterReplace.body.count, 31);
    assert.equal(afterReplace.body.candles[1].close, 441.5);
    assert.equal((await getJson(`${baseUrl}/api/data/datasets`)).body.count, 1);
  });
});

test('import validation: per-line CSV errors (422), zod errors (400), unknown instrument (404), request consistency', async () => {
  await withServer(new InMemoryCandleRepository(), async (baseUrl) => {
    const bad = await postImport(baseUrl, {
      ...baseImport,
      csv: 'Date,Open,High,Low,Close\n2025-01-06,10,11,9,10\n2025-01-07,10,9,11,10\n2025-01-08,abc,11,9,10\n',
    });
    assert.equal(bad.status, 422);
    assert.equal(bad.body.error, 'REJECTED_INVALID_DATA');
    assert.deepEqual(
      bad.body.errors.map((e: { line: number }) => e.line),
      [3, 4]
    );
    assert.equal((await getJson(`${baseUrl}/api/data/datasets`)).body.count, 0);

    const ambiguous = await postImport(baseUrl, { ...baseImport, csv: 'Date,Open,High,Low,Close\n01/02/2025,10,11,9,10\n' });
    assert.equal(ambiguous.status, 422);
    assert.match(ambiguous.body.errors[0].message, /dateFormat/);

    const declared = await postImport(baseUrl, {
      ...baseImport,
      csv: 'Date,Open,High,Low,Close\n01/02/2025,10,11,9,10\n',
      dateFormat: 'DD/MM/YYYY',
      dryRun: true,
    });
    assert.equal(declared.status, 200);
    assert.equal(declared.body.parse.firstTimestamp, '2025-02-01T00:00:00.000Z');

    const noTz = await postImport(baseUrl, { ...baseImport, timezone: undefined, csv: FIXTURE_CSV });
    assert.equal(noTz.status, 400);
    assert.equal(noTz.body.error, 'VALIDATION_ERROR');
    assert.equal((await postImport(baseUrl, { ...baseImport, timezone: 'Mars/Base', csv: FIXTURE_CSV })).status, 400);
    assert.equal((await postImport(baseUrl, { ...baseImport, sourceQuality: 'TRUSTED', csv: FIXTURE_CSV })).status, 400);
    assert.equal((await postImport(baseUrl, { ...baseImport, csv: FIXTURE_CSV, unexpected: 1 })).status, 400);

    const unknown = await postImport(baseUrl, { ...baseImport, instrumentId: 'NOPE', csv: FIXTURE_CSV });
    assert.equal(unknown.status, 404);
    assert.equal(unknown.body.error, 'INSTRUMENT_NOT_FOUND');

    const continuous = await postImport(baseUrl, { ...baseImport, contractCode: 'CONTINUOUS', csv: FIXTURE_CSV });
    assert.equal(continuous.status, 422);
    assert.equal(continuous.body.error, 'INVALID_REQUEST');

    const continuousOk = await postImport(baseUrl, {
      ...baseImport,
      contractCode: 'CONTINUOUS',
      continuousAdjustment: 'BACK_ADJUSTED',
      priceUnit: 'USD/bushel',
      csv: FIXTURE_CSV,
    });
    assert.equal(continuousOk.status, 201);
    assert.equal(continuousOk.body.dataset.continuousAdjustment, 'BACK_ADJUSTED');
    assert.equal(continuousOk.body.dataset.priceUnit, 'USD/bushel');
    assert.equal(continuousOk.body.dataset.priceUnitDeclared, true);
    assert.ok(continuousOk.body.warnings.some((w: { code: string }) => w.code === 'PRICE_UNIT_DIFFERS'));

    // appending a different unit to the same series is refused
    const mismatch = await postImport(baseUrl, {
      ...baseImport,
      contractCode: 'CONTINUOUS',
      continuousAdjustment: 'BACK_ADJUSTED',
      mode: 'append',
      csv: FIXTURE_CSV + '02/18/2025,431.00,432.00,430.00,431.50,100000,1536000\r\n',
    });
    assert.equal(mismatch.status, 409);
    assert.equal(mismatch.body.error, 'REJECTED_SERIES_MISMATCH');

    const badQuery = await getJson(`${baseUrl}/api/market/candles?instrumentId=ZC&contractCode=ZCH25&timeframe=D2`);
    assert.equal(badQuery.status, 400);
    const badRange = await getJson(
      `${baseUrl}/api/market/candles?instrumentId=ZC&contractCode=ZCH25&timeframe=D1&from=2025-02-01&to=2025-01-01`
    );
    assert.equal(badRange.status, 400);
    const unknownInst = await getJson(`${baseUrl}/api/market/candles?instrumentId=NOPE&contractCode=X&timeframe=D1`);
    assert.equal(unknownInst.status, 404);
  });
});

test('DELETE /api/data/datasets/:id removes candles and provider health returns to UNCONFIGURED', async () => {
  await withServer(new InMemoryCandleRepository(), async (baseUrl) => {
    const imp = await postImport(baseUrl, { ...baseImport, csv: FIXTURE_CSV });
    const id = imp.body.dataset.id;
    assert.equal(csvProvider((await getJson(`${baseUrl}/api/providers/health`)).body).connectionState, 'CONNECTED');

    const del = await fetch(`${baseUrl}/api/data/datasets/${id}`, { method: 'DELETE' });
    assert.equal(del.status, 200);
    assert.deepEqual(await del.json(), { deleted: true, datasetId: id, candlesDeleted: 30 });

    const candles = await getJson(`${baseUrl}/api/market/candles?instrumentId=ZC&contractCode=ZCH25&timeframe=D1`);
    assert.equal(candles.body.status, 'UNAVAILABLE');
    assert.equal(csvProvider((await getJson(`${baseUrl}/api/providers/health`)).body).connectionState, 'UNCONFIGURED');

    assert.equal((await fetch(`${baseUrl}/api/data/datasets/${id}`, { method: 'DELETE' })).status, 404);
    assert.equal((await fetch(`${baseUrl}/api/data/datasets/not-a-uuid`, { method: 'DELETE' })).status, 400);
  });
});

test('body limit: import route accepts > 256kb, other routes do not, import rejects > 10mb with 413', async () => {
  await withServer(new InMemoryCandleRepository(), async (baseUrl) => {
    const padding = 'x'.repeat(12_000);
    const bigCsv = FIXTURE_CSV.split('\r\n')
      .map((line, i) => (line === '' ? line : i === 0 ? line : i === 1 ? `${line},Note` : `${line},${padding}`))
      .join('\r\n');
    assert.ok(bigCsv.length > 300_000);
    const big = await postImport(baseUrl, { ...baseImport, csv: bigCsv, dryRun: true });
    assert.equal(big.status, 200, JSON.stringify(big.body).slice(0, 300));
    assert.equal(big.body.parse.validRowCount, 30);

    const elsewhere = await fetch(`${baseUrl}/api/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv: bigCsv }),
    });
    assert.equal(elsewhere.status, 413);

    const huge = await fetch(`${baseUrl}/api/data/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...baseImport, csv: 'x'.repeat(10.5 * 1024 * 1024) }),
    });
    assert.equal(huge.status, 413);
    assert.equal((await huge.json()).error, 'PAYLOAD_TOO_LARGE');
  });
});

// ---------------------------------------------------------------------------------------------
// T29: non-positive prices
// ---------------------------------------------------------------------------------------------

// Illustrative CLK20-style daily bars (May-2020 WTI settled at −37.63 on 2020-04-20). Test-only values.
const CL_NEGATIVE_CSV = [
  'Date,Open,High,Low,Close,Volume,Open Interest',
  '2020-04-16,19.85,20.40,19.20,19.87,200000,150000',
  '2020-04-17,19.80,20.40,17.31,18.27,220000,140000',
  '2020-04-20,17.73,17.85,-40.32,-37.63,250000,108000',
  // Fixture made OHLC-consistent (high >= close); the WIP row used high 1.00 < settle 10.01, which the validator rejects.
  '2020-04-21,-14.00,10.01,-16.74,10.01,30000,2000',
  '',
].join('\n');

const clImport = {
  instrumentId: 'CL',
  contractCode: 'CLK20',
  timeframe: 'D1',
  timezone: 'America/New_York',
  sourceLabel: 'synthetic test fixture',
  sourceQuality: 'USER_PROVIDED',
  csv: CL_NEGATIVE_CSV,
};

test('non-positive prices: rejected by default, accepted with allowNonPositivePrices + NON_POSITIVE_PRICE warning', async () => {
  await withServer(new InMemoryCandleRepository(), async (baseUrl) => {
    const rejected = await postImport(baseUrl, clImport);
    assert.equal(rejected.status, 422);
    assert.equal(rejected.body.error, 'REJECTED_INVALID_DATA');
    assert.deepEqual([...new Set(rejected.body.errors.map((e: { line: number }) => e.line))], [4, 5]);
    assert.match(rejected.body.errors[0].message, /allowNonPositivePrices/);

    const ok = await postImport(baseUrl, { ...clImport, allowNonPositivePrices: true });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    const w = ok.body.warnings.find((x: { code: string }) => x.code === 'NON_POSITIVE_PRICE');
    assert.ok(w, 'NON_POSITIVE_PRICE warning expected');
    assert.equal(w.line, 4);
    assert.match(w.message, /^2 bar\(s\).*lines 4, 5/);
    assert.ok(
      !ok.body.warnings.some((x: { code: string; line: number }) => x.code === 'PRICE_JUMP' && x.line === 5),
      'no % jump computed from a negative previous close'
    );

    const candles = await getJson(`${baseUrl}/api/market/candles?instrumentId=CL&contractCode=CLK20&timeframe=D1`);
    assert.equal(candles.body.count, 4);
    assert.equal(candles.body.candles[2].close, -37.63);

    assert.equal((await postImport(baseUrl, { ...clImport, allowNonPositivePrices: 'yes' })).status, 400);

    // Still rejects broken OHLC relationships and negative volume with the flag.
    const broken = await postImport(baseUrl, {
      ...clImport,
      contractCode: 'CLM20',
      allowNonPositivePrices: true,
      csv: 'Date,Open,High,Low,Close,Volume\n2020-04-20,-1,-5,-40,-3,10\n2020-04-21,-1,1,-2,0,-7\n',
    });
    assert.equal(broken.status, 422);
    assert.deepEqual(
      broken.body.errors.map((e: { line: number }) => e.line),
      [2, 3]
    );
  });
});

test('CONTINUOUS + BACK_ADJUSTED implies allowNonPositivePrices; other adjustments do not', async () => {
  await withServer(new InMemoryCandleRepository(), async (baseUrl) => {
    const backAdjusted = await postImport(baseUrl, {
      ...clImport,
      contractCode: 'CONTINUOUS',
      continuousAdjustment: 'BACK_ADJUSTED',
    });
    assert.equal(backAdjusted.status, 201, JSON.stringify(backAdjusted.body));
    assert.ok(backAdjusted.body.warnings.some((x: { code: string }) => x.code === 'NON_POSITIVE_PRICE'));

    const ratio = await postImport(baseUrl, {
      ...clImport,
      contractCode: 'CONTINUOUS',
      continuousAdjustment: 'RATIO_ADJUSTED',
      mode: 'replace',
    });
    assert.equal(ratio.status, 422);
    assert.equal(ratio.body.error, 'REJECTED_INVALID_DATA');
  });
});

// ---------------------------------------------------------------------------------------------
// T29: admin auth on mutating endpoints
// ---------------------------------------------------------------------------------------------

const TOKEN = 'test-admin-token-0123456789abcdef';

async function mutate(baseUrl: string, headers: Record<string, string> = {}) {
  const imp = await postImport(baseUrl, { ...baseImport, csv: FIXTURE_CSV, dryRun: true }, headers);
  const del = await fetch(`${baseUrl}/api/data/datasets/${randomUUID()}`, { method: 'DELETE', headers });
  // Invalid body: an authorized request stops at the COT route's validation (400) without touching CFTC/DB.
  const cot = await fetch(`${baseUrl}/api/cot/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ instrumentId: 'bad' }),
  });
  return {
    imp,
    del: { status: del.status, body: await del.json() },
    cot: { status: cot.status, body: await cot.json() },
  };
}

test('admin auth: ADMIN_API_TOKEN set → Bearer token required (401 otherwise), even from loopback', async () => {
  await withServer(
    new InMemoryCandleRepository(),
    async (baseUrl) => {
      const badHeaders: Array<Record<string, string>> = [
        {},
        { Authorization: 'Bearer wrong' },
        { Authorization: TOKEN },
        { Authorization: `Basic ${TOKEN}` },
      ];
      for (const headers of badHeaders) {
        const r = await mutate(baseUrl, headers);
        for (const x of [r.imp, r.del, r.cot]) {
          assert.equal(x.status, 401, JSON.stringify(headers));
          assert.equal(x.body.error, 'UNAUTHORIZED');
        }
      }
      const ok = await mutate(baseUrl, { Authorization: `Bearer ${TOKEN}` });
      assert.equal(ok.imp.status, 200);
      assert.equal(ok.imp.body.status, 'DRY_RUN_OK');
      assert.equal(ok.del.status, 404, 'authorized; dataset does not exist');
      assert.equal(ok.cot.status, 400, 'authorized; reaches COT body validation');
      assert.equal((await mutate(baseUrl, { Authorization: `bearer ${TOKEN}` })).imp.status, 200);

      // Read-only endpoints stay open.
      assert.equal((await getJson(`${baseUrl}/api/data/datasets`)).status, 200);
      assert.equal(
        (await getJson(`${baseUrl}/api/market/candles?instrumentId=ZC&contractCode=ZCH25&timeframe=D1`)).status,
        200
      );
    },
    { adminToken: TOKEN }
  );
});

test('admin auth: no token → loopback allowed, proxied or non-loopback requests get 403', async () => {
  const warnings: string[] = [];
  await withServer(
    new InMemoryCandleRepository(),
    async (baseUrl) => {
      const local = await mutate(baseUrl);
      assert.equal(local.imp.status, 200);
      assert.equal(local.del.status, 404);
      assert.equal(local.cot.status, 400);

      // A request relayed by a reverse proxy on the same host is not treated as local.
      const proxied = await mutate(baseUrl, { 'X-Forwarded-For': '127.0.0.1' });
      for (const x of [proxied.imp, proxied.del, proxied.cot]) {
        assert.equal(x.status, 403);
        assert.equal(x.body.error, 'FORBIDDEN');
        assert.match(x.body.message, /ADMIN_API_TOKEN/);
      }
    },
    { logWarn: (m) => warnings.push(m) }
  );
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /ADMIN_API_TOKEN is not set/);

  await withServer(
    new InMemoryCandleRepository(),
    async (baseUrl) => {
      const remote = await mutate(baseUrl);
      for (const x of [remote.imp, remote.del, remote.cot]) assert.equal(x.status, 403);
      assert.equal((await getJson(`${baseUrl}/api/data/datasets`)).status, 200);
    },
    { adminIsLoopback: () => false }
  );
});

test('adminAuth helpers: loopback detection, constant-time compare, env fallback, startup warning', () => {
  const fakeReq = (remoteAddress: string, headers: Record<string, string> = {}) =>
    ({ socket: { remoteAddress }, headers }) as unknown as Request;
  assert.equal(isDirectLoopbackRequest(fakeReq('127.0.0.1')), true);
  assert.equal(isDirectLoopbackRequest(fakeReq('::1')), true);
  assert.equal(isDirectLoopbackRequest(fakeReq('::ffff:127.0.0.1')), true);
  assert.equal(isDirectLoopbackRequest(fakeReq('192.168.1.20')), false);
  assert.equal(isDirectLoopbackRequest(fakeReq('127.0.0.1', { forwarded: 'for=1.2.3.4' })), false);

  assert.equal(tokensMatch('abc', 'abc'), true);
  assert.equal(tokensMatch('abc', 'abd'), false);
  assert.equal(tokensMatch('abc', 'abcd'), false);

  assert.match(String(adminAuthStartupWarning(null)), /not set/);
  assert.match(String(adminAuthStartupWarning('  ')), /not set/);
  assert.match(String(adminAuthStartupWarning('short')), /shorter than 16/);
  assert.equal(adminAuthStartupWarning(TOKEN), null);

  // Default (token undefined) follows process.env.ADMIN_API_TOKEN at request time.
  const prev = process.env.ADMIN_API_TOKEN;
  process.env.ADMIN_API_TOKEN = TOKEN;
  try {
    const mw = createRequireAdminToken();
    let status = 0;
    let nextCalled = false;
    const res = {
      setHeader: () => res,
      status: (s: number) => {
        status = s;
        return res;
      },
      json: () => res,
    };
    mw(fakeReq('127.0.0.1'), res as never, () => {
      nextCalled = true;
    });
    assert.equal(status, 401);
    assert.equal(nextCalled, false);
    mw(fakeReq('127.0.0.1', { authorization: `Bearer ${TOKEN}` }), res as never, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
  } finally {
    if (prev === undefined) delete process.env.ADMIN_API_TOKEN;
    else process.env.ADMIN_API_TOKEN = prev;
  }
});
