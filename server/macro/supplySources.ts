/**
 * T60 — Supply/demand source adapters (fail-closed; a value is never synthesized).
 *
 *   EIA weekly U.S. fuel-ethanol production   OFFICIAL  api.eia.gov v2 (needs EIA_API_KEY)
 *   USDA FAS Export Sales Reporting (ESR)     OFFICIAL  apps.fas.usda.gov/OpenData (needs FAS_API_KEY, free via api.data.gov)
 *   USDA ERS Commodity Costs and Returns      OFFICIAL  annual CSV (no key); breakeven = cost per acre / yield per acre
 *
 * CONAB (Brazil) has no stable machine-readable file, so it is NOT fetched (see CONAB_URL link-only rows).
 */
import type { DataQualityStatus } from '../../src/shared/types/market.ts';
import type { MacroDatapoint, MacroDatapointId } from '../../src/shared/types/macro.ts';
import { DAY_MS, errMessage, isIsoDate, TIMEOUT_MS, unavailable, type FetchLike } from './sources.ts';

export const ETHANOL_SERIES = 'W_EPOOXE_YOP_NUS_MBBLD';
export const EIA_ETHANOL_PAGE = 'https://www.eia.gov/petroleum/ethanol/';
export const EIA_ETHANOL_BASE =
  'https://api.eia.gov/v2/petroleum/sum/sndw/data/?frequency=weekly&data%5B0%5D=value' +
  `&facets%5Bseries%5D%5B%5D=${ETHANOL_SERIES}&sort%5B0%5D%5Bcolumn%5D=period&sort%5B0%5D%5Bdirection%5D=desc&length=2`;
export const FAS_ESR_PAGE = 'https://apps.fas.usda.gov/export-sales/esrd1.html';
export const FAS_ESR_BASE = 'https://apps.fas.usda.gov/OpenData/api/esr/exports';
export const FAS_KEY_URL = 'https://api.data.gov/signup/';
export const ERS_COSTS_PAGE = 'https://www.ers.usda.gov/data-products/commodity-costs-and-returns';
export const CONAB_URL = 'https://www.conab.gov.br/info-agro/safras/graos';

const ethBase = (fetchedAt: string) => ({
  id: 'EIA_ETHANOL_PRODUCTION' as const,
  label: 'U.S. fuel ethanol production (weekly)',
  unit: 'thousand barrels per day',
  sourceName: `U.S. EIA Weekly Petroleum Status Report (API v2, series ${ETHANOL_SERIES})`,
  sourceUrl: EIA_ETHANOL_BASE,
  sourceQuality: 'OFFICIAL' as const,
  fetchedAt,
});

interface EiaRow {
  period?: unknown;
  value?: unknown;
  units?: unknown;
  series?: unknown;
}

export function parseEiaEthanol(json: unknown, now: Date, fetchedAt: string): MacroDatapoint {
  const base = ethBase(fetchedAt);
  const raw = (json as { response?: { data?: unknown } })?.response?.data;
  const rows = (Array.isArray(raw) ? (raw as EiaRow[]) : [])
    .filter((r) => r.series === ETHANOL_SERIES)
    .sort((a, b) => String(b.period).localeCompare(String(a.period)));
  if (rows.length === 0) return unavailable(base, `EIA response contained no rows for ${ETHANOL_SERIES}.`);
  const [cur, prev] = rows;
  const value = Number(cur.value);
  if (!isIsoDate(cur.period) || !Number.isFinite(value) || value < 0 || cur.units !== 'MBBL/D') {
    return unavailable(base, 'EIA ethanol row failed validation (period/value/units).', 'INVALID');
  }
  const pv = prev && isIsoDate(prev.period) && prev.units === 'MBBL/D' ? Number(prev.value) : NaN;
  const stale = now.getTime() - Date.parse(`${cur.period}T00:00:00Z`) > 16 * DAY_MS;
  return {
    ...base,
    value,
    asOf: cur.period,
    releasedAt: null,
    previousValue: Number.isFinite(pv) ? pv : null,
    previousAsOf: Number.isFinite(pv) ? String(prev.period) : null,
    status: stale ? 'STALE' : 'HISTORICAL',
    reason: 'asOf = week ending. Release time is not provided by the EIA API.',
  };
}

export async function fetchEiaEthanol(
  fetchFn: FetchLike,
  apiKey: string | undefined,
  now: Date
): Promise<MacroDatapoint> {
  const fetchedAt = now.toISOString();
  const key = apiKey?.trim();
  if (!key) {
    return unavailable(ethBase(fetchedAt), 'EIA_API_KEY not configured (free key: https://www.eia.gov/opendata/register.php).');
  }
  try {
    const res = await fetchFn(`${EIA_ETHANOL_BASE}&api_key=${encodeURIComponent(key)}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return unavailable(ethBase(fetchedAt), `EIA HTTP ${res.status}`);
    return parseEiaEthanol(await res.json(), now, fetchedAt);
  } catch (err) {
    return unavailable(ethBase(fetchedAt), `EIA request failed: ${errMessage(err, key)}`);
  }
}

// ───────────────────────────── USDA FAS Export Sales ─────────────────────────────

export type FasCommodity = 'CORN' | 'SOYBEAN' | 'WHEAT';

/** ESR commodity codes (FAS OpenData): 401 Corn, 801 Soybeans, 107 All Wheat. Marketing years start Sep 1 / Sep 1 / Jun 1. */
export const FAS_COMMODITIES: Record<FasCommodity, { code: number; id: MacroDatapointId; label: string; myStartMonth: number }> = {
  CORN: { code: 401, id: 'FAS_EXPORT_SALES_CORN', label: 'U.S. corn weekly export shipments', myStartMonth: 9 },
  SOYBEAN: { code: 801, id: 'FAS_EXPORT_SALES_SOYBEAN', label: 'U.S. soybean weekly export shipments', myStartMonth: 9 },
  WHEAT: { code: 107, id: 'FAS_EXPORT_SALES_WHEAT', label: 'U.S. all-wheat weekly export shipments', myStartMonth: 6 },
};

export function fasMarketYear(c: FasCommodity, now: Date): number {
  return now.getUTCMonth() + 1 >= FAS_COMMODITIES[c].myStartMonth ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

export function fasUrl(c: FasCommodity, marketYear: number): string {
  return `${FAS_ESR_BASE}/commodityCode/${FAS_COMMODITIES[c].code}/allCountries/marketYear/${marketYear}`;
}

const fasBase = (c: FasCommodity, marketYear: number, fetchedAt: string) => ({
  id: FAS_COMMODITIES[c].id,
  label: FAS_COMMODITIES[c].label,
  unit: 'metric tons per week',
  sourceName: 'USDA FAS Export Sales Reporting (ESR OpenData API)',
  sourceUrl: fasUrl(c, marketYear),
  sourceQuality: 'OFFICIAL' as const,
  fetchedAt,
});

interface FasRow {
  weekEndingDate?: unknown;
  weeklyExports?: unknown;
  accumulatedExports?: unknown;
  outstandingSales?: unknown;
  currentMYNetSales?: unknown;
}

export function parseFasExportSales(json: unknown, c: FasCommodity, marketYear: number, now: Date, fetchedAt: string): MacroDatapoint {
  const base = fasBase(c, marketYear, fetchedAt);
  if (!Array.isArray(json)) return unavailable(base, 'FAS response is not a list of rows.', 'INVALID');
  // One row per country plus possibly a total; with the allCountries route rows are per week — sum duplicates by week.
  const byWeek = new Map<string, { weekly: number; accum: number; outstanding: number; net: number; ok: boolean }>();
  for (const r of json as FasRow[]) {
    const day = typeof r.weekEndingDate === 'string' ? r.weekEndingDate.slice(0, 10) : '';
    if (!isIsoDate(day)) continue;
    const w = byWeek.get(day) ?? { weekly: 0, accum: 0, outstanding: 0, net: 0, ok: true };
    const nums = [r.weeklyExports, r.accumulatedExports, r.outstandingSales, r.currentMYNetSales].map(Number);
    if (nums.some((n) => !Number.isFinite(n))) w.ok = false;
    else {
      w.weekly += nums[0];
      w.accum += nums[1];
      w.outstanding += nums[2];
      w.net += nums[3];
    }
    byWeek.set(day, w);
  }
  const weeks = [...byWeek.entries()].filter(([, w]) => w.ok).sort((a, b) => b[0].localeCompare(a[0]));
  if (weeks.length === 0) return unavailable(base, `FAS returned no usable weekly rows for market year ${marketYear}.`);
  const [[curDay, cur], prev] = weeks;
  const stale = now.getTime() - Date.parse(`${curDay}T00:00:00Z`) > 16 * DAY_MS;
  return {
    ...base,
    value: cur.weekly,
    asOf: curDay,
    releasedAt: null,
    previousValue: prev ? prev[1].weekly : null,
    previousAsOf: prev ? prev[0] : null,
    details: {
      accumulatedExports: cur.accum,
      outstandingSales: cur.outstanding,
      currentMYNetSales: cur.net,
      marketYear,
    },
    status: stale ? 'STALE' : 'HISTORICAL',
    reason: 'asOf = week ending (Thursday). Weekly shipments (exports), summed over all destination countries.',
  };
}

export async function fetchFasExportSales(
  fetchFn: FetchLike,
  apiKey: string | undefined,
  c: FasCommodity,
  now: Date
): Promise<MacroDatapoint> {
  const fetchedAt = now.toISOString();
  const my = fasMarketYear(c, now);
  const key = apiKey?.trim();
  if (!key) {
    return unavailable(fasBase(c, my, fetchedAt), `FAS_API_KEY not configured (free key: ${FAS_KEY_URL}).`);
  }
  try {
    const res = await fetchFn(fasUrl(c, my), { headers: { API_KEY: key }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return unavailable(fasBase(c, my, fetchedAt), `FAS HTTP ${res.status}`);
    return parseFasExportSales(await res.json(), c, my, now, fetchedAt);
  } catch (err) {
    return unavailable(fasBase(c, my, fetchedAt), `FAS request failed: ${errMessage(err, key)}`);
  }
}

// ───────────────────────────── USDA ERS costs & returns ─────────────────────────────

export type ErsCommodity = 'CORN' | 'SOYBEAN' | 'WHEAT';
const ERS_FILES: Record<ErsCommodity, { file: string; id: MacroDatapointId; label: string }> = {
  CORN: { file: 'corn', id: 'ERS_BREAKEVEN_CORN', label: 'U.S. corn full cost per bushel (ERS)' },
  SOYBEAN: { file: 'soybeans', id: 'ERS_BREAKEVEN_SOYBEAN', label: 'U.S. soybean full cost per bushel (ERS)' },
  WHEAT: { file: 'wheat', id: 'ERS_BREAKEVEN_WHEAT', label: 'U.S. wheat full cost per bushel (ERS)' },
};

/** Minimal RFC-4180 CSV parser (quoted fields with commas). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

const ersBase = (c: ErsCommodity, sourceUrl: string, fetchedAt: string) => ({
  id: ERS_FILES[c].id,
  label: ERS_FILES[c].label,
  unit: 'US dollars per bushel',
  sourceName: 'USDA ERS Commodity Costs and Returns (survey-based, U.S. total)',
  sourceUrl,
  sourceQuality: 'OFFICIAL' as const,
  fetchedAt,
});

/** Full cost per bushel = "Total, costs listed" ($/planted acre) / yield (bushels/planted acre), per year. */
export function parseErsCosts(csv: string, c: ErsCommodity, sourceUrl: string, fetchedAt: string): MacroDatapoint {
  const base = ersBase(c, sourceUrl, fetchedAt);
  const rows = parseCsv(csv);
  const head = rows[0]?.map((h) => h.trim());
  const col = (n: string) => head?.indexOf(n) ?? -1;
  const [iItem, iUnits, iRegion, iYear, iVal] = ['Item', 'Units', 'Region', 'Year', 'Value'].map(col);
  if (!head || [iItem, iUnits, iRegion, iYear, iVal].some((i) => i < 0)) {
    return unavailable(base, 'ERS CSV header not recognised.', 'INVALID');
  }
  const pick = (item: string, unitsRe: RegExp) => {
    const out = new Map<number, number>();
    for (const r of rows.slice(1)) {
      if (r[iRegion]?.trim() !== 'U.S. total' || r[iItem]?.trim() !== item || !unitsRe.test(r[iUnits] ?? '')) continue;
      const year = Number(r[iYear]);
      const v = Number(r[iVal]);
      if (Number.isInteger(year) && Number.isFinite(v) && v > 0) out.set(year, v);
    }
    return out;
  };
  const cost = pick('Total, costs listed', /dollars per planted acre/i);
  const opCost = pick('Total, operating costs', /dollars per planted acre/i);
  const yld = pick('Yield', /bushels per planted acre/i);
  const price = pick('Price', /dollars per bushel/i);
  const years = [...cost.keys()].filter((y) => yld.has(y)).sort((a, b) => b - a);
  if (years.length === 0) return unavailable(base, 'ERS CSV has no year with both total cost and yield for the U.S. total.');
  const [y, py] = years;
  const be = (yr: number) => cost.get(yr)! / yld.get(yr)!;
  const details: Record<string, number> = {
    costPerAcre: cost.get(y)!,
    yieldBuPerAcre: yld.get(y)!,
  };
  if (opCost.has(y)) {
    details.operatingCostPerAcre = opCost.get(y)!;
    details.operatingCostPerBushel = Number((opCost.get(y)! / yld.get(y)!).toFixed(2));
  }
  if (price.has(y)) details.priceReceivedPerBushel = price.get(y)!;
  return {
    ...base,
    value: Number(be(y).toFixed(2)),
    asOf: String(y),
    releasedAt: null,
    previousValue: py !== undefined ? Number(be(py).toFixed(2)) : null,
    previousAsOf: py !== undefined ? String(py) : null,
    details,
    status: 'HISTORICAL' as DataQualityStatus,
    reason: 'Annual survey data (calendar year of harvest). Full cost includes land and unpaid-labor opportunity costs; it is not a futures-market level.',
  };
}

/** The CSV links on the landing page carry release-specific media ids, so the link is discovered, never hard-coded. */
export function findErsCsvUrl(html: string, c: ErsCommodity): string | null {
  const m = new RegExp(`href="(/media/\\d+/${ERS_FILES[c].file}\\.csv[^"]*)"`, 'i').exec(html);
  return m ? `https://www.ers.usda.gov${m[1].replace(/&amp;/g, '&')}` : null;
}

export async function fetchErsCosts(fetchFn: FetchLike, c: ErsCommodity, now: Date): Promise<MacroDatapoint> {
  const fetchedAt = now.toISOString();
  try {
    const page = await fetchFn(ERS_COSTS_PAGE, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!page.ok) return unavailable(ersBase(c, ERS_COSTS_PAGE, fetchedAt), `ERS page HTTP ${page.status}`);
    const url = findErsCsvUrl(await page.text(), c);
    if (!url) return unavailable(ersBase(c, ERS_COSTS_PAGE, fetchedAt), 'ERS CSV link not found on the landing page.');
    const res = await fetchFn(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return unavailable(ersBase(c, url, fetchedAt), `ERS CSV HTTP ${res.status}`);
    return parseErsCosts(await res.text(), c, url, fetchedAt);
  } catch (err) {
    return unavailable(ersBase(c, ERS_COSTS_PAGE, fetchedAt), `ERS request failed: ${errMessage(err)}`);
  }
}
