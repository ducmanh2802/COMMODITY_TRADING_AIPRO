import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CftcFetchError, type CftcClientLike, type CftcFetchRequest } from './client.ts';
import { CftcHistoricalFileSource } from './fileSource.ts';
import { parseCftcCsv } from './parser.ts';
import { SqliteCotRepository } from './repository.ts';
import { CotService } from './service.ts';
import { buildZip } from './__fixtures__/buildZip.ts';

const fixtureText = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), 'utf8');
const DISAGG = 'cftc_disagg_fut_2026_corn_002602.csv';
const LEGACY = 'cftc_legacy_fut_2026_corn_002602.csv';

/** Fixture text plus a row for another market (code 067651) that must be filtered out. */
function withForeignRow(text: string): string {
  const lines = text.trimEnd().split(/\r?\n/);
  const foreign = lines[1].replace('"CORN - CHICAGO BOARD OF TRADE"', '"CRUDE OIL, LIGHT SWEET - NYMEX"').replace(',002602,', ',067651,');
  return [...lines, foreign].join('\r\n') + '\r\n';
}

const NOW = new Date('2026-11-17T12:00:00Z');
const BASE = 'https://www.cftc.gov/files/dea/history';

interface Harness {
  calls: string[];
  sleeps: number[];
  routes: Map<string, Array<() => Response>>;
  source: (now?: Date, extra?: object) => CftcHistoricalFileSource;
  dir: string;
}

function harness(): Harness {
  const dir = mkdtempSync(path.join(tmpdir(), 'cot-cache-'));
  const h: Harness = {
    calls: [],
    sleeps: [],
    routes: new Map(),
    dir,
    source: (now = NOW, extra = {}) =>
      new CftcHistoricalFileSource({
        cacheDir: dir,
        now: () => now,
        backoffBaseMs: 100,
        requestDelayMs: 7,
        sleep: async (ms) => {
          h.sleeps.push(ms);
        },
        fetchImpl: (async (input: string | URL | Request) => {
          const url = String(input);
          h.calls.push(url);
          const queue = h.routes.get(url);
          const next = queue && queue.length > 1 ? queue.shift()! : queue?.[0];
          if (!next) return new Response('Not Found', { status: 404 });
          return next();
        }) as typeof fetch,
        ...extra,
      }),
  };
  return h;
}

const zipResponse = (entryName: string, text: string, method: 0 | 8 = 8) => () =>
  new Response(new Uint8Array(buildZip([{ name: entryName, data: text, method }])), { status: 200 });

test('downloads each year sequentially, extracts f_year.txt, filters by market code and from-date', async () => {
  const h = harness();
  try {
    h.routes.set(`${BASE}/fut_disagg_txt_2025.zip`, [zipResponse('f_year.txt', withForeignRow(fixtureText(DISAGG)).replace(/2026-1/g, '2025-1'), 0)]);
    h.routes.set(`${BASE}/fut_disagg_txt_2026.zip`, [zipResponse('f_year.txt', withForeignRow(fixtureText(DISAGG)))]);
    const res = await h.source().fetchReports({ reportType: 'DISAGGREGATED', marketCode: '002602', from: '2025-11-01' });
    assert.deepEqual(h.calls, [`${BASE}/fut_disagg_txt_2025.zip`, `${BASE}/fut_disagg_txt_2026.zip`]);
    assert.deepEqual(h.sleeps, [7]); // polite delay between the two downloads
    assert.equal(res.source, 'files');
    assert.equal(res.pages, 2);
    // 2025 file: 2025-11-10, 2025-11-03 kept; 2025-10-27 is before `from`. 2026: all 3. Foreign rows dropped.
    const dates = res.records.map((r) => (r as Record<string, string>)['Report_Date_as_YYYY-MM-DD']);
    assert.deepEqual(dates, ['2025-11-10', '2025-11-03', '2026-11-10', '2026-11-03', '2026-10-27']);
    assert.deepEqual(res.recordProvenance?.map((p) => path.basename(p.sourceUrl)), [
      'fut_disagg_txt_2025.zip',
      'fut_disagg_txt_2025.zip',
      'fut_disagg_txt_2026.zip',
      'fut_disagg_txt_2026.zip',
      'fut_disagg_txt_2026.zip',
    ]);
    const meta = JSON.parse(readFileSync(path.join(h.dir, 'fut_disagg_txt_2026.zip.json'), 'utf8'));
    assert.match(meta.sha256, /^[0-9a-f]{64}$/);
    assert.equal(meta.fetchedAt, NOW.toISOString());
    assert.equal(meta.url, `${BASE}/fut_disagg_txt_2026.zip`);
  } finally {
    rmSync(h.dir, { recursive: true, force: true });
  }
});

test('cache: past year reused once final; current year refetched after 1 day; corrupted cache refetched', async () => {
  const h = harness();
  try {
    h.routes.set(`${BASE}/deacot2025.zip`, [zipResponse('annual.txt', fixtureText(LEGACY).replace(/2026-1/g, '2025-1'))]);
    h.routes.set(`${BASE}/deacot2026.zip`, [zipResponse('annual.txt', fixtureText(LEGACY))]);
    const req: CftcFetchRequest = { reportType: 'LEGACY', marketCode: '002602', from: '2025-01-01' };

    // 1st run (2026-11-17): both downloaded. 2025 was fetched after the year ended → final.
    await h.source().fetchReports(req);
    assert.equal(h.calls.length, 2);

    // Same day: nothing downloaded.
    const again = await h.source(new Date('2026-11-17T20:00:00Z')).fetchReports(req);
    assert.equal(h.calls.length, 2);
    assert.equal(again.records.length, 6);
    assert.equal(again.recordProvenance?.[5].fetchedAt, NOW.toISOString()); // provenance = original fetch time

    // Two days later: only the current year is refetched.
    await h.source(new Date('2026-11-19T12:00:00Z')).fetchReports(req);
    assert.deepEqual(h.calls.slice(2), [`${BASE}/deacot2026.zip`]);

    // Corrupt the cached 2025 zip → SHA-256 mismatch → refetched.
    writeFileSync(path.join(h.dir, 'deacot2025.zip'), 'garbage');
    await h.source(new Date('2026-11-19T13:00:00Z')).fetchReports(req);
    assert.deepEqual(h.calls.slice(3), [`${BASE}/deacot2025.zip`]);
  } finally {
    rmSync(h.dir, { recursive: true, force: true });
  }
});

test('a past-year file cached during that year is not treated as final', async () => {
  const h = harness();
  try {
    h.routes.set(`${BASE}/deacot2025.zip`, [zipResponse('annual.txt', fixtureText(LEGACY).replace(/2026-1/g, '2025-1'))]);
    const req: CftcFetchRequest = { reportType: 'LEGACY', marketCode: '002602', from: '2025-01-01' };
    await h.source(new Date('2025-12-31T12:00:00Z')).fetchReports(req);
    // 2026-01-05: the 2025 copy is from 2025 and > 1 day old → refetched (late-December reports).
    await h.source(new Date('2026-01-05T12:00:00Z')).fetchReports(req);
    assert.deepEqual(h.calls, [`${BASE}/deacot2025.zip`, `${BASE}/deacot2025.zip`, `${BASE}/deacot2026.zip`]);
  } finally {
    rmSync(h.dir, { recursive: true, force: true });
  }
});

test('retries 5xx/429/network errors; no retry on 4xx; current-year 404 is skipped with a note', async () => {
  const h = harness();
  try {
    h.routes.set(`${BASE}/deacot2026.zip`, [
      () => new Response('busy', { status: 503 }),
      () => {
        throw new TypeError('fetch failed');
      },
      () => new Response('slow down', { status: 429 }),
      zipResponse('annual.txt', fixtureText(LEGACY)),
    ]);
    const res = await h
      .source(NOW, { maxAttempts: 4 })
      .fetchReports({ reportType: 'LEGACY', marketCode: '002602', from: '2026-01-01' });
    assert.equal(res.records.length, 3);
    assert.equal(h.calls.length, 4);
    assert.deepEqual(h.sleeps, [100, 200, 400]);

    // Past year 404 → fails immediately (one request).
    const h2 = harness();
    try {
      await assert.rejects(
        h2.source().fetchReports({ reportType: 'LEGACY', marketCode: '002602', from: '2025-06-01' }),
        (e: unknown) => e instanceof CftcFetchError && e.httpStatus === 404 && e.attempts === 1
      );
      assert.equal(h2.calls.length, 1);
      // Early January, current-year file not yet published → skipped with a note.
      h2.routes.set(`${BASE}/deacot2025.zip`, [zipResponse('annual.txt', fixtureText(LEGACY).replace(/2026-1/g, '2025-1'))]);
      const jan = await h2
        .source(new Date('2026-01-02T12:00:00Z'))
        .fetchReports({ reportType: 'LEGACY', marketCode: '002602', from: '2025-11-01' });
      assert.equal(jan.records.length, 2);
      assert.match(jan.notes?.join(' ') ?? '', /deacot2026\.zip: not published yet/);
    } finally {
      rmSync(h2.dir, { recursive: true, force: true });
    }
  } finally {
    rmSync(h.dir, { recursive: true, force: true });
  }
});

test('rejects non-zip bodies, corrupted zips and archives without the expected text file', async () => {
  const h = harness();
  try {
    const url = `${BASE}/deacot2026.zip`;
    const req: CftcFetchRequest = { reportType: 'LEGACY', marketCode: '002602', from: '2026-01-01' };
    h.routes.set(url, [() => new Response('<html>blocked</html>', { status: 200 })]);
    await assert.rejects(h.source().fetchReports(req), /not a zip archive/);

    const good = buildZip([{ name: 'annual.txt', data: fixtureText(LEGACY), method: 8 }]);
    const bad = Buffer.from(good);
    bad[40] ^= 0xff; // inside the deflate stream
    h.routes.set(url, [() => new Response(bad, { status: 200 })]);
    await assert.rejects(h.source(new Date('2026-11-20T00:00:00Z')).fetchReports(req), (e: unknown) => e instanceof CftcFetchError && /Corrupt zip/.test(e.message));

    h.routes.set(url, [() => new Response(new Uint8Array(buildZip([{ name: 'a.txt', data: 'x', method: 0 }, { name: 'b.txt', data: 'y', method: 0 }])), { status: 200 })]);
    await assert.rejects(h.source(new Date('2026-11-22T00:00:00Z')).fetchReports(req), /expected annual\.txt/);

    // Download refresh fails with 5xx but a valid (stale) cache exists → stale copy used, with a note.
    h.routes.set(url, [zipResponse('annual.txt', fixtureText(LEGACY))]);
    await h.source(new Date('2026-11-23T00:00:00Z')).fetchReports(req);
    h.routes.set(url, [() => new Response('down', { status: 500 })]);
    const stale = await h.source(new Date('2026-11-25T00:00:00Z'), { maxAttempts: 1 }).fetchReports(req);
    assert.equal(stale.records.length, 3);
    assert.match(stale.notes?.join(' ') ?? '', /using cached copy fetched 2026-11-23/);
  } finally {
    rmSync(h.dir, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------------ Socrata vs files: identical rows

/** Field-name map from CFTC legacy text-file headers to the Socrata dataset (6dca-aqww) names. */
const LEGACY_SOCRATA_NAMES: Record<string, string> = {
  'Market and Exchange Names': 'market_and_exchange_names',
  'As of Date in Form YYYY-MM-DD': 'report_date_as_yyyy_mm_dd',
  'CFTC Contract Market Code': 'cftc_contract_market_code',
  'Open Interest (All)': 'open_interest_all',
  'Noncommercial Positions-Long (All)': 'noncomm_positions_long_all',
  'Noncommercial Positions-Short (All)': 'noncomm_positions_short_all',
  'Noncommercial Positions-Spreading (All)': 'noncomm_postions_spread_all',
  'Commercial Positions-Long (All)': 'comm_positions_long_all',
  'Commercial Positions-Short (All)': 'comm_positions_short_all',
  ' Total Reportable Positions-Long (All)': 'tot_rept_positions_long_all',
  'Total Reportable Positions-Short (All)': 'tot_rept_positions_short_all',
  'Nonreportable Positions-Long (All)': 'nonrept_positions_long_all',
  'Nonreportable Positions-Short (All)': 'nonrept_positions_short_all',
};

/** Same real values reshaped the way Socrata returns them (snake_case keys, trimmed strings, timestamps). */
function socrataLike(text: string, legacy: boolean): Record<string, unknown>[] {
  return parseCftcCsv(text).map((row) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      const key = legacy ? LEGACY_SOCRATA_NAMES[k] : k.toLowerCase().replace(/-/g, '_');
      if (key) out[key] = v.trim();
    }
    out.report_date_as_yyyy_mm_dd = `${out.report_date_as_yyyy_mm_dd}T00:00:00.000`;
    return out;
  });
}

class SocrataMock implements CftcClientLike {
  async fetchReports(req: CftcFetchRequest) {
    const records = req.reportType === 'DISAGGREGATED' ? socrataLike(fixtureText(DISAGG), false) : socrataLike(fixtureText(LEGACY), true);
    return { records, sourceUrl: 'https://publicreporting.cftc.gov/resource/x.json', pages: 1, fetchedAt: NOW.toISOString(), source: 'socrata' as const };
  }
}

test('Socrata and historical-file sources store identical rows for the same reports', async () => {
  const h = harness();
  h.routes.set(`${BASE}/fut_disagg_txt_2026.zip`, [zipResponse('f_year.txt', withForeignRow(fixtureText(DISAGG)))]);
  h.routes.set(`${BASE}/deacot2026.zip`, [zipResponse('annual.txt', withForeignRow(fixtureText(LEGACY)))]);
  const repoA = new SqliteCotRepository(':memory:');
  const repoB = new SqliteCotRepository(':memory:');
  try {
    const viaSocrata = new CotService({ repository: repoA, client: new SocrataMock(), sourceMode: 'socrata', now: () => NOW });
    const viaFiles = new CotService({ repository: repoB, fileSource: h.source(), sourceMode: 'files', now: () => NOW });
    const a = await viaSocrata.sync('CBOT:ZC', '2026-01-01');
    const b = await viaFiles.sync('CBOT:ZC', '2026-01-01');
    assert.equal(a.status, 'SUCCESS');
    assert.equal(b.status, 'SUCCESS');
    assert.deepEqual(b.results.map((r) => [r.source, r.rowsAccepted, r.rowsRejected]), [
      ['files', 3, 0],
      ['files', 3, 0],
    ]);
    for (const reportType of ['DISAGGREGATED', 'LEGACY'] as const) {
      const strip = (rows: ReturnType<SqliteCotRepository['listReports']>) =>
        rows.map(({ sourceUrl: _s, fetchedAt: _f, ...r }) => r);
      const ra = strip(repoA.listReports({ reportType, marketCode: '002602' }));
      const rb = strip(repoB.listReports({ reportType, marketCode: '002602' }));
      assert.equal(ra.length, 3);
      assert.deepEqual(rb, ra, reportType);
    }
    assert.equal(repoB.listReports({ reportType: 'LEGACY', marketCode: '002602' })[0].sourceUrl, `${BASE}/deacot2026.zip`);
    assert.equal(repoB.lastSync('CBOT:ZC', 'LEGACY')?.source, 'files');
    assert.equal(repoA.lastSync('CBOT:ZC', 'LEGACY')?.source, 'socrata');
  } finally {
    repoA.close();
    repoB.close();
    rmSync(h.dir, { recursive: true, force: true });
  }
});
