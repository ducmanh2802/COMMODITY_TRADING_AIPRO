/**
 * T93 Paper trading — performance statistics over closed trades (pure, no React). Simulation only:
 * numbers describe the practice trades, they are not a forecast and not advice.
 */
export const MIN_TRADES_TO_CONCLUDE = 30;

export interface StatTrade {
  instrumentId: string;
  pnlVnd: number;
  feesVnd?: number;
  rMultiple: number | null;
  closedAtMs: number;
  /** plan.onPlan when the trade carried a pre-trade checklist; undefined for older trades. */
  onPlan?: boolean;
}

export interface CurvePoint {
  /** 0 = starting capital, i = after the i-th closed trade. */
  i: number;
  t: number | null;
  equityVnd: number;
}

export interface Drawdown {
  vnd: number;
  pct: number;
  /** Curve indices of the peak and the trough of the worst drawdown (equal when no drawdown). */
  peakIndex: number;
  troughIndex: number;
}

export interface GroupStats {
  key: string;
  trades: number;
  winRatePct: number;
  pnlVnd: number;
  avgR: number | null;
  rCount: number;
}

export interface PerformanceStats {
  trades: number;
  totalPnlVnd: number;
  wins: number;
  losses: number;
  winRatePct: number;
  avgWinVnd: number | null;
  avgLossVnd: number | null;
  /** Mean R per trade over trades that have an R (null when none). */
  expectancyR: number | null;
  rCount: number;
  /** Gross profit / gross loss; null when there are no losses. */
  profitFactor: number | null;
  maxDrawdown: Drawdown;
  longestLossStreak: number;
  curve: CurvePoint[];
  byInstrument: GroupStats[];
  onPlan: GroupStats | null;
  offPlan: GroupStats | null;
  /** True when there are fewer than MIN_TRADES_TO_CONCLUDE trades. */
  tooFew: boolean;
}

const round = (v: number, d: number) => {
  const f = 10 ** d;
  return Math.round(v * f) / f;
};

export function groupStats(key: string, rows: StatTrade[]): GroupStats {
  const rs = rows.map((r) => r.rMultiple).filter((r): r is number => r !== null && Number.isFinite(r));
  const wins = rows.filter((r) => r.pnlVnd > 0).length;
  return {
    key,
    trades: rows.length,
    winRatePct: rows.length ? round((wins / rows.length) * 100, 1) : 0,
    pnlVnd: Math.round(rows.reduce((s, r) => s + r.pnlVnd, 0)),
    avgR: rs.length ? round(rs.reduce((s, r) => s + r, 0) / rs.length, 2) : null,
    rCount: rs.length,
  };
}

/** Trades sorted by close time (stable); the curve starts at the starting capital. */
export function equityCurve(trades: StatTrade[], startingCapitalVnd: number): CurvePoint[] {
  const sorted = [...trades].sort((a, b) => a.closedAtMs - b.closedAtMs);
  const out: CurvePoint[] = [{ i: 0, t: null, equityVnd: startingCapitalVnd }];
  let eq = startingCapitalVnd;
  sorted.forEach((x, k) => {
    eq += x.pnlVnd;
    out.push({ i: k + 1, t: x.closedAtMs, equityVnd: Math.round(eq) });
  });
  return out;
}

export function maxDrawdown(curve: CurvePoint[]): Drawdown {
  let peak = curve[0]?.equityVnd ?? 0;
  let peakI = 0;
  let best: Drawdown = { vnd: 0, pct: 0, peakIndex: 0, troughIndex: 0 };
  curve.forEach((p, idx) => {
    if (p.equityVnd > peak) {
      peak = p.equityVnd;
      peakI = idx;
    }
    const dd = peak - p.equityVnd;
    if (dd > best.vnd) best = { vnd: dd, pct: peak > 0 ? round((dd / peak) * 100, 2) : 0, peakIndex: peakI, troughIndex: idx };
  });
  return best;
}

export function longestLossStreak(trades: StatTrade[]): number {
  const sorted = [...trades].sort((a, b) => a.closedAtMs - b.closedAtMs);
  let cur = 0;
  let best = 0;
  for (const x of sorted) {
    if (x.pnlVnd < 0) best = Math.max(best, ++cur);
    else cur = 0;
  }
  return best;
}

export function computePerformance(trades: StatTrade[], startingCapitalVnd: number): PerformanceStats {
  const curve = equityCurve(trades, startingCapitalVnd);
  const wins = trades.filter((x) => x.pnlVnd > 0);
  const losses = trades.filter((x) => x.pnlVnd < 0);
  const grossWin = wins.reduce((s, x) => s + x.pnlVnd, 0);
  const grossLoss = -losses.reduce((s, x) => s + x.pnlVnd, 0);
  const all = groupStats('all', trades);
  const ids = [...new Set(trades.map((x) => x.instrumentId))];
  const planned = trades.filter((x) => x.onPlan === true);
  const unplanned = trades.filter((x) => x.onPlan === false);
  return {
    trades: trades.length,
    totalPnlVnd: all.pnlVnd,
    wins: wins.length,
    losses: losses.length,
    winRatePct: all.winRatePct,
    avgWinVnd: wins.length ? Math.round(grossWin / wins.length) : null,
    avgLossVnd: losses.length ? Math.round(-grossLoss / losses.length) : null,
    expectancyR: all.avgR,
    rCount: all.rCount,
    profitFactor: grossLoss > 0 ? round(grossWin / grossLoss, 2) : null,
    maxDrawdown: maxDrawdown(curve),
    longestLossStreak: longestLossStreak(trades),
    curve,
    byInstrument: ids.map((id) => groupStats(id, trades.filter((x) => x.instrumentId === id))).sort((a, b) => b.pnlVnd - a.pnlVnd),
    onPlan: planned.length ? groupStats('onPlan', planned) : null,
    offPlan: unplanned.length ? groupStats('offPlan', unplanned) : null,
    tooFew: trades.length < MIN_TRADES_TO_CONCLUDE,
  };
}

/** Structured takeaway (the UI formats it with i18n). Needs R data on both sides to compare; else null. */
export function planTakeaway(s: PerformanceStats): { on: number; off: number; better: 'on' | 'off' | 'same' } | null {
  if (!s.onPlan || !s.offPlan || s.onPlan.avgR === null || s.offPlan.avgR === null) return null;
  const on = s.onPlan.avgR;
  const off = s.offPlan.avgR;
  return { on, off, better: on > off ? 'on' : on < off ? 'off' : 'same' };
}
