/**
 * Browser client for the historical-data endpoints used by the Analysis module.
 *
 *   GET /api/data/datasets          → imported dataset records (provenance per CSV import)
 *   GET /api/market/candles         → stored candles for one series (instrumentId + contractCode + timeframe)
 *
 * Conventions
 * - Never fabricates data: an empty series is returned as `status: 'UNAVAILABLE'` exactly as the API says.
 * - A "series" is the key (instrumentId, contractCode, timeframe). Several datasets (imports) can feed
 *   one series; they are grouped here so the UI can pick a series and still show every provenance record.
 * - Errors are thrown as `ApiError` with the HTTP status and the server's `error` / `message` fields.
 */
import type { MarketCandle } from '../shared/types/market';

export type SourceQuality = 'OFFICIAL' | 'LICENSED_VENDOR' | 'UNOFFICIAL' | 'USER_PROVIDED';
export type ContinuousAdjustment = 'NONE' | 'UNADJUSTED' | 'BACK_ADJUSTED' | 'RATIO_ADJUSTED';

/** Mirror of the server's `DatasetRecord` (server/storage/candleRepository.ts). */
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
  importMode: string;
}

export interface DatasetProvenance {
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
  timeframe: string;
  timestampConvention: string;
  status: 'HISTORICAL' | 'UNAVAILABLE';
  reason?: string;
  priceUnit: string | null;
  continuousAdjustment: ContinuousAdjustment | null;
  count: number;
  totalInRange: number;
  truncated: boolean;
  candles: Array<MarketCandle & { datasetId: string }>;
  provenance: DatasetProvenance[];
}

/** One selectable series = all datasets sharing (instrumentId, contractCode, timeframe). */
export interface SeriesOption {
  key: string;
  label: string;
  instrumentId: string;
  contractCode: string;
  timeframe: string;
  /** Price unit of the most recent dataset (as declared or taken from the Instrument Master). */
  priceUnit: string;
  continuousAdjustment: ContinuousAdjustment;
  datasets: DatasetRecord[];
}

export class ApiError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const b = (body ?? {}) as { error?: string; message?: string };
    throw new ApiError(res.status, b.error ?? `HTTP_${res.status}`, b.message ?? `Request failed (HTTP ${res.status}).`);
  }
  return body as T;
}

export function seriesKey(instrumentId: string, contractCode: string, timeframe: string): string {
  return `${instrumentId}|${contractCode}|${timeframe}`;
}

/** Lists every imported dataset and groups them into selectable series (sorted by label). */
export async function fetchSeriesOptions(signal?: AbortSignal): Promise<SeriesOption[]> {
  const json = await getJson<{ datasets: DatasetRecord[] }>('/api/data/datasets', signal);
  const groups = new Map<string, DatasetRecord[]>();
  for (const d of json.datasets ?? []) {
    const k = seriesKey(d.instrumentId, d.contractCode, d.timeframe);
    const arr = groups.get(k) ?? [];
    arr.push(d);
    groups.set(k, arr);
  }
  const out: SeriesOption[] = [];
  for (const [key, datasets] of groups) {
    const sorted = [...datasets].sort((a, b) => a.importedAt.localeCompare(b.importedAt));
    const latest = sorted[sorted.length - 1];
    out.push({
      key,
      label: `${latest.instrumentId} · ${latest.contractCode} · ${latest.timeframe}`,
      instrumentId: latest.instrumentId,
      contractCode: latest.contractCode,
      timeframe: latest.timeframe,
      priceUnit: latest.priceUnit,
      continuousAdjustment: latest.continuousAdjustment,
      datasets: sorted,
    });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

/** Fetches the stored candles of one series (server limit max 20 000 rows; truncation is reported). */
export function fetchCandles(
  q: { instrumentId: string; contractCode: string; timeframe: string; limit?: number },
  signal?: AbortSignal
): Promise<CandlesResponse> {
  const p = new URLSearchParams({
    instrumentId: q.instrumentId,
    contractCode: q.contractCode,
    timeframe: q.timeframe,
    limit: String(q.limit ?? 20_000),
  });
  return getJson<CandlesResponse>(`/api/market/candles?${p.toString()}`, signal);
}
