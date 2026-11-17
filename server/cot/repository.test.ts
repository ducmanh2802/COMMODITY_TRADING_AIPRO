import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseCftcCsv, parseCotRecord, type CotReportRecord } from './parser.ts';
import { SqliteCotRepository } from './repository.ts';

function fixtureRecords(): CotReportRecord[] {
  const text = readFileSync(
    fileURLToPath(new URL('./__fixtures__/cftc_disagg_fut_2026_corn_002602.csv', import.meta.url)),
    'utf8'
  );
  return parseCftcCsv(text).map((r) => {
    const p = parseCotRecord(r, 'DISAGGREGATED');
    if (!p.ok) throw new Error(p.reason);
    return p.record;
  });
}

const prov = { sourceUrl: 'https://example.test/source', fetchedAt: '2026-11-17T00:00:00.000Z' };

test('upsert is idempotent by (report type, market code, report date)', () => {
  const repo = new SqliteCotRepository(':memory:');
  try {
    const recs = fixtureRecords();
    assert.deepEqual(repo.upsertReports(recs, prov), { inserted: 3, updated: 0, unchanged: 0 });
    assert.deepEqual(repo.upsertReports(recs, prov), { inserted: 0, updated: 0, unchanged: 3 });

    const revised = structuredClone(recs);
    revised[0].openInterest += 1;
    assert.deepEqual(repo.upsertReports(revised, prov), { inserted: 0, updated: 1, unchanged: 2 });

    const listed = repo.listReports({ reportType: 'DISAGGREGATED', marketCode: '002602' });
    assert.equal(listed.length, 3);
    assert.deepEqual(listed.map((r) => r.reportDate), ['2026-10-27', '2026-11-03', '2026-11-10']);
    assert.equal(listed[2].openInterest, 1979759);
    assert.equal(listed[0].sourceUrl, prov.sourceUrl);

    // Same dates under the other report type are separate rows.
    const legacyLike = recs.map((r) => ({ ...r, reportType: 'LEGACY' as const }));
    assert.equal(repo.upsertReports(legacyLike, prov).inserted, 3);
    assert.equal(repo.summary('DISAGGREGATED', '002602').rowCount, 3);

    const ranged = repo.listReports({ reportType: 'DISAGGREGATED', marketCode: '002602', from: '2026-11-01', to: '2026-11-05' });
    assert.deepEqual(ranged.map((r) => r.reportDate), ['2026-11-03']);
    assert.deepEqual(repo.summary('DISAGGREGATED', '002602'), {
      reportType: 'DISAGGREGATED',
      marketCode: '002602',
      rowCount: 3,
      firstReportDate: '2026-10-27',
      lastReportDate: '2026-11-10',
    });
  } finally {
    repo.close();
  }
});

test('sync log records and returns the latest entries', () => {
  const repo = new SqliteCotRepository(':memory:');
  try {
    const base = {
      instrumentId: 'CBOT:ZC',
      reportType: 'DISAGGREGATED' as const,
      marketCode: '002602',
      requestedFrom: '2026-01-01',
      sourceUrl: 'https://example.test',
      startedAt: '2026-11-17T00:00:00.000Z',
      fetchedAt: '2026-11-17T00:00:01.000Z',
      rowsReceived: 3,
      rowsAccepted: 3,
      rowsRejected: 0,
      inserted: 3,
      updated: 0,
      unchanged: 0,
      message: null,
    };
    repo.appendSyncLog({ ...base, status: 'SUCCESS' });
    repo.appendSyncLog({ ...base, status: 'FAILED', fetchedAt: null, message: 'HTTP 403' });
    assert.equal(repo.lastSync('CBOT:ZC', 'DISAGGREGATED')?.status, 'FAILED');
    assert.equal(repo.lastSuccessfulSync('CBOT:ZC', 'DISAGGREGATED')?.rowsAccepted, 3);
    assert.equal(repo.lastSync('CBOT:ZC', 'LEGACY'), null);
  } finally {
    repo.close();
  }
});
