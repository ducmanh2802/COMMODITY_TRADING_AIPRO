/**
 * COT data from CFTC's downloadable historical files on www.cftc.gov (fallback for the Socrata API).
 *
 *   Disaggregated Futures Only: https://www.cftc.gov/files/dea/history/fut_disagg_txt_<YEAR>.zip → f_year.txt
 *   Legacy Futures Only:        https://www.cftc.gov/files/dea/history/deacot<YEAR>.zip         → annual.txt
 *
 * The current year's zip is republished by CFTC each week with the latest report included, so it also
 * serves as the "current week" source (no separate header-less current-week file is needed).
 *
 * Politeness: one download at a time, a delay between downloads, per-request timeout, bounded retry with
 * exponential backoff on network errors / HTTP 429 / 5xx; other 4xx fail immediately.
 *
 * Cache: zips are kept under data/cache/cftc/ (override: COT_CACHE_DIR) with a JSON sidecar holding the
 * URL, fetch time, byte size and SHA-256 (re-verified on every reuse). A past year's file is reused
 * indefinitely once it was fetched after that year was over (plus a grace period for the last reports of
 * December, released in early January); otherwise (current year) it is refetched when older than 1 day.
 * If a refetch fails but a cached copy exists, the stale copy is used and a note says so.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CotReportType } from '../../src/shared/cot/analytics.ts';
import { CftcFetchError, type CftcClientLike, type CftcFetchRequest, type CftcFetchResult } from './client.ts';
import { normalizeKey, parseCftcCsv } from './parser.ts';
import { DEFAULT_MAX_UNCOMPRESSED_BYTES, extractZipEntry, listZipEntries, ZipError } from './zip.ts';

export const CFTC_FILES_BASE_URL = 'https://www.cftc.gov/files/dea/history';
export const DEFAULT_COT_CACHE_DIR = path.join('data', 'cache', 'cftc');

export const CFTC_HISTORY_FILES: Record<CotReportType, { zipName: (year: number) => string; entryName: string }> = {
  DISAGGREGATED: { zipName: (y) => `fut_disagg_txt_${y}.zip`, entryName: 'f_year.txt' },
  LEGACY: { zipName: (y) => `deacot${y}.zip`, entryName: 'annual.txt' },
};

/** A past year's file fetched on/after Jan <GRACE> of the following year is treated as final. */
const FINAL_GRACE_DAYS = 14;
const MIN_YEAR = 1986;

export interface CacheMeta {
  url: string;
  fetchedAt: string;
  sha256: string;
  bytes: number;
}

export interface CftcHistoricalFileSourceOptions {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  cacheDir?: string;
  now?: () => Date;
  timeoutMs?: number;
  maxAttempts?: number;
  backoffBaseMs?: number;
  /** Delay between two consecutive downloads (cache hits do not wait). */
  requestDelayMs?: number;
  /** Current-year cache max age. */
  maxAgeMs?: number;
  maxDownloadBytes?: number;
  maxUncompressedBytes?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

export class CftcHistoricalFileSource implements CftcClientLike {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly cacheDir: string;
  private readonly now: () => Date;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly backoffBaseMs: number;
  private readonly requestDelayMs: number;
  private readonly maxAgeMs: number;
  private readonly maxDownloadBytes: number;
  private readonly maxUncompressedBytes: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private lastDownloadAt: number | null = null;

  constructor(options: CftcHistoricalFileSourceOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = (options.baseUrl ?? CFTC_FILES_BASE_URL).replace(/\/+$/, '');
    this.cacheDir = options.cacheDir ?? (process.env.COT_CACHE_DIR?.trim() || DEFAULT_COT_CACHE_DIR);
    this.now = options.now ?? (() => new Date());
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.backoffBaseMs = options.backoffBaseMs ?? 2_000;
    this.requestDelayMs = options.requestDelayMs ?? 1_500;
    this.maxAgeMs = options.maxAgeMs ?? 86_400_000;
    this.maxDownloadBytes = options.maxDownloadBytes ?? 100 * 1024 * 1024;
    this.maxUncompressedBytes = options.maxUncompressedBytes ?? DEFAULT_MAX_UNCOMPRESSED_BYTES;
    this.sleep = options.sleep ?? defaultSleep;
  }

  fileUrl(reportType: CotReportType, year: number): string {
    return `${this.baseUrl}/${CFTC_HISTORY_FILES[reportType].zipName(year)}`;
  }

  async fetchReports(req: CftcFetchRequest): Promise<CftcFetchResult> {
    if (!/^[0-9A-Z]{6}$/.test(req.marketCode)) throw new Error('Invalid CFTC contract market code');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.from)) throw new Error('Invalid from date');
    const fromYear = Math.max(MIN_YEAR, Number(req.from.slice(0, 4)));
    const currentYear = this.now().getUTCFullYear();

    const records: Record<string, unknown>[] = [];
    const recordProvenance: Array<{ sourceUrl: string; fetchedAt: string }> = [];
    const sourceUrls: string[] = [];
    const notes: string[] = [];
    let latestFetch: string | null = null;

    for (let year = fromYear; year <= currentYear; year += 1) {
      const url = this.fileUrl(req.reportType, year);
      let file: { text: string; meta: CacheMeta };
      try {
        file = await this.getText(url, req.reportType, year, currentYear, notes);
      } catch (err) {
        // Early January: the new year's file may not exist yet.
        if (err instanceof CftcFetchError && err.httpStatus === 404 && year === currentYear) {
          notes.push(`${url}: not published yet (HTTP 404); skipped.`);
          continue;
        }
        throw err;
      }
      sourceUrls.push(url);
      if (latestFetch === null || file.meta.fetchedAt > latestFetch) latestFetch = file.meta.fetchedAt;

      const text = file.text;
      const rows = parseCftcCsv(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
      if (rows.length === 0) continue;
      const keys = Object.keys(rows[0]);
      const codeKey = keys.find((k) => normalizeKey(k) === 'cftc_contract_market_code');
      const dateKey = keys.find((k) =>
        ['report_date_as_yyyy_mm_dd', 'as_of_date_in_form_yyyy_mm_dd'].includes(normalizeKey(k))
      );
      if (!codeKey) {
        throw new CftcFetchError(`CFTC file ${url}: no "CFTC Contract Market Code" column`, url, null, 1);
      }
      for (const row of rows) {
        if (row[codeKey].trim() !== req.marketCode) continue;
        // Keep rows with an unparseable date: the parser rejects them visibly (fail-closed).
        const d = dateKey ? row[dateKey].trim().slice(0, 10) : '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d < req.from) continue;
        records.push(row);
        recordProvenance.push({ sourceUrl: url, fetchedAt: file.meta.fetchedAt });
      }
    }

    return {
      records,
      sourceUrl: sourceUrls[0] ?? this.fileUrl(req.reportType, fromYear),
      sourceUrls,
      pages: sourceUrls.length,
      fetchedAt: latestFetch ?? this.now().toISOString(),
      source: 'files',
      recordProvenance,
      notes,
    };
  }

  private extractText(zip: Buffer, reportType: CotReportType, url: string): string {
    try {
      const entries = listZipEntries(zip);
      const want = CFTC_HISTORY_FILES[reportType].entryName;
      const txt = entries.filter((e) => e.name.toLowerCase().endsWith('.txt'));
      const entry = entries.find((e) => e.name.toLowerCase() === want) ?? (txt.length === 1 ? txt[0] : undefined);
      if (!entry) {
        throw new ZipError(`expected ${want} in archive, found: ${entries.map((e) => e.name).join(', ') || 'nothing'}`);
      }
      return extractZipEntry(zip, entry, { maxUncompressedBytes: this.maxUncompressedBytes }).toString('utf8');
    } catch (err) {
      if (err instanceof ZipError) throw new CftcFetchError(`CFTC file ${url}: ${err.message}`, url, null, 1);
      throw err;
    }
  }

  // ------------------------------------------------------------------------------------------- cache
  private cachePaths(url: string): { zip: string; meta: string } {
    const name = path.basename(new URL(url).pathname);
    if (!/^[A-Za-z0-9_.-]+\.zip$/.test(name)) throw new Error(`Unexpected CFTC file name: ${name}`);
    const zip = path.join(this.cacheDir, name);
    return { zip, meta: `${zip}.json` };
  }

  private async readCache(url: string): Promise<{ zip: Buffer; meta: CacheMeta } | null> {
    const p = this.cachePaths(url);
    try {
      const meta = JSON.parse(await readFile(p.meta, 'utf8')) as CacheMeta;
      const zip = await readFile(p.zip);
      if (meta.url !== url || meta.bytes !== zip.length || meta.sha256 !== sha256(zip)) return null;
      if (Number.isNaN(Date.parse(meta.fetchedAt))) return null;
      return { zip, meta };
    } catch {
      return null;
    }
  }

  private async writeCache(url: string, zip: Buffer, meta: CacheMeta): Promise<void> {
    const p = this.cachePaths(url);
    await mkdir(this.cacheDir, { recursive: true });
    const tmpZip = `${p.zip}.${process.pid}.tmp`;
    const tmpMeta = `${p.meta}.${process.pid}.tmp`;
    await writeFile(tmpZip, zip);
    await writeFile(tmpMeta, JSON.stringify(meta, null, 2));
    await rename(tmpZip, p.zip);
    await rename(tmpMeta, p.meta);
  }

  private isFresh(meta: CacheMeta, year: number, currentYear: number): boolean {
    const fetched = Date.parse(meta.fetchedAt);
    if (year < currentYear && fetched >= Date.UTC(year + 1, 0, 1 + FINAL_GRACE_DAYS)) return true;
    return this.now().getTime() - fetched < this.maxAgeMs;
  }

  /** Cached or downloaded zip → extracted text. A download is only cached after it extracted cleanly. */
  private async getText(
    url: string,
    reportType: CotReportType,
    year: number,
    currentYear: number,
    notes: string[]
  ): Promise<{ text: string; meta: CacheMeta }> {
    let cached: { text: string; meta: CacheMeta } | null = null;
    const raw = await this.readCache(url);
    if (raw) {
      try {
        cached = { text: this.extractText(raw.zip, reportType, url), meta: raw.meta };
      } catch {
        cached = null; // unreadable cache → treat as a miss
      }
    }
    if (cached && this.isFresh(cached.meta, year, currentYear)) return cached;
    try {
      const zip = await this.download(url);
      const text = this.extractText(zip, reportType, url);
      const meta: CacheMeta = { url, fetchedAt: this.now().toISOString(), sha256: sha256(zip), bytes: zip.length };
      try {
        await this.writeCache(url, zip, meta);
      } catch {
        notes.push(`${url}: could not write cache (continuing without it).`);
      }
      return { text, meta };
    } catch (err) {
      if (cached && err instanceof CftcFetchError && err.httpStatus !== 404) {
        notes.push(`${url}: refresh failed (${err.message}); using cached copy fetched ${cached.meta.fetchedAt}.`);
        return cached;
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------------------------------- download
  private async download(url: string): Promise<Buffer> {
    let lastError: CftcFetchError | null = null;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      if (attempt > 1) await this.sleep(this.backoffBaseMs * 2 ** (attempt - 2));
      else if (this.lastDownloadAt !== null && this.requestDelayMs > 0) await this.sleep(this.requestDelayMs);
      this.lastDownloadAt = Date.now();
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          headers: { Accept: 'application/zip, application/octet-stream' },
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (err) {
        const msg = err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'network error';
        lastError = new CftcFetchError(`CFTC file download failed (${msg})`, url, null, attempt);
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        lastError = new CftcFetchError(`CFTC responded HTTP ${res.status}`, url, res.status, attempt);
        continue;
      }
      if (!res.ok) throw new CftcFetchError(`CFTC responded HTTP ${res.status}`, url, res.status, attempt);
      const declared = Number(res.headers.get('content-length') ?? NaN);
      if (Number.isFinite(declared) && declared > this.maxDownloadBytes) {
        throw new CftcFetchError(`CFTC file is ${declared} bytes, above the download cap`, url, res.status, attempt);
      }
      let body: Buffer;
      try {
        body = Buffer.from(await res.arrayBuffer());
      } catch {
        lastError = new CftcFetchError('CFTC file download failed (body read error)', url, null, attempt);
        continue;
      }
      if (body.length > this.maxDownloadBytes) {
        throw new CftcFetchError(`CFTC file is ${body.length} bytes, above the download cap`, url, res.status, attempt);
      }
      if (body.length < 4 || body.readUInt32LE(0) !== 0x04034b50) {
        throw new CftcFetchError('CFTC response is not a zip archive', url, res.status, attempt);
      }
      return body;
    }
    throw lastError ?? new CftcFetchError('CFTC file download failed', url, null, this.maxAttempts);
  }
}
