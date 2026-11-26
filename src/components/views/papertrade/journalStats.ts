/** I5 Paper trading journal — simple stats over closed trades (pure). Practice only, not a forecast. */
export const JOURNAL_MIN_TRADES = 5;

export interface JournalTrade {
  pnlVnd: number;
  closedAtMs: number;
  stopLoss?: number | null;
  rMultiple?: number | null;
}

export interface JournalStats {
  trades: number;
  enough: boolean;
  winRatePct: number | null;
  avgWinVnd: number | null;
  avgLossVnd: number | null;
  avgR: number | null;
  rCount: number;
  maxDrawdownVnd: number;
  longestLossStreak: number;
  /** Cumulative P&L after each trade, oldest first. */
  cumulative: number[];
}

export function computeJournalStats(input: JournalTrade[]): JournalStats {
  const sorted = [...input].sort((a, b) => a.closedAtMs - b.closedAtMs);
  const wins = sorted.filter((x) => x.pnlVnd > 0);
  const losses = sorted.filter((x) => x.pnlVnd < 0);
  const rs = sorted
    .filter((x) => x.stopLoss !== null && x.stopLoss !== undefined && x.rMultiple !== null && x.rMultiple !== undefined && Number.isFinite(x.rMultiple))
    .map((x) => x.rMultiple as number);
  const cumulative: number[] = [];
  let cum = 0;
  let peak = 0;
  let dd = 0;
  let streak = 0;
  let best = 0;
  for (const x of sorted) {
    cum += x.pnlVnd;
    cumulative.push(Math.round(cum));
    peak = Math.max(peak, cum);
    dd = Math.max(dd, peak - cum);
    if (x.pnlVnd < 0) best = Math.max(best, ++streak);
    else streak = 0;
  }
  const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
  const r2 = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);
  const aw = mean(wins.map((x) => x.pnlVnd));
  const al = mean(losses.map((x) => x.pnlVnd));
  return {
    trades: sorted.length,
    enough: sorted.length >= JOURNAL_MIN_TRADES,
    winRatePct: sorted.length ? Math.round((wins.length / sorted.length) * 1000) / 10 : null,
    avgWinVnd: aw === null ? null : Math.round(aw),
    avgLossVnd: al === null ? null : Math.round(al),
    avgR: r2(mean(rs)),
    rCount: rs.length,
    maxDrawdownVnd: Math.round(dd),
    longestLossStreak: best,
    cumulative,
  };
}
