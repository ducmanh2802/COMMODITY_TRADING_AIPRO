/**
 * Browser client for the contract / historical-data endpoints used by the Contract Explorer (T09)
 * and Term Structure (T12) views. Every call returns parsed JSON or throws `ApiError`; nothing here
 * fabricates or caches data.
 */
import type { ChainContract } from '../shared/contracts/chain';
import type { CalendarVerification } from '../shared/contracts/calendarSpecs';
import type { InstrumentDefinition } from '../shared/types/instrument';
import type { MarketCandle } from '../shared/types/market';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const b = (body ?? {}) as { error?: string; message?: string };
    throw new ApiError(b.message ?? `Request failed with HTTP ${res.status}.`, res.status, b.error ?? null);
  }
  return body as T;
}

// ---------------------------------------------------------------------------------------------
// Instruments
// ---------------------------------------------------------------------------------------------


// ---------------------------------------------------------------------------------------------
// Contract chain & calendar rule
// ---------------------------------------------------------------------------------------------

export type ContractChainResponse =
  | {
      instrumentId: string;
      exchange: string;
      root: string;
      mxvRoot: string | null;
      asOf: string;
      count: number;
      requestedCount: number;
      status: 'OK';
      calendarStatus: CalendarVerification;
      listedMonths: string;
      holidayAdjusted: boolean;
      contracts: ChainContract[];
      notes: string[];
      warnings: string[];
      sources: string[];
      disclaimer: string;
      computedAt: string;
    }
  | {
      instrumentId: string;
      asOf: string;
      status: 'UNAVAILABLE';
      reason: string;
      contracts: [];
      disclaimer: string;
    };

export function fetchContractChain(
  instrumentId: string,
  opts: { asOf?: string; count?: number } = {},
  signal?: AbortSignal
): Promise<ContractChainResponse> {
  const q = new URLSearchParams();
  if (opts.asOf) q.set('asOf', opts.asOf);
  if (opts.count) q.set('count', String(opts.count));
  const qs = q.toString();
  return getJson(`/api/contracts/${encodeURIComponent(instrumentId)}/chain${qs ? `?${qs}` : ''}`, signal);
}

interface CalendarRule {
  listedMonths: string;
  lastTradingDayRule: string;
  sourceUrl: string;
  verificationStatus: 'VERIFIED' | 'UNVERIFIED';
  notes?: string;
}

export interface CalendarRuleResponse {
  instrumentId: string;
  status: 'OK' | 'UNAVAILABLE';
  rule: CalendarRule | null;
  retrievedAt: string;
}

export function fetchCalendarRule(instrumentId: string, signal?: AbortSignal): Promise<CalendarRuleResponse> {
  return getJson(`/api/contracts/${encodeURIComponent(instrumentId)}/calendar-rule`, signal);
}

// ---------------------------------------------------------------------------------------------
// Imported datasets & candles
// ---------------------------------------------------------------------------------------------

export interface DatasetSummary {
  id: string;
  instrumentId: string;
  contractCode: string;
  timeframe: string;
  continuousAdjustment: string;
  sourceLabel: string;
  sourceQuality: string;
  importedAt: string;
  rowCount: number;
  insertedCount: number;
  firstTimestamp: string;
  lastTimestamp: string;
  timezone: string;
  priceUnit: string;
  priceUnitDeclared: boolean;
}

export async function fetchDatasets(instrumentId: string, signal?: AbortSignal): Promise<DatasetSummary[]> {
  const r = await getJson<{ datasets?: DatasetSummary[] }>(
    `/api/data/datasets?instrumentId=${encodeURIComponent(instrumentId)}`,
    signal
  );
  return r.datasets ?? [];
}

export interface CandleProvenance {
  datasetId: string;
  sourceLabel: string;
  sourceQuality: string;
  importedAt: string;
  priceUnit: string;
}

export interface CandlesResponse {
  status: 'HISTORICAL' | 'UNAVAILABLE';
  reason?: string;
  instrumentId: string;
  contractCode: string;
  timeframe: string;
  priceUnit: string | null;
  count: number;
  truncated: boolean;
  candles: (MarketCandle & { datasetId: string })[];
  provenance: CandleProvenance[];
  timestampConvention: string;
}

export function fetchCandles(
  params: { instrumentId: string; contractCode: string; timeframe: string; from?: string; to?: string; limit?: number },
  signal?: AbortSignal
): Promise<CandlesResponse> {
  const q = new URLSearchParams({
    instrumentId: params.instrumentId,
    contractCode: params.contractCode,
    timeframe: params.timeframe,
  });
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  if (params.limit) q.set('limit', String(params.limit));
  return getJson(`/api/market/candles?${q.toString()}`, signal);
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.code ? `${err.code}: ${err.message}` : err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

export type YahooCurveResponseDto =
  | {
      status: 'OK' | 'PARTIAL';
      instrumentId: string;
      source: string;
      unit: string;
      valuationDate: string | null;
      contracts: {
        contract: string;
        yahooSymbol: string;
        price: number;
        asOf: string;
        lastTradingDay: string;
        calendarStatus: string;
      }[];
      excluded: { contract: string; reason: string }[];
      result: import('../shared/contracts/termStructure').TermStructureResult | null;
      notes: string[];
      fetchedAt: string;
    }
  | { status: 'UNAVAILABLE'; instrumentId: string; source: string; reason: string; fetchedAt: string };

/** Live per-contract-month curve from Yahoo (UNOFFICIAL, delayed). */
export function fetchYahooCurve(instrumentId: string, count = 8, signal?: AbortSignal): Promise<YahooCurveResponseDto> {
  return getJson(`/api/contracts/${encodeURIComponent(instrumentId)}/yahoo-curve?count=${count}`, signal);
}
