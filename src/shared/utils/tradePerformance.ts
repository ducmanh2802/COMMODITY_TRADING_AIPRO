/**
 * Pure trade performance, win/loss ratio, cumulative equity, and drawdown calculations
 * for journal analytics in the Analysis Hub.
 * Works identically over closed TradeJournal entries (USD) and closed PaperTrade entries (VND)
 * without mixing currencies.
 */

export type TradeOutcome = 'win' | 'loss' | 'breakeven';

export interface NormalizedJournalTrade {
  id: string;
  symbol: string;
  direction?: 'LONG' | 'SHORT';
  strategy?: string;
  timestampMs: number;
  pnl: number;
  rMultiple?: number | null;
}

export interface TradePerformancePoint {
  index: number;
  id: string;
  symbol: string;
  direction?: 'LONG' | 'SHORT';
  strategy?: string;
  timestampMs: number;
  /** Short date label for chart X-axis (MM/DD). */
  shortDate: string;
  pnl: number;
  cumulativePnl: number;
  /** High-water mark of cumulative P&L (starts at 0). */
  peakPnl: number;
  /** Signed drawdown from peak (<= 0, suitable for underwater chart). */
  drawdown: number;
  /** Drawdown magnitude (>= 0). */
  drawdownAbs: number;
  /** Drawdown percentage relative to peak equity (or peak cumulative P&L if > 0). */
  drawdownPct: number | null;
  rMultiple: number | null;
  outcome: TradeOutcome;
}

export interface InstrumentPerformance {
  symbol: string;
  trades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRatePct: number;
  netPnl: number;
  avgR: number | null;
}

export interface OutcomeSlice {
  outcome: TradeOutcome;
  count: number;
  totalPnl: number;
  pct: number;
}

export interface TradePerformanceSummary {
  totalTrades: number;
  winCount: number;
  lossCount: number;
  breakevenCount: number;
  winRatePct: number | null;
  lossRatePct: number | null;
  /** Win-to-loss count ratio (wins / losses). Null when losses === 0. */
  winLossRatio: number | null;
  /** Average winning trade divided by absolute average losing trade. Null when either side is empty. */
  payoffRatio: number | null;
  /** Gross profit divided by gross loss magnitude. Null when grossLoss === 0. */
  profitFactor: number | null;
  netPnl: number;
  grossProfit: number;
  /** Positive magnitude of total losses. */
  grossLoss: number;
  avgWin: number | null;
  /** Negative average loss (or null if no losses). */
  avgLoss: number | null;
  expectancy: number | null;
  avgR: number | null;
  rCount: number;
  /** Maximum drawdown magnitude (>= 0). */
  maxDrawdown: number;
  maxDrawdownPct: number | null;
  /** Current drawdown magnitude at the latest trade (>= 0). */
  currentDrawdown: number;
  isAtPeak: boolean;
  maxWinStreak: number;
  maxLossStreak: number;
  points: TradePerformancePoint[];
  outcomes: OutcomeSlice[];
  byInstrument: InstrumentPerformance[];
}

const roundTo = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

function formatShortDate(timestampMs: number): string {
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) return '—';
  const d = new Date(timestampMs);
  if (Number.isNaN(d.getTime())) return '—';
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${day}/${month}`;
}

export function parseJournalTimestampMs(exitTimestamp: string, entryTimestamp: string): number {
  const raw = (exitTimestamp || entryTimestamp || '').trim();
  if (!raw) return 0;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function computeTradePerformance(
  rawTrades: NormalizedJournalTrade[],
  options: { startingCapital?: number | null } = {}
): TradePerformanceSummary {
  const startingCapital =
    typeof options.startingCapital === 'number' &&
    Number.isFinite(options.startingCapital) &&
    options.startingCapital > 0
      ? options.startingCapital
      : null;

  const valid = rawTrades.filter(
    (t) => typeof t.pnl === 'number' && Number.isFinite(t.pnl)
  );

  // Stable chronological sort by exit/close timestamp
  const sorted = [...valid]
    .map((trade, idx) => ({ trade, idx }))
    .sort((a, b) => {
      const diff = a.trade.timestampMs - b.trade.timestampMs;
      return diff !== 0 ? diff : a.idx - b.idx;
    })
    .map((item) => item.trade);

  if (sorted.length === 0) {
    return {
      totalTrades: 0,
      winCount: 0,
      lossCount: 0,
      breakevenCount: 0,
      winRatePct: null,
      lossRatePct: null,
      winLossRatio: null,
      payoffRatio: null,
      profitFactor: null,
      netPnl: 0,
      grossProfit: 0,
      grossLoss: 0,
      avgWin: null,
      avgLoss: null,
      expectancy: null,
      avgR: null,
      rCount: 0,
      maxDrawdown: 0,
      maxDrawdownPct: null,
      currentDrawdown: 0,
      isAtPeak: true,
      maxWinStreak: 0,
      maxLossStreak: 0,
      points: [],
      outcomes: [
        { outcome: 'win', count: 0, totalPnl: 0, pct: 0 },
        { outcome: 'loss', count: 0, totalPnl: 0, pct: 0 },
        { outcome: 'breakeven', count: 0, totalPnl: 0, pct: 0 },
      ],
      byInstrument: [],
    };
  }

  let winCount = 0;
  let lossCount = 0;
  let breakevenCount = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let cumulativePnl = 0;
  let peakPnl = 0;
  let maxDrawdown = 0;
  let maxDrawdownPct: number | null = null;
  let curWinStreak = 0;
  let curLossStreak = 0;
  let maxWinStreak = 0;
  let maxLossStreak = 0;
  let rSum = 0;
  let rCount = 0;

  const bySymbol = new Map<
    string,
    { trades: number; wins: number; losses: number; breakeven: number; netPnl: number; rSum: number; rCount: number }
  >();

  const points: TradePerformancePoint[] = sorted.map((t, i) => {
    const pnl = t.pnl;
    const outcome: TradeOutcome = pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'breakeven';

    if (outcome === 'win') {
      winCount++;
      grossProfit += pnl;
      curWinStreak++;
      curLossStreak = 0;
      if (curWinStreak > maxWinStreak) maxWinStreak = curWinStreak;
    } else if (outcome === 'loss') {
      lossCount++;
      grossLoss += Math.abs(pnl);
      curLossStreak++;
      curWinStreak = 0;
      if (curLossStreak > maxLossStreak) maxLossStreak = curLossStreak;
    } else {
      breakevenCount++;
      curWinStreak = 0;
      curLossStreak = 0;
    }

    const rVal =
      typeof t.rMultiple === 'number' && Number.isFinite(t.rMultiple) ? t.rMultiple : null;
    if (rVal !== null) {
      rSum += rVal;
      rCount++;
    }

    cumulativePnl += pnl;
    if (cumulativePnl > peakPnl) {
      peakPnl = cumulativePnl;
    }
    const drawdownAbs = Math.max(0, peakPnl - cumulativePnl);
    const drawdown = drawdownAbs === 0 ? 0 : -drawdownAbs;

    const denominator = startingCapital !== null ? startingCapital + peakPnl : peakPnl > 0 ? peakPnl : null;
    const drawdownPct =
      denominator !== null && denominator > 0
        ? roundTo((drawdownAbs / denominator) * 100, 2)
        : null;

    if (drawdownAbs > maxDrawdown) {
      maxDrawdown = drawdownAbs;
    }
    if (drawdownPct !== null && (maxDrawdownPct === null || drawdownPct > maxDrawdownPct)) {
      maxDrawdownPct = drawdownPct;
    }

    const sym = (t.symbol || '—').trim() || '—';
    const prev = bySymbol.get(sym) ?? {
      trades: 0,
      wins: 0,
      losses: 0,
      breakeven: 0,
      netPnl: 0,
      rSum: 0,
      rCount: 0,
    };
    bySymbol.set(sym, {
      trades: prev.trades + 1,
      wins: prev.wins + (outcome === 'win' ? 1 : 0),
      losses: prev.losses + (outcome === 'loss' ? 1 : 0),
      breakeven: prev.breakeven + (outcome === 'breakeven' ? 1 : 0),
      netPnl: prev.netPnl + pnl,
      rSum: prev.rSum + (rVal ?? 0),
      rCount: prev.rCount + (rVal !== null ? 1 : 0),
    });

    return {
      index: i + 1,
      id: t.id,
      symbol: sym,
      direction: t.direction,
      strategy: t.strategy,
      timestampMs: t.timestampMs,
      shortDate: formatShortDate(t.timestampMs),
      pnl: roundTo(pnl, 2),
      cumulativePnl: roundTo(cumulativePnl, 2),
      peakPnl: roundTo(peakPnl, 2),
      drawdown: roundTo(drawdown, 2),
      drawdownAbs: roundTo(drawdownAbs, 2),
      drawdownPct,
      rMultiple: rVal !== null ? roundTo(rVal, 2) : null,
      outcome,
    };
  });

  const totalTrades = sorted.length;
  const netPnl = roundTo(grossProfit - grossLoss, 2);
  const avgWin = winCount > 0 ? roundTo(grossProfit / winCount, 2) : null;
  const avgLoss = lossCount > 0 ? roundTo(-(grossLoss / lossCount), 2) : null;
  const winLossRatio = lossCount > 0 ? roundTo(winCount / lossCount, 2) : null;
  const payoffRatio =
    avgWin !== null && avgLoss !== null && avgLoss !== 0
      ? roundTo(avgWin / Math.abs(avgLoss), 2)
      : null;
  const profitFactor = grossLoss > 0 ? roundTo(grossProfit / grossLoss, 2) : null;
  const currentDrawdown = points[points.length - 1]?.drawdownAbs ?? 0;

  const byInstrument: InstrumentPerformance[] = Array.from(bySymbol.entries())
    .map(([symbol, row]) => ({
      symbol,
      trades: row.trades,
      wins: row.wins,
      losses: row.losses,
      breakeven: row.breakeven,
      winRatePct: row.trades > 0 ? roundTo((row.wins / row.trades) * 100, 1) : 0,
      netPnl: roundTo(row.netPnl, 2),
      avgR: row.rCount > 0 ? roundTo(row.rSum / row.rCount, 2) : null,
    }))
    .sort((a, b) => Math.abs(b.netPnl) - Math.abs(a.netPnl));

  const outcomes: OutcomeSlice[] = [
    {
      outcome: 'win',
      count: winCount,
      totalPnl: roundTo(grossProfit, 2),
      pct: roundTo((winCount / totalTrades) * 100, 1),
    },
    {
      outcome: 'loss',
      count: lossCount,
      totalPnl: roundTo(-grossLoss, 2),
      pct: roundTo((lossCount / totalTrades) * 100, 1),
    },
    {
      outcome: 'breakeven',
      count: breakevenCount,
      totalPnl: 0,
      pct: roundTo((breakevenCount / totalTrades) * 100, 1),
    },
  ];

  return {
    totalTrades,
    winCount,
    lossCount,
    breakevenCount,
    winRatePct: roundTo((winCount / totalTrades) * 100, 1),
    lossRatePct: roundTo((lossCount / totalTrades) * 100, 1),
    winLossRatio,
    payoffRatio,
    profitFactor,
    netPnl,
    grossProfit: roundTo(grossProfit, 2),
    grossLoss: roundTo(grossLoss, 2),
    avgWin,
    avgLoss,
    expectancy: roundTo(netPnl / totalTrades, 2),
    avgR: rCount > 0 ? roundTo(rSum / rCount, 2) : null,
    rCount,
    maxDrawdown: roundTo(maxDrawdown, 2),
    maxDrawdownPct,
    currentDrawdown: roundTo(currentDrawdown, 2),
    isAtPeak: currentDrawdown === 0,
    maxWinStreak,
    maxLossStreak,
    points,
    outcomes,
    byInstrument,
  };
}
