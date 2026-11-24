import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { FundamentalMacroRecord } from '../../src/shared/types/analysis.ts';

/**
 * SQLite persistence for FundamentalStore (FRED macro, EIA inventories, USDA, ...).
 * Shares the market DB file (MARKET_DB_PATH), so the T53 GCS backup (VACUUM INTO of that file) includes it.
 * Key = series (dataset) + source + observation date. Values are nullable and NEVER coerced to 0:
 * the numeric/text value columns are NULL when the value is missing, and the full record is kept as JSON.
 */
export const DEFAULT_RETENTION_DAYS = 5 * 366;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS fundamental_records (
  series_id        TEXT NOT NULL,
  source           TEXT NOT NULL,
  observation_date TEXT NOT NULL,
  publication_ts   TEXT NOT NULL,
  category         TEXT,
  actual_num       REAL,
  actual_text      TEXT,
  previous_num     REAL,
  previous_text    TEXT,
  forecast_num     REAL,
  forecast_text    TEXT,
  unit             TEXT NOT NULL,
  quality          TEXT NOT NULL,
  fetched_at       TEXT NOT NULL,
  payload          TEXT NOT NULL,
  PRIMARY KEY (series_id, source, observation_date)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS fundamental_records_obs ON fundamental_records (observation_date);
`;

function split(v: number | string | null | undefined): [number | null, string | null] {
  if (typeof v === 'number') return Number.isFinite(v) ? [v, null] : [null, null];
  if (typeof v === 'string') return [null, v];
  return [null, null];
}

export class FundamentalRepository {
  private readonly db: DatabaseSync;
  constructor(location: string = process.env.MARKET_DB_PATH?.trim() || path.join('data', 'market.db')) {
    if (location !== ':memory:') mkdirSync(path.dirname(path.resolve(location)), { recursive: true });
    this.db = new DatabaseSync(location);
    this.db.exec(SCHEMA_SQL);
  }

  upsert(record: FundamentalMacroRecord, fetchedAt: string = new Date().toISOString()): void {
    const obs = (record.observationDate ?? record.dataPeriod).slice(0, 10);
    const [an, at] = split(record.actualValue);
    const [pn, pt] = split(record.previousValue);
    const [fn, ft] = split(record.forecastValue);
    this.db
      .prepare(
        `INSERT INTO fundamental_records (series_id, source, observation_date, publication_ts, category,
           actual_num, actual_text, previous_num, previous_text, forecast_num, forecast_text, unit, quality, fetched_at, payload)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(series_id, source, observation_date) DO UPDATE SET
           publication_ts = excluded.publication_ts, category = excluded.category,
           actual_num = excluded.actual_num, actual_text = excluded.actual_text,
           previous_num = excluded.previous_num, previous_text = excluded.previous_text,
           forecast_num = excluded.forecast_num, forecast_text = excluded.forecast_text,
           unit = excluded.unit, quality = excluded.quality, fetched_at = excluded.fetched_at, payload = excluded.payload`
      )
      .run(
        record.dataset, record.source, obs, record.publicationTimestamp, record.category ?? null,
        an, at, pn, pt, fn, ft, record.unit, record.freshnessStatus ?? 'UNKNOWN', fetchedAt, JSON.stringify(record)
      );
  }

  /** Loads all stored records. Corrupt payload rows are skipped. Freshness is re-evaluated by the store, not trusted from disk. */
  loadAll(): FundamentalMacroRecord[] {
    const rows = this.db.prepare('SELECT payload FROM fundamental_records').all() as Array<{ payload: string }>;
    const out: FundamentalMacroRecord[] = [];
    for (const r of rows) {
      try {
        const rec = JSON.parse(r.payload) as FundamentalMacroRecord;
        if (rec && typeof rec.dataset === 'string' && typeof rec.source === 'string') out.push(rec);
      } catch {
        /* skip corrupt row */
      }
    }
    return out;
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM fundamental_records').get() as { n: number }).n;
  }

  /** Deletes rows whose observation date is older than `retentionDays`. Returns number deleted. */
  prune(nowMs: number = Date.now(), retentionDays: number = DEFAULT_RETENTION_DAYS): number {
    const cutoff = new Date(nowMs - retentionDays * 86_400_000).toISOString().slice(0, 10);
    const res = this.db.prepare('DELETE FROM fundamental_records WHERE observation_date < ?').run(cutoff);
    return Number(res.changes);
  }

  clear(): void {
    this.db.exec('DELETE FROM fundamental_records');
  }

  close(): void {
    this.db.close();
  }
}
