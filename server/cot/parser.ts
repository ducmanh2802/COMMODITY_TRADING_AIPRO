/**
 * Normalizes raw CFTC COT records into typed rows. Fail-closed: a record missing any required field,
 * or carrying a non-numeric / negative position, is rejected with a reason — never defaulted to 0.
 *
 * Field names: the Socrata datasets on publicreporting.cftc.gov use lower-case snake_case names
 * (e.g. `report_date_as_yyyy_mm_dd`, `cftc_contract_market_code`, `open_interest_all`). CFTC's
 * downloadable text files use the same names in mixed case for the disaggregated report
 * (`Report_Date_as_YYYY-MM-DD`, `Swap__Positions_Short_All`) and descriptive names for the legacy report
 * (`Noncommercial Positions-Long (All)`). Keys are normalized (lower-case, runs of non-alphanumerics → `_`)
 * and each field is looked up through a list of known aliases, so both sources parse identically.
 * Only the "All" (all crop years) columns are used.
 */
import type { CotCategory, CotCategoryPositions, CotReportType } from '../../src/shared/cot/analytics.ts';
import { parseIsoDate } from '../../src/shared/cot/analytics.ts';

export interface CotReportRecord {
  reportType: CotReportType;
  cftcContractMarketCode: string;
  /** CFTC as-of date (YYYY-MM-DD), stored exactly as published. */
  reportDate: string;
  marketAndExchangeNames: string;
  openInterest: number;
  positions: Partial<Record<CotCategory, CotCategoryPositions>>;
  totalReportable: { long: number; short: number } | null;
  /** Non-fatal consistency notes (e.g. category totals do not add up to open interest). */
  warnings: string[];
}

export type ParseOutcome =
  | { ok: true; record: CotReportRecord }
  | { ok: false; reason: string };

export function normalizeKey(key: string): string {
  return key
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeRecord(raw: Record<string, unknown>): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const [k, v] of Object.entries(raw)) out.set(normalizeKey(k), v);
  return out;
}

/** Look up the first alias present; each alias is also tried with/without a trailing `_all`. */
function pick(rec: Map<string, unknown>, aliases: readonly string[]): unknown {
  for (const a of aliases) {
    const variants = a.endsWith('_all') ? [a, a.slice(0, -4)] : [a, `${a}_all`];
    for (const v of variants) {
      if (rec.has(v)) return rec.get(v);
    }
  }
  return undefined;
}

const NUMERIC = /^-?\d+(\.\d+)?$/;

function toCount(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!NUMERIC.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function toReportDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  // Socrata floating timestamp "2026-11-10T00:00:00.000" or plain "2026-11-10".
  const m = /^(\d{4}-\d{2}-\d{2})(T00:00:00(\.0+)?)?$/.exec(s);
  if (!m) return null;
  return parseIsoDate(m[1]) === null ? null : m[1];
}

interface CategorySpec {
  category: CotCategory;
  long: readonly string[];
  short: readonly string[];
  spread: readonly string[] | null;
}

const DISAGG_SPECS: readonly CategorySpec[] = [
  { category: 'producerMerchant', long: ['prod_merc_positions_long_all'], short: ['prod_merc_positions_short_all'], spread: null },
  {
    category: 'swapDealers',
    long: ['swap_positions_long_all'],
    short: ['swap_positions_short_all'],
    spread: ['swap_positions_spread_all'],
  },
  {
    category: 'managedMoney',
    long: ['m_money_positions_long_all'],
    short: ['m_money_positions_short_all'],
    spread: ['m_money_positions_spread_all'],
  },
  {
    category: 'otherReportables',
    long: ['other_rept_positions_long_all'],
    short: ['other_rept_positions_short_all'],
    spread: ['other_rept_positions_spread_all'],
  },
  {
    category: 'nonReportables',
    long: ['nonrept_positions_long_all'],
    short: ['nonrept_positions_short_all'],
    spread: null,
  },
];

const LEGACY_SPECS: readonly CategorySpec[] = [
  {
    category: 'nonCommercial',
    long: ['noncomm_positions_long_all', 'noncommercial_positions_long_all'],
    short: ['noncomm_positions_short_all', 'noncommercial_positions_short_all'],
    // Socrata's legacy dataset spells this column "postions".
    spread: ['noncomm_postions_spread_all', 'noncomm_positions_spread_all', 'noncommercial_positions_spreading_all'],
  },
  {
    category: 'commercial',
    long: ['comm_positions_long_all', 'commercial_positions_long_all'],
    short: ['comm_positions_short_all', 'commercial_positions_short_all'],
    spread: null,
  },
  {
    category: 'nonReportables',
    long: ['nonrept_positions_long_all', 'nonreportable_positions_long_all'],
    short: ['nonrept_positions_short_all', 'nonreportable_positions_short_all'],
    spread: null,
  },
];

const TOTAL_REPT_LONG = ['tot_rept_positions_long_all', 'total_reportable_positions_long_all'];
const TOTAL_REPT_SHORT = ['tot_rept_positions_short_all', 'total_reportable_positions_short_all'];

export function parseCotRecord(raw: Record<string, unknown>, reportType: CotReportType): ParseOutcome {
  if (typeof raw !== 'object' || raw === null) return { ok: false, reason: 'record is not an object' };
  const rec = normalizeRecord(raw);

  const code = pick(rec, ['cftc_contract_market_code']);
  if (typeof code !== 'string' || !/^[0-9A-Z]{6}$/.test(code.trim())) {
    return { ok: false, reason: 'missing or malformed cftc_contract_market_code' };
  }
  const reportDate = toReportDate(pick(rec, ['report_date_as_yyyy_mm_dd', 'as_of_date_in_form_yyyy_mm_dd']));
  if (!reportDate) return { ok: false, reason: 'missing or malformed report date' };
  const name = pick(rec, ['market_and_exchange_names']);
  if (typeof name !== 'string' || name.trim() === '') {
    return { ok: false, reason: 'missing market_and_exchange_names' };
  }
  const oi = toCount(pick(rec, ['open_interest_all']));
  if (oi === null) return { ok: false, reason: `${reportDate}: missing or invalid open_interest_all` };

  const positions: Partial<Record<CotCategory, CotCategoryPositions>> = {};
  const specs = reportType === 'DISAGGREGATED' ? DISAGG_SPECS : LEGACY_SPECS;
  for (const spec of specs) {
    const long = toCount(pick(rec, spec.long));
    const short = toCount(pick(rec, spec.short));
    const spread = spec.spread ? toCount(pick(rec, spec.spread)) : null;
    if (long === null || short === null || (spec.spread && spread === null)) {
      return { ok: false, reason: `${reportDate}: missing or invalid ${spec.category} positions` };
    }
    positions[spec.category] = { long, short, spread };
  }

  const totLong = toCount(pick(rec, TOTAL_REPT_LONG));
  const totShort = toCount(pick(rec, TOTAL_REPT_SHORT));
  const totalReportable = totLong !== null && totShort !== null ? { long: totLong, short: totShort } : null;

  // Consistency: every long-side (incl. spreading) contract + non-reportable long = open interest.
  const warnings: string[] = [];
  const sum = (side: 'long' | 'short') =>
    Object.values(positions).reduce((s, p) => s + p![side] + (p!.spread ?? 0), 0);
  for (const side of ['long', 'short'] as const) {
    const total = sum(side);
    if (total !== oi) {
      warnings.push(`${reportDate}: ${side} side categories sum to ${total}, open interest is ${oi}`);
    }
  }

  return {
    ok: true,
    record: {
      reportType,
      cftcContractMarketCode: code.trim(),
      reportDate,
      marketAndExchangeNames: name.trim(),
      openInterest: oi,
      positions,
      totalReportable,
      warnings,
    },
  };
}

/**
 * Minimal CSV reader for CFTC's comma-delimited text files (header row + quoted strings).
 * Used for fixtures / file imports; the live sync uses the Socrata JSON API.
 */
export function parseCftcCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.some((f) => f !== '')) rows.push(row);
  }
  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((h, idx) => {
      obj[h] = r[idx] ?? '';
    });
    return obj;
  });
}
