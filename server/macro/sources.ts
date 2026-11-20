/**
 * T21 — Fundamental / macro source adapters (pure functions with injected fetch; no globals).
 *
 *   EIA Weekly Petroleum Status (stocks)  OFFICIAL    api.eia.gov v2 (needs EIA_API_KEY)
 *   USDA WASDE release calendar           OFFICIAL    esmis.nal.usda.gov API (no key)
 *   USDA WASDE key U.S. numbers           OFFICIAL    official WASDE .txt file from the latest release
 *   DXY (ICE US Dollar Index)             UNOFFICIAL  Yahoo Finance chart (opt-in YAHOO_ENABLED=true)
 *   USD/VND SBV central rate              OFFICIAL    not integrated (no machine-readable endpoint) → UNAVAILABLE
 *   USD/VND Vietcombank posted rate       UNOFFICIAL  Vietcombank XML feed (commercial-bank rate, not SBV)
 *
 * Every function fails closed: on any HTTP/shape/validation problem it returns status UNAVAILABLE or
 * INVALID with value null and a reason — it never substitutes a default or a previous number.
 */
import type { DataQualityStatus } from '../../src/shared/types/market.ts';
import type {
  MacroDatapoint,
  MacroDatapointId,
  MacroGroupResult,
  WasdeRelease,
  WasdeResult,
} from '../../src/shared/types/macro.ts';
import { sanitizeExternalText } from '../services/fundamentalService.ts';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const TIMEOUT_MS = 10_000;
export const DAY_MS = 86_400_000;

// ───────────────────────────── helpers ─────────────────────────────

export function errMessage(err: unknown, secret?: string): string {
  let msg = err instanceof Error ? err.message : String(err);
  if (secret) msg = msg.split(secret).join('***');
  return sanitizeExternalText(msg).slice(0, 200);
}

export function unavailable(
  base: Pick<MacroDatapoint, 'id' | 'label' | 'unit' | 'sourceName' | 'sourceUrl' | 'sourceQuality' | 'fetchedAt'>,
  reason: string,
  status: DataQualityStatus = 'UNAVAILABLE'
): MacroDatapoint {
  return { ...base, value: null, asOf: null, releasedAt: null, status, reason };
}

export function isIsoDate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

/** Aggregate status of a group: fails closed when nothing usable came back. */
export function groupStatus(items: MacroDatapoint[]): DataQualityStatus {
  const usable = items.filter((i) => i.value !== null && (i.status !== 'UNAVAILABLE' && i.status !== 'INVALID'));
  if (usable.length === 0) return items.some((i) => i.status === 'INVALID') ? 'INVALID' : 'UNAVAILABLE';
  const s = new Set(usable.map((i) => i.status));
  if (s.has('STALE')) return 'STALE';
  if (s.has('DELAYED')) return 'DELAYED';
  if (s.has('HISTORICAL')) return 'HISTORICAL';
  return 'CURRENT';
}

// ───────────────────────────── EIA ─────────────────────────────

export const EIA_WPSR_PAGE = 'https://www.eia.gov/petroleum/supply/weekly/';
export const EIA_WPSR_SCHEDULE = 'https://www.eia.gov/petroleum/supply/weekly/schedule.php';

export const EIA_SERIES: ReadonlyArray<{ series: string; id: MacroDatapointId; label: string }> = [
  { series: 'WCESTUS1', id: 'EIA_CRUDE_EX_SPR', label: 'U.S. crude oil stocks excl. SPR' },
  { series: 'WGTSTUS1', id: 'EIA_GASOLINE', label: 'U.S. total motor gasoline stocks' },
  { series: 'WDISTUS1', id: 'EIA_DISTILLATE', label: 'U.S. distillate fuel oil stocks' },
];

/** Public (key-less) form of the EIA v2 query; the key is appended only for the outgoing request. */
export function eiaQueryUrl(): string {
  const facets = EIA_SERIES.map((s) => `facets%5Bseries%5D%5B%5D=${s.series}`).join('&');
  return (
    'https://api.eia.gov/v2/petroleum/stoc/wstk/data/?frequency=weekly&data%5B0%5D=value&' +
    `${facets}&sort%5B0%5D%5Bcolumn%5D=period&sort%5B0%5D%5Bdirection%5D=desc&length=${EIA_SERIES.length * 2}`
  );
}

interface EiaRow {
  period?: unknown;
  series?: unknown;
  value?: unknown;
  units?: unknown;
}

/** Weekly stocks: week-ending date older than 16 days means at least one weekly release was missed. */
export function eiaStatus(period: string, now: Date): DataQualityStatus {
  return now.getTime() - Date.parse(`${period}T00:00:00Z`) > 16 * DAY_MS ? 'STALE' : 'HISTORICAL';
}

export function parseEiaWeeklyStocks(json: unknown, now: Date, fetchedAt: string): MacroDatapoint[] {
  const rows: EiaRow[] = Array.isArray((json as { response?: { data?: unknown } })?.response?.data)
    ? ((json as { response: { data: EiaRow[] } }).response.data)
    : [];
  const sourceUrl = eiaQueryUrl();
  return EIA_SERIES.map(({ series, id, label }) => {
    const base = {
      id,
      label,
      unit: 'thousand barrels',
      sourceName: `U.S. EIA Weekly Petroleum Status Report (API v2, series ${series})`,
      sourceUrl,
      sourceQuality: 'OFFICIAL' as const,
      fetchedAt,
    };
    const mine = rows
      .filter((r) => r.series === series)
      .sort((a, b) => String(b.period).localeCompare(String(a.period)));
    if (mine.length === 0) return unavailable(base, `EIA response contained no rows for ${series}.`);
    const [cur, prev] = mine;
    const value = Number(cur.value);
    if (!isIsoDate(cur.period) || !Number.isFinite(value) || value < 0 || cur.units !== 'MBBL') {
      return unavailable(base, `EIA row for ${series} failed validation (period/value/units).`, 'INVALID');
    }
    const prevValue = prev && isIsoDate(prev.period) && prev.units === 'MBBL' ? Number(prev.value) : NaN;
    return {
      ...base,
      value,
      asOf: cur.period,
      // The EIA API does not return the publication time; it is not inferred.
      releasedAt: null,
      previousValue: Number.isFinite(prevValue) ? prevValue : null,
      previousAsOf: Number.isFinite(prevValue) ? String(prev!.period) : null,
      status: eiaStatus(cur.period, now),
      reason: `asOf = week ending. Release time is not provided by the EIA API; schedule: ${EIA_WPSR_SCHEDULE}`,
    };
  });
}

export async function fetchEiaWeeklyStocks(
  fetchFn: FetchLike,
  apiKey: string | undefined,
  now: Date
): Promise<MacroGroupResult<MacroDatapoint>> {
  const fetchedAt = now.toISOString();
  const sourceUrl = eiaQueryUrl();
  const fail = (reason: string): MacroGroupResult<MacroDatapoint> => ({
    status: 'UNAVAILABLE',
    sourceUrl,
    fetchedAt,
    reason,
    items: EIA_SERIES.map(({ series, id, label }) =>
      unavailable(
        {
          id,
          label,
          unit: 'thousand barrels',
          sourceName: `U.S. EIA Weekly Petroleum Status Report (API v2, series ${series})`,
          sourceUrl,
          sourceQuality: 'OFFICIAL',
          fetchedAt,
        },
        reason
      )
    ),
  });
  const key = apiKey?.trim();
  if (!key) return fail('EIA_API_KEY not configured (free key: https://www.eia.gov/opendata/register.php).');
  try {
    const res = await fetchFn(`${sourceUrl}&api_key=${encodeURIComponent(key)}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return fail(`EIA HTTP ${res.status}`);
    const items = parseEiaWeeklyStocks(await res.json(), now, fetchedAt);
    return { status: groupStatus(items), items, sourceUrl, fetchedAt };
  } catch (err) {
    return fail(`EIA request failed: ${errMessage(err, key)}`);
  }
}

// ───────────────────────────── USDA WASDE ─────────────────────────────

export const ESMIS_WASDE_RELEASES_URL = 'https://esmis.nal.usda.gov/api/v1/release/findByIdentifier/wasde';
export const ESMIS_WASDE_PUBLICATION_URL = 'https://esmis.nal.usda.gov/api/v1/publication/findByIdentifier/wasde';
export const USDA_WASDE_PAGE = 'https://www.usda.gov/oce/commodity/wasde';

/**
 * ESMIS `release_datetime` (e.g. "2026-11-10T12:00:00+0000") is labelled +0000 although its wall clock
 * matches USDA's documented 12:00 ET release. To avoid publishing a wrong instant, only the calendar
 * date is used as `releasedAt`; the raw string is kept verbatim.
 */
function releaseFromRaw(raw: unknown, title: unknown, files: unknown): WasdeRelease | null {
  if (typeof raw !== 'string') return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(raw.trim());
  return {
    releasedAtRaw: sanitizeExternalText(raw),
    releasedAt: m && isIsoDate(m[1]) ? m[1] : null,
    title: typeof title === 'string' ? sanitizeExternalText(title) : 'World Agricultural Supply and Demand Estimates',
    files: Array.isArray(files)
      ? files.filter((f): f is string => typeof f === 'string' && /^https:\/\/esmis\.nal\.usda\.gov\//.test(f))
      : [],
  };
}

export function parseEsmisReleases(json: unknown): WasdeRelease[] {
  const results = (json as { results?: unknown })?.results;
  if (!Array.isArray(results)) return [];
  return results
    .map((r) => {
      const o = r as { release_datetime?: unknown; title?: unknown; files?: unknown };
      return releaseFromRaw(o.release_datetime, o.title, o.files);
    })
    .filter((r): r is WasdeRelease => r !== null && r.releasedAt !== null)
    .sort((a, b) => b.releasedAt!.localeCompare(a.releasedAt!));
}

/** `upcoming_releases` of the ESMIS publication record — only what USDA publishes, never estimated. */
export function parseEsmisUpcoming(json: unknown): WasdeRelease[] {
  const results = (json as { results?: unknown })?.results;
  if (!Array.isArray(results) || results.length === 0) return [];
  const up = (results[0] as { upcoming_releases?: unknown }).upcoming_releases;
  if (!Array.isArray(up)) return [];
  return up
    .map((u) => {
      if (typeof u === 'string') return releaseFromRaw(u, undefined, undefined);
      const o = u as { release_datetime?: unknown; date?: unknown; datetime?: unknown; title?: unknown };
      return releaseFromRaw(o?.release_datetime ?? o?.datetime ?? o?.date, o?.title, undefined);
    })
    .filter((r): r is WasdeRelease => r !== null && r.releasedAt !== null)
    .sort((a, b) => a.releasedAt!.localeCompare(b.releasedAt!));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const WASDE_TARGETS: ReadonlyArray<{
  id: MacroDatapointId;
  label: string;
  title: RegExp;
  marker: string | null;
}> = [
  { id: 'WASDE_US_CORN_ENDING_STOCKS', label: 'U.S. corn ending stocks', title: /U\.S\. Feed Grain and Corn Supply and Use/, marker: 'CORN' },
  { id: 'WASDE_US_SOYBEAN_ENDING_STOCKS', label: 'U.S. soybean ending stocks', title: /U\.S\. Soybeans and Products Supply and Use/, marker: 'SOYBEANS' },
  { id: 'WASDE_US_WHEAT_ENDING_STOCKS', label: 'U.S. wheat ending stocks', title: /U\.S\. Wheat Supply and Use/, marker: null },
];

export interface WasdeParseContext {
  releasedAt: string | null;
  sourceUrl: string;
  fetchedAt: string;
}

/**
 * Extracts U.S. ending stocks (current-month projection and the prior month's projection for the same
 * marketing year) from the official WASDE text file. Any structural surprise → INVALID for that item.
 */
export function parseWasdeText(text: string, ctx: WasdeParseContext): MacroDatapoint[] {
  const lines = text.replace(/\r/g, '').split('\n');
  // Report month from the page header, e.g. "WASDE - 677 - 8    November 2026".
  const header = lines.find((l) => /WASDE\s*-\s*\d+/.test(l)) ?? '';
  const hm = new RegExp(`(${MONTH_NAMES.join('|')})\\s+(\\d{4})`).exec(header);
  const reportMonth = hm ? `${hm[2]}-${String(MONTH_NAMES.indexOf(hm[1]) + 1).padStart(2, '0')}` : null;
  const headerMismatch =
    reportMonth !== null && ctx.releasedAt !== null && !ctx.releasedAt.startsWith(reportMonth);

  return WASDE_TARGETS.map(({ id, label, title, marker }) => {
    const base = {
      id,
      label,
      unit: '',
      sourceName: 'USDA WAOB — WASDE report (official text file)',
      sourceUrl: ctx.sourceUrl,
      sourceQuality: 'OFFICIAL' as const,
      fetchedAt: ctx.fetchedAt,
    };
    const invalid = (why: string) => ({ ...unavailable(base, why, 'INVALID'), unit: 'unknown' });
    if (!reportMonth) return invalid('WASDE text header (report month) not found.');
    if (headerMismatch) return invalid(`WASDE text is for ${reportMonth}, release date is ${ctx.releasedAt}.`);

    const ti = lines.findIndex((l) => title.test(l));
    if (ti < 0) return invalid(`Section "${title.source}" not found in WASDE text.`);
    const yearLine = lines.slice(ti, ti + 6).find((l) => /Proj\./.test(l));
    const monthLine = lines.slice(ti, ti + 6).find((l) => /^Item\b/.test(l.trim()));
    const years = yearLine ? [...yearLine.matchAll(/(\d{4}\/\d{2})\s+Proj\./g)].map((m) => m[1]) : [];
    const months = monthLine ? [...monthLine.matchAll(new RegExp(`\\b(${MONTHS.join('|')})\\b`, 'g'))].map((m) => m[1]) : [];
    if (years.length === 0 || months.length === 0) return invalid('WASDE column header not recognised.');

    let start = ti;
    if (marker) {
      const mi = lines.findIndex((l, i) => i > ti && l.trim() === marker);
      if (mi < 0) return invalid(`Sub-table ${marker} not found.`);
      start = mi;
    }
    const ei = lines.findIndex((l, i) => i > start && /^Ending Stocks\s/.test(l));
    if (ei < 0 || ei - start > 40) return invalid('Ending Stocks row not found.');
    const nums = (lines[ei].match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    if (nums.length < 2 || nums.some((n) => !Number.isFinite(n))) return invalid('Ending Stocks row not numeric.');

    let unit = '';
    for (let i = ei - 1; i > start; i--) {
      const t = lines[i].trim();
      if (/^(Million|Thousand|Billion)\s+[A-Za-z ]+$/.test(t)) {
        unit = t.toLowerCase();
        break;
      }
    }
    if (!unit) return invalid('Unit line for Ending Stocks not found.');

    const year = years[years.length - 1];
    const cur = nums[nums.length - 1];
    const hasPrevMonth = years.length >= 2 && years[years.length - 2] === year && months.length >= 2;

    // Stocks-to-use = Ending Stocks / "Use, Total" (same table, same unit). Omitted when the row is absent.
    const details: Record<string, number> = {};
    const useLine = lines.slice(start, ei).reverse().find((l) => /^\s*Use, Total\s/.test(l));
    const useNums = useLine ? (useLine.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number) : [];
    if (useNums.length === nums.length && useNums.every((n) => Number.isFinite(n) && n > 0)) {
      const useCur = useNums[useNums.length - 1];
      details.useTotal = useCur;
      details.stocksToUsePct = Number(((cur / useCur) * 100).toFixed(1));
      if (hasPrevMonth) {
        const usePrev = useNums[useNums.length - 2];
        details.previousUseTotal = usePrev;
        details.previousStocksToUsePct = Number(((nums[nums.length - 2] / usePrev) * 100).toFixed(1));
      }
    }
    return {
      ...base,
      ...(Object.keys(details).length > 0 ? { details } : {}),
      unit,
      value: cur,
      asOf: `${year} projection (${months[months.length - 1]} ${reportMonth.slice(0, 4)} WASDE)`,
      releasedAt: ctx.releasedAt,
      previousValue: hasPrevMonth ? nums[nums.length - 2] : null,
      previousAsOf: hasPrevMonth ? `${year} projection (${months[months.length - 2]} WASDE)` : null,
      status: 'HISTORICAL' as DataQualityStatus,
    };
  });
}

export async function fetchWasde(fetchFn: FetchLike, now: Date): Promise<WasdeResult> {
  const fetchedAt = now.toISOString();
  const result: WasdeResult = {
    status: 'UNAVAILABLE',
    releases: [],
    upcoming: [],
    keyNumbers: [],
    calendarSourceUrl: ESMIS_WASDE_RELEASES_URL,
    fetchedAt,
  };
  const keyFail = (reason: string, sourceUrl: string) =>
    WASDE_TARGETS.map(({ id, label }) =>
      unavailable(
        {
          id,
          label,
          unit: 'unknown',
          sourceName: 'USDA WAOB — WASDE report (official text file)',
          sourceUrl,
          sourceQuality: 'OFFICIAL',
          fetchedAt,
        },
        reason
      )
    );

  try {
    const res = await fetchFn(ESMIS_WASDE_RELEASES_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`ESMIS HTTP ${res.status}`);
    result.releases = parseEsmisReleases(await res.json()).slice(0, 12);
  } catch (err) {
    result.reason = `WASDE release calendar unavailable: ${errMessage(err)}`;
    result.keyNumbers = keyFail(result.reason, USDA_WASDE_PAGE);
    return result;
  }

  try {
    const res = await fetchFn(ESMIS_WASDE_PUBLICATION_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.ok) result.upcoming = parseEsmisUpcoming(await res.json());
  } catch {
    // Upcoming list is optional; absence is shown as "not published", never estimated.
  }

  const latest = result.releases[0];
  const txtUrl = latest?.files.find((f) => f.endsWith('.txt'));
  if (!latest || !txtUrl) {
    result.reason = 'No WASDE release with an official .txt file found.';
    result.keyNumbers = keyFail(result.reason, ESMIS_WASDE_RELEASES_URL);
  } else {
    try {
      const res = await fetchFn(txtUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`WASDE file HTTP ${res.status}`);
      const text = await res.text();
      result.keyNumbers = parseWasdeText(text, { releasedAt: latest.releasedAt, sourceUrl: txtUrl, fetchedAt });
      // A WASDE more than ~40 days old means a monthly release was missed by this feed.
      const age = latest.releasedAt ? now.getTime() - Date.parse(`${latest.releasedAt}T00:00:00Z`) : Infinity;
      if (age > 40 * DAY_MS) {
        result.keyNumbers = result.keyNumbers.map((k) => (k.value !== null ? { ...k, status: 'STALE' } : k));
      }
    } catch (err) {
      result.keyNumbers = keyFail(`WASDE text unavailable: ${errMessage(err)}`, txtUrl);
    }
  }
  result.status = result.releases.length > 0 ? groupStatus(result.keyNumbers) : 'UNAVAILABLE';
  if (result.status === 'UNAVAILABLE' || result.status === 'INVALID') {
    // Calendar itself is still real data even if key numbers failed.
    result.status = result.releases.length > 0 ? 'HISTORICAL' : 'UNAVAILABLE';
  }
  return result;
}

// ───────────────────────────── FX: DXY & USD/VND ─────────────────────────────

export const YAHOO_DXY_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?range=5d&interval=1d';
const YAHOO_UA = 'Mozilla/5.0 (compatible; market-data-client/1.0)';

export function parseYahooDxy(json: unknown, now: Date, fetchedAt: string): MacroDatapoint {
  const base = {
    id: 'DXY' as const,
    label: 'ICE U.S. Dollar Index (DXY)',
    unit: 'index points',
    sourceName: 'Yahoo Finance chart DX-Y.NYB (unofficial, delayed; ICE DXY has no free official feed)',
    sourceUrl: YAHOO_DXY_URL,
    sourceQuality: 'UNOFFICIAL' as const,
    fetchedAt,
  };
  const meta = (json as { chart?: { result?: Array<{ meta?: Record<string, unknown> }> } })?.chart?.result?.[0]?.meta;
  if (!meta) return unavailable(base, 'Yahoo response has no chart.meta.');
  if (meta.symbol !== 'DX-Y.NYB' || meta.exchangeName !== 'NYB' || meta.currency !== 'USD') {
    return unavailable(base, 'Yahoo response symbol/exchange/currency did not match DX-Y.NYB / NYB / USD.', 'INVALID');
  }
  const price = Number(meta.regularMarketPrice);
  const t = Number(meta.regularMarketTime);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(t) || t <= 0) {
    return unavailable(base, 'Yahoo price or timestamp missing.', 'INVALID');
  }
  const asOfMs = t * 1000;
  if (asOfMs > now.getTime() + 5 * 60_000) return unavailable(base, 'Yahoo timestamp is in the future.', 'INVALID');
  const ageH = (now.getTime() - asOfMs) / 3_600_000;
  const prevClose = Number(meta.chartPreviousClose);
  return {
    ...base,
    value: price,
    asOf: new Date(asOfMs).toISOString(),
    releasedAt: null,
    status: ageH <= 2 ? 'DELAYED' : ageH <= 96 ? 'HISTORICAL' : 'STALE',
    details: Number.isFinite(prevClose) ? { chartPreviousClose: prevClose } : undefined,
    reason: 'UNOFFICIAL: Yahoo Finance, delayed, personal use only. Not an ICE data licence.',
  };
}

export async function fetchDxy(fetchFn: FetchLike, yahooEnabled: boolean, now: Date): Promise<MacroDatapoint> {
  const fetchedAt = now.toISOString();
  if (!yahooEnabled) {
    return parseYahooDxyDisabled(fetchedAt);
  }
  try {
    const res = await fetchFn(YAHOO_DXY_URL, {
      headers: { 'User-Agent': YAHOO_UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { ...parseYahooDxy(null, now, fetchedAt), reason: `Yahoo HTTP ${res.status}` };
    return parseYahooDxy(await res.json(), now, fetchedAt);
  } catch (err) {
    return { ...parseYahooDxy(null, now, fetchedAt), reason: `Yahoo request failed: ${errMessage(err)}` };
  }
}

function parseYahooDxyDisabled(fetchedAt: string): MacroDatapoint {
  return {
    ...parseYahooDxy(null, new Date(fetchedAt), fetchedAt),
    reason: 'DXY uses the UNOFFICIAL Yahoo source, which is disabled. Set YAHOO_ENABLED=true (personal use only).',
  };
}

export const SBV_URL = 'https://www.sbv.gov.vn/';

export function sbvCentralRateUnavailable(fetchedAt: string): MacroDatapoint {
  return unavailable(
    {
      id: 'USDVND_SBV_CENTRAL',
      label: 'USD/VND central rate (State Bank of Vietnam)',
      unit: 'VND per USD',
      sourceName: 'State Bank of Vietnam (SBV)',
      sourceUrl: SBV_URL,
      sourceQuality: 'OFFICIAL',
      fetchedAt,
    },
    'SBV publishes the daily central rate only on its web portal; no machine-readable official endpoint is integrated. Check sbv.gov.vn directly.'
  );
}

export const VCB_XML_URL = 'https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx';

function parseVnNumber(s: string | undefined): number {
  if (!s || s.trim() === '-') return NaN;
  return Number(s.replace(/,/g, ''));
}

/** "11/18/2026 5:40:00 PM" (Vietnam local time) → ISO with +07:00. */
export function parseVcbDateTime(s: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i.exec(s.trim());
  if (!m) return null;
  let h = Number(m[4]);
  if (h < 1 || h > 12) return null;
  const pm = m[7].toUpperCase() === 'PM';
  if (h === 12) h = pm ? 12 : 0;
  else if (pm) h += 12;
  const pad = (n: number | string) => String(n).padStart(2, '0');
  const iso = `${m[3]}-${pad(m[1])}-${pad(m[2])}T${pad(h)}:${m[5]}:${m[6]}+07:00`;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

export function parseVcbXml(xml: string, now: Date, fetchedAt: string): MacroDatapoint {
  const base = {
    id: 'USDVND_VCB' as const,
    label: 'USD/VND Vietcombank posted rate (transfer)',
    unit: 'VND per USD',
    sourceName: 'Vietcombank XML exchange-rate feed (commercial-bank rate, not the SBV central rate)',
    sourceUrl: VCB_XML_URL,
    sourceQuality: 'UNOFFICIAL' as const,
    fetchedAt,
  };
  const dt = /<DateTime>([^<]+)<\/DateTime>/.exec(xml)?.[1];
  const row = /<Exrate\s+CurrencyCode="USD"[^>]*\/>/.exec(xml)?.[0];
  if (!dt || !row) return unavailable(base, 'Vietcombank XML missing DateTime or USD row.');
  const asOf = parseVcbDateTime(dt);
  const attr = (name: string) => new RegExp(`${name}="([^"]*)"`).exec(row)?.[1];
  const buy = parseVnNumber(attr('Buy'));
  const transfer = parseVnNumber(attr('Transfer'));
  const sell = parseVnNumber(attr('Sell'));
  if (!asOf || !Number.isFinite(transfer) || transfer <= 0) {
    return unavailable(base, 'Vietcombank USD row or timestamp failed validation.', 'INVALID');
  }
  if (Date.parse(asOf) > now.getTime() + 5 * 60_000) {
    return unavailable(base, 'Vietcombank timestamp is in the future.', 'INVALID');
  }
  const details: Record<string, number> = { transfer };
  if (Number.isFinite(buy)) details.buyCash = buy;
  if (Number.isFinite(sell)) details.sell = sell;
  const ageH = (now.getTime() - Date.parse(asOf)) / 3_600_000;
  return {
    ...base,
    value: transfer,
    asOf,
    releasedAt: asOf,
    details,
    status: ageH <= 24 ? 'DELAYED' : 'STALE',
    reason: 'UNOFFICIAL for the SBV central rate: Vietcombank posted rate, "for reference only" per the feed.',
  };
}

export async function fetchUsdVndVcb(fetchFn: FetchLike, now: Date): Promise<MacroDatapoint> {
  const fetchedAt = now.toISOString();
  try {
    const res = await fetchFn(VCB_XML_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return { ...parseVcbXml('', now, fetchedAt), reason: `Vietcombank HTTP ${res.status}` };
    return parseVcbXml(await res.text(), now, fetchedAt);
  } catch (err) {
    return { ...parseVcbXml('', now, fetchedAt), reason: `Vietcombank request failed: ${errMessage(err)}` };
  }
}
