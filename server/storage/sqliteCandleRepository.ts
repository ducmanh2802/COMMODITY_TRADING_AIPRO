import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { logger } from '../lib/logger.ts';
import {
  planImport,
  planIsCommittable,
  type CandleQuery,
  type CandleQueryResult,
  type CandleRow,
  type CommitImportResult,
  type ContinuousAdjustment,
  type DatasetRecord,
  type ICandleRepository,
  type ImportMode,
  type ImportPlan,
  type ImportSeriesMeta,
  type RepositorySummary,
  type SeriesKey,
  type SourceQuality,
  type StoredCandleRow,
} from './candleRepository.ts';

export const DEFAULT_MARKET_DB_PATH = path.join('data', 'market.db');
const SCHEMA_VERSION = 1;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS datasets (
  id                    TEXT PRIMARY KEY,
  instrument_id         TEXT NOT NULL,
  contract_code         TEXT NOT NULL,
  timeframe             TEXT NOT NULL,
  continuous_adjustment TEXT NOT NULL CHECK (continuous_adjustment IN ('NONE','UNADJUSTED','BACK_ADJUSTED','RATIO_ADJUSTED')),
  source_label          TEXT NOT NULL,
  source_quality        TEXT NOT NULL CHECK (source_quality IN ('OFFICIAL','LICENSED_VENDOR','UNOFFICIAL','USER_PROVIDED')),
  imported_at           TEXT NOT NULL,
  row_count             INTEGER NOT NULL,
  inserted_count        INTEGER NOT NULL,
  first_ts              INTEGER NOT NULL,
  last_ts               INTEGER NOT NULL,
  timezone              TEXT NOT NULL,
  date_format           TEXT NOT NULL,
  price_unit            TEXT NOT NULL,
  price_unit_declared   INTEGER NOT NULL,
  checksum              TEXT NOT NULL,
  import_mode           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS datasets_series ON datasets (instrument_id, contract_code, timeframe);

CREATE TABLE IF NOT EXISTS candles (
  instrument_id  TEXT NOT NULL,
  contract_code  TEXT NOT NULL,
  timeframe      TEXT NOT NULL,
  ts             INTEGER NOT NULL,
  open           REAL NOT NULL,
  high           REAL NOT NULL,
  low            REAL NOT NULL,
  close          REAL NOT NULL,
  volume         REAL,
  open_interest  REAL,
  dataset_id     TEXT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  PRIMARY KEY (instrument_id, contract_code, timeframe, ts)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS candles_dataset ON candles (dataset_id);
`;

interface DatasetDbRow {
  id: string;
  instrument_id: string;
  contract_code: string;
  timeframe: string;
  continuous_adjustment: string;
  source_label: string;
  source_quality: string;
  imported_at: string;
  row_count: number;
  inserted_count: number;
  first_ts: number;
  last_ts: number;
  timezone: string;
  date_format: string;
  price_unit: string;
  price_unit_declared: number;
  checksum: string;
  import_mode: string;
}

interface CandleDbRow {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  open_interest: number | null;
  dataset_id: string;
}

function toDataset(row: DatasetDbRow): DatasetRecord {
  return {
    id: row.id,
    instrumentId: row.instrument_id,
    contractCode: row.contract_code,
    timeframe: row.timeframe,
    continuousAdjustment: row.continuous_adjustment as ContinuousAdjustment,
    sourceLabel: row.source_label,
    sourceQuality: row.source_quality as SourceQuality,
    importedAt: row.imported_at,
    rowCount: row.row_count,
    insertedCount: row.inserted_count,
    firstTimestamp: new Date(row.first_ts).toISOString(),
    lastTimestamp: new Date(row.last_ts).toISOString(),
    timezone: row.timezone,
    dateFormat: row.date_format,
    priceUnit: row.price_unit,
    priceUnitDeclared: row.price_unit_declared === 1,
    checksum: row.checksum,
    importMode: row.import_mode as ImportMode,
  };
}

function toCandle(row: CandleDbRow): StoredCandleRow {
  return {
    timestampMs: row.ts,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume,
    openInterest: row.open_interest,
    datasetId: row.dataset_id,
  };
}

const SERIES_WHERE = 'instrument_id = ? AND contract_code = ? AND timeframe = ?';

/**
 * SQLite-backed candle repository using Node's built-in `node:sqlite` (no npm dependency).
 * All writes of one import run inside a single transaction.
 */
export class SqliteCandleRepository implements ICandleRepository {
  private readonly db: DatabaseSync;

  /** @param location file path or ':memory:' */
  constructor(location: string) {
    if (location !== ':memory:') {
      mkdirSync(path.dirname(path.resolve(location)), { recursive: true });
    }
    this.db = new DatabaseSync(location);
    this.db.exec('PRAGMA foreign_keys = ON;');
    if (location !== ':memory:') {
      this.db.exec('PRAGMA journal_mode = WAL;');
    }
    const versionRow = this.db.prepare('PRAGMA user_version').get() as { user_version: number };
    if (versionRow.user_version > SCHEMA_VERSION) {
      throw new Error(
        `market DB schema version ${versionRow.user_version} is newer than supported ${SCHEMA_VERSION}`
      );
    }
    this.db.exec(SCHEMA_SQL);
    this.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  }

  private transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  async listDatasets(filter: { instrumentId?: string } = {}): Promise<DatasetRecord[]> {
    const rows = filter.instrumentId
      ? this.db
          .prepare('SELECT * FROM datasets WHERE instrument_id = ? ORDER BY imported_at DESC, id')
          .all(filter.instrumentId)
      : this.db.prepare('SELECT * FROM datasets ORDER BY imported_at DESC, id').all();
    return (rows as unknown as DatasetDbRow[]).map(toDataset);
  }

  async getDataset(id: string): Promise<DatasetRecord | null> {
    const row = this.db.prepare('SELECT * FROM datasets WHERE id = ?').get(id) as unknown as
      | DatasetDbRow
      | undefined;
    return row ? toDataset(row) : null;
  }

  async deleteDataset(id: string): Promise<{ deleted: boolean; candlesDeleted: number }> {
    return this.transaction(() => {
      const candles = this.db.prepare('DELETE FROM candles WHERE dataset_id = ?').run(id);
      const ds = this.db.prepare('DELETE FROM datasets WHERE id = ?').run(id);
      return { deleted: Number(ds.changes) > 0, candlesDeleted: Number(candles.changes) };
    });
  }

  async deleteCandlesBefore(key: SeriesKey, beforeMs: number): Promise<number> {
    return this.transaction(() => {
      const r = this.db
        .prepare(`DELETE FROM candles WHERE ${SERIES_WHERE} AND ts < ?`)
        .run(key.instrumentId, key.contractCode, key.timeframe, beforeMs);
      this.db
        .prepare(
          `DELETE FROM datasets WHERE ${SERIES_WHERE} AND NOT EXISTS (SELECT 1 FROM candles WHERE candles.dataset_id = datasets.id)`
        )
        .run(key.instrumentId, key.contractCode, key.timeframe);
      return Number(r.changes);
    });
  }

  async queryCandles(key: SeriesKey, query: CandleQuery = {}): Promise<CandleQueryResult> {
    const fromMs = query.fromMs ?? Number.MIN_SAFE_INTEGER;
    const toMs = query.toMs ?? Number.MAX_SAFE_INTEGER;
    const params = [key.instrumentId, key.contractCode, key.timeframe, fromMs, toMs] as const;
    const countRow = this.db
      .prepare(`SELECT COUNT(*) AS n FROM candles WHERE ${SERIES_WHERE} AND ts >= ? AND ts <= ?`)
      .get(...params) as { n: number };
    const total = Number(countRow.n);
    const limit = query.limit;
    let rows: CandleDbRow[];
    if (limit !== undefined && total > limit) {
      rows = this.db
        .prepare(
          `SELECT * FROM (SELECT * FROM candles WHERE ${SERIES_WHERE} AND ts >= ? AND ts <= ? ORDER BY ts DESC LIMIT ?) ORDER BY ts ASC`
        )
        .all(...params, limit) as unknown as CandleDbRow[];
    } else {
      rows = this.db
        .prepare(`SELECT * FROM candles WHERE ${SERIES_WHERE} AND ts >= ? AND ts <= ? ORDER BY ts ASC`)
        .all(...params) as unknown as CandleDbRow[];
    }
    return { rows: rows.map(toCandle), totalInRange: total, truncated: limit !== undefined && total > limit };
  }

  private plan(key: SeriesKey, rows: CandleRow[], mode: ImportMode, meta: ImportSeriesMeta): ImportPlan {
    const existing = new Map<number, StoredCandleRow>();
    if (rows.length > 0) {
      let min = rows[0].timestampMs;
      let max = rows[0].timestampMs;
      for (const r of rows) {
        if (r.timestampMs < min) min = r.timestampMs;
        if (r.timestampMs > max) max = r.timestampMs;
      }
      const stored = this.db
        .prepare(`SELECT * FROM candles WHERE ${SERIES_WHERE} AND ts >= ? AND ts <= ?`)
        .all(key.instrumentId, key.contractCode, key.timeframe, min, max) as unknown as CandleDbRow[];
      for (const s of stored) existing.set(s.ts, toCandle(s));
    }
    const seriesDatasets = (
      this.db
        .prepare(`SELECT * FROM datasets WHERE ${SERIES_WHERE}`)
        .all(key.instrumentId, key.contractCode, key.timeframe) as unknown as DatasetDbRow[]
    ).map(toDataset);
    const countRow = this.db
      .prepare(`SELECT COUNT(*) AS n FROM candles WHERE ${SERIES_WHERE}`)
      .get(key.instrumentId, key.contractCode, key.timeframe) as { n: number };
    return planImport({
      mode,
      incoming: rows,
      existingAt: (ts) => existing.get(ts),
      existingSeriesDatasets: seriesDatasets,
      existingSeriesRowCount: Number(countRow.n),
      meta,
    });
  }

  async previewImport(key: SeriesKey, rows: CandleRow[], mode: ImportMode, meta: ImportSeriesMeta): Promise<ImportPlan> {
    return this.plan(key, rows, mode, meta);
  }

  async commitImport(dataset: DatasetRecord, rows: CandleRow[], mode: ImportMode): Promise<CommitImportResult> {
    return this.transaction(() => {
      const plan = this.plan(dataset, rows, mode, dataset);
      if (!planIsCommittable(plan)) return { committed: false, plan, dataset: null };

      if (mode === 'replace') {
        this.db
          .prepare(`DELETE FROM candles WHERE ${SERIES_WHERE}`)
          .run(dataset.instrumentId, dataset.contractCode, dataset.timeframe);
        this.db
          .prepare(`DELETE FROM datasets WHERE ${SERIES_WHERE}`)
          .run(dataset.instrumentId, dataset.contractCode, dataset.timeframe);
      }

      const stored: DatasetRecord = { ...dataset, insertedCount: plan.rowsToWrite.length };
      this.db
        .prepare(
          `INSERT INTO datasets (id, instrument_id, contract_code, timeframe, continuous_adjustment, source_label,
             source_quality, imported_at, row_count, inserted_count, first_ts, last_ts, timezone, date_format,
             price_unit, price_unit_declared, checksum, import_mode)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          stored.id,
          stored.instrumentId,
          stored.contractCode,
          stored.timeframe,
          stored.continuousAdjustment,
          stored.sourceLabel,
          stored.sourceQuality,
          stored.importedAt,
          stored.rowCount,
          stored.insertedCount,
          Date.parse(stored.firstTimestamp),
          Date.parse(stored.lastTimestamp),
          stored.timezone,
          stored.dateFormat,
          stored.priceUnit,
          stored.priceUnitDeclared ? 1 : 0,
          stored.checksum,
          stored.importMode
        );

      // Plain INSERT (no OR REPLACE): the plan guarantees these timestamps are free, and a PK violation
      // here would abort the transaction instead of silently overwriting data.
      const insert = this.db.prepare(
        `INSERT INTO candles (instrument_id, contract_code, timeframe, ts, open, high, low, close, volume, open_interest, dataset_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const r of plan.rowsToWrite) {
        insert.run(
          stored.instrumentId,
          stored.contractCode,
          stored.timeframe,
          r.timestampMs,
          r.open,
          r.high,
          r.low,
          r.close,
          r.volume,
          r.openInterest,
          stored.id
        );
      }
      return { committed: true, plan, dataset: stored };
    });
  }

  async getSummary(): Promise<RepositorySummary> {
    const ds = this.db
      .prepare('SELECT COUNT(*) AS n, MAX(imported_at) AS last FROM datasets')
      .get() as { n: number; last: string | null };
    const c = this.db.prepare('SELECT COUNT(*) AS n, MAX(ts) AS last FROM candles').get() as {
      n: number;
      last: number | null;
    };
    return {
      datasetCount: Number(ds.n),
      candleCount: Number(c.n),
      lastImportedAt: ds.last ?? null,
      lastCandleTimestamp: c.last === null ? null : new Date(Number(c.last)).toISOString(),
    };
  }

  /**
   * Idempotent startup cleanup of values that can never be real:
   *  - candles with any open/high/low/close <= 0 are deleted (a price of 0 is impossible), so the next sync refetches them;
   *  - volume 0 is set to NULL only for datasets from providers that once turned a null/empty volume into 0
   *    (Twelve Data, FMP). Volume 0 from every other source (e.g. Yahoo, which preserves null) can be real and is kept.
   * Open interest and unknown sources are never touched.
   */
  purgeImpossibleValues(): { badPriceRowsDeleted: number; zeroVolumeNulled: number } {
    return this.transaction(() => {
      const del = this.db.prepare('DELETE FROM candles WHERE open <= 0 OR high <= 0 OR low <= 0 OR close <= 0').run();
      const upd = this.db
        .prepare(
          `UPDATE candles SET volume = NULL WHERE volume = 0 AND dataset_id IN (
             SELECT id FROM datasets WHERE source_label LIKE 'Twelve Data%' OR source_label LIKE 'Financial Modeling Prep%')`
        )
        .run();
      return { badPriceRowsDeleted: Number(del.changes), zeroVolumeNulled: Number(upd.changes) };
    });
  }

  close(): void {
    if (this.db.isOpen) this.db.close();
  }
}

let defaultRepository: SqliteCandleRepository | null = null;

/** Lazily opens the shared SQLite repository at MARKET_DB_PATH (default data/market.db). */
export function getDefaultCandleRepository(): SqliteCandleRepository {
  if (!defaultRepository) {
    const location = process.env.MARKET_DB_PATH?.trim() || DEFAULT_MARKET_DB_PATH;
    defaultRepository = new SqliteCandleRepository(location);
    try {
      const r = defaultRepository.purgeImpossibleValues();
      if (r.badPriceRowsDeleted > 0 || r.zeroVolumeNulled > 0) {
        logger.warn(`[startup cleanup] removed ${r.badPriceRowsDeleted} candle rows with price <= 0; nulled ${r.zeroVolumeNulled} fabricated zero volumes`);
      }
    } catch (err) {
      logger.warn(`[startup cleanup] skipped: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }
  return defaultRepository;
}
