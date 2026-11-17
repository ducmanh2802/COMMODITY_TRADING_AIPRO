/**
 * SQLite storage for COT reports (node:sqlite, no dependencies).
 *
 * Shares the market DB file (MARKET_DB_PATH, default data/market.db) with other modules but uses ONLY
 * its own tables `cot_reports` and `cot_sync_log`, and never touches `PRAGMA user_version` (owned by the
 * candle repository).
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { CotReportType } from '../../src/shared/cot/analytics.ts';
import type { CotReportRecord } from './parser.ts';

export const DEFAULT_MARKET_DB_PATH = path.join('data', 'market.db');

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS cot_reports (
  report_type      TEXT NOT NULL CHECK (report_type IN ('DISAGGREGATED','LEGACY')),
  market_code      TEXT NOT NULL,
  report_date      TEXT NOT NULL,
  market_name      TEXT NOT NULL,
  open_interest    REAL NOT NULL,
  positions_json   TEXT NOT NULL,
  total_rept_json  TEXT,
  warnings_json    TEXT NOT NULL,
  source_url       TEXT NOT NULL,
  fetched_at       TEXT NOT NULL,
  PRIMARY KEY (report_type, market_code, report_date)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS cot_sync_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  instrument_id   TEXT NOT NULL,
  report_type     TEXT NOT NULL,
  market_code     TEXT NOT NULL,
  requested_from  TEXT NOT NULL,
  source_url      TEXT NOT NULL,
  started_at      TEXT NOT NULL,
  fetched_at      TEXT,
  status          TEXT NOT NULL CHECK (status IN ('SUCCESS','FAILED')),
  rows_received   INTEGER NOT NULL,
  rows_accepted   INTEGER NOT NULL,
  rows_rejected   INTEGER NOT NULL,
  inserted        INTEGER NOT NULL,
  updated         INTEGER NOT NULL,
  unchanged       INTEGER NOT NULL,
  message         TEXT
);
CREATE INDEX IF NOT EXISTS cot_sync_log_instrument ON cot_sync_log (instrument_id, report_type, id);
`;

export interface StoredCotReport extends Omit<CotReportRecord, 'warnings'> {
  warnings: string[];
  sourceUrl: string;
  fetchedAt: string;
}

export interface UpsertResult {
  inserted: number;
  updated: number;
  unchanged: number;
}

export interface CotSyncLogEntry {
  id?: number;
  instrumentId: string;
  reportType: CotReportType;
  marketCode: string;
  requestedFrom: string;
  sourceUrl: string;
  startedAt: string;
  fetchedAt: string | null;
  status: 'SUCCESS' | 'FAILED';
  rowsReceived: number;
  rowsAccepted: number;
  rowsRejected: number;
  inserted: number;
  updated: number;
  unchanged: number;
  message: string | null;
  /** Upstream actually used: 'socrata' | 'files' (null for failed syncs / pre-T28 rows). */
  source?: string | null;
}

export interface CotStoredSummary {
  reportType: CotReportType;
  marketCode: string;
  rowCount: number;
  firstReportDate: string | null;
  lastReportDate: string | null;
}

interface ReportDbRow {
  report_type: string;
  market_code: string;
  report_date: string;
  market_name: string;
  open_interest: number;
  positions_json: string;
  total_rept_json: string | null;
  warnings_json: string;
  source_url: string;
  fetched_at: string;
}

interface LogDbRow {
  id: number;
  instrument_id: string;
  report_type: string;
  market_code: string;
  requested_from: string;
  source_url: string;
  started_at: string;
  fetched_at: string | null;
  status: string;
  rows_received: number;
  rows_accepted: number;
  rows_rejected: number;
  inserted: number;
  updated: number;
  unchanged: number;
  message: string | null;
  source: string | null;
}

export interface CotRepositoryLike {
  upsertReports(records: CotReportRecord[], provenance: { sourceUrl: string; fetchedAt: string }): UpsertResult;
  listReports(q: { reportType: CotReportType; marketCode: string; from?: string; to?: string }): StoredCotReport[];
  summary(reportType: CotReportType, marketCode: string): CotStoredSummary;
  appendSyncLog(entry: CotSyncLogEntry): number;
  lastSync(instrumentId: string, reportType: CotReportType): CotSyncLogEntry | null;
  lastSuccessfulSync(instrumentId: string, reportType: CotReportType): CotSyncLogEntry | null;
}

export class SqliteCotRepository implements CotRepositoryLike {
  private readonly db: DatabaseSync;

  constructor(location: string = process.env.MARKET_DB_PATH?.trim() || DEFAULT_MARKET_DB_PATH) {
    if (location !== ':memory:') mkdirSync(path.dirname(path.resolve(location)), { recursive: true });
    this.db = new DatabaseSync(location);
    this.db.exec('PRAGMA busy_timeout = 5000;');
    this.db.exec(SCHEMA_SQL);
    // Additive migration (T28): which upstream a sync used. Only touches this module's own table.
    const cols = this.db.prepare(`PRAGMA table_info(cot_sync_log)`).all() as unknown as Array<{ name: string }>;
    if (!cols.some((c) => c.name === 'source')) this.db.exec('ALTER TABLE cot_sync_log ADD COLUMN source TEXT');
  }

  close(): void {
    this.db.close();
  }

  upsertReports(records: CotReportRecord[], provenance: { sourceUrl: string; fetchedAt: string }): UpsertResult {
    const select = this.db.prepare(
      `SELECT market_name, open_interest, positions_json, total_rept_json FROM cot_reports
       WHERE report_type = ? AND market_code = ? AND report_date = ?`
    );
    const upsert = this.db.prepare(
      `INSERT INTO cot_reports (report_type, market_code, report_date, market_name, open_interest,
         positions_json, total_rept_json, warnings_json, source_url, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (report_type, market_code, report_date) DO UPDATE SET
         market_name = excluded.market_name,
         open_interest = excluded.open_interest,
         positions_json = excluded.positions_json,
         total_rept_json = excluded.total_rept_json,
         warnings_json = excluded.warnings_json,
         source_url = excluded.source_url,
         fetched_at = excluded.fetched_at`
    );
    const result: UpsertResult = { inserted: 0, updated: 0, unchanged: 0 };
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const r of records) {
        const positionsJson = JSON.stringify(r.positions);
        const totalJson = r.totalReportable ? JSON.stringify(r.totalReportable) : null;
        const existing = select.get(r.reportType, r.cftcContractMarketCode, r.reportDate) as
          | { market_name: string; open_interest: number; positions_json: string; total_rept_json: string | null }
          | undefined;
        if (!existing) result.inserted += 1;
        else if (
          existing.market_name === r.marketAndExchangeNames &&
          existing.open_interest === r.openInterest &&
          existing.positions_json === positionsJson &&
          existing.total_rept_json === totalJson
        ) {
          result.unchanged += 1;
        } else result.updated += 1;
        upsert.run(
          r.reportType,
          r.cftcContractMarketCode,
          r.reportDate,
          r.marketAndExchangeNames,
          r.openInterest,
          positionsJson,
          totalJson,
          JSON.stringify(r.warnings),
          provenance.sourceUrl,
          provenance.fetchedAt
        );
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    return result;
  }

  listReports(q: { reportType: CotReportType; marketCode: string; from?: string; to?: string }): StoredCotReport[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM cot_reports WHERE report_type = ? AND market_code = ?
           AND report_date >= ? AND report_date <= ? ORDER BY report_date ASC`
      )
      .all(q.reportType, q.marketCode, q.from ?? '0000-00-00', q.to ?? '9999-99-99') as unknown as ReportDbRow[];
    return rows.map((r) => ({
      reportType: r.report_type as CotReportType,
      cftcContractMarketCode: r.market_code,
      reportDate: r.report_date,
      marketAndExchangeNames: r.market_name,
      openInterest: r.open_interest,
      positions: JSON.parse(r.positions_json),
      totalReportable: r.total_rept_json ? JSON.parse(r.total_rept_json) : null,
      warnings: JSON.parse(r.warnings_json),
      sourceUrl: r.source_url,
      fetchedAt: r.fetched_at,
    }));
  }

  summary(reportType: CotReportType, marketCode: string): CotStoredSummary {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS n, MIN(report_date) AS first, MAX(report_date) AS last FROM cot_reports
         WHERE report_type = ? AND market_code = ?`
      )
      .get(reportType, marketCode) as { n: number; first: string | null; last: string | null };
    return { reportType, marketCode, rowCount: row.n, firstReportDate: row.first, lastReportDate: row.last };
  }

  appendSyncLog(e: CotSyncLogEntry): number {
    const info = this.db
      .prepare(
        `INSERT INTO cot_sync_log (instrument_id, report_type, market_code, requested_from, source_url, started_at,
           fetched_at, status, rows_received, rows_accepted, rows_rejected, inserted, updated, unchanged, message, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        e.instrumentId,
        e.reportType,
        e.marketCode,
        e.requestedFrom,
        e.sourceUrl,
        e.startedAt,
        e.fetchedAt,
        e.status,
        e.rowsReceived,
        e.rowsAccepted,
        e.rowsRejected,
        e.inserted,
        e.updated,
        e.unchanged,
        e.message,
        e.source ?? null
      );
    return Number(info.lastInsertRowid);
  }

  lastSync(instrumentId: string, reportType: CotReportType): CotSyncLogEntry | null {
    return this.queryLog(`instrument_id = ? AND report_type = ?`, [instrumentId, reportType]);
  }

  lastSuccessfulSync(instrumentId: string, reportType: CotReportType): CotSyncLogEntry | null {
    return this.queryLog(`instrument_id = ? AND report_type = ? AND status = 'SUCCESS'`, [instrumentId, reportType]);
  }

  private queryLog(where: string, params: string[]): CotSyncLogEntry | null {
    const r = this.db
      .prepare(`SELECT * FROM cot_sync_log WHERE ${where} ORDER BY id DESC LIMIT 1`)
      .get(...params) as unknown as LogDbRow | undefined;
    if (!r) return null;
    return {
      id: r.id,
      instrumentId: r.instrument_id,
      reportType: r.report_type as CotReportType,
      marketCode: r.market_code,
      requestedFrom: r.requested_from,
      sourceUrl: r.source_url,
      startedAt: r.started_at,
      fetchedAt: r.fetched_at,
      status: r.status as 'SUCCESS' | 'FAILED',
      rowsReceived: r.rows_received,
      rowsAccepted: r.rows_accepted,
      rowsRejected: r.rows_rejected,
      inserted: r.inserted,
      updated: r.updated,
      unchanged: r.unchanged,
      message: r.message,
      source: r.source ?? null,
    };
  }
}
