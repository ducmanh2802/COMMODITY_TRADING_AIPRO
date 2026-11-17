import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  InMemoryCandleRepository,
  type CandleRow,
  type DatasetRecord,
  type ICandleRepository,
  type SeriesKey,
} from './candleRepository.ts';
import { SqliteCandleRepository } from './sqliteCandleRepository.ts';

const KEY: SeriesKey = { instrumentId: 'CBOT:ZC', contractCode: 'ZCH25', timeframe: 'D1' };
const DAY = 86_400_000;
const T0 = Date.UTC(2025, 0, 6);

function rows(count: number, startOffsetDays = 0, closeBump = 0): CandleRow[] {
  return Array.from({ length: count }, (_, i) => ({
    timestampMs: T0 + (startOffsetDays + i) * DAY,
    open: 100 + i,
    high: 102 + i + closeBump,
    low: 99 + i,
    close: 101 + i + closeBump,
    volume: 1000 + i,
    openInterest: null,
  }));
}

let seq = 0;
function dataset(r: CandleRow[], overrides: Partial<DatasetRecord> = {}): DatasetRecord {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    ...KEY,
    continuousAdjustment: 'NONE',
    sourceLabel: 'unit test',
    sourceQuality: 'USER_PROVIDED',
    importedAt: new Date(Date.UTC(2026, 0, 1) + seq * 1000).toISOString(),
    rowCount: r.length,
    insertedCount: 0,
    firstTimestamp: new Date(r[0].timestampMs).toISOString(),
    lastTimestamp: new Date(r[r.length - 1].timestampMs).toISOString(),
    timezone: 'America/Chicago',
    dateFormat: 'YYYY-MM-DD',
    priceUnit: 'cents/bushel',
    priceUnitDeclared: false,
    checksum: `sum-${seq}`,
    importMode: 'reject_conflicts',
    ...overrides,
  };
}

const factories: Array<[string, () => { repo: ICandleRepository; cleanup: () => void }]> = [
  ['in-memory', () => ({ repo: new InMemoryCandleRepository(), cleanup: () => {} })],
  [
    'sqlite (temp file)',
    () => {
      const dir = mkdtempSync(path.join(tmpdir(), 'candles-test-'));
      const repo = new SqliteCandleRepository(path.join(dir, 'nested', 'market.db'));
      return {
        repo,
        cleanup: () => {
          repo.close();
          rmSync(dir, { recursive: true, force: true });
        },
      };
    },
  ],
];

for (const [name, make] of factories) {
  test(`${name}: commit, query window, limit keeps most recent rows`, async () => {
    const { repo, cleanup } = make();
    try {
      const r = rows(10);
      const res = await repo.commitImport(dataset(r), r, 'reject_conflicts');
      assert.equal(res.committed, true);
      assert.equal(res.dataset?.insertedCount, 10);

      const all = await repo.queryCandles(KEY);
      assert.equal(all.rows.length, 10);
      assert.deepEqual(
        { ...all.rows[0], datasetId: undefined },
        { ...r[0], datasetId: undefined }
      );
      const window = await repo.queryCandles(KEY, { fromMs: T0 + 2 * DAY, toMs: T0 + 5 * DAY });
      assert.equal(window.rows.length, 4);
      const limited = await repo.queryCandles(KEY, { limit: 3 });
      assert.equal(limited.truncated, true);
      assert.equal(limited.totalInRange, 10);
      assert.deepEqual(limited.rows.map((x) => x.timestampMs), [T0 + 7 * DAY, T0 + 8 * DAY, T0 + 9 * DAY]);

      const summary = await repo.getSummary();
      assert.equal(summary.datasetCount, 1);
      assert.equal(summary.candleCount, 10);
      assert.equal(summary.lastCandleTimestamp, new Date(T0 + 9 * DAY).toISOString());
    } finally {
      cleanup();
    }
  });

  test(`${name}: reject_conflicts rejects atomically, append skips conflicts, replace rewrites the series`, async () => {
    const { repo, cleanup } = make();
    try {
      const first = rows(5);
      const d1 = dataset(first);
      await repo.commitImport(d1, first, 'reject_conflicts');

      // overlap days 3-4 with different close + new days 5-6
      const second = rows(4, 3, 0.5);
      const rejected = await repo.commitImport(dataset(second), second, 'reject_conflicts');
      assert.equal(rejected.committed, false);
      assert.equal(rejected.plan.conflicts.length, 2);
      assert.equal(rejected.plan.conflicts[0].stored.datasetId, d1.id);
      assert.equal((await repo.queryCandles(KEY)).rows.length, 5, 'nothing written on rejection');
      assert.equal((await repo.listDatasets()).length, 1);

      // identical overlap + new rows passes reject_conflicts
      const extension = rows(7).slice(3);
      const ok = await repo.commitImport(dataset(extension), extension, 'reject_conflicts');
      assert.equal(ok.committed, true);
      assert.equal(ok.plan.unchangedCount, 2);
      assert.equal(ok.dataset?.insertedCount, 2);

      const appended = rows(4, 5, 0.5); // days 5-6 conflict, 7-8 new
      const app = await repo.commitImport(dataset(appended), appended, 'append');
      assert.equal(app.committed, true);
      assert.equal(app.plan.conflicts.length, 2);
      assert.equal(app.dataset?.insertedCount, 2);
      const afterAppend = await repo.queryCandles(KEY);
      assert.equal(afterAppend.rows.length, 9);
      assert.equal(afterAppend.rows[5].close, 106, 'append never overwrites stored rows');

      const replacement = rows(3, 0, 0.25);
      const rep = await repo.commitImport(dataset(replacement), replacement, 'replace');
      assert.equal(rep.committed, true);
      assert.equal(rep.plan.existingSeriesRowCount, 9);
      const afterReplace = await repo.queryCandles(KEY);
      assert.equal(afterReplace.rows.length, 3);
      assert.equal(afterReplace.rows[0].close, 101.25);
      assert.equal((await repo.listDatasets()).length, 1);
    } finally {
      cleanup();
    }
  });

  test(`${name}: series metadata mismatch, no-change imports, delete cascades candles`, async () => {
    const { repo, cleanup } = make();
    try {
      const r = rows(4);
      const d = dataset(r);
      await repo.commitImport(d, r, 'reject_conflicts');

      const more = rows(2, 4);
      const mismatch = await repo.commitImport(dataset(more, { priceUnit: 'USD/bushel' }), more, 'append');
      assert.equal(mismatch.committed, false);
      assert.match(mismatch.plan.seriesMismatch ?? '', /priceUnit/);

      const same = await repo.commitImport(dataset(r, { checksum: d.checksum }), r, 'reject_conflicts');
      assert.equal(same.committed, false);
      assert.equal(same.plan.unchangedCount, 4);
      assert.equal(same.plan.duplicateChecksumDatasetId, d.id);

      const preview = await repo.previewImport(KEY, more, 'append', {
        priceUnit: 'cents/bushel',
        continuousAdjustment: 'NONE',
        checksum: 'x',
      });
      assert.equal(preview.rowsToWrite.length, 2);
      assert.equal((await repo.queryCandles(KEY)).rows.length, 4, 'preview writes nothing');

      const d2 = dataset(more);
      await repo.commitImport(d2, more, 'append');
      const del = await repo.deleteDataset(d.id);
      assert.deepEqual(del, { deleted: true, candlesDeleted: 4 });
      const remaining = await repo.queryCandles(KEY);
      assert.equal(remaining.rows.length, 2);
      assert.ok(remaining.rows.every((x) => x.datasetId === d2.id));
      assert.deepEqual(await repo.deleteDataset(d.id), { deleted: false, candlesDeleted: 0 });
      assert.equal(await repo.getDataset(d.id), null);
    } finally {
      cleanup();
    }
  });
}

test('sqlite: data persists across reopen of the same file', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'candles-persist-'));
  const file = path.join(dir, 'market.db');
  try {
    const a = new SqliteCandleRepository(file);
    const r = rows(3);
    await a.commitImport(dataset(r), r, 'reject_conflicts');
    a.close();
    const b = new SqliteCandleRepository(file);
    assert.equal((await b.queryCandles(KEY)).rows.length, 3);
    assert.equal((await b.listDatasets({ instrumentId: 'CBOT:ZC' })).length, 1);
    assert.equal((await b.listDatasets({ instrumentId: 'CBOT:ZS' })).length, 0);
    b.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
