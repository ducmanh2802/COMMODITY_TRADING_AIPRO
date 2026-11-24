import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteCandleRepository } from '../storage/sqliteCandleRepository.ts';
import type { CandleRow, DatasetRecord } from '../storage/candleRepository.ts';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 1);
const row = (i: number, o: Partial<CandleRow> = {}): CandleRow => ({
  timestampMs: T0 + i * DAY, open: 100, high: 102, low: 99, close: 101, volume: 0, openInterest: null, ...o,
});

async function seed(repo: SqliteCandleRepository, n: number, label: string, rows: CandleRow[]) {
  const ds: DatasetRecord = {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    instrumentId: `X:I${n}`, contractCode: 'CONTINUOUS', timeframe: 'D1', continuousAdjustment: 'NONE',
    sourceLabel: label, sourceQuality: 'UNOFFICIAL', importedAt: new Date(T0).toISOString(),
    rowCount: rows.length, insertedCount: 0,
    firstTimestamp: new Date(rows[0].timestampMs).toISOString(), lastTimestamp: new Date(rows[rows.length - 1].timestampMs).toISOString(),
    timezone: 'UTC', dateFormat: 'ISO', priceUnit: 'USD', priceUnitDeclared: false, checksum: `c${n}`, importMode: 'reject_conflicts',
  };
  await repo.commitImport(ds, rows, 'reject_conflicts');
  return ds;
}

const q = async (repo: SqliteCandleRepository, n: number) =>
  (await repo.queryCandles({ instrumentId: `X:I${n}`, contractCode: 'CONTINUOUS', timeframe: 'D1' })).rows;

test('purgeImpossibleValues: deletes price<=0 rows, nulls zero volume only for Twelve Data/FMP, keeps Yahoo zero volume, idempotent', async () => {
  const repo = new SqliteCandleRepository(':memory:');
  try {
    await seed(repo, 1, 'Yahoo Finance chart API API sync', [row(0), row(1, { close: 0 }), row(2, { open: -1 }), row(3, { volume: 500 })]);
    await seed(repo, 2, 'Twelve Data (Real-Time) API sync', [row(0), row(1, { volume: 700 })]);
    await seed(repo, 3, 'Financial Modeling Prep (/stable) API sync', [row(0)]);
    await seed(repo, 4, 'unknown source', [row(0)]);

    const first = repo.purgeImpossibleValues();
    assert.deepEqual(first, { badPriceRowsDeleted: 2, zeroVolumeNulled: 2 });
    const yahoo = await q(repo, 1);
    assert.equal(yahoo.length, 2);
    assert.equal(yahoo[0].volume, 0, 'real zero volume from Yahoo kept');
    assert.equal((await q(repo, 2))[0].volume, null);
    assert.equal((await q(repo, 2))[1].volume, 700);
    assert.equal((await q(repo, 3))[0].volume, null);
    assert.equal((await q(repo, 4))[0].volume, 0, 'unknown series untouched');

    assert.deepEqual(repo.purgeImpossibleValues(), { badPriceRowsDeleted: 0, zeroVolumeNulled: 0 });
  } finally {
    repo.close();
  }
});
