import assert from 'node:assert/strict';
import test from 'node:test';
import { INITIAL_INSTRUMENTS } from '../../../server/data/instruments.ts';
import {
  interpretBacktestMetrics,
  interpretContractSpec,
  interpretCorrelationMatrix,
  interpretDrawdownSnapshot,
  interpretScannerSummary,
  interpretSeasonalityMonths,
  interpretSignalsSummary,
  interpretSpreadZScore,
  interpretTechnicalSnapshot,
  interpretTermStructure,
  interpretVolatilitySnapshot,
} from './advancedInsights.ts';

test('interpretTechnicalSnapshot translates raw indicators into plain Vietnamese and flags RSI extremes', () => {
  const res = interpretTechnicalSnapshot(
    {
      symbol: 'ZC',
      lastClose: 452,
      ema: { ema9: 448, ema20: 444, ema50: 438, ema100: 432, ema200: 425 },
      sma: { sma20: 443, sma50: 437, sma200: 426 },
      rsi14: 72.4,
      macd: { macd: 3.2, signal: 2.1, histogram: 1.1 },
      atrPct: 1.85,
      adx14: { adx: 29.5, plusDI: 26, minusDI: 14 },
      marketStructure: {
        mainTrend: 'BULLISH',
        shortTermTrend: 'BULLISH',
        momentum: 'STRONG',
        volatility: 'NORMAL',
        marketRegime: 'TRENDING_UP',
        supportZones: [438],
        resistanceZones: [460],
        bullishInvalidationLevel: 430,
        bearishInvalidationLevel: null,
      },
    },
    'vi'
  );

  assert.equal(res.tone, 'positive');
  assert.match(res.headline, /ZC/);
  assert.match(res.headline, /tăng/);
  assert.ok(res.bullets.some((b) => b.includes('EMA 20') && b.includes('SMA 50')));
  assert.ok(res.bullets.some((b) => b.includes('72.4') && b.includes('quá mua')));
  assert.ok(res.bullets.some((b) => b.includes('29.5') && b.includes('1.85%')));
  assert.equal(res.cautions.length, 1);
  assert.match(res.cautions[0], /quá mua/);
});

test('interpretTermStructure explains Contango carry cost and flags near expiry', () => {
  const res = interpretTermStructure(
    {
      shape: 'CONTANGO',
      points: [
        { contract: 'ZCN26', price: 440, daysToExpiry: 10 },
        { contract: 'ZCU26', price: 452, daysToExpiry: 70 },
      ],
      spreads: [{ near: 'ZCN26', far: 'ZCU26', spread: 12, annualizedRollYield: -0.095, direction: 'CONTANGO' }],
    },
    'CBOT:ZC',
    'vi'
  );

  assert.equal(res.tone, 'warning');
  assert.match(res.headline, /Contango/);
  assert.ok(res.bullets.some((b) => b.includes('-9.50%')));
  assert.ok(res.cautions.some((c) => c.includes('10 ngày')));
});

test('interpretBacktestMetrics explains positive expectancy with <50% win rate and warns on small sample', () => {
  const res = interpretBacktestMetrics(
    {
      netProfit: 1450,
      winRatePct: 41.7,
      profitFactor: 1.72,
      maxDrawdownPct: 12.5,
      expectancy: 120.8,
      averageR: 0.42,
      sharpeRatio: 1.35,
      tradeCount: 12,
    },
    'RC',
    'Trend Following',
    'vi'
  );

  assert.equal(res.tone, 'neutral'); // small sample (<15) prevents strongEdge
  assert.match(res.headline, /\+\$1,450\.00/);
  assert.ok(res.bullets[0].includes('dưới 50% nhưng vẫn có lãi'));
  assert.ok(res.cautions.some((c) => c.includes('12 lệnh')));
});

test('interpretSignalsSummary and interpretScannerSummary synthesize direction consensus', () => {
  const sigRes = interpretSignalsSummary(
    [
      { strategyName: 'Trend', direction: 'LONG', confirmationStatus: 'CONFIRMED', setupQualityScore: 76, riskReward: 2.3 },
      { strategyName: 'Breakout', direction: 'SHORT', confirmationStatus: 'CONFIRMED', setupQualityScore: 60, riskReward: 1.8 },
    ],
    'GC',
    'H4',
    'vi'
  );
  assert.equal(sigRes.tone, 'warning');
  assert.match(sigRes.headline, /xung đột/);
  assert.equal(sigRes.cautions.length, 1);

  const scanRes = interpretScannerSummary(
    [{ instrument: 'RC', strategy: 'Trend', direction: 'LONG', setupQualityScore: 81, riskReward: 2.4 }],
    3,
    'SWING',
    'D1',
    'vi'
  );
  assert.equal(scanRes.tone, 'positive');
  assert.match(scanRes.headline, /1 thiết lập/);
  assert.equal(scanRes.cautions.length, 1);
});

test('interpretContractSpec explains tick value and verification status', () => {
  const rc = INITIAL_INSTRUMENTS.find((i) => i.exchangeSymbol === 'RC');
  assert.ok(rc);
  const res = interpretContractSpec(rc, 'vi');
  assert.match(res.headline, /RC/);
  assert.ok(res.bullets.length >= 1);
});

test('analysis tab interpreters summarize volatility, drawdown, correlation, seasonality, and spreads', () => {
  const vol = interpretVolatilitySnapshot({ label: 'KC', realizedAnn: 0.44, parkinsonAnn: 0.39, atrPct: 2.8 }, 'vi');
  assert.equal(vol.tone, 'warning');
  assert.ok(vol.cautions.length === 1);

  const dd = interpretDrawdownSnapshot(
    {
      label: 'ZC',
      totalReturn: 0.18,
      maxDrawdown: -0.22,
      peakDate: '2025-02-01',
      troughDate: '2025-05-10',
      recoveryDate: null,
    },
    'vi'
  );
  assert.ok(dd.bullets.some((b) => b.includes('-22.0%')));
  assert.equal(dd.cautions.length, 1);

  const corr = interpretCorrelationMatrix(
    ['KC', 'RC', 'GC'],
    [
      [1, 0.82, -0.15],
      [0.82, 1, -0.05],
      [-0.15, -0.05, 1],
    ],
    'vi'
  );
  assert.equal(corr.tone, 'warning');
  assert.match(corr.headline, /0\.82/);
  assert.equal(corr.cautions.length, 1);

  const seas = interpretSeasonalityMonths(
    [
      { month: 1, count: 6, mean: 0.045, pctPositive: 0.83 },
      { month: 7, count: 6, mean: -0.032, pctPositive: 0.17 },
    ],
    'ZC',
    5,
    'vi'
  );
  assert.match(seas.headline, /Tháng 1/);
  assert.match(seas.headline, /Tháng 7/);

  const spr = interpretSpreadZScore(18.5, 2.35, 'USD/bu', 20, 'vi');
  assert.equal(spr.tone, 'warning');
  assert.match(spr.headline, /2\.35/);
});
