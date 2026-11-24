/**
 * Event risk for the paper-trading order ticket: high-impact scheduled reports due in the next 24h for one
 * instrument. Pure (no React/network) so it is unit-testable and usable on server or client. EDUCATION ONLY.
 *
 * Schedules come only from rules/data already in the repo or the agencies' fixed official rules:
 *   EIA Weekly Petroleum Status Report   Wednesday 10:30 ET (eia.gov/petroleum/supply/weekly/schedule.php).
 *                                        A federal holiday Mon-Wed delays it one day -> marked 'estimated'.
 *   EIA Weekly Natural Gas Storage       Thursday 10:30 ET. Any federal holiday Mon-Thu in the week -> 'estimated'
 *                                        (Thursday holiday: moved to Wednesday 12:00 ET, still 'estimated').
 *   USDA Weekly Export Sales             Thursday 08:30 ET (already listed in vietnamCalendar.ts). Holiday week -> 'estimated'.
 *   USDA WASDE                           Dates ONLY from the official USDA ESMIS list (server drivers endpoint), at
 *                                        USDA's documented 12:00 ET -> 'official'. When the official list is unknown
 *                                        (null) the repo has no date list, so a weekday on the 8th-12th of the month is
 *                                        shown as 'estimated' (never presented as a confirmed date).
 * Federal holidays: the repo's projected US exchange holidays (minus Good Friday, not a federal holiday) plus
 * Columbus Day (2nd Mon Oct) and Veterans Day (Nov 11, observed) from the fixed federal rules.
 *   FOMC statement / US CPI              Explicit official date lists in usMacroCalendar.ts (federalreserve.gov,
 *                                        bls.gov) at 14:00 / 08:30 ET -> 'official'. They move USD, rates and risk, so
 *                                        they apply to EVERY instrument (scope 'macro'), listed after the
 *                                        instrument-specific reports. Dates beyond the published lists are absent.
 * Not included: USDA Crop Progress — no machine-readable schedule is wired into the repo.
 */
import { addCalendarDays, makeDate, weekday, type IsoDate } from '../contracts/dates.ts';
import { projectUsExchangeHolidays } from '../contracts/holidays/usExchange.ts';
import {
  FOMC_HOUR_ET,
  FOMC_MINUTE_ET,
  FOMC_SOURCE,
  FOMC_STATEMENT_DATES,
  US_CPI_HOUR_ET,
  US_CPI_MINUTE_ET,
  US_CPI_RELEASE_DATES,
  US_CPI_SOURCE,
} from './usMacroCalendar.ts';

export type EventRiskKind = 'EIA_PETROLEUM' | 'EIA_NATGAS' | 'USDA_EXPORT_SALES' | 'WASDE' | 'FOMC' | 'US_CPI';
/** instrument = report specific to this market; macro = US-wide release that affects every instrument. */
export type EventRiskScope = 'instrument' | 'macro';
/** official = date from the agency's published list; rule = fixed weekly rule; estimated = may differ. */
export type EventRiskStatus = 'official' | 'rule' | 'estimated';

export interface EventRiskItem {
  kind: EventRiskKind;
  /** UTC instant (ISO). */
  atIso: string;
  atMs: number;
  /** New York calendar date of the release. */
  etDate: IsoDate;
  hoursUntil: number;
  status: EventRiskStatus;
  scope: EventRiskScope;
  source: string;
}

export const EVENT_RISK_SOURCES: Record<EventRiskKind, string> = {
  EIA_PETROLEUM: 'https://www.eia.gov/petroleum/supply/weekly/schedule.php',
  EIA_NATGAS: 'https://ir.eia.gov/ngs/schedule.html',
  USDA_EXPORT_SALES: 'https://apps.fas.usda.gov/export-sales/esrd1.html',
  WASDE: 'https://www.usda.gov/oce/commodity/wasde',
  FOMC: FOMC_SOURCE,
  US_CPI: US_CPI_SOURCE,
};

const MACRO_KINDS: ReadonlySet<EventRiskKind> = new Set(['FOMC', 'US_CPI']);

const WASDE_SYMBOLS = new Set(['ZS', 'ZM', 'ZL', 'ZC', 'ZW', 'ZR', 'KE', 'CT', 'SB']);
const EXPORT_SALES_SYMBOLS = new Set(['ZS', 'ZM', 'ZL', 'ZC', 'ZW', 'KE', 'CT']);
const PETROLEUM_SYMBOLS = new Set(['CL', 'BRN', 'BZ', 'HO', 'RB']);
const NATGAS_SYMBOLS = new Set(['NG']);

/** Report kinds that move this instrument (by exchange symbol, case-insensitive). */
export function relevantKinds(symbol: string): EventRiskKind[] {
  const s = symbol.trim().toUpperCase();
  const out: EventRiskKind[] = [];
  if (PETROLEUM_SYMBOLS.has(s)) out.push('EIA_PETROLEUM');
  if (NATGAS_SYMBOLS.has(s)) out.push('EIA_NATGAS');
  if (WASDE_SYMBOLS.has(s)) out.push('WASDE');
  if (EXPORT_SALES_SYMBOLS.has(s)) out.push('USDA_EXPORT_SALES');
  return out;
}

const NY = 'America/New_York';
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function partsIn(ms: number, timeZone: string): { y: number; m: number; d: number; h: number; mi: number } {
  let f = fmtCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
    fmtCache.set(timeZone, f);
  }
  const p: Record<string, number> = {};
  for (const x of f.formatToParts(new Date(ms))) if (x.type !== 'literal') p[x.type] = Number(x.value);
  return { y: p.year, m: p.month, d: p.day, h: p.hour % 24, mi: p.minute };
}

/** UTC ms of a New York wall-clock time (DST-aware via Intl). */
export function nyWallToUtcMs(date: IsoDate, hour: number, minute: number): number {
  const [y, m, d] = date.split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d, hour, minute);
  let guess = wall;
  for (let i = 0; i < 2; i++) {
    const p = partsIn(guess, NY);
    const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
    guess += wall - asUtc;
  }
  return guess;
}

function nyDate(ms: number): IsoDate {
  const p = partsIn(ms, NY);
  return makeDate(p.y, p.m, p.d);
}

/** US federal holidays (weekday dates) for a year: exchange projection minus Good Friday plus Columbus & Veterans Day. */
export function usFederalHolidays(year: number): Set<IsoDate> {
  const out = new Set<IsoDate>();
  for (const h of projectUsExchangeHolidays(year, '')) if (h.name !== 'Good Friday') out.add(h.date);
  const oct1 = makeDate(year, 10, 1);
  out.add(addCalendarDays(oct1, ((1 - weekday(oct1) + 7) % 7) + 7)); // 2nd Monday of October
  const vet = makeDate(year, 11, 11);
  const wd = weekday(vet);
  out.add(wd === 6 ? addCalendarDays(vet, -1) : wd === 0 ? addCalendarDays(vet, 1) : vet);
  return out;
}

function isHoliday(date: IsoDate): boolean {
  return usFederalHolidays(Number(date.slice(0, 4))).has(date);
}

/** Holidays on Monday..(Monday+lastOffset) of the week containing `date`. */
function holidayInWeek(date: IsoDate, lastOffset: number): IsoDate | null {
  const monday = addCalendarDays(date, -((weekday(date) + 6) % 7));
  for (let i = 0; i <= lastOffset; i++) {
    const d = addCalendarDays(monday, i);
    if (isHoliday(d)) return d;
  }
  return null;
}

interface Candidate {
  kind: EventRiskKind;
  etDate: IsoDate;
  hour: number;
  minute: number;
  status: EventRiskStatus;
}

/** Candidates whose nominal week day falls on `day` (an ET date). */
function weeklyCandidates(day: IsoDate, kinds: ReadonlySet<EventRiskKind>): Candidate[] {
  const out: Candidate[] = [];
  const wd = weekday(day);
  if (kinds.has('EIA_PETROLEUM') && wd === 3) {
    const hol = holidayInWeek(day, 2);
    out.push(hol ? { kind: 'EIA_PETROLEUM', etDate: addCalendarDays(day, 1), hour: 11, minute: 0, status: 'estimated' } : { kind: 'EIA_PETROLEUM', etDate: day, hour: 10, minute: 30, status: 'rule' });
  }
  if (kinds.has('EIA_NATGAS') && wd === 4) {
    const hol = holidayInWeek(day, 3);
    if (!hol) out.push({ kind: 'EIA_NATGAS', etDate: day, hour: 10, minute: 30, status: 'rule' });
    else if (hol === day) out.push({ kind: 'EIA_NATGAS', etDate: addCalendarDays(day, -1), hour: 12, minute: 0, status: 'estimated' });
    else out.push({ kind: 'EIA_NATGAS', etDate: day, hour: 10, minute: 30, status: 'estimated' });
  }
  if (kinds.has('USDA_EXPORT_SALES') && wd === 4) {
    const hol = holidayInWeek(day, 3);
    out.push(hol ? { kind: 'USDA_EXPORT_SALES', etDate: addCalendarDays(day, 1), hour: 8, minute: 30, status: 'estimated' } : { kind: 'USDA_EXPORT_SALES', etDate: day, hour: 8, minute: 30, status: 'rule' });
  }
  return out;
}

export interface EventRiskInput {
  symbol: string;
  nowMs: number;
  /**
   * Official WASDE release dates (YYYY-MM-DD) from USDA ESMIS. null/undefined = unknown (falls back to an
   * 'estimated' 8th-12th weekday window); [] = official list known and has no date in range.
   */
  wasdeOfficialDates?: readonly string[] | null;
  /** Look-ahead window in hours (default 24). */
  horizonHours?: number;
}

/**
 * Upcoming high-impact reports for `symbol` within (now, now + horizon]: instrument-specific reports first, then
 * the US macro releases (FOMC/CPI, any non-empty symbol); each group sorted by time.
 */
export function upcomingEventRisk(input: EventRiskInput): EventRiskItem[] {
  const { nowMs } = input;
  if (!Number.isFinite(nowMs)) return [];
  const horizonMs = (input.horizonHours ?? 24) * 3_600_000;
  if (!input.symbol.trim()) return [];
  const kinds = new Set(relevantKinds(input.symbol));

  const start = nyDate(nowMs);
  const cands: Candidate[] = [];
  for (const d of FOMC_STATEMENT_DATES) cands.push({ kind: 'FOMC', etDate: d, hour: FOMC_HOUR_ET, minute: FOMC_MINUTE_ET, status: 'official' });
  for (const d of US_CPI_RELEASE_DATES) cands.push({ kind: 'US_CPI', etDate: d, hour: US_CPI_HOUR_ET, minute: US_CPI_MINUTE_ET, status: 'official' });
  // Scan a few ET days around the window so holiday shifts (+/-1 day) are caught.
  for (let i = -2; i <= 3; i++) cands.push(...weeklyCandidates(addCalendarDays(start, i), kinds));

  if (kinds.has('WASDE')) {
    const official = input.wasdeOfficialDates;
    if (Array.isArray(official)) {
      for (const d of official) {
        const day = typeof d === 'string' ? d.slice(0, 10) : '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(day)) cands.push({ kind: 'WASDE', etDate: day, hour: 12, minute: 0, status: 'official' });
      }
    } else {
      for (let i = 0; i <= 2; i++) {
        const day = addCalendarDays(start, i);
        const dom = Number(day.slice(8, 10));
        const wd = weekday(day);
        if (dom >= 8 && dom <= 12 && wd >= 1 && wd <= 5 && !isHoliday(day)) {
          cands.push({ kind: 'WASDE', etDate: day, hour: 12, minute: 0, status: 'estimated' });
        }
      }
    }
  }

  const seen = new Set<string>();
  const out: EventRiskItem[] = [];
  for (const c of cands) {
    const atMs = nyWallToUtcMs(c.etDate, c.hour, c.minute);
    if (atMs <= nowMs || atMs > nowMs + horizonMs) continue;
    // One estimated WASDE entry is enough (the window is a guess, not a date list).
    const key = c.kind === 'WASDE' && c.status === 'estimated' ? 'WASDE|estimated' : `${c.kind}|${atMs}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      kind: c.kind,
      atIso: new Date(atMs).toISOString(),
      atMs,
      etDate: c.etDate,
      hoursUntil: Math.round(((atMs - nowMs) / 3_600_000) * 10) / 10,
      status: c.status,
      scope: MACRO_KINDS.has(c.kind) ? 'macro' : 'instrument',
      source: EVENT_RISK_SOURCES[c.kind],
    });
  }
  const rank = (x: EventRiskItem) => (x.scope === 'instrument' ? 0 : 1);
  return out.sort((a, b) => rank(a) - rank(b) || a.atMs - b.atMs);
}

/** "HH:mm dd/MM" in Asia/Ho_Chi_Minh. */
export function vietnamTimeLabel(ms: number): string {
  const p = partsIn(ms, 'Asia/Ho_Chi_Minh');
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(p.h)}:${two(p.mi)} ${two(p.d)}/${two(p.m)}`;
}
