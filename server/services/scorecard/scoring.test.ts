import test from 'node:test';
import assert from 'node:assert/strict';
import {
  overallTrendClarity,
  overallVolatilityRisk,
  percentileRank,
  scoreCot,
  scoreDataQuality,
  scoreDrawdown,
  scoreMomentum,
  scoreSeasonality,
  scoreTrend,
  scoreVolatility,
} from './scoring.ts';

const base = { source: 'TEST', asOf: '2026-11-19' };

test('trend labels follow MA votes', () => {
  assert.equal(scoreTrend({ close: 110, sma50: 100, sma200: 90, sma50Prev: 95, ...base }).level, 'STRONG_UP');
  assert.equal(scoreTrend({ close: 80, sma50: 100, sma200: 110, sma50Prev: 105, ...base }).level, 'STRONG_DOWN');
  assert.equal(scoreTrend({ close: 110, sma50: 100, sma200: 120, sma50Prev: 95, ...base }).level, 'UP');
  assert.equal(scoreTrend({ close: 100.4, sma50: 100, sma200: 120, sma50Prev: 95, ...base }).level, 'SIDEWAYS');
  const noMa200 = scoreTrend({ close: 110, sma50: 100, sma200: null, sma50Prev: null, ...base });
  assert.equal(noMa200.level, 'STRONG_UP');
  assert.match(noMa200.explanation.vi, /chưa đủ 200 phiên/);
});

test('trend unavailable without SMA50', () => {
  const d = scoreTrend({ close: 100, sma50: null, sma200: null, sma50Prev: null, ...base });
  assert.equal(d.status, 'UNAVAILABLE');
  assert.equal(d.level, null);
  assert.equal(d.score, null);
});

test('momentum from RSI', () => {
  assert.equal(scoreMomentum({ rsi14: 75, ret20: 0.05, ...base }).level, 'VERY_STRONG');
  assert.equal(scoreMomentum({ rsi14: 60, ret20: null, ...base }).level, 'STRONG');
  assert.equal(scoreMomentum({ rsi14: 50, ret20: null, ...base }).level, 'NEUTRAL');
  assert.equal(scoreMomentum({ rsi14: 40, ret20: null, ...base }).level, 'WEAK');
  assert.equal(scoreMomentum({ rsi14: 20, ret20: null, ...base }).level, 'VERY_WEAK');
  assert.equal(scoreMomentum({ rsi14: null, ret20: null, ...base }).status, 'UNAVAILABLE');
});

test('volatility percentile vs own history', () => {
  const hist = Array.from({ length: 100 }, (_, i) => 0.1 + i * 0.002);
  assert.equal(percentileRank([1, 2, 3, 4], 2), 50);
  assert.equal(scoreVolatility({ vol20: 0.29, volHistory: hist, ...base }).level, 'HIGH');
  assert.equal(scoreVolatility({ vol20: 0.2, volHistory: hist, ...base }).level, 'MEDIUM');
  assert.equal(scoreVolatility({ vol20: 0.1, volHistory: hist, ...base }).level, 'LOW');
  assert.equal(scoreVolatility({ vol20: 0.2, volHistory: hist.slice(0, 30), ...base }).status, 'UNAVAILABLE');
});

test('drawdown buckets and min history', () => {
  const mk = (close: number, bars = 250) => scoreDrawdown({ close, high52w: 100, bars, ...base });
  assert.equal(mk(97).level, 'NEAR_HIGH');
  assert.equal(mk(90).level, 'MILD');
  assert.equal(mk(80).level, 'DEEP');
  assert.equal(mk(60).level, 'VERY_DEEP');
  assert.equal(mk(90, 50).status, 'UNAVAILABLE');
});

test('COT and seasonality availability', () => {
  const cot = { available: true, reason: null, cotIndex: 85, cotIndexWeeks: 156, mmNetPctOi: 12, reportDate: '2026-11-10', stale: false, source: 'CFTC' };
  assert.equal(scoreCot(cot).level, 'HIGH_VS_HISTORY');
  assert.equal(scoreCot({ ...cot, cotIndex: 10 }).level, 'LOW_VS_HISTORY');
  assert.equal(scoreCot({ ...cot, cotIndex: 50 }).level, 'MID_VS_HISTORY');
  assert.equal(scoreCot({ ...cot, available: false, cotIndex: null }).status, 'UNAVAILABLE');

  const s = { ok: true, yearsCovered: 5, month: 11, count: 5, mean: 0.02, pctPositive: 0.8, ...base };
  assert.equal(scoreSeasonality(s).level, 'USUALLY_UP');
  assert.equal(scoreSeasonality({ ...s, pctPositive: 0.2 }).level, 'USUALLY_DOWN');
  assert.equal(scoreSeasonality({ ...s, pctPositive: 0.5 }).level, 'MIXED');
  assert.equal(scoreSeasonality({ ...s, yearsCovered: 2 }).status, 'UNAVAILABLE');
});

test('overall readings exclude unavailable dimensions and contain no advice words', () => {
  const trend = scoreTrend({ close: 110, sma50: 100, sma200: 90, sma50Prev: 95, ...base });
  const mom = scoreMomentum({ rsi14: 65, ret20: 0.04, ...base });
  const clarity = overallTrendClarity(trend, mom);
  assert.equal(clarity.level, 'CLEAR');
  assert.equal(clarity.score, 100);
  const noTrend = scoreTrend({ close: null, sma50: null, sma200: null, sma50Prev: null, ...base });
  assert.equal(overallTrendClarity(noTrend, mom).score, null);

  const vol = scoreVolatility({ vol20: 0.29, volHistory: Array.from({ length: 100 }, (_, i) => 0.1 + i * 0.002), ...base });
  const dd = scoreDrawdown({ close: 60, high52w: 100, bars: 250, ...base });
  const risk = overallVolatilityRisk(vol, dd);
  assert.equal(risk.level, 'HIGH');
  assert.equal(overallVolatilityRisk(scoreVolatility({ vol20: null, volHistory: [], ...base }), dd).score, null);

  const text = JSON.stringify([trend, mom, vol, dd, clarity, risk]).toLowerCase();
  assert.ok(!/\b(buy|sell|entry|target|stop loss)\b|nên mua|nên bán/.test(text));
});

test('data quality levels', () => {
  assert.equal(scoreDataQuality({ quotePrice: null, quoteStatus: 'UNAVAILABLE', historyBars: 0 }).level, 'UNAVAILABLE');
  assert.equal(scoreDataQuality({ quotePrice: 1, quoteStatus: 'DELAYED', historyBars: 30 }).level, 'POOR');
  assert.equal(scoreDataQuality({ quotePrice: 1, quoteStatus: 'DELAYED', historyBars: 120 }).level, 'LIMITED');
  assert.equal(scoreDataQuality({ quotePrice: 1, quoteStatus: 'DELAYED', historyBars: 500 }).level, 'GOOD');
});
