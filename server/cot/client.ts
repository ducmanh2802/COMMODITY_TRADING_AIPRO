/**
 * CFTC Public Reporting Environment (Socrata SODA) client for COT data.
 *
 * Datasets (Futures Only):
 *   - Disaggregated: 72hh-3qpy
 *   - Legacy:        6dca-aqww
 * Provenance note (2026-11-17): these ids are the ones referenced for the CFTC COT futures-only datasets
 * (e.g. https://publicreporting.cftc.gov/resource/72hh-3qpy.json). Fetching them from the verification
 * environment returned HTTP 403 (Socrata edge), so they were NOT fetch-verified there; the first
 * successful sync verifies them implicitly (every returned row is checked for the requested market code
 * and a parseable report). Override with CFTC_DISAGGREGATED_DATASET_ID / CFTC_LEGACY_DATASET_ID if needed.
 *
 * Politeness: requests are strictly sequential (pages one after another, report types one after another),
 * with a small delay between pages, a per-request timeout, and bounded retry with exponential backoff on
 * network errors, HTTP 429 and 5xx. Other 4xx fail immediately. `CFTC_APP_TOKEN` → `X-App-Token` header.
 */
import type { CotReportType } from '../../src/shared/cot/analytics.ts';

export const CFTC_BASE_URL = 'https://publicreporting.cftc.gov';

export const CFTC_DATASET_IDS: Record<CotReportType, string> = {
  DISAGGREGATED: '72hh-3qpy',
  LEGACY: '6dca-aqww',
};

export class CftcFetchError extends Error {
  constructor(
    message: string,
    readonly url: string,
    readonly httpStatus: number | null,
    readonly attempts: number
  ) {
    super(message);
    this.name = 'CftcFetchError';
  }
}

export interface CftcClientOptions {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  datasetIds?: Partial<Record<CotReportType, string>>;
  appToken?: string | null;
  timeoutMs?: number;
  maxAttempts?: number;
  backoffBaseMs?: number;
  pageSize?: number;
  /** Hard cap on pages per fetch (safety against runaway pagination). */
  maxPages?: number;
  pageDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface CftcFetchRequest {
  reportType: CotReportType;
  marketCode: string;
  /** Inclusive YYYY-MM-DD lower bound on report date. */
  from: string;
}

/** Which upstream produced a result: the Socrata API or CFTC's downloadable historical files. */
export type CotDataSource = 'socrata' | 'files';

export interface CftcFetchResult {
  records: Record<string, unknown>[];
  /** URL of the first page (later pages differ only by $offset). */
  sourceUrl: string;
  pages: number;
  fetchedAt: string;
  /** Upstream that produced the records (absent = socrata, for older/mock clients). */
  source?: CotDataSource;
  /** All URLs the records came from (e.g. one zip per year). */
  sourceUrls?: string[];
  /** Per-record provenance, parallel to `records` (when records come from several files). */
  recordProvenance?: Array<{ sourceUrl: string; fetchedAt: string }>;
  /** Non-fatal notes (e.g. cached copy reused, current-year file not yet published). */
  notes?: string[];
}

export interface CftcClientLike {
  fetchReports(req: CftcFetchRequest): Promise<CftcFetchResult>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class CftcClient implements CftcClientLike {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly datasetIds: Record<CotReportType, string>;
  private readonly appToken: string | null;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly backoffBaseMs: number;
  private readonly pageSize: number;
  private readonly maxPages: number;
  private readonly pageDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: CftcClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = options.baseUrl ?? CFTC_BASE_URL;
    this.datasetIds = {
      DISAGGREGATED:
        options.datasetIds?.DISAGGREGATED ??
        (process.env.CFTC_DISAGGREGATED_DATASET_ID?.trim() || CFTC_DATASET_IDS.DISAGGREGATED),
      LEGACY: options.datasetIds?.LEGACY ?? (process.env.CFTC_LEGACY_DATASET_ID?.trim() || CFTC_DATASET_IDS.LEGACY),
    };
    for (const id of Object.values(this.datasetIds)) {
      if (!/^[a-z0-9]{4}-[a-z0-9]{4}$/.test(id)) throw new Error(`Invalid Socrata dataset id: ${id}`);
    }
    const token = options.appToken === undefined ? process.env.CFTC_APP_TOKEN : options.appToken;
    this.appToken = token && token.trim() ? token.trim() : null;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.backoffBaseMs = options.backoffBaseMs ?? 1_000;
    this.pageSize = options.pageSize ?? 1_000;
    this.maxPages = options.maxPages ?? 50;
    this.pageDelayMs = options.pageDelayMs ?? 250;
    this.sleep = options.sleep ?? defaultSleep;
  }

  buildUrl(req: CftcFetchRequest, offset = 0): string {
    if (!/^[0-9A-Z]{6}$/.test(req.marketCode)) throw new Error('Invalid CFTC contract market code');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.from)) throw new Error('Invalid from date');
    const params = new URLSearchParams({
      $where: `cftc_contract_market_code='${req.marketCode}' AND report_date_as_yyyy_mm_dd >= '${req.from}T00:00:00.000'`,
      $order: 'report_date_as_yyyy_mm_dd ASC',
      $limit: String(this.pageSize),
      $offset: String(offset),
    });
    return `${this.baseUrl}/resource/${this.datasetIds[req.reportType]}.json?${params.toString()}`;
  }

  async fetchReports(req: CftcFetchRequest): Promise<CftcFetchResult> {
    const records: Record<string, unknown>[] = [];
    const sourceUrl = this.buildUrl(req, 0);
    let pages = 0;
    for (let offset = 0; ; offset += this.pageSize) {
      if (pages >= this.maxPages) {
        throw new CftcFetchError(`Pagination exceeded ${this.maxPages} pages`, sourceUrl, null, 0);
      }
      if (pages > 0 && this.pageDelayMs > 0) await this.sleep(this.pageDelayMs);
      const page = await this.fetchPage(this.buildUrl(req, offset));
      pages += 1;
      records.push(...page);
      if (page.length < this.pageSize) break;
    }
    return { records, sourceUrl, pages, fetchedAt: new Date().toISOString(), source: 'socrata', sourceUrls: [sourceUrl] };
  }

  private async fetchPage(url: string): Promise<Record<string, unknown>[]> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.appToken) headers['X-App-Token'] = this.appToken;
    let lastError: CftcFetchError | null = null;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      if (attempt > 1) await this.sleep(this.backoffBaseMs * 2 ** (attempt - 2));
      let res: Response;
      try {
        res = await this.fetchImpl(url, { headers, signal: AbortSignal.timeout(this.timeoutMs) });
      } catch (err) {
        const msg = err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'network error';
        lastError = new CftcFetchError(`CFTC request failed (${msg})`, url, null, attempt);
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        lastError = new CftcFetchError(`CFTC responded HTTP ${res.status}`, url, res.status, attempt);
        continue;
      }
      if (!res.ok) {
        throw new CftcFetchError(`CFTC responded HTTP ${res.status}`, url, res.status, attempt);
      }
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        throw new CftcFetchError('CFTC response was not valid JSON', url, res.status, attempt);
      }
      if (!Array.isArray(body) || !body.every((r) => typeof r === 'object' && r !== null && !Array.isArray(r))) {
        throw new CftcFetchError('CFTC response was not a JSON array of records', url, res.status, attempt);
      }
      return body as Record<string, unknown>[];
    }
    throw lastError ?? new CftcFetchError('CFTC request failed', url, null, this.maxAttempts);
  }
}
