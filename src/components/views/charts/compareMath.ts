/** Pure helpers for the performance-comparison chart: window start, calendar alignment, normalization. */

export const COMPARE_WINDOWS = ['1M', '3M', '6M', '1Y', '3Y', '5Y'] as const;
export type CompareWindow = (typeof COMPARE_WINDOWS)[number];

const MONTHS: Record<CompareWindow, number> = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12, '3Y': 36, '5Y': 60 };

export interface ClosePoint {
  /** ISO date YYYY-MM-DD. */
  date: string;
  close: number;
}

export interface NamedSeries {
  id: string;
  points: ClosePoint[];
}

export interface NormalizedSeries {
  id: string;
  /** % change from base, index-aligned to `dates`; null before the series has data. */
  values: (number | null)[];
  finalPct: number | null;
}

export interface NormalizedResult {
  dates: string[];
  startDate: string | null;
  series: NormalizedSeries[];
}

/** ISO date `months` before `isoDate` (day clamped to month end). */
export function windowStartDate(isoDate: string, window: CompareWindow): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const total = y * 12 + (m - 1) - MONTHS[window];
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  const dim = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  const dd = Math.min(d, dim);
  return `${String(ny).padStart(4, '0')}-${String(nm + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

/**
 * Align series on the union of their dates (carrying the last known close across gaps / holidays),
 * cut to the window ending at the latest date any series has, and rebase each to 0% at a shared start date.
 * The shared start is the later of the window start and the latest first-date, so every series has a real
 * base value (never extrapolated backwards). Series with no points or non-positive base are dropped.
 */
export function normalizeSeries(input: NamedSeries[], window: CompareWindow): NormalizedResult {
  const usable = input
    .map((s) => ({
      id: s.id,
      points: [...s.points].filter((p) => Number.isFinite(p.close) && p.close > 0).sort((a, b) => a.date.localeCompare(b.date)),
    }))
    .filter((s) => s.points.length > 0);
  if (usable.length === 0) return { dates: [], startDate: null, series: [] };

  const lastDate = usable.reduce((mx, s) => (s.points[s.points.length - 1].date > mx ? s.points[s.points.length - 1].date : mx), '');
  const wStart = windowStartDate(lastDate, window);
  const latestFirst = usable.reduce((mx, s) => (s.points[0].date > mx ? s.points[0].date : mx), '');
  const start = wStart > latestFirst ? wStart : latestFirst;

  const dateSet = new Set<string>();
  for (const s of usable) for (const p of s.points) if (p.date >= start && p.date <= lastDate) dateSet.add(p.date);
  dateSet.add(start <= lastDate ? start : lastDate);
  const dates = [...dateSet].sort();

  const out: NormalizedSeries[] = [];
  for (const s of usable) {
    let i = 0;
    let last: number | null = null;
    // advance to the last close at or before the first output date
    const values: (number | null)[] = [];
    let base: number | null = null;
    for (const dt of dates) {
      while (i < s.points.length && s.points[i].date <= dt) {
        last = s.points[i].close;
        i++;
      }
      if (last === null) {
        values.push(null);
        continue;
      }
      if (base === null) base = last;
      values.push((last / base - 1) * 100);
    }
    const final = values.length ? values[values.length - 1] : null;
    out.push({ id: s.id, values, finalPct: final });
  }
  return { dates, startDate: dates[0] ?? null, series: out };
}

export const MAX_COMPARE = 6;
export const MIN_COMPARE = 2;

export type ChartLayout = '1x1' | '1x2' | '2x2';
export const CHART_LAYOUTS: ChartLayout[] = ['1x1', '1x2', '2x2'];
export const layoutCount = (l: ChartLayout): number => (l === '1x1' ? 1 : l === '1x2' ? 2 : 4);
export function parseLayout(v: unknown): ChartLayout {
  return v === '1x2' || v === '2x2' ? v : '1x1';
}

/** Keep only preset ids that exist in `available`; keep order, cap at MAX_COMPARE. */
export function presetIds(wanted: string[], available: string[]): string[] {
  const set = new Set(available);
  return wanted.filter((id) => set.has(id)).slice(0, MAX_COMPARE);
}
