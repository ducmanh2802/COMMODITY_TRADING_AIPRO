/**
 * Historical OHLCV storage contracts (T05) + in-memory implementation (tests).
 *
 * A *series* is identified by (instrumentId, contractCode, timeframe). `contractCode` is a specific
 * contract (e.g. `ZSF27`) or `CONTINUOUS`. Every stored candle is owned by exactly one *dataset*
 * (the import that inserted it), so provenance can always be traced back to a source file
 * (sha256 checksum), a source label and a declared source quality.
 *
 * Timestamp convention (see docs/DATA_IMPORT.md):
 * - D1 / W1 bars: the trading-session date as written in the source, stored at 00:00:00Z.
 * - Intraday bars: the source wall-clock time converted from the declared IANA timezone to UTC.
 */

export const SOURCE_QUALITIES = ['OFFICIAL', 'LICENSED_VENDOR', 'UNOFFICIAL', 'USER_PROVIDED'] as const;
export type SourceQuality = (typeof SOURCE_QUALITIES)[number];

/** How a series was built. `NONE` = a single specific contract; the others apply only to CONTINUOUS. */
export const CONTINUOUS_ADJUSTMENTS = ['NONE', 'UNADJUSTED', 'BACK_ADJUSTED', 'RATIO_ADJUSTED'] as const;
export type ContinuousAdjustment = (typeof CONTINUOUS_ADJUSTMENTS)[number];

/**
 * Re-import policy for rows whose timestamp already exists in the series:
 * - `reject_conflicts` (default): identical rows are skipped, new rows inserted; if ANY existing row has a
 *   different OHLC the whole import is rejected and the conflicts are reported. Nothing is written.
 * - `append`: only new timestamps are inserted; existing rows are never modified (conflicts are reported
 *   as warnings and skipped).
 * - `replace`: the whole series (all candles and the dataset records that owned them) is deleted and
 *   replaced by the new file.
 */
export const IMPORT_MODES = ['replace', 'append', 'reject_conflicts'] as const;
export type ImportMode = (typeof IMPORT_MODES)[number];

export const CONTINUOUS_CONTRACT_CODE = 'CONTINUOUS';

export interface SeriesKey {
  instrumentId: string;
  contractCode: string;
  timeframe: string;
}

export interface CandleRow {
  timestampMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  openInterest: number | null;
}

export interface StoredCandleRow extends CandleRow {
  datasetId: string;
}

export interface DatasetRecord {
  id: string;
  instrumentId: string;
  contractCode: string;
  timeframe: string;
  continuousAdjustment: ContinuousAdjustment;
  sourceLabel: string;
  sourceQuality: SourceQuality;
  importedAt: string;
  /** Data rows in the source file. */
  rowCount: number;
  /** Rows this dataset actually inserted (and therefore owns). */
  insertedCount: number;
  firstTimestamp: string;
  lastTimestamp: string;
  /** IANA timezone the caller declared for the source timestamps. */
  timezone: string;
  /** Date format used to parse the file (declared or unambiguously detected). */
  dateFormat: string;
  priceUnit: string;
  /** true when priceUnit was explicitly declared by the caller (vs. taken from the Instrument Master). */
  priceUnitDeclared: boolean;
  /** sha256 (hex) of the raw CSV text. */
  checksum: string;
  importMode: ImportMode;
}

export interface CandleQuery {
  fromMs?: number;
  toMs?: number;
  /** When more rows match, the most recent `limit` rows are returned (ascending) and `truncated=true`. */
  limit?: number;
}

export interface CandleQueryResult {
  rows: StoredCandleRow[];
  totalInRange: number;
  truncated: boolean;
}

export interface OhlcValues {
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface ImportConflict {
  timestampMs: number;
  stored: OhlcValues & { datasetId: string };
  incoming: OhlcValues;
}

export interface ImportSeriesMeta {
  priceUnit: string;
  continuousAdjustment: ContinuousAdjustment;
  checksum: string;
}

export interface ImportPlan {
  mode: ImportMode;
  /** Rows that would be written (all rows for `replace`). */
  rowsToWrite: CandleRow[];
  /** Incoming rows identical (OHLC, volume, OI) to stored rows. */
  unchangedCount: number;
  /** Incoming rows whose OHLC is identical but volume / open interest differs (stored row kept). */
  volumeOrOiDiffCount: number;
  conflicts: ImportConflict[];
  /** Candles currently in the series that `replace` would delete. */
  existingSeriesRowCount: number;
  existingDatasetIds: string[];
  /** Non-null when the series already holds data with a different unit / adjustment (non-replace modes). */
  seriesMismatch: string | null;
  /** Dataset id of an earlier import of this exact file into this series, if any. */
  duplicateChecksumDatasetId: string | null;
}

export interface CommitImportResult {
  committed: boolean;
  plan: ImportPlan;
  dataset: DatasetRecord | null;
}

export interface RepositorySummary {
  datasetCount: number;
  candleCount: number;
  lastImportedAt: string | null;
  lastCandleTimestamp: string | null;
}

export interface ICandleRepository {
  listDatasets(filter?: { instrumentId?: string }): Promise<DatasetRecord[]>;
  getDataset(id: string): Promise<DatasetRecord | null>;
  /** Deletes a dataset and every candle it owns. */
  deleteDataset(id: string): Promise<{ deleted: boolean; candlesDeleted: number }>;
  /**
   * Retention: deletes the candles of ONE series with timestamp < beforeMs, then the dataset records of that
   * series that no longer own any candle. Returns the number of candles removed.
   */
  deleteCandlesBefore(key: SeriesKey, beforeMs: number): Promise<number>;
  queryCandles(key: SeriesKey, query?: CandleQuery): Promise<CandleQueryResult>;
  /** Computes what an import would do without writing anything (dry run). */
  previewImport(key: SeriesKey, rows: CandleRow[], mode: ImportMode, meta: ImportSeriesMeta): Promise<ImportPlan>;
  /**
   * Atomically applies an import. Nothing is written when: the series metadata mismatches (non-replace),
   * mode=reject_conflicts and conflicts exist, or (non-replace) there is nothing new to write.
   * `dataset.insertedCount` is set by the repository.
   */
  commitImport(dataset: DatasetRecord, rows: CandleRow[], mode: ImportMode): Promise<CommitImportResult>;
  getSummary(): Promise<RepositorySummary>;
  close(): void;
}

function sameNumberOrNull(a: number | null, b: number | null): boolean {
  return a === b || (a !== null && b !== null && Object.is(a, b));
}

/** Pure planning logic shared by every repository implementation. */
export function planImport(params: {
  mode: ImportMode;
  incoming: CandleRow[];
  existingAt: (timestampMs: number) => StoredCandleRow | undefined;
  existingSeriesDatasets: DatasetRecord[];
  existingSeriesRowCount: number;
  meta: ImportSeriesMeta;
}): ImportPlan {
  const { mode, incoming, existingAt, existingSeriesDatasets, meta } = params;
  const conflicts: ImportConflict[] = [];
  const newRows: CandleRow[] = [];
  let unchangedCount = 0;
  let volumeOrOiDiffCount = 0;

  for (const row of incoming) {
    const stored = existingAt(row.timestampMs);
    if (!stored) {
      newRows.push(row);
      continue;
    }
    const ohlcSame =
      stored.open === row.open &&
      stored.high === row.high &&
      stored.low === row.low &&
      stored.close === row.close;
    if (!ohlcSame) {
      conflicts.push({
        timestampMs: row.timestampMs,
        stored: {
          open: stored.open,
          high: stored.high,
          low: stored.low,
          close: stored.close,
          datasetId: stored.datasetId,
        },
        incoming: { open: row.open, high: row.high, low: row.low, close: row.close },
      });
    } else if (
      !sameNumberOrNull(stored.volume, row.volume) ||
      !sameNumberOrNull(stored.openInterest, row.openInterest)
    ) {
      volumeOrOiDiffCount += 1;
    } else {
      unchangedCount += 1;
    }
  }

  let seriesMismatch: string | null = null;
  if (mode !== 'replace') {
    const units = new Set(existingSeriesDatasets.map((d) => d.priceUnit));
    const adjustments = new Set(existingSeriesDatasets.map((d) => d.continuousAdjustment));
    const problems: string[] = [];
    if (units.size > 0 && !(units.size === 1 && units.has(meta.priceUnit))) {
      problems.push(`existing priceUnit ${[...units].join(', ')} ≠ incoming ${meta.priceUnit}`);
    }
    if (adjustments.size > 0 && !(adjustments.size === 1 && adjustments.has(meta.continuousAdjustment))) {
      problems.push(
        `existing continuousAdjustment ${[...adjustments].join(', ')} ≠ incoming ${meta.continuousAdjustment}`
      );
    }
    if (problems.length > 0) {
      seriesMismatch = `Series already contains data with different metadata (${problems.join('; ')}). Use mode=replace or a different series.`;
    }
  }

  const duplicate = existingSeriesDatasets.find((d) => d.checksum === meta.checksum);

  return {
    mode,
    rowsToWrite: mode === 'replace' ? [...incoming] : newRows,
    unchangedCount,
    volumeOrOiDiffCount,
    conflicts,
    existingSeriesRowCount: params.existingSeriesRowCount,
    existingDatasetIds: existingSeriesDatasets.map((d) => d.id),
    seriesMismatch,
    duplicateChecksumDatasetId: duplicate ? duplicate.id : null,
  };
}

/** Whether a plan may be committed (see ICandleRepository.commitImport). */
export function planIsCommittable(plan: ImportPlan): boolean {
  if (plan.seriesMismatch) return false;
  if (plan.mode === 'reject_conflicts' && plan.conflicts.length > 0) return false;
  if (plan.mode !== 'replace' && plan.rowsToWrite.length === 0) return false;
  return plan.rowsToWrite.length > 0;
}

export function seriesKeyString(key: SeriesKey): string {
  return `${key.instrumentId}\u0000${key.contractCode}\u0000${key.timeframe}`;
}

function datasetMatchesSeries(d: DatasetRecord, key: SeriesKey): boolean {
  return d.instrumentId === key.instrumentId && d.contractCode === key.contractCode && d.timeframe === key.timeframe;
}

function compareDatasets(a: DatasetRecord, b: DatasetRecord): number {
  return a.importedAt === b.importedAt ? a.id.localeCompare(b.id) : a.importedAt < b.importedAt ? 1 : -1;
}

export function applyQueryWindow(sortedRows: StoredCandleRow[], query: CandleQuery = {}): CandleQueryResult {
  const inRange = sortedRows.filter(
    (r) =>
      (query.fromMs === undefined || r.timestampMs >= query.fromMs) &&
      (query.toMs === undefined || r.timestampMs <= query.toMs)
  );
  const limit = query.limit;
  if (limit !== undefined && inRange.length > limit) {
    return { rows: inRange.slice(inRange.length - limit), totalInRange: inRange.length, truncated: true };
  }
  return { rows: inRange, totalInRange: inRange.length, truncated: false };
}

/** In-memory repository for tests and ephemeral use. Not persisted. */
export class InMemoryCandleRepository implements ICandleRepository {
  private readonly datasets = new Map<string, DatasetRecord>();
  private readonly series = new Map<string, Map<number, StoredCandleRow>>();

  async listDatasets(filter: { instrumentId?: string } = {}): Promise<DatasetRecord[]> {
    return [...this.datasets.values()]
      .filter((d) => !filter.instrumentId || d.instrumentId === filter.instrumentId)
      .sort(compareDatasets)
      .map((d) => ({ ...d }));
  }

  async getDataset(id: string): Promise<DatasetRecord | null> {
    const d = this.datasets.get(id);
    return d ? { ...d } : null;
  }

  async deleteDataset(id: string): Promise<{ deleted: boolean; candlesDeleted: number }> {
    const d = this.datasets.get(id);
    if (!d) return { deleted: false, candlesDeleted: 0 };
    this.datasets.delete(id);
    let candlesDeleted = 0;
    const rows = this.series.get(seriesKeyString(d));
    if (rows) {
      for (const [ts, row] of rows) {
        if (row.datasetId === id) {
          rows.delete(ts);
          candlesDeleted += 1;
        }
      }
    }
    return { deleted: true, candlesDeleted };
  }

  async deleteCandlesBefore(key: SeriesKey, beforeMs: number): Promise<number> {
    const rows = this.series.get(seriesKeyString(key));
    if (!rows) return 0;
    let removed = 0;
    for (const ts of [...rows.keys()]) {
      if (ts < beforeMs) {
        rows.delete(ts);
        removed += 1;
      }
    }
    const owners = new Set([...rows.values()].map((r) => r.datasetId));
    for (const d of [...this.datasets.values()]) {
      if (datasetMatchesSeries(d, key) && !owners.has(d.id)) this.datasets.delete(d.id);
    }
    return removed;
  }

  async queryCandles(key: SeriesKey, query: CandleQuery = {}): Promise<CandleQueryResult> {
    const rows = this.series.get(seriesKeyString(key));
    if (!rows) return { rows: [], totalInRange: 0, truncated: false };
    const sorted = [...rows.values()].sort((a, b) => a.timestampMs - b.timestampMs).map((r) => ({ ...r }));
    return applyQueryWindow(sorted, query);
  }

  private plan(key: SeriesKey, rows: CandleRow[], mode: ImportMode, meta: ImportSeriesMeta): ImportPlan {
    const existing = this.series.get(seriesKeyString(key)) ?? new Map<number, StoredCandleRow>();
    return planImport({
      mode,
      incoming: rows,
      existingAt: (ts) => existing.get(ts),
      existingSeriesDatasets: [...this.datasets.values()].filter((d) => datasetMatchesSeries(d, key)),
      existingSeriesRowCount: existing.size,
      meta,
    });
  }

  async previewImport(key: SeriesKey, rows: CandleRow[], mode: ImportMode, meta: ImportSeriesMeta): Promise<ImportPlan> {
    return this.plan(key, rows, mode, meta);
  }

  async commitImport(dataset: DatasetRecord, rows: CandleRow[], mode: ImportMode): Promise<CommitImportResult> {
    const plan = this.plan(dataset, rows, mode, dataset);
    if (!planIsCommittable(plan)) return { committed: false, plan, dataset: null };

    const keyStr = seriesKeyString(dataset);
    if (mode === 'replace') {
      for (const id of plan.existingDatasetIds) this.datasets.delete(id);
      this.series.delete(keyStr);
    }
    const target = this.series.get(keyStr) ?? new Map<number, StoredCandleRow>();
    for (const row of plan.rowsToWrite) {
      target.set(row.timestampMs, { ...row, datasetId: dataset.id });
    }
    this.series.set(keyStr, target);
    const stored: DatasetRecord = { ...dataset, insertedCount: plan.rowsToWrite.length };
    this.datasets.set(stored.id, stored);
    return { committed: true, plan, dataset: { ...stored } };
  }

  async getSummary(): Promise<RepositorySummary> {
    let candleCount = 0;
    let lastTs: number | null = null;
    for (const rows of this.series.values()) {
      candleCount += rows.size;
      for (const ts of rows.keys()) if (lastTs === null || ts > lastTs) lastTs = ts;
    }
    let lastImportedAt: string | null = null;
    for (const d of this.datasets.values()) {
      if (lastImportedAt === null || d.importedAt > lastImportedAt) lastImportedAt = d.importedAt;
    }
    return {
      datasetCount: this.datasets.size,
      candleCount,
      lastImportedAt,
      lastCandleTimestamp: lastTs === null ? null : new Date(lastTs).toISOString(),
    };
  }

  close(): void {
    // nothing to release
  }
}
