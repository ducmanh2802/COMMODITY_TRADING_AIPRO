/** Per-session OHLCV summary (pure). Sessions come from intraday bars when available, else from D1. */
import { isSessionInProgress, sessionOf } from './sessionOf.ts';

export interface SessionBar {
  timestampMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

export type SessionSourceTimeframe = 'M15' | 'H1' | 'D1';
export type SessionStatus = 'COMPLETE' | 'IN_PROGRESS';

export interface SessionSummaryRow {
  sessionDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
  /** close - previous listed session's close; null for the first session known. */
  change: number | null;
  changePct: number | null;
  range: number;
  /** range / close * 100. */
  rangePct: number;
  /** Mean true range of up to 14 sessions BEFORE this one (needs >= 5); null otherwise. */
  atr14: number | null;
  /** range / atr14 (1 = a typical-sized session). */
  rangeVsAtr: number | null;
  volume: number | null;
  /** Intraday bars used; null when the row comes from a daily bar. */
  bars: number | null;
  timeframe: SessionSourceTimeframe;
  fromDaily: boolean;
  source: string;
  status: SessionStatus;
  /** Weekdays with no session between the previous listed session and this one (holidays or missing data). */
  gapWeekdaysBefore: number;
}

export interface SessionSeries {
  timeframe: SessionSourceTimeframe;
  source: string;
  bars: SessionBar[];
}

function aggregate(bars: SessionBar[]): Omit<SessionBar, 'timestampMs'> {
  const sorted = [...bars].sort((a, b) => a.timestampMs - b.timestampMs);
  let hasVol = false;
  let vol = 0;
  for (const b of sorted) {
    if (b.volume !== null) {
      hasVol = true;
      vol += b.volume;
    }
  }
  return {
    open: sorted[0].open,
    high: Math.max(...sorted.map((b) => b.high)),
    low: Math.min(...sorted.map((b) => b.low)),
    close: sorted[sorted.length - 1].close,
    volume: hasVol ? vol : null,
  };
}

function weekdaysBetween(prev: string, next: string): number {
  let n = 0;
  for (let t = Date.parse(prev) + 86_400_000; t < Date.parse(next); t += 86_400_000) {
    const d = new Date(t).getUTCDay();
    if (d !== 0 && d !== 6) n += 1;
  }
  return n;
}

/**
 * intraday: finest first (M15, then H1). The EARLIEST session of an intraday series may be cut by retention or
 * the vendor window, so it is not used from that series (it falls through to a coarser series or D1).
 * daily: D1 bars; their timestamp date IS the session date.
 */
export function summarizeSessions(args: {
  instrument: { exchange: string };
  intraday: SessionSeries[];
  daily: SessionSeries | null;
  count: number;
  nowMs: number;
}): SessionSummaryRow[] {
  const { instrument, nowMs } = args;
  const chosen = new Map<
    string,
    { agg: Omit<SessionBar, 'timestampMs'>; bars: number | null; tf: SessionSourceTimeframe; source: string }
  >();

  for (const series of args.intraday) {
    const bySession = new Map<string, SessionBar[]>();
    for (const b of series.bars) {
      const s = sessionOf(b.timestampMs, instrument);
      if (s === null) continue;
      const list = bySession.get(s) ?? [];
      list.push(b);
      bySession.set(s, list);
    }
    const dates = [...bySession.keys()].sort();
    for (const d of dates.slice(1)) {
      if (chosen.has(d)) continue;
      const bars = bySession.get(d)!;
      chosen.set(d, { agg: aggregate(bars), bars: bars.length, tf: series.timeframe, source: series.source });
    }
  }
  if (args.daily) {
    for (const b of args.daily.bars) {
      const d = new Date(b.timestampMs).toISOString().slice(0, 10);
      if (!chosen.has(d)) chosen.set(d, { agg: b, bars: null, tf: 'D1', source: args.daily.source });
    }
  }

  const dates = [...chosen.keys()].sort();
  const rows: SessionSummaryRow[] = [];
  const trs: number[] = [];
  let prevClose: number | null = null;
  let prevDate: string | null = null;
  for (const d of dates) {
    const c = chosen.get(d)!;
    const a = c.agg;
    const range = a.high - a.low;
    const window = trs.slice(-14);
    const atr14 = window.length >= 5 ? window.reduce((s, x) => s + x, 0) / window.length : null;
    rows.push({
      sessionDate: d,
      open: a.open,
      high: a.high,
      low: a.low,
      close: a.close,
      change: prevClose === null ? null : a.close - prevClose,
      changePct: prevClose === null || prevClose === 0 ? null : ((a.close - prevClose) / prevClose) * 100,
      range,
      rangePct: a.close === 0 ? 0 : (range / a.close) * 100,
      atr14,
      rangeVsAtr: atr14 !== null && atr14 > 0 ? range / atr14 : null,
      volume: a.volume,
      bars: c.bars,
      timeframe: c.tf,
      fromDaily: c.tf === 'D1',
      source: c.source,
      status: isSessionInProgress(d, nowMs, instrument) ? 'IN_PROGRESS' : 'COMPLETE',
      gapWeekdaysBefore: prevDate === null ? 0 : weekdaysBetween(prevDate, d),
    });
    trs.push(prevClose === null ? range : Math.max(range, Math.abs(a.high - prevClose), Math.abs(a.low - prevClose)));
    prevClose = a.close;
    prevDate = d;
  }
  return rows.slice(-Math.max(1, args.count));
}
