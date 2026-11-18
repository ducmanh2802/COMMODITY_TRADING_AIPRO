import test from 'node:test';
import assert from 'node:assert/strict';
import type { MarketCandle } from '../../src/shared/types/market.ts';
import { INITIAL_INSTRUMENTS } from '../data/instruments.ts';
import { evaluateMultiTimeframeCycle } from './cycleEngine.ts';
import { buildDualTradeSetupPlans, runBottomDetectionEngine } from './bottomDetectionEngine.ts';

function buildBottomingSeries(): MarketCandle[] {
  // 140 days: drops from 620 down to 360 then forms double bottom with higher second RSI low and tight bounce
  const closes: number[] = [];
  for (let i = 0; i < 90; i++) {
    closes.push(620 - i * 2.8); // drops to ~368
  }
  // bounce to 395
  for (let i = 0; i < 15; i++) closes.push(368 + i * 1.8);
  // retest lower low at 362 gently (higher RSI low), then stabilize up to 382
  for (let i = 0; i < 15; i++) closes.push(395 - i * 2.2);
  for (let i = 0; i < 20; i++) closes.push(362 + i * 1.0);

  const startMs = Date.parse('2024-01-01T00:00:00.000Z');
  return closes.map((close, idx) => {
    const ts = new Date(startMs + idx * 86_400_000).toISOString();
    return {
      symbol: 'CBOT:ZC',
      exchange: 'CBOT',
      timeframe: 'D1',
      timestamp: ts,
      retrievedAt: ts,
      open: close - 0.5,
      high: close + 2,
      low: close - 2,
      close,
      volume: idx > 120 ? 22_000 : 12_000,
      openInterest: 45_000,
      isComplete: true,
      source: 'TEST_BOTTOM',
      status: 'HISTORICAL',
    };
  });
}

test('bottomDetectionEngine fails closed on insufficient history', () => {
  const zc = INITIAL_INSTRUMENTS.find((i) => i.id === 'CBOT:ZC')!;
  const cycle = evaluateMultiTimeframeCycle({ dailyCandles: [] });
  const result = runBottomDetectionEngine({
    instrument: zc,
    dailyCandles: [],
    weeklyCandles: [],
    timeframes: cycle.timeframes,
  });
  assert.equal(result.status, 'DATA_UNAVAILABLE');
  assert.equal(result.totalScore, null);
  assert.equal(result.classification, 'DATA_UNAVAILABLE');
});

test('bottomDetectionEngine scores strong bottom candidate (>= 70) when depressed + bullish divergence + cot washed out', () => {
  const zc = INITIAL_INSTRUMENTS.find((i) => i.id === 'CBOT:ZC')!;
  const daily = buildBottomingSeries();
  const cycle = evaluateMultiTimeframeCycle({ dailyCandles: daily });
  const result = runBottomDetectionEngine({
    instrument: zc,
    dailyCandles: daily,
    weeklyCandles: [],
    timeframes: cycle.timeframes,
    supplyDemandBiasScore: 0.7,
    supplyDemandEvidence: 'Tồn kho cuối kỳ WASDE thu hẹp',
    cotIndex: 10,
    cotNote: 'COT Index = 10% (Short cực đoan)',
    macroScoreNormalized: 0.5,
    macroEvidence: 'DXY suy yếu',
  });

  assert.equal(result.status, 'COMPUTED');
  assert.ok((result.totalScore ?? 0) >= 70, `Expected >= 70, got ${result.totalScore}`);
  assert.ok(result.modelConfidenceScore !== null && result.modelConfidenceScore >= 50);

  const plans = buildDualTradeSetupPlans({
    instrument: zc,
    dailyCandles: daily,
    timeframes: cycle.timeframes,
    bottomDetection: result,
  });
  assert.equal(plans.longTermCycle.autoExecutionAllowed, false);
  assert.equal(plans.swingTrading.autoExecutionAllowed, false);
  assert.ok((plans.longTermCycle.riskRewardRatio ?? 0) >= 1.5);
});

test('bottomDetectionEngine suppresses bottom score when price sits at multi-year highs', () => {
  const zc = INITIAL_INSTRUMENTS.find((i) => i.id === 'CBOT:ZC')!;
  const startMs = Date.parse('2024-01-01T00:00:00.000Z');
  const daily: MarketCandle[] = Array.from({ length: 120 }, (_, i) => {
    const close = 400 + i * 2.5;
    const ts = new Date(startMs + i * 86_400_000).toISOString();
    return {
      symbol: 'CBOT:ZC',
      exchange: 'CBOT',
      timeframe: 'D1',
      timestamp: ts,
      retrievedAt: ts,
      open: close - 1,
      high: close + 2,
      low: close - 2,
      close,
      volume: 10_000,
      openInterest: 40_000,
      isComplete: true,
      source: 'TEST_HIGH',
      status: 'HISTORICAL',
    };
  });
  const cycle = evaluateMultiTimeframeCycle({ dailyCandles: daily });
  const result = runBottomDetectionEngine({
    instrument: zc,
    dailyCandles: daily,
    weeklyCandles: [],
    timeframes: cycle.timeframes,
  });
  assert.ok((result.totalScore ?? 100) <= 40);
  assert.equal(result.classification, 'NO_BOTTOM_SIGNAL');
});
