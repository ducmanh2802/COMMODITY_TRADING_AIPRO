/**
 * COT service: sync from CFTC → SQLite, query stored reports, run analytics, report sync health.
 */
import {
  analyzeCot,
  expectedReleaseDate,
  type CotAnalyticsResult,
  type CotReportType,
} from '../../src/shared/cot/analytics.ts';
import {
  CftcClient,
  CftcFetchError,
  type CftcClientLike,
  type CftcFetchRequest,
  type CftcFetchResult,
  type CotDataSource,
} from './client.ts';
import { CftcHistoricalFileSource } from './fileSource.ts';
import { COT_MARKET_MAPPINGS, getCotMapping, type CotMarketMapping } from './mapping.ts';
import { parseCotRecord, type CotReportRecord } from './parser.ts';
import { SqliteCotRepository, type CotRepositoryLike, type StoredCotReport } from './repository.ts';

export const COT_TIMING_NOTICE =
  'reportDate is the CFTC "as of" date (positions at Tuesday close) stored exactly as CFTC publishes it. ' +
  'CFTC normally releases it the following Friday at 15:30 US Eastern (later in holiday weeks / shutdowns). ' +
  'expectedReleaseDate is that TYPICAL Friday, an estimate — not the actual release. Lag any analysis to ' +
  'the release time; using a row from its reportDate introduces look-ahead bias.';

/** Default history window for a first sync: 4 years covers the 156-week default COT Index lookback. */
const DEFAULT_INITIAL_YEARS = 4;
/** Re-fetch this many weeks before the last stored report on incremental syncs (picks up revisions). */
const INCREMENTAL_OVERLAP_WEEKS = 4;
const MAX_REJECTION_SAMPLES = 10;

export class CotServiceError extends Error {
  constructor(
    readonly code: 'INSTRUMENT_NOT_FOUND' | 'COT_NOT_REPORTED' | 'UPSTREAM_ERROR',
    message: string,
    readonly httpStatus: number
  ) {
    super(message);
  }
}

/** `COT_SOURCE`: auto = Socrata first, CFTC historical files on failure; socrata / files = only that one. */
export type CotSourceMode = 'auto' | 'socrata' | 'files';

export function resolveCotSourceMode(value: string | undefined = process.env.COT_SOURCE): CotSourceMode {
  const v = (value ?? '').trim().toLowerCase();
  if (v === '' || v === 'auto') return 'auto';
  if (v === 'socrata' || v === 'files') return v;
  throw new Error(`Invalid COT_SOURCE "${value}" (expected auto | socrata | files)`);
}

/** Classify a stored source URL (for query provenance). */
export function dataSourceOfUrl(url: string): CotDataSource | 'unknown' {
  try {
    const u = new URL(url);
    if (u.hostname === 'publicreporting.cftc.gov' || u.pathname.startsWith('/resource/')) return 'socrata';
    if (u.pathname.endsWith('.zip')) return 'files';
  } catch {
    /* fall through */
  }
  return 'unknown';
}

export interface CotSyncTypeResult {
  reportType: CotReportType;
  status: 'SUCCESS' | 'FAILED';
  /** Upstream actually used for the stored rows (null when nothing could be fetched). */
  source: CotDataSource | null;
  /** Set when auto mode fell back from Socrata to the files; explains why. */
  fallbackReason: string | null;
  sourceUrl: string;
  sourceUrls: string[];
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

export interface CotServiceOptions {
  repository?: CotRepositoryLike;
  /** Socrata API client. */
  client?: CftcClientLike;
  /** CFTC historical zip-file source (www.cftc.gov). */
  fileSource?: CftcClientLike;
  /** Default: COT_SOURCE env, else 'auto'. */
  sourceMode?: CotSourceMode;
  now?: () => Date;
}

/** Per-sync state: once Socrata failed in auto mode, later report types go straight to the files. */
interface RunState {
  socrataFailure: string | null;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function shiftDays(date: string, days: number): string {
  return isoDate(new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000));
}

export class CotService {
  private readonly repository: CotRepositoryLike;
  private readonly client: CftcClientLike;
  private readonly fileSource: CftcClientLike;
  readonly sourceMode: CotSourceMode;
  private readonly now: () => Date;
  /** Serializes syncs so that requests to CFTC are never concurrent. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(options: CotServiceOptions = {}) {
    this.repository = options.repository ?? new SqliteCotRepository();
    this.client = options.client ?? new CftcClient();
    this.fileSource = options.fileSource ?? new CftcHistoricalFileSource();
    this.sourceMode = options.sourceMode ?? resolveCotSourceMode();
    this.now = options.now ?? (() => new Date());
  }

  listMappings(): readonly CotMarketMapping[] {
    return COT_MARKET_MAPPINGS;
  }

  private requireReported(instrumentId: string): CotMarketMapping & { cftcContractMarketCode: string } {
    const mapping = getCotMapping(instrumentId);
    if (!mapping) {
      throw new CotServiceError('INSTRUMENT_NOT_FOUND', `Instrument ${instrumentId} has no COT mapping.`, 404);
    }
    if (mapping.status !== 'REPORTED' || !mapping.cftcContractMarketCode) {
      throw new CotServiceError(
        'COT_NOT_REPORTED',
        `Instrument ${instrumentId} is not covered by CFTC COT reports: ${mapping.notes ?? ''}`.trim(),
        422
      );
    }
    return mapping as CotMarketMapping & { cftcContractMarketCode: string };
  }

  sync(instrumentId: string, from?: string): Promise<CotSyncResult> {
    const mapping = this.requireReported(instrumentId);
    const run = this.queue.then(() => this.runSync(mapping, from));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async runSync(
    mapping: CotMarketMapping & { cftcContractMarketCode: string },
    from: string | undefined
  ): Promise<CotSyncResult> {
    const code = mapping.cftcContractMarketCode;
    const results: CotSyncTypeResult[] = [];
    const state: RunState = { socrataFailure: null };
    // Sequential on purpose (politeness): one report type after the other.
    for (const reportType of mapping.reportTypes) {
      results.push(await this.syncOne(mapping.instrumentId, code, reportType, from, mapping, state));
    }
    const ok = results.filter((r) => r.status === 'SUCCESS').length;
    return {
      instrumentId: mapping.instrumentId,
      cftcContractMarketCode: code,
      status: ok === results.length ? 'SUCCESS' : ok === 0 ? 'FAILED' : 'PARTIAL',
      results,
    };
  }

  private resolveFrom(reportType: CotReportType, code: string, from: string | undefined): string {
    if (from) return from;
    const last = this.repository.summary(reportType, code).lastReportDate;
    if (last) return shiftDays(last, -7 * INCREMENTAL_OVERLAP_WEEKS);
    const d = this.now();
    return isoDate(new Date(Date.UTC(d.getUTCFullYear() - DEFAULT_INITIAL_YEARS, d.getUTCMonth(), d.getUTCDate())));
  }

  private async syncOne(
    instrumentId: string,
    code: string,
    reportType: CotReportType,
    fromInput: string | undefined,
    mapping: CotMarketMapping,
    state: RunState
  ): Promise<CotSyncTypeResult> {
    const startedAt = this.now().toISOString();
    const requestedFrom = this.resolveFrom(reportType, code, fromInput);
    const base: CotSyncTypeResult = {
      reportType,
      status: 'FAILED',
      source: null,
      fallbackReason: null,
      sourceUrl: '',
      sourceUrls: [],
      requestedFrom,
      fetchedAt: null,
      rowsReceived: 0,
      rowsAccepted: 0,
      rowsRejected: 0,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      rejectionSamples: [],
      warnings: [],
      message: null,
    };
    try {
      const { fetched, source, fallbackReason } = await this.fetchFromSources(
        { reportType, marketCode: code, from: requestedFrom },
        state
      );
      base.source = source;
      base.fallbackReason = fallbackReason;
      base.sourceUrl = fetched.sourceUrl;
      base.sourceUrls = fetched.sourceUrls ?? [fetched.sourceUrl];
      base.fetchedAt = fetched.fetchedAt;
      base.rowsReceived = fetched.records.length;
      base.warnings.push(...(fetched.notes ?? []));
      const provenanceOf = (i: number) =>
        fetched.recordProvenance?.[i] ?? { sourceUrl: fetched.sourceUrl, fetchedAt: fetched.fetchedAt };

      const accepted: Array<{ record: CotReportRecord; sourceUrl: string; fetchedAt: string }> = [];
      const seen = new Set<string>();
      const names = new Set<string>();
      for (const [i, raw] of fetched.records.entries()) {
        const parsed = parseCotRecord(raw, reportType);
        let reason: string | null = null;
        if (!parsed.ok) reason = parsed.reason;
        else if (parsed.record.cftcContractMarketCode !== code) {
          reason = `${parsed.record.reportDate}: market code ${parsed.record.cftcContractMarketCode} ≠ requested ${code}`;
        } else if (seen.has(parsed.record.reportDate)) {
          reason = `${parsed.record.reportDate}: duplicate report date in response`;
        }
        if (reason !== null || !parsed.ok) {
          base.rowsRejected += 1;
          if (base.rejectionSamples.length < MAX_REJECTION_SAMPLES) base.rejectionSamples.push(reason ?? 'rejected');
          continue;
        }
        seen.add(parsed.record.reportDate);
        names.add(parsed.record.marketAndExchangeNames);
        base.warnings.push(...parsed.record.warnings);
        accepted.push({ record: parsed.record, ...provenanceOf(i) });
      }
      const expectedName = mapping.evidence?.marketAndExchangeNames;
      for (const n of names) {
        if (expectedName && n !== expectedName) {
          base.warnings.push(`CFTC market name "${n}" differs from verified name "${expectedName}" (same code ${code}).`);
        }
      }
      base.rowsAccepted = accepted.length;
      // One upsert per provenance (e.g. one per yearly zip) so every row keeps its exact source URL.
      const groups = new Map<string, { prov: { sourceUrl: string; fetchedAt: string }; records: CotReportRecord[] }>();
      for (const a of accepted) {
        const key = `${a.sourceUrl} ${a.fetchedAt}`;
        const g = groups.get(key) ?? { prov: { sourceUrl: a.sourceUrl, fetchedAt: a.fetchedAt }, records: [] };
        g.records.push(a.record);
        groups.set(key, g);
      }
      for (const g of groups.values()) {
        const up = this.repository.upsertReports(g.records, g.prov);
        base.inserted += up.inserted;
        base.updated += up.updated;
        base.unchanged += up.unchanged;
      }
      base.status = 'SUCCESS';
      const msgs: string[] = [];
      if (fallbackReason) msgs.push(`Socrata unavailable (${fallbackReason}); used CFTC historical files.`);
      if (base.rowsRejected > 0) msgs.push(`${base.rowsRejected} record(s) rejected (fail-closed).`);
      base.message = msgs.length > 0 ? msgs.join(' ') : null;
    } catch (err) {
      base.status = 'FAILED';
      if (err instanceof CftcFetchError) {
        base.sourceUrl = err.url;
        base.message = `${err.message} after ${err.attempts} attempt(s).`;
        if (state.socrataFailure && this.sourceMode === 'auto') {
          base.message = `Socrata unavailable (${state.socrataFailure}); CFTC files also failed: ${base.message}`;
        }
      } else {
        base.message = 'Sync failed while processing CFTC data.';
      }
    }
    this.repository.appendSyncLog({
      instrumentId,
      reportType,
      marketCode: code,
      requestedFrom,
      sourceUrl: base.sourceUrls.length > 1 ? base.sourceUrls.join(' ') : base.sourceUrl,
      startedAt,
      fetchedAt: base.fetchedAt,
      status: base.status,
      rowsReceived: base.rowsReceived,
      rowsAccepted: base.rowsAccepted,
      rowsRejected: base.rowsRejected,
      inserted: base.inserted,
      updated: base.updated,
      unchanged: base.unchanged,
      message: base.message,
      source: base.source,
    });
    return base;
  }

  private async fetchFromSources(
    req: CftcFetchRequest,
    state: RunState
  ): Promise<{ fetched: CftcFetchResult; source: CotDataSource; fallbackReason: string | null }> {
    if (this.sourceMode === 'files') {
      return { fetched: await this.fileSource.fetchReports(req), source: 'files', fallbackReason: null };
    }
    if (this.sourceMode === 'socrata') {
      return { fetched: await this.client.fetchReports(req), source: 'socrata', fallbackReason: null };
    }
    if (state.socrataFailure === null) {
      try {
        return { fetched: await this.client.fetchReports(req), source: 'socrata', fallbackReason: null };
      } catch (err) {
        // Any upstream failure (HTTP 403 from the Socrata edge, network error, exhausted 5xx/429 retries,
        // malformed response) → fall back. Non-fetch errors (programming errors) are not masked.
        if (!(err instanceof CftcFetchError)) throw err;
        state.socrataFailure = err.httpStatus !== null ? `HTTP ${err.httpStatus}` : err.message;
      }
    }
    return { fetched: await this.fileSource.fetchReports(req), source: 'files', fallbackReason: state.socrataFailure };
  }

  query(
    instrumentId: string,
    q: { reportType: CotReportType; from?: string; to?: string; lookbackWeeks?: number; maxMissingWeeks?: number }
  ): {
    instrumentId: string;
    cftcContractMarketCode: string;
    reportType: CotReportType;
    timingNotice: string;
    provenance: { sources: string[]; dataSources: Array<CotDataSource | 'unknown'>; fetchedAt: string | null };
    rows: Array<Omit<StoredCotReport, 'sourceUrl' | 'fetchedAt'> & { expectedReleaseDate: string }>;
    analytics: CotAnalyticsResult;
  } {
    const mapping = this.requireReported(instrumentId);
    const code = mapping.cftcContractMarketCode;
    const stored = this.repository.listReports({ reportType: q.reportType, marketCode: code, from: q.from, to: q.to });
    // The COT Index needs history before `from`: load the full lookback for analytics, then trim output.
    const lookback = q.lookbackWeeks ?? 156;
    const analyticsFrom = q.from ? shiftDays(q.from, -7 * lookback) : undefined;
    const forAnalytics = q.from
      ? this.repository.listReports({ reportType: q.reportType, marketCode: code, from: analyticsFrom, to: q.to })
      : stored;
    const analytics = analyzeCot(forAnalytics, q.reportType, {
      lookbackWeeks: q.lookbackWeeks,
      maxMissingWeeks: q.maxMissingWeeks,
    });
    if (q.from && analytics.rows.length > 0) {
      const from = q.from;
      analytics.rows = analytics.rows.filter((r) => r.reportDate >= from);
      analytics.gaps = analytics.gaps.filter((g) => g.before >= from);
      analytics.latest = analytics.rows[analytics.rows.length - 1] ?? null;
    }
    const sources = [...new Set(stored.map((r) => r.sourceUrl))];
    const fetchedAt = stored.reduce<string | null>((m, r) => (m === null || r.fetchedAt > m ? r.fetchedAt : m), null);
    return {
      instrumentId,
      cftcContractMarketCode: code,
      reportType: q.reportType,
      timingNotice: COT_TIMING_NOTICE,
      provenance: { sources, dataSources: [...new Set(sources.map(dataSourceOfUrl))], fetchedAt },
      rows: stored.map(({ sourceUrl: _s, fetchedAt: _f, ...r }) => ({
        ...r,
        expectedReleaseDate: expectedReleaseDate(r.reportDate),
      })),
      analytics,
    };
  }

  health(): {
    retrievedAt: string;
    overallStatus: 'CURRENT' | 'STALE' | 'UNAVAILABLE';
    markets: Array<{
      instrumentId: string;
      status: CotMarketMapping['status'];
      cftcContractMarketCode: string | null;
      notes: string | null;
      reports: Array<{
        reportType: CotReportType;
        rowCount: number;
        firstReportDate: string | null;
        lastReportDate: string | null;
        lastSync: { status: string; source: string | null; fetchedAt: string | null; startedAt: string; rowsAccepted: number; rowsRejected: number; sourceUrl: string; message: string | null } | null;
        lastSuccessfulSyncAt: string | null;
      }>;
    }>;
  } {
    const now = this.now();
    // A weekly report older than ~17 days (Tuesday as-of + Friday release + a week) is stale.
    const staleBefore = shiftDays(isoDate(now), -17);
    let anyData = false;
    let anyStale = false;
    const markets = COT_MARKET_MAPPINGS.map((m) => ({
      instrumentId: m.instrumentId,
      status: m.status,
      cftcContractMarketCode: m.cftcContractMarketCode,
      notes: m.notes,
      reports: m.cftcContractMarketCode
        ? m.reportTypes.map((rt) => {
            const s = this.repository.summary(rt, m.cftcContractMarketCode!);
            const last = this.repository.lastSync(m.instrumentId, rt);
            const lastOk = this.repository.lastSuccessfulSync(m.instrumentId, rt);
            if (s.rowCount > 0) {
              anyData = true;
              if (s.lastReportDate !== null && s.lastReportDate < staleBefore) anyStale = true;
            }
            return {
              reportType: rt,
              rowCount: s.rowCount,
              firstReportDate: s.firstReportDate,
              lastReportDate: s.lastReportDate,
              lastSync: last
                ? {
                    status: last.status,
                    source: last.source ?? null,
                    fetchedAt: last.fetchedAt,
                    startedAt: last.startedAt,
                    rowsAccepted: last.rowsAccepted,
                    rowsRejected: last.rowsRejected,
                    sourceUrl: last.sourceUrl,
                    message: last.message,
                  }
                : null,
              lastSuccessfulSyncAt: lastOk?.fetchedAt ?? null,
            };
          })
        : [],
    }));
    return {
      retrievedAt: now.toISOString(),
      overallStatus: !anyData ? 'UNAVAILABLE' : anyStale ? 'STALE' : 'CURRENT',
      markets,
    };
  }
}
