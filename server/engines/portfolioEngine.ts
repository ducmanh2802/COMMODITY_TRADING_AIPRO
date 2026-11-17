import type { InstrumentDefinition, ProductCategory, ExchangeCode } from '../../src/shared/types/instrument.ts';

export interface ManualPositionInput {
  id: string;
  instrumentId: string;
  productName: string;
  category: ProductCategory;
  exchange: ExchangeCode;
  direction: 'LONG' | 'SHORT';
  contracts: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  estimatedMargin: number;
  marginVerified: boolean;
  status: 'OPEN' | 'CLOSED';
}

export interface PortfolioExposureSummary {
  openPositionCount: number;
  totalEstimatedRiskUsd: number;
  totalEstimatedMarginUsd: number;
  verifiedMarginUsd: number;
  unverifiedMarginUsd: number;
  exposureByProduct: Array<{ key: string; contracts: number; riskUsd: number }>;
  exposureByCategory: Array<{ key: string; contracts: number; riskUsd: number }>;
  exposureByExchange: Array<{ key: string; contracts: number; riskUsd: number }>;
  correlationWarnings: string[];
  brokerSyncNotice: string;
}

export function analyzePortfolioExposure(
  positions: ManualPositionInput[],
  instrumentsById: Map<string, InstrumentDefinition>
): PortfolioExposureSummary {
  const open = positions.filter((p) => p.status === 'OPEN');

  const byProduct = new Map<string, { contracts: number; riskUsd: number }>();
  const byCategory = new Map<string, { contracts: number; riskUsd: number }>();
  const byExchange = new Map<string, { contracts: number; riskUsd: number }>();

  let totalEstimatedRiskUsd = 0;
  let totalEstimatedMarginUsd = 0;
  let verifiedMarginUsd = 0;
  let unverifiedMarginUsd = 0;

  for (const pos of open) {
    const inst = instrumentsById.get(pos.instrumentId);
    const tickSize = inst?.specification.minimumTickSize;
    const tickValue = inst?.specification.tickValue;

    let posRisk = 0;
    if (tickSize && tickValue && tickSize > 0 && tickValue > 0) {
      posRisk = (Math.abs(pos.entryPrice - pos.stopLoss) / tickSize) * tickValue * pos.contracts;
    }

    totalEstimatedRiskUsd += posRisk;
    totalEstimatedMarginUsd += pos.estimatedMargin;
    if (pos.marginVerified) verifiedMarginUsd += pos.estimatedMargin;
    else unverifiedMarginUsd += pos.estimatedMargin;

    const addBucket = (map: Map<string, { contracts: number; riskUsd: number }>, key: string) => {
      const curr = map.get(key) ?? { contracts: 0, riskUsd: 0 };
      map.set(key, { contracts: curr.contracts + pos.contracts, riskUsd: curr.riskUsd + posRisk });
    };

    addBucket(byProduct, pos.productName);
    addBucket(byCategory, pos.category);
    addBucket(byExchange, pos.exchange);
  }

  const correlationWarnings: string[] = [];
  for (const [category, stats] of byCategory.entries()) {
    const sameCatPositions = open.filter((p) => p.category === category);
    if (sameCatPositions.length >= 2) {
      correlationWarnings.push(
        `Concentrated exposure in ${category}: ${sameCatPositions.length} open positions (${stats.contracts} contracts).`
      );
    }
  }

  return {
    openPositionCount: open.length,
    totalEstimatedRiskUsd,
    totalEstimatedMarginUsd,
    verifiedMarginUsd,
    unverifiedMarginUsd,
    exposureByProduct: Array.from(byProduct.entries()).map(([key, v]) => ({ key, ...v })),
    exposureByCategory: Array.from(byCategory.entries()).map(([key, v]) => ({ key, ...v })),
    exposureByExchange: Array.from(byExchange.entries()).map(([key, v]) => ({ key, ...v })),
    correlationWarnings,
    brokerSyncNotice:
      'Manual portfolio tracking only. Positions are NOT synchronized with any live brokerage or MXV clearing account.',
  };
}

export interface JournalEntryAnalyticsInput {
  instrument: string;
  strategy: string;
  timeframe: string;
  realizedPnl: number;
  tradingCosts: number;
  resultInR: number;
  status: 'OPEN' | 'CLOSED';
}

export interface TradeJournalAnalytics {
  totalClosedTrades: number;
  openTrades: number;
  netRealizedPnl: number;
  totalCosts: number;
  winRatePct: number;
  profitFactor: number | null;
  expectancyUsd: number;
  averageWinnerUsd: number;
  averageLoserUsd: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  maxDrawdownUsd: number;
  byStrategy: Array<{ key: string; trades: number; netPnl: number; winRatePct: number }>;
  byProduct: Array<{ key: string; trades: number; netPnl: number; winRatePct: number }>;
  byTimeframe: Array<{ key: string; trades: number; netPnl: number; winRatePct: number }>;
}

export function analyzeTradeJournal(entries: JournalEntryAnalyticsInput[]): TradeJournalAnalytics {
  const closed = entries.filter((e) => e.status === 'CLOSED');
  const openCount = entries.filter((e) => e.status === 'OPEN').length;

  let grossProfit = 0;
  let grossLoss = 0;
  let totalCosts = 0;
  let wins = 0;
  let losses = 0;
  let currWinStreak = 0;
  let currLossStreak = 0;
  let maxWinStreak = 0;
  let maxLossStreak = 0;

  let equity = 0;
  let peak = 0;
  let maxDrawdownUsd = 0;

  const groupBucket = () =>
    new Map<string, { trades: number; wins: number; netPnl: number }>();
  const byStrategyMap = groupBucket();
  const byProductMap = groupBucket();
  const byTimeframeMap = groupBucket();

  const recordGroup = (
    map: Map<string, { trades: number; wins: number; netPnl: number }>,
    key: string,
    pnl: number
  ) => {
    const prev = map.get(key) ?? { trades: 0, wins: 0, netPnl: 0 };
    map.set(key, {
      trades: prev.trades + 1,
      wins: prev.wins + (pnl > 0 ? 1 : 0),
      netPnl: prev.netPnl + pnl,
    });
  };

  for (const t of closed) {
    totalCosts += t.tradingCosts;
    if (t.realizedPnl > 0) {
      grossProfit += t.realizedPnl;
      wins++;
      currWinStreak++;
      currLossStreak = 0;
      if (currWinStreak > maxWinStreak) maxWinStreak = currWinStreak;
    } else if (t.realizedPnl < 0) {
      grossLoss += Math.abs(t.realizedPnl);
      losses++;
      currLossStreak++;
      currWinStreak = 0;
      if (currLossStreak > maxLossStreak) maxLossStreak = currLossStreak;
    }

    equity += t.realizedPnl;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDrawdownUsd) maxDrawdownUsd = dd;

    recordGroup(byStrategyMap, t.strategy, t.realizedPnl);
    recordGroup(byProductMap, t.instrument, t.realizedPnl);
    recordGroup(byTimeframeMap, t.timeframe, t.realizedPnl);
  }

  const netRealizedPnl = grossProfit - grossLoss;
  const winRatePct = closed.length > 0 ? (wins / closed.length) * 100 : 0;
  const profitFactor =
    grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? null : 0;
  const expectancyUsd = closed.length > 0 ? netRealizedPnl / closed.length : 0;
  const averageWinnerUsd = wins > 0 ? grossProfit / wins : 0;
  const averageLoserUsd = losses > 0 ? grossLoss / losses : 0;

  const toSummary = (map: Map<string, { trades: number; wins: number; netPnl: number }>) =>
    Array.from(map.entries()).map(([key, v]) => ({
      key,
      trades: v.trades,
      netPnl: v.netPnl,
      winRatePct: v.trades > 0 ? (v.wins / v.trades) * 100 : 0,
    }));

  return {
    totalClosedTrades: closed.length,
    openTrades: openCount,
    netRealizedPnl,
    totalCosts,
    winRatePct,
    profitFactor,
    expectancyUsd,
    averageWinnerUsd,
    averageLoserUsd,
    maxConsecutiveWins: maxWinStreak,
    maxConsecutiveLosses: maxLossStreak,
    maxDrawdownUsd,
    byStrategy: toSummary(byStrategyMap),
    byProduct: toSummary(byProductMap),
    byTimeframe: toSummary(byTimeframeMap),
  };
}
