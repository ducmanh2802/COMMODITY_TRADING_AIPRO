import { createHash, randomUUID } from 'node:crypto';
import type { InstrumentDefinition, Timeframe } from '../../src/shared/types/instrument.ts';
import {
  CONTINUOUS_CONTRACT_CODE,
  type CandleRow,
  type ContinuousAdjustment,
  type DatasetRecord,
  type ICandleRepository,
  type ImportConflict,
  type ImportMode,
  type ImportPlan,
  type SourceQuality,
} from '../storage/candleRepository.ts';
import {
  parseOhlcvCsv,
  type CsvImportIssue,
  type CsvImportWarning,
  type DateFormat,
} from './csvOhlcvParser.ts';

export interface CsvImportRequest {
  instrumentId: string;
  contractCode: string;
  timeframe: Timeframe;
  csv: string;
  dateFormat?: DateFormat;
  timezone: string;
  decimalSeparator?: '.' | ',';
  delimiter?: ',' | ';';
  sourceLabel: string;
  sourceQuality: SourceQuality;
  priceUnit?: string;
  continuousAdjustment?: ContinuousAdjustment;
  mode: ImportMode;
  sort: boolean;
  dryRun: boolean;
  gapThresholdSessions?: number;
  jumpThresholdPct?: number;
  /**
   * Accept zero/negative OHLC. Implied for contractCode=CONTINUOUS with BACK_ADJUSTED; otherwise
   * default false. Non-positive bars are always reported as a NON_POSITIVE_PRICE warning.
   */
  allowNonPositivePrices?: boolean;
}

export type ImportStatus =
  | 'IMPORTED'
  | 'DRY_RUN_OK'
  | 'NO_CHANGES'
  | 'INSTRUMENT_NOT_FOUND'
  | 'INVALID_REQUEST'
  | 'REJECTED_INVALID_DATA'
  | 'REJECTED_CONFLICTS'
  | 'REJECTED_SERIES_MISMATCH';

interface ImportConflictReport {
  timestamp: string;
  stored: ImportConflict['stored'];
  incoming: ImportConflict['incoming'];
  line: number | null;
}

export interface ImportReport {
  status: ImportStatus;
  ok: boolean;
  dryRun: boolean;
  message: string;
  dataset: DatasetRecord | null;
  parse: {
    delimiter: string | null;
    dateFormat: string | null;
    dateFormatSource: 'DECLARED' | 'DETECTED' | null;
    columns: Record<string, string>;
    ignoredColumns: string[];
    dataRowCount: number;
    validRowCount: number;
    firstTimestamp: string | null;
    lastTimestamp: string | null;
  };
  plan: {
    mode: ImportMode;
    rowsToWrite: number;
    unchanged: number;
    volumeOrOiDiffs: number;
    conflicts: number;
    existingSeriesRows: number;
    existingDatasetIds: string[];
  } | null;
  conflicts: ImportConflictReport[];
  errors: CsvImportIssue[];
  errorCount: number;
  warnings: CsvImportWarning[];
  warningCount: number;
}

const MAX_REPORTED_ISSUES = 500;
const MAX_REPORTED_CONFLICTS = 200;

/** Units that mean "not known" in the Instrument Master; such instruments require an explicit priceUnit. */
const UNKNOWN_UNITS = new Set(['', 'UNSPECIFIED', 'UNKNOWN', 'N/A']);

function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function emptyParse(): ImportReport['parse'] {
  return {
    delimiter: null,
    dateFormat: null,
    dateFormatSource: null,
    columns: {},
    ignoredColumns: [],
    dataRowCount: 0,
    validRowCount: 0,
    firstTimestamp: null,
    lastTimestamp: null,
  };
}

function report(partial: Partial<ImportReport> & Pick<ImportReport, 'status' | 'ok' | 'dryRun' | 'message'>): ImportReport {
  const errors = partial.errors ?? [];
  const warnings = partial.warnings ?? [];
  return {
    dataset: null,
    parse: emptyParse(),
    plan: null,
    conflicts: [],
    ...partial,
    errors: errors.slice(0, MAX_REPORTED_ISSUES),
    errorCount: partial.errorCount ?? errors.length,
    warnings: warnings.slice(0, MAX_REPORTED_ISSUES),
    warningCount: partial.warningCount ?? warnings.length,
  };
}

export interface ImportDeps {
  findInstrument: (id: string) => Promise<InstrumentDefinition | null>;
  candles: ICandleRepository;
  now?: () => Date;
}

export async function importCsv(req: CsvImportRequest, deps: ImportDeps): Promise<ImportReport> {
  const now = deps.now?.() ?? new Date();
  const base = { dryRun: req.dryRun };

  const instrument = await deps.findInstrument(req.instrumentId);
  if (!instrument) {
    return report({
      ...base,
      status: 'INSTRUMENT_NOT_FOUND',
      ok: false,
      message: `Instrument ${req.instrumentId} is not registered in the Instrument Master.`,
    });
  }

  const requestErrors: CsvImportIssue[] = [];
  const warnings: CsvImportWarning[] = [];
  const contractCode = req.contractCode.trim().toUpperCase();
  const isContinuous = contractCode === CONTINUOUS_CONTRACT_CODE;
  let continuousAdjustment: ContinuousAdjustment;
  if (isContinuous) {
    if (!req.continuousAdjustment || req.continuousAdjustment === 'NONE') {
      requestErrors.push({
        line: null,
        field: 'continuousAdjustment',
        message: 'contractCode=CONTINUOUS requires continuousAdjustment: UNADJUSTED, BACK_ADJUSTED or RATIO_ADJUSTED.',
      });
    }
    continuousAdjustment = req.continuousAdjustment ?? 'NONE';
  } else {
    if (req.continuousAdjustment && req.continuousAdjustment !== 'NONE') {
      requestErrors.push({
        line: null,
        field: 'continuousAdjustment',
        message: `continuousAdjustment=${req.continuousAdjustment} only applies to contractCode=CONTINUOUS.`,
      });
    }
    continuousAdjustment = 'NONE';
    const root = instrument.exchangeSymbol.toUpperCase();
    if (!contractCode.startsWith(root)) {
      warnings.push({
        code: 'CONTRACT_CODE_PREFIX',
        line: null,
        message: `contractCode ${contractCode} does not start with the instrument symbol ${root}; check it refers to ${instrument.id}.`,
      });
    }
  }

  const instrumentUnit = instrument.specification.quotationUnit?.trim() ?? '';
  let priceUnit: string;
  let priceUnitDeclared: boolean;
  if (req.priceUnit !== undefined) {
    priceUnit = req.priceUnit.trim();
    priceUnitDeclared = true;
    if (!UNKNOWN_UNITS.has(instrumentUnit.toUpperCase()) && priceUnit !== instrumentUnit) {
      warnings.push({
        code: 'PRICE_UNIT_DIFFERS',
        line: null,
        message: `Declared priceUnit "${priceUnit}" differs from the Instrument Master quotation unit "${instrumentUnit}". Stored as declared; prices are NOT converted.`,
      });
    }
  } else if (UNKNOWN_UNITS.has(instrumentUnit.toUpperCase())) {
    requestErrors.push({
      line: null,
      field: 'priceUnit',
      message: `Instrument ${instrument.id} has no verified quotation unit; declare priceUnit explicitly.`,
    });
    priceUnit = '';
    priceUnitDeclared = false;
  } else {
    priceUnit = instrumentUnit;
    priceUnitDeclared = false;
  }

  if (requestErrors.length > 0) {
    return report({
      ...base,
      status: 'INVALID_REQUEST',
      ok: false,
      message: 'Import request is inconsistent.',
      errors: requestErrors,
      warnings,
    });
  }

  // Back-adjusted continuous series subtract roll gaps and can legitimately go ≤ 0; otherwise only on request.
  const allowNonPositivePrices =
    req.allowNonPositivePrices === true || (isContinuous && continuousAdjustment === 'BACK_ADJUSTED');

  const parsed = parseOhlcvCsv(req.csv, {
    timeframe: req.timeframe,
    timezone: req.timezone,
    dateFormat: req.dateFormat,
    decimalSeparator: req.decimalSeparator,
    delimiter: req.delimiter,
    sort: req.sort,
    gapThresholdSessions: req.gapThresholdSessions,
    jumpThresholdPct: req.jumpThresholdPct,
    allowNonPositivePrices,
    symbol: isContinuous ? instrument.exchangeSymbol : contractCode,
    exchange: instrument.exchange,
    now,
  });
  warnings.push(...parsed.warnings);

  const bars = parsed.bars;
  const parseInfo: ImportReport['parse'] = {
    delimiter: parsed.delimiter,
    dateFormat: parsed.dateFormat,
    dateFormatSource: parsed.dateFormat ? (req.dateFormat ? 'DECLARED' : 'DETECTED') : null,
    columns: parsed.columns as Record<string, string>,
    ignoredColumns: parsed.ignoredColumns,
    dataRowCount: parsed.dataRowCount,
    validRowCount: bars.length,
    firstTimestamp: bars.length ? new Date(bars[0].timestampMs).toISOString() : null,
    lastTimestamp: bars.length ? new Date(bars[bars.length - 1].timestampMs).toISOString() : null,
  };

  if (!parsed.ok) {
    return report({
      ...base,
      status: 'REJECTED_INVALID_DATA',
      ok: false,
      message: `CSV rejected: ${parsed.errors.length} error(s). Nothing was written.`,
      parse: parseInfo,
      errors: parsed.errors,
      warnings,
    });
  }

  const rows: CandleRow[] = bars.map((b) => ({
    timestampMs: b.timestampMs,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
    openInterest: b.openInterest,
  }));
  const lineByTs = new Map(bars.map((b) => [b.timestampMs, b.line]));
  const checksum = sha256Hex(req.csv);

  const dataset: DatasetRecord = {
    id: randomUUID(),
    instrumentId: instrument.id,
    contractCode,
    timeframe: req.timeframe,
    continuousAdjustment,
    sourceLabel: req.sourceLabel.trim(),
    sourceQuality: req.sourceQuality,
    importedAt: now.toISOString(),
    rowCount: rows.length,
    insertedCount: 0,
    firstTimestamp: parseInfo.firstTimestamp as string,
    lastTimestamp: parseInfo.lastTimestamp as string,
    timezone: req.timezone,
    dateFormat: parsed.dateFormat as string,
    priceUnit,
    priceUnitDeclared,
    checksum,
    importMode: req.mode,
  };

  let plan: ImportPlan;
  let committedDataset: DatasetRecord | null = null;
  if (req.dryRun) {
    plan = await deps.candles.previewImport(dataset, rows, req.mode, dataset);
  } else {
    const result = await deps.candles.commitImport(dataset, rows, req.mode);
    plan = result.plan;
    committedDataset = result.dataset;
  }

  if (plan.duplicateChecksumDatasetId) {
    warnings.push({
      code: 'DUPLICATE_FILE',
      line: null,
      message: `This exact file (sha256 ${checksum.slice(0, 12)}…) was already imported into this series as dataset ${plan.duplicateChecksumDatasetId}.`,
    });
  }
  if (plan.volumeOrOiDiffCount > 0) {
    warnings.push({
      code: 'VOLUME_OI_DIFFERS',
      line: null,
      message: `${plan.volumeOrOiDiffCount} row(s) match stored OHLC but differ in volume/open interest; stored values were kept${req.mode === 'replace' ? ' (replaced)' : ''}.`,
    });
  }
  if (req.mode === 'append' && plan.conflicts.length > 0) {
    warnings.push({
      code: 'CONFLICTS_SKIPPED',
      line: lineByTs.get(plan.conflicts[0].timestampMs) ?? null,
      message: `${plan.conflicts.length} row(s) differ from stored OHLC and were skipped (mode=append never overwrites).`,
    });
  }
  if (req.mode === 'replace' && plan.existingSeriesRowCount > 0) {
    warnings.push({
      code: 'SERIES_REPLACED',
      line: null,
      message: `${req.dryRun ? 'Would delete' : 'Deleted'} ${plan.existingSeriesRowCount} existing candle(s) and ${plan.existingDatasetIds.length} dataset record(s) of this series.`,
    });
  }

  const planInfo: ImportReport['plan'] = {
    mode: plan.mode,
    rowsToWrite: plan.rowsToWrite.length,
    unchanged: plan.unchangedCount,
    volumeOrOiDiffs: plan.volumeOrOiDiffCount,
    conflicts: plan.conflicts.length,
    existingSeriesRows: plan.existingSeriesRowCount,
    existingDatasetIds: plan.existingDatasetIds,
  };
  const conflicts: ImportConflictReport[] = plan.conflicts.slice(0, MAX_REPORTED_CONFLICTS).map((c) => ({
    timestamp: new Date(c.timestampMs).toISOString(),
    stored: c.stored,
    incoming: c.incoming,
    line: lineByTs.get(c.timestampMs) ?? null,
  }));
  const common = { ...base, parse: parseInfo, plan: planInfo, conflicts, warnings };

  if (plan.seriesMismatch) {
    return report({ ...common, status: 'REJECTED_SERIES_MISMATCH', ok: false, message: plan.seriesMismatch });
  }
  if (req.mode === 'reject_conflicts' && plan.conflicts.length > 0) {
    return report({
      ...common,
      status: 'REJECTED_CONFLICTS',
      ok: false,
      message: `${plan.conflicts.length} row(s) differ from stored OHLC values. Nothing was written. Use mode=replace or mode=append deliberately.`,
    });
  }
  if (req.dryRun) {
    return report({
      ...common,
      status: 'DRY_RUN_OK',
      ok: true,
      message: `Dry run: ${plan.rowsToWrite.length} row(s) would be written. Nothing was written.`,
      dataset: { ...dataset, insertedCount: plan.rowsToWrite.length },
    });
  }
  if (!committedDataset) {
    return report({
      ...common,
      status: 'NO_CHANGES',
      ok: true,
      message: 'No new rows: every row already exists in the series. No dataset was recorded.',
    });
  }
  return report({
    ...common,
    status: 'IMPORTED',
    ok: true,
    message: `Imported ${committedDataset.insertedCount} row(s).`,
    dataset: committedDataset,
  });
}
