import test from 'node:test';
import assert from 'node:assert/strict';
import { instrumentRepository } from '../services/instrumentRegistry.ts';
import { analyzePortfolioExposure, analyzeTradeJournal } from './portfolioEngine.ts';

test('analyzePortfolioExposure computes category/product/exchange exposure and correlation alerts', async () => {
  const all = await instrumentRepository.list();
  const byId = new Map(all.map((i) => [i.id, i]));

  const summary = analyzePortfolioExposure(
    [
      {
        id: 'p1',
        instrumentId: 'COMEX:GC',
        productName: 'Gold',
        category: 'METALS',
        exchange: 'COMEX',
        direction: 'LONG',
        contracts: 2,
        entryPrice: 2650,
        stopLoss: 2640, // 100 ticks * $10 * 2 = $2000
        takeProfit: 2680,
        estimatedMargin: 11000,
        marginVerified: false,
        status: 'OPEN',
      },
      {
        id: 'p2',
        instrumentId: 'COMEX:SI',
        productName: 'Silver',
        category: 'METALS',
        exchange: 'COMEX',
        direction: 'LONG',
        contracts: 1,
        entryPrice: 30.5,
        stopLoss: 30.0, // 0.5 / 0.005 = 100 ticks * $25 = $2500
        takeProfit: 32.0,
        estimatedMargin: 9000,
        marginVerified: false,
        status: 'OPEN',
      },
    ],
    byId
  );

  assert.equal(summary.openPositionCount, 2);
  assert.equal(summary.totalEstimatedRiskUsd, 4500);
  assert.equal(summary.unverifiedMarginUsd, 20000);
  assert.equal(summary.verifiedMarginUsd, 0);
  assert.equal(summary.correlationWarnings.length, 1);
});

test('analyzeTradeJournal computes win rate, profit factor, expectancy, streaks, and drawdown', () => {
  const analytics = analyzeTradeJournal([
    {
      instrument: 'GC',
      strategy: 'TREND_FOLLOWING',
      timeframe: 'H4',
      realizedPnl: 1000,
      tradingCosts: 10,
      resultInR: 2,
      status: 'CLOSED',
    },
    {
      instrument: 'CL',
      strategy: 'BREAKOUT',
      timeframe: 'H1',
      realizedPnl: -400,
      tradingCosts: 10,
      resultInR: -1,
      status: 'CLOSED',
    },
    {
      instrument: 'GC',
      strategy: 'TREND_FOLLOWING',
      timeframe: 'H4',
      realizedPnl: 800,
      tradingCosts: 10,
      resultInR: 1.6,
      status: 'CLOSED',
    },
  ]);

  assert.equal(analytics.totalClosedTrades, 3);
  assert.equal(analytics.netRealizedPnl, 1400);
  assert.equal(Math.round(analytics.winRatePct * 100) / 100, 66.67);
  assert.equal(analytics.profitFactor, 1800 / 400);
  assert.equal(analytics.maxDrawdownUsd, 400);
  assert.equal(analytics.maxConsecutiveWins, 1);
  assert.equal(analytics.maxConsecutiveLosses, 1);
});
