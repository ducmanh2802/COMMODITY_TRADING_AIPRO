import type { MarketCandle } from '../types/market';

/** Statistical/indicator minimum bar floor enforced across UI session tables. */
export const MIN_ANALYSIS_SESSIONS = 20;
/** Default number of recent sessions rendered (> 20 so users always inspect > 20 sessions immediately). */
export const DEFAULT_SESSION_DISPLAY_LIMIT = 30;
/** Allowed quick-select session counts in the session history table. */
export const SESSION_DISPLAY_PRESETS = [30, 60, 120] as const;

export interface CandleSessionRow {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  changeAbs: number | null;
  changePct: number | null;
  rangeAbs: number;
  rangePct: number | null;
  source: string;
}

export interface BenchmarkSessionRow {
  date: string;
  value: number;
  changeAbs: number | null;
  changePct: number | null;
}

/**
 * Normalizes and sorts OHLCV candles ascending to compute exact bar-over-bar change,
 * then returns sessions newest-first for UI inspection without mutating inputs.
 */
export function buildCandleSessionRows(candles: MarketCandle[]): CandleSessionRow[] {
  const complete = candles.filter((c) => c.isComplete !== false && Number.isFinite(c.close) && c.close > 0);
  if (complete.length === 0) return [];

  const sortedAsc = [...complete].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const withChanges: CandleSessionRow[] = sortedAsc.map((c, idx) => {
    const prev = idx > 0 ? sortedAsc[idx - 1] : null;
    const changeAbs = prev ? c.close - prev.close : null;
    const changePct = prev && prev.close !== 0 ? ((c.close - prev.close) / prev.close) * 100 : null;
    const rangeAbs = Math.max(0, c.high - c.low);
    const rangePct = c.low > 0 ? (rangeAbs / c.low) * 100 : null;
    return {
      timestamp: c.timestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
      changeAbs,
      changePct,
      rangeAbs,
      rangePct,
      source: c.source,
    };
  });

  return withChanges.reverse();
}

/**
 * Sorts benchmark points ascending to compute period-over-period change, then returns newest-first.
 */
export function buildBenchmarkSessionRows(
  points: ReadonlyArray<{ date: string; value: number }>
): BenchmarkSessionRow[] {
  const valid = points.filter((p) => p.date && Number.isFinite(p.value) && p.value > 0);
  if (valid.length === 0) return [];

  const sortedAsc = [...valid].sort((a, b) => a.date.localeCompare(b.date));
  const withChanges: BenchmarkSessionRow[] = sortedAsc.map((p, idx) => {
    const prev = idx > 0 ? sortedAsc[idx - 1] : null;
    const changeAbs = prev ? p.value - prev.value : null;
    const changePct = prev && prev.value !== 0 ? ((p.value - prev.value) / prev.value) * 100 : null;
    return {
      date: p.date,
      value: p.value,
      changeAbs,
      changePct,
    };
  });

  return withChanges.reverse();
}

/** Slices rows according to selected preset (`30`, `60`, `120`, or `'ALL'`). */
export function sliceSessionRows<T>(rows: readonly T[], limit: number | 'ALL'): T[] {
  if (limit === 'ALL') return [...rows];
  if (!Number.isFinite(limit) || limit <= 0) return [];
  return rows.slice(0, limit);
}

export function hasSufficientSessionsForAnalysis(totalCount: number): boolean {
  return totalCount > MIN_ANALYSIS_SESSIONS;
}
