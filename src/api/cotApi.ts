/**
 * Browser client for the CFTC Commitments of Traders API (server/routes/cot.ts).
 *
 *   GET  /api/cot/markets                       → instrument ↔ CFTC market mapping (REPORTED / NOT_REPORTED)
 *   GET  /api/cot/health                        → sync status per instrument / report type
 *   GET  /api/cot/:instrumentId?type=&lookbackWeeks=&maxMissingWeeks=&from=&to=
 *   POST /api/cot/sync {instrumentId, from?}    → admin-only (token auth)
 *
 * Admin token handling: the token is kept in `sessionStorage` only (cleared when the tab closes) and
 * sent as both `Authorization: Bearer <token>` and `X-Admin-Token: <token>` so it works with either
 * header convention. 401 / 403 are surfaced as `CotAuthError` so the UI can explain them.
 */
import type { CotAnalyticsResult, CotCategoryPositions, CotCategory, CotReportType } from '../shared/cot/analytics';
import { ApiError } from './analysisApi';

export interface CotMarketEvidence {
  marketAndExchangeNames: string;
  observedReportDate: string;
  sources: string[];
  checkedOn: string;
}

export interface CotMarketMapping {
  instrumentId: string;
  status: 'REPORTED' | 'NOT_REPORTED';
  cftcContractMarketCode: string | null;
  reportTypes: CotReportType[];
  evidence: CotMarketEvidence | null;
  notes: string | null;
}

interface CotHealthReport {
  reportType: CotReportType;
  rowCount: number;
  firstReportDate: string | null;
  lastReportDate: string | null;
  lastSync: {
    status: string;
    fetchedAt: string | null;
    startedAt: string;
    rowsAccepted: number;
    rowsRejected: number;
    sourceUrl: string;
    message: string | null;
  } | null;
  lastSuccessfulSyncAt: string | null;
}

export interface CotHealthResponse {
  retrievedAt: string;
  overallStatus: 'CURRENT' | 'STALE' | 'UNAVAILABLE';
  markets: Array<{
    instrumentId: string;
    status: 'REPORTED' | 'NOT_REPORTED';
    cftcContractMarketCode: string | null;
    notes: string | null;
    reports: CotHealthReport[];
  }>;
}

interface CotStoredRow {
  reportType: CotReportType;
  cftcContractMarketCode: string;
  reportDate: string;
  marketAndExchangeNames: string;
  openInterest: number;
  positions: Partial<Record<CotCategory, CotCategoryPositions>>;
  totalReportable: { long: number; short: number } | null;
  warnings: string[];
  expectedReleaseDate: string;
}

export interface CotQueryResponse {
  retrievedAt: string;
  count: number;
  instrumentId: string;
  cftcContractMarketCode: string;
  reportType: CotReportType;
  timingNotice: string;
  provenance: { sources: string[]; fetchedAt: string | null };
  rows: CotStoredRow[];
  analytics: CotAnalyticsResult;
}

export interface CotSyncTypeResult {
  reportType: CotReportType;
  status: 'SUCCESS' | 'FAILED';
  sourceUrl: string;
  requestedFrom: string;
  fetchedAt: string | null;
  rowsReceived: number;
  rowsAccepted: number;
  rowsRejected: number;
  inserted: number;
  updated: number;
  unchanged: number;
  rejectionSamples: string[];
  warnings: string[];
  message: string | null;
}

export interface CotSyncResult {
  instrumentId: string;
  cftcContractMarketCode: string;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  results: CotSyncTypeResult[];
}

/** 401 (no / wrong token) or 403 (token valid but not allowed, or admin sync disabled). */
export class CotAuthError extends ApiError {}

const TOKEN_KEY = 'cot.adminToken';

export function readAdminToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function writeAdminToken(token: string): void {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable (private mode) — token stays in memory only */
  }
}

async function parse<T>(res: Response): Promise<T> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const b = (body ?? {}) as { error?: string; message?: string };
    const code = b.error ?? `HTTP_${res.status}`;
    const msg = b.message ?? `Request failed (HTTP ${res.status}).`;
    if (res.status === 401 || res.status === 403) throw new CotAuthError(res.status, code, msg);
    throw new ApiError(res.status, code, msg);
  }
  return body as T;
}

export async function fetchCotMarkets(signal?: AbortSignal): Promise<CotMarketMapping[]> {
  const json = await parse<{ markets: CotMarketMapping[] }>(await fetch('/api/cot/markets', { signal }));
  return json.markets ?? [];
}

export async function fetchCotHealth(signal?: AbortSignal): Promise<CotHealthResponse> {
  return parse<CotHealthResponse>(await fetch('/api/cot/health', { signal }));
}

export async function fetchCot(
  instrumentId: string,
  q: { reportType: CotReportType; lookbackWeeks: number; maxMissingWeeks?: number },
  signal?: AbortSignal
): Promise<CotQueryResponse> {
  const p = new URLSearchParams({
    type: q.reportType === 'LEGACY' ? 'legacy' : 'disaggregated',
    lookbackWeeks: String(q.lookbackWeeks),
    maxMissingWeeks: String(q.maxMissingWeeks ?? 0),
  });
  return parse<CotQueryResponse>(await fetch(`/api/cot/${encodeURIComponent(instrumentId)}?${p.toString()}`, { signal }));
}

/**
 * Triggers a CFTC sync. HTTP 502 (upstream failure) still carries a `sync` body describing what failed;
 * it is returned (not thrown) so the UI can show per-report-type messages.
 */
export async function syncCot(instrumentId: string, token: string, from?: string): Promise<CotSyncResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    headers['X-Admin-Token'] = token;
  }
  const res = await fetch('/api/cot/sync', {
    method: 'POST',
    headers,
    body: JSON.stringify(from ? { instrumentId, from } : { instrumentId }),
  });
  if (res.status === 502) {
    const body = (await res.json().catch(() => null)) as { sync?: CotSyncResult; message?: string } | null;
    if (body?.sync) return body.sync;
  }
  const json = await parse<{ sync: CotSyncResult }>(res);
  return json.sync;
}
