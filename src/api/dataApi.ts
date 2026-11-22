/**
 * Client for the historical-data API (server/routes/dataRoutes.ts).
 * Types mirror the server contract; they are re-declared here so the browser bundle never imports
 * server modules.
 */
import type { MarketCandle } from '../shared/types/market';
import type { Timeframe } from '../shared/types/instrument';

export const IMPORT_TIMEFRAMES: Timeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'];
export const DATE_FORMATS = ['ISO', 'YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY'] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];
export const SOURCE_QUALITIES = ['OFFICIAL', 'LICENSED_VENDOR', 'UNOFFICIAL', 'USER_PROVIDED'] as const;
export type SourceQuality = (typeof SOURCE_QUALITIES)[number];
export const CONTINUOUS_ADJUSTMENTS = ['UNADJUSTED', 'BACK_ADJUSTED', 'RATIO_ADJUSTED'] as const;
export type ContinuousAdjustment = 'NONE' | (typeof CONTINUOUS_ADJUSTMENTS)[number];
export const IMPORT_MODES = ['reject_conflicts', 'append', 'replace'] as const;
export type ImportMode = (typeof IMPORT_MODES)[number];

export interface DatasetRecord {
  id: string;
  instrumentId: string;
  contractCode: string;
  timeframe: string;
  continuousAdjustment: ContinuousAdjustment;
  sourceLabel: string;
  sourceQuality: SourceQuality;
  importedAt: string;
  rowCount: number;
  insertedCount: number;
  firstTimestamp: string;
  lastTimestamp: string;
  timezone: string;
  dateFormat: string;
  priceUnit: string;
  priceUnitDeclared: boolean;
  checksum: string;
  importMode: ImportMode;
}

export interface ImportRequest {
  instrumentId: string;
  contractCode: string;
  timeframe: Timeframe;
  csv: string;
  timezone: string;
  sourceLabel: string;
  sourceQuality: SourceQuality;
  dateFormat?: DateFormat;
  decimalSeparator?: '.' | ',';
  delimiter?: ',' | ';';
  priceUnit?: string;
  continuousAdjustment?: ContinuousAdjustment;
  mode?: ImportMode;
  sort?: boolean;
  dryRun?: boolean;
}

export interface ImportIssue {
  line: number | null;
  field?: string;
  message: string;
}

export interface ImportWarning {
  code: string;
  line?: number | null;
  message: string;
}

export interface OhlcvSnapshot {
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
  openInterest?: number | null;
}

export interface ImportConflict {
  timestamp: string;
  stored: OhlcvSnapshot;
  incoming: OhlcvSnapshot;
  line: number | null;
}

export interface ImportReport {
  status: string;
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
  conflicts: ImportConflict[];
  errors: ImportIssue[];
  errorCount: number;
  warnings: ImportWarning[];
  warningCount: number;
}

export interface CandleProvenance {
  datasetId: string;
  sourceLabel: string;
  sourceQuality: SourceQuality;
  importedAt: string;
  checksum: string;
  timezone: string;
  dateFormat: string;
  priceUnit: string;
  priceUnitDeclared: boolean;
  continuousAdjustment: ContinuousAdjustment;
  firstTimestamp: string;
  lastTimestamp: string;
}

export interface CandlesResponse {
  retrievedAt: string;
  instrumentId: string;
  exchange: string;
  contractCode: string;
  timeframe: Timeframe;
  timestampConvention: string;
  status: 'HISTORICAL' | 'UNAVAILABLE';
  reason?: string;
  priceUnit: string | null;
  continuousAdjustment: ContinuousAdjustment | null;
  count: number;
  totalInRange: number;
  truncated: boolean;
  candles: (MarketCandle & { datasetId: string })[];
  provenance: CandleProvenance[];
}

/** Error carrying HTTP status and (when present) the parsed JSON body. */
export class ApiError extends Error {
  readonly httpStatus: number;
  readonly body: unknown;

  constructor(message: string, httpStatus: number, body: unknown) {
    super(message);
    this.httpStatus = httpStatus;
    this.body = body;
  }

  get isAuthError(): boolean {
    return this.httpStatus === 401 || this.httpStatus === 403;
  }
}

// ---------------------------------------------------------------------------------------------
// Admin token (sessionStorage only — never localStorage, never sent to third parties)
// ---------------------------------------------------------------------------------------------

const TOKEN_KEY = 'ctaip.adminToken';

export function getAdminToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setAdminToken(token: string): void {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: token simply isn't persisted */
  }
}

function authHeaders(): Record<string, string> {
  const token = getAdminToken().trim();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function describeAuthError(httpStatus: number): string {
  return httpStatus === 401
    ? 'HTTP 401 — admin token missing or invalid. Enter the server admin token (ADMIN token) above and retry.'
    : 'HTTP 403 — this token is not allowed to modify data (or the server only accepts writes from an authorized origin).';
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 300) };
  }
}

function messageOf(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'message' in body && typeof (body as { message: unknown }).message === 'string') {
    return (body as { message: string }).message;
  }
  return fallback;
}

// ---------------------------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------------------------

/**
 * POST /api/data/import. Import reports are returned for 200/201/404/409/422 (the server sends a full
 * report body for those). 400 (schema validation) and 401/403 throw ApiError.
 */
export async function postImport(req: ImportRequest, signal?: AbortSignal): Promise<{ httpStatus: number; report: ImportReport }> {
  const res = await fetch('/api/data/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(req),
    signal,
  });
  const body = await readJson(res);
  if (res.status === 401 || res.status === 403) {
    throw new ApiError(describeAuthError(res.status), res.status, body);
  }
  if (body && typeof body === 'object' && 'parse' in body && 'errors' in body) {
    return { httpStatus: res.status, report: body as ImportReport };
  }
  let msg = messageOf(body, `Import request failed (HTTP ${res.status}).`);
  const details = (body as { details?: { path: unknown[]; message: string }[] } | null)?.details;
  if (Array.isArray(details) && details.length > 0) {
    msg += ' ' + details.map((d) => `${d.path.join('.') || '(body)'}: ${d.message}`).join('; ');
  }
  throw new ApiError(msg, res.status, body);
}

export async function fetchDatasets(signal?: AbortSignal): Promise<DatasetRecord[]> {
  const res = await fetch('/api/data/datasets', { signal });
  const body = await readJson(res);
  if (!res.ok) throw new ApiError(messageOf(body, `Failed to load datasets (HTTP ${res.status}).`), res.status, body);
  return ((body as { datasets?: DatasetRecord[] } | null)?.datasets ?? []) as DatasetRecord[];
}

export async function deleteDataset(id: string): Promise<{ candlesDeleted: number }> {
  const res = await fetch(`/api/data/datasets/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  const body = await readJson(res);
  if (res.status === 401 || res.status === 403) throw new ApiError(describeAuthError(res.status), res.status, body);
  if (!res.ok) throw new ApiError(messageOf(body, `Delete failed (HTTP ${res.status}).`), res.status, body);
  return { candlesDeleted: (body as { candlesDeleted?: number } | null)?.candlesDeleted ?? 0 };
}

export async function fetchCandles(
  q: { instrumentId: string; contractCode: string; timeframe: string; limit?: number },
  signal?: AbortSignal
): Promise<CandlesResponse> {
  const params = new URLSearchParams({
    instrumentId: q.instrumentId,
    contractCode: q.contractCode,
    timeframe: q.timeframe,
    limit: String(q.limit ?? 5000),
  });
  const res = await fetch(`/api/market/candles?${params.toString()}`, { signal });
  const body = await readJson(res);
  if (!res.ok) throw new ApiError(messageOf(body, `Failed to load candles (HTTP ${res.status}).`), res.status, body);
  return body as CandlesResponse;
}

/** T96: D1 candles of one specific contract month. status UNAVAILABLE => fall back to continuous + roll warning. */
export type ContractCandlesResponse =
  | { status: 'OK'; contractMonth: string; yahooSymbol: string; candles: CandlesResponse['candles']; source: string }
  | { status: 'UNAVAILABLE'; contractMonth: string | null; reason: string };

export async function fetchContractCandles(
  q: { instrumentId: string; contractMonth: string },
  signal?: AbortSignal
): Promise<ContractCandlesResponse> {
  const params = new URLSearchParams({ instrumentId: q.instrumentId, contractMonth: q.contractMonth });
  try {
    const res = await fetch(`/api/market/contract-candles?${params.toString()}`, { signal });
    const body = await readJson(res);
    if (!res.ok) return { status: 'UNAVAILABLE', contractMonth: q.contractMonth, reason: messageOf(body, `HTTP ${res.status}`) };
    return body as ContractCandlesResponse;
  } catch (err) {
    if (signal?.aborted) throw err;
    return { status: 'UNAVAILABLE', contractMonth: q.contractMonth, reason: 'network error' };
  }
}

/** True for daily/weekly bars, which are stored at 00:00Z of the session date. */
export function isSessionDateTimeframe(tf: string): boolean {
  return tf === 'D1' || tf === 'W1';
}

/**
 * Formats a stored timestamp for display. D1/W1 → the session date (YYYY-MM-DD, no timezone shift);
 * intraday → UTC "YYYY-MM-DD HH:mm UTC".
 */
export function formatStoredTimestamp(ts: string | null | undefined, timeframe: string): string {
  if (!ts) return '—';
  if (isSessionDateTimeframe(timeframe)) return ts.slice(0, 10);
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}
