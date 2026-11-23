import test from 'node:test';
import assert from 'node:assert/strict';
import type { MarketCandle } from '../../src/shared/types/market.ts';
import type { InstrumentDefinition } from '../../src/shared/types/instrument.ts';
import { buildContractChain } from '../../src/shared/contracts/chain.ts';
import { addCalendarDays, weekday } from '../../src/shared/contracts/dates.ts';
import { instrumentRepository } from '../services/instrumentRegistry.ts';
import { runHistoricalBacktest, prepareBacktest, simulateRange, type BacktestConfig } from './backtestEngine.ts';
import { computeRollSchedule } from './rollSchedule.ts';
import { defaultParams, getParamSchema, STRATEGY_PARAM_SCHEMAS, validateStrategyParams } from './strategyParams.ts';
import { evaluateStrategy, STRATEGY_CATALOG } from './strategyEngine.ts';
import { analyzeTechnicalSnapshot, calculateOBV, detectObvDivergence, summarizeObv } from './technicalEngine.ts';
import {
  expandParamGrid,
  MAX_GRID_COMBOS,
  mulberry32,
  percentile,
  planFolds,
  runMonteCarlo,
  runWalkForward,
} from './labEngine.ts';

function candle(i: number, close: number, volume: number | null, open = close, startMs = Date.parse('2025-01-02T00:00:00Z')): MarketCandle {
  return {
    symbol: 'GC',
    exchange: 'COMEX',
    timeframe: 'D1',
    timestamp: new Date(startMs + i * 86_400_000).toISOString(),
    retrievedAt: '2026-11-17T00:00:00Z',
    open,
    high: Math.max(open, close) + 1,
    low: Math.min(open, close) - 1,
    close,
    volume,
    openInterest: null,
    isComplete: true,
    source: 'CSV_HISTORICAL',
    status: 'HISTORICAL',
  };
}

/** Deterministic noisy wave + drift so strategies produce a handful of trades. */
function makeSeries(count: number, seed = 7, drift = 0.6): MarketCandle[] {
  const rand = mulberry32(seed);
  const out: MarketCandle[] = [];
  let prev = 2000;
  for (let i = 0; i < count; i++) {
    const target = 2000 + i * drift + 70 * Math.sin(i / 14) + (rand() - 0.5) * 12;
    out.push(candle(i, target, 1000 + Math.floor(rand() * 500), prev));
    prev = target;
  }
  return out;
}

async function gold(): Promise<InstrumentDefinition> {
  const g = await instrumentRepository.findBySymbol('GC');
  assert.ok(g);
  return g;
}

function cfg(instrument: InstrumentDefinition, extra: Partial<BacktestConfig> = {}): BacktestConfig {
  return {
    instrument,
    strategyId: 'TREND_FOLLOWING',
    timeframe: 'D1',
    initialEquity: 50_000,
    contractsPerTrade: 1,
    commissionPerContract: 2.5,
    slippageTicks: 1,
    ...extra,
  };
}

// ------------------------------------------------------------------ OBV

test('calculateOBV adds volume on up closes, subtracts on down closes, holds on flat', () => {
  const c = [candle(0, 10, 100), candle(1, 11, 50), candle(2, 10, 30), candle(3, 10, 70), candle(4, 12, 20)];
  assert.deepEqual(calculateOBV(c), [0, 50, 20, 20, 40]);
});

test('calculateOBV treats missing volume as zero', () => {
  const c = [candle(0, 10, null), candle(1, 11, null), candle(2, 12, 5)];
  assert.deepEqual(calculateOBV(c), [0, 0, 5]);
});

test('detectObvDivergence flags bearish divergence (new price high, OBV below its high)', () => {
  const closes = [10, 11, 12, 13, 12, 12.5, 14];
  const obv = [0, 100, 200, 300, 250, 260, 280];
  assert.equal(detectObvDivergence(closes, obv, 5), 'BEARISH');
});

test('detectObvDivergence flags bullish divergence (new price low, OBV above its low)', () => {
  const closes = [14, 13, 12, 11, 12, 11.5, 10];
  const obv = [300, 200, 100, 0, 50, 40, 20];
  assert.equal(detectObvDivergence(closes, obv, 5), 'BULLISH');
});

test('detectObvDivergence is NONE when OBV confirms price and when history is short', () => {
  assert.equal(detectObvDivergence([10, 11, 12, 13, 14, 15], [0, 1, 2, 3, 4, 5], 5), 'NONE');
  assert.equal(detectObvDivergence([10, 11], [0, 1], 5), 'NONE');
});

test('detectObvDivergence ignores the last bar when building the reference window (no look-ahead)', () => {
  // The last bar itself is the only bar that exceeds the window; the window max must not include it.
  const closes = [10, 10, 10, 10, 10, 11];
  const obv = [5, 5, 5, 5, 5, 9];
  assert.equal(detectObvDivergence(closes, obv, 5), 'NONE');
});

test('summarizeObv returns null without volume or history and a full summary otherwise', () => {
  assert.equal(summarizeObv(makeSeries(10)), null);
  const noVol = makeSeries(60).map((c) => ({ ...c, volume: null }));
  assert.equal(summarizeObv(noVol), null);
  const s = summarizeObv(makeSeries(80));
  assert.ok(s);
  assert.equal(s.lookback, 20);
  assert.ok(s.ema !== null);
  assert.ok(['ABOVE_EMA', 'BELOW_EMA', 'FLAT'].includes(s.signal as string));
});

test('analyzeTechnicalSnapshot exposes obv', () => {
  const snap = analyzeTechnicalSnapshot(makeSeries(90), 'GC', 'COMEX', 'D1');
  assert.ok(snap.obv);
  assert.equal(typeof snap.obv.value, 'number');
});

// ------------------------------------------------------------------ strategy params

test('every strategy declares a well-formed param schema with defaults inside bounds', () => {
  for (const s of STRATEGY_CATALOG) {
    const schema = STRATEGY_PARAM_SCHEMAS[s.id];
    assert.ok(schema && schema.length >= 2, `${s.id} schema`);
    const keys = new Set<string>();
    for (const d of schema) {
      assert.ok(!keys.has(d.key), `${s.id} duplicate ${d.key}`);
      keys.add(d.key);
      assert.ok(d.label.length > 0 && d.hint.length > 0);
      assert.ok(d.min < d.max && d.step > 0);
      assert.ok(d.default >= d.min && d.default <= d.max, `${s.id}.${d.key} default in range`);
    }
  }
});

test('validateStrategyParams fills defaults and rejects unknown, non-finite and out-of-range values', () => {
  const ok = validateStrategyParams('TREND_FOLLOWING', { adxMin: 25 });
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.equal(ok.params.adxMin, 25);
    assert.equal(ok.params.slAtrMult, 1.5);
  }
  assert.ok(validateStrategyParams('TREND_FOLLOWING', undefined).ok);
  for (const bad of [{ nope: 1 }, { adxMin: 5 }, { adxMin: 41 }, { adxMin: Number.NaN }, { adxMin: '22' }, [1]]) {
    const r = validateStrategyParams('TREND_FOLLOWING', bad);
    assert.equal(r.ok, false, JSON.stringify(bad));
  }
  // a key valid for one strategy is unknown for another
  assert.equal(validateStrategyParams('MACD_MOMENTUM', { adxMin: 22 }).ok, false);
});

test('default params reproduce the original behaviour of evaluateStrategy', () => {
  const candles = makeSeries(120);
  const snap = analyzeTechnicalSnapshot(candles, 'GC', 'COMEX', 'D1');
  for (const s of STRATEGY_CATALOG) {
    const a = evaluateStrategy(s.id, snap, candles);
    const b = evaluateStrategy(s.id, snap, candles, defaultParams(s.id));
    assert.deepEqual(a, b, s.id);
  }
});

test('changing slAtrMult / tp1R moves the trade levels', () => {
  const candles = makeSeries(160, 3, 1.2);
  let found = false;
  for (let i = 80; i < candles.length && !found; i++) {
    const slice = candles.slice(0, i + 1);
    const snap = analyzeTechnicalSnapshot(slice, 'GC', 'COMEX', 'D1');
    const base = evaluateStrategy('TREND_FOLLOWING', snap, slice);
    if (base.confirmationStatus !== 'CONFIRMED') continue;
    const wide = evaluateStrategy('TREND_FOLLOWING', snap, slice, { slAtrMult: 3, tp1R: 3 });
    assert.equal(wide.direction, base.direction);
    const price = snap.lastClose as number;
    assert.ok(Math.abs(price - (wide.stopLoss as number)) > Math.abs(price - (base.stopLoss as number)));
    assert.ok(Math.abs((wide.takeProfits[0] as number) - price) > Math.abs((base.takeProfits[0] as number) - price));
    found = true;
  }
  assert.ok(found, 'expected at least one confirmed signal in the fixture');
});

test('runHistoricalBacktest rejects invalid params instead of silently clamping', async () => {
  const res = runHistoricalBacktest(makeSeries(200), cfg(await gold(), { params: { adxMin: 999 } }));
  assert.equal(res.valid, false);
  assert.match(res.error ?? '', /Invalid strategy parameters/);
});

// ------------------------------------------------------------------ grid + folds

test('expandParamGrid enforces the combo and per-param caps and validates values', () => {
  const base = defaultParams('TREND_FOLLOWING');
  const ok = expandParamGrid('TREND_FOLLOWING', base, { adxMin: [20, 22, 24], slAtrMult: [1.2, 1.5] });
  assert.ok(ok.ok);
  if (ok.ok) assert.equal(ok.combos.length, 6);
  const tooMany = expandParamGrid('RANGE_TRADING', defaultParams('RANGE_TRADING'), {
    adxMax: [16, 18, 20, 22, 24, 26, 28],
    rsiLow: [30, 32, 34, 36, 38, 40, 42],
    slAtrMult: [1, 1.2],
  });
  assert.equal(tooMany.ok, false);
  assert.equal(expandParamGrid('TREND_FOLLOWING', base, { adxMin: [1, 2, 3, 4, 5, 6, 7, 8] }).ok, false);
  assert.equal(expandParamGrid('TREND_FOLLOWING', base, { adxMin: [5] }).ok, false);
  assert.equal(expandParamGrid('TREND_FOLLOWING', base, { bogus: [1] }).ok, false);
  const empty = expandParamGrid('TREND_FOLLOWING', base, undefined);
  assert.ok(empty.ok);
  assert.ok(MAX_GRID_COMBOS <= 50);
});

test('planFolds: contiguous OOS windows, IS strictly before OOS, last OOS ends at the final bar', () => {
  for (const mode of ['ROLLING', 'ANCHORED'] as const) {
    const plan = planFolds(55, 654, 4, mode, 3);
    assert.ok(plan.ok);
    if (!plan.ok) return;
    assert.equal(plan.folds.length, 4);
    assert.equal(plan.folds[3].oosEnd, 654);
    assert.ok(plan.isBars >= 3 * plan.oosBars);
    plan.folds.forEach((f, k) => {
      assert.equal(f.isEnd + 1, f.oosStart, 'IS ends right before OOS starts');
      assert.ok(f.isStart >= 55 && f.isStart <= f.isEnd);
      assert.equal(f.oosEnd - f.oosStart + 1, plan.oosBars);
      if (k > 0) assert.equal(f.oosStart, plan.folds[k - 1].oosEnd + 1, 'OOS windows are contiguous, no overlap');
      if (mode === 'ROLLING') assert.equal(f.isEnd - f.isStart + 1, plan.isBars);
      else assert.equal(f.isStart, 55);
    });
  }
  assert.equal(planFolds(0, 40, 4, 'ROLLING', 3).ok, false);
  assert.equal(planFolds(0, 500, 1, 'ROLLING', 3).ok, false);
});

// ------------------------------------------------------------------ walk-forward

test('simulateRange never depends on bars after the window end (no look-ahead)', async () => {
  const candles = makeSeries(360);
  const config = cfg(await gold());
  const full = prepareBacktest(candles, config);
  assert.ok(!('error' in full));
  if ('error' in full) return;
  const end = 250;
  const truncated = prepareBacktest(candles.slice(0, end + 1), config);
  assert.ok(!('error' in truncated));
  if ('error' in truncated) return;
  const a = simulateRange(full, full.params, 80, end);
  const b = simulateRange(truncated, truncated.params, 80, end);
  assert.deepEqual(a.trades, b.trades);
  assert.deepEqual(a.equityCurve, b.equityCurve);
});

test('walk-forward in-sample results are independent of out-of-sample data', async () => {
  const candles = makeSeries(420);
  const config = cfg(await gold());
  const opts = { folds: 3, mode: 'ROLLING' as const, isOosRatio: 3, grid: { adxMin: [18, 22, 26] } };
  const a = await runWalkForward(candles, config, opts);
  assert.ok(a.valid, a.error);
  const firstOosStartTs = a.folds[0].oosRange.from;
  const cut = candles.findIndex((c) => c.timestamp === firstOosStartTs);
  assert.ok(cut > 0);
  const scrambled = candles.map((c, i) =>
    i < cut ? c : { ...c, open: c.open * 0.6, close: c.close * 1.4, high: c.high * 1.5, low: c.low * 0.5 }
  );
  const b = await runWalkForward(scrambled, config, opts);
  assert.ok(b.valid, b.error);
  assert.deepEqual(b.folds[0].inSample, a.folds[0].inSample);
  assert.deepEqual(b.folds[0].bestParams, a.folds[0].bestParams);
});

test('walk-forward reports per-fold IS vs OOS, stitched OOS equity and an overfit assessment', async () => {
  const candles = makeSeries(480);
  const res = await runWalkForward(candles, cfg(await gold()), {
    folds: 4,
    mode: 'ANCHORED',
    grid: { adxMin: [18, 22], slAtrMult: [1.2, 1.5, 2] },
  });
  assert.ok(res.valid, res.error);
  assert.equal(res.folds.length, 4);
  assert.equal(res.combosPerFold, 6);
  for (const f of res.folds) {
    assert.ok(f.isRange.to < f.oosRange.from, 'IS window ends before OOS starts');
    assert.equal(f.oosRange.bars, res.oosBars);
    assert.ok('netProfit' in f.inSample && 'netProfit' in f.outOfSample);
  }
  assert.equal(res.stitchedOosEquity.length, res.oosBars * 4);
  const timestamps = res.stitchedOosEquity.map((p) => p.timestamp);
  assert.deepEqual(timestamps, [...timestamps].sort());
  assert.equal(res.stitchedOosEquity[0].equity > 0, true);
  const lastEq = res.stitchedOosEquity[res.stitchedOosEquity.length - 1].equity;
  assert.ok(Math.abs(lastEq - (50_000 + res.stitchedOos.netProfit)) < 1e-6);
  assert.ok(res.overfit);
  assert.ok(['LOW', 'MEDIUM', 'HIGH', 'INSUFFICIENT', 'NO_EDGE'].includes(res.overfit.level));
  assert.match(res.disclaimer, /not a promise/);
});

test('walk-forward fails cleanly on too little data or a too-large grid', async () => {
  const g = await gold();
  const short = await runWalkForward(makeSeries(90), cfg(g), { folds: 6 });
  assert.equal(short.valid, false);
  const big = await runWalkForward(makeSeries(400), cfg(g, { strategyId: 'RANGE_TRADING' }), {
    grid: { adxMax: [16, 18, 20, 22, 24, 26, 28], rsiLow: [30, 32, 34, 36, 38, 40, 42], slAtrMult: [1, 1.2] },
  });
  assert.equal(big.valid, false);
  assert.match(big.error ?? '', /combinations/);
});

// ------------------------------------------------------------------ Monte Carlo

test('mulberry32 is deterministic per seed and stays in [0,1)', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  const c = mulberry32(43);
  const xs = Array.from({ length: 50 }, () => a());
  assert.deepEqual(xs, Array.from({ length: 50 }, () => b()));
  assert.notDeepEqual(xs, Array.from({ length: 50 }, () => c()));
  assert.ok(xs.every((x) => x >= 0 && x < 1));
});

test('percentile interpolates linearly', () => {
  assert.equal(percentile([1, 2, 3, 4, 5], 50), 3);
  assert.equal(percentile([0, 10], 25), 2.5);
  assert.equal(percentile([7], 95), 7);
});

test('runMonteCarlo is reproducible with a seed and differs across seeds', () => {
  const pnls = [120, -80, 45, -30, 200, -150, 60, 90, -40, 15, -25, 70];
  const a = runMonteCarlo(pnls, 10_000, { seed: 99 });
  const b = runMonteCarlo(pnls, 10_000, { seed: 99 });
  const c = runMonteCarlo(pnls, 10_000, { seed: 100 });
  assert.ok(a.valid);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.finalReturnPct, c.finalReturnPct);
  assert.equal(a.runs, 1000);
  assert.equal(a.histogram.reduce((s, h) => s + h.count, 0), 1000);
  assert.ok(a.finalReturnPct.p5 <= a.finalReturnPct.p50 && a.finalReturnPct.p50 <= a.finalReturnPct.p95);
  assert.ok(a.maxDrawdownPct.p5 <= a.maxDrawdownPct.p50 && a.maxDrawdownPct.p50 <= a.maxDrawdownPct.p95);
  assert.ok(a.probDrawdownAbove >= 0 && a.probDrawdownAbove <= 1 && a.probLoss >= 0 && a.probLoss <= 1);
  assert.equal(a.equityBands[0].trade, 0);
  assert.equal(a.equityBands[0].p50, 10_000);
  assert.equal(a.equityBands[a.equityBands.length - 1].trade, pnls.length);
});

test('runMonteCarlo degenerate cases are exact', () => {
  const win = runMonteCarlo(Array(10).fill(100), 10_000, { seed: 1, runs: 200 });
  assert.equal(win.finalReturnPct.p5, 10);
  assert.equal(win.finalReturnPct.p95, 10);
  assert.equal(win.maxDrawdownPct.p95, 0);
  assert.equal(win.probLoss, 0);
  assert.equal(win.expectancy.p50, 100);
  const lose = runMonteCarlo(Array(10).fill(-100), 10_000, { seed: 1, runs: 200, drawdownThresholdPct: 5 });
  assert.equal(lose.probLoss, 1);
  assert.equal(lose.probDrawdownAbove, 1);
});

test('runMonteCarlo caps runs, rejects too few trades and caps trade count', () => {
  const few = runMonteCarlo([1, 2, 3], 1000);
  assert.equal(few.valid, false);
  const capped = runMonteCarlo([10, -5, 3, 8, -2], 1000, { runs: 999_999 });
  assert.equal(capped.runs, 2000);
  const many = runMonteCarlo(Array.from({ length: 3000 }, (_, i) => (i % 3 === 0 ? -5 : 4)), 1000, { runs: 100 });
  assert.equal(many.tradesCapped, true);
  assert.equal(many.tradeCount, 2000);
});

// ------------------------------------------------------------------ calendar rolls

test('computeRollSchedule(0 days) equals the contract chain anchor dates; n days moves earlier on business days', () => {
  const chain = buildContractChain({ instrumentId: 'COMEX:GC', root: 'GC', asOf: '2025-01-01', count: 8 });
  assert.equal(chain.status, 'OK');
  if (chain.status !== 'OK') return;
  const zero = computeRollSchedule('COMEX:GC', '2025-01-01', '2025-12-31', 0);
  const five = computeRollSchedule('COMEX:GC', '2025-01-01', '2025-12-31', 5);
  assert.equal(zero.source, 'CALENDAR');
  assert.equal(five.source, 'CALENDAR');
  if (zero.source !== 'CALENDAR' || five.source !== 'CALENDAR') return;
  const anchors = chain.contracts
    .map((c) => (c.firstNoticeDay.status === 'COMPUTED' ? c.firstNoticeDay.date : c.lastTradingDay.status === 'COMPUTED' ? c.lastTradingDay.date : null))
    .filter((d): d is string => d !== null && d >= '2025-01-01' && d <= '2025-12-31');
  assert.ok(anchors.length > 0);
  for (const a of anchors) assert.ok(zero.dates.includes(a), `anchor ${a} present in n=0 schedule`);
  assert.ok(five.dates.length > 0);
  for (const d of five.dates) {
    assert.ok(weekday(d) >= 1 && weekday(d) <= 5, `${d} is a weekday`);
    // every n=5 date is 5..9 calendar days before some n=0 anchor in the same or next calendar window
    const later = [...zero.dates, ...anchors].find((z) => z > d && z <= addCalendarDays(d, 12));
    assert.ok(later, `${d} lies shortly before an anchor`);
  }
  assert.deepEqual([...five.dates], [...five.dates].sort());
  assert.equal(new Set(five.dates).size, five.dates.length);
});

test('computeRollSchedule reports UNAVAILABLE for instruments without a calendar rule and bad inputs', () => {
  assert.equal(computeRollSchedule('TEST:NOCAL', '2025-01-01', '2025-12-31', 5).source, 'UNAVAILABLE');
  assert.equal(computeRollSchedule('COMEX:GC', '2025-01-01', '2025-12-31', -1).source, 'UNAVAILABLE');
  assert.equal(computeRollSchedule('COMEX:GC', '2025-01-01', '2025-12-31', 99).source, 'UNAVAILABLE');
});

test('CALENDAR roll mode rolls on exchange roll dates and charges the same cost per roll as INTERVAL mode', async () => {
  const g = await gold();
  const candles = makeSeries(520, 11, 1.4);
  const hold = { slAtrMult: 4, tp1R: 5 };
  const calendar = runHistoricalBacktest(
    candles,
    cfg(g, { params: hold, rolloverMode: 'CALENDAR', rollBusinessDaysBefore: 5, rolloverCostPerContract: 3 })
  );
  assert.equal(calendar.valid, true);
  assert.equal(calendar.rollInfo?.mode, 'CALENDAR');
  assert.equal(calendar.rollInfo?.note, null);
  assert.ok((calendar.rollInfo?.rollDates.length ?? 0) > 3);
  assert.ok(calendar.metrics.rollCount >= 1, 'a long-held position must roll at least once');
  const interval = runHistoricalBacktest(candles, cfg(g, { params: hold, rolloverMode: 'INTERVAL', rolloverIntervalBars: 30, rolloverCostPerContract: 3 }));
  assert.equal(interval.rollInfo?.mode, 'INTERVAL');
  assert.ok(interval.metrics.rollCount >= 1);
  // 3 + 2 x commission 2.5 + 2 x slippage (1 tick x tickValue)
  const perRoll = calendar.metrics.totalRollCosts / calendar.metrics.rollCount;
  assert.ok(Math.abs(perRoll - interval.metrics.totalRollCosts / interval.metrics.rollCount) < 1e-9);
  assert.ok(Math.abs(calendar.metrics.totalRollCosts - calendar.trades.reduce((s, t) => s + t.rollCosts, 0)) < 1e-9);
  const none = runHistoricalBacktest(candles, cfg(g, { params: hold }));
  assert.equal(none.rollInfo?.mode, 'NONE');
  assert.equal(none.metrics.rollCount, 0);
});

test('every calendar roll falls on or after a roll date and never on the entry day', async () => {
  const g = await gold();
  const candles = makeSeries(520, 11, 1.4);
  const res = runHistoricalBacktest(
    candles,
    cfg(g, { params: { slAtrMult: 4, tp1R: 5 }, rolloverMode: 'CALENDAR', rollBusinessDaysBefore: 3 })
  );
  assert.equal(res.valid, true);
  const dates = res.rollInfo?.rollDates ?? [];
  assert.ok(dates.length > 0);
  for (const t of res.trades) {
    assert.ok(t.rollCount <= dates.filter((d) => d > t.entryTimestamp.slice(0, 10) && d <= t.exitTimestamp.slice(0, 10)).length);
  }
});

test('CALENDAR mode falls back to the fixed interval with a visible note when no calendar exists', async () => {
  const g = await gold();
  const noCal: InstrumentDefinition = { ...g, id: 'TEST:NOCAL' };
  const res = runHistoricalBacktest(
    makeSeries(300, 5),
    cfg(noCal, { rolloverMode: 'CALENDAR', rolloverIntervalBars: 25 })
  );
  assert.equal(res.valid, true);
  assert.equal(res.rollInfo?.requested, 'CALENDAR');
  assert.equal(res.rollInfo?.mode, 'INTERVAL');
  assert.equal(res.rollInfo?.intervalBars, 25);
  assert.match(res.rollInfo?.note ?? '', /fell back/);
  assert.match(res.disclosure.rollModel, /fell back/);
  const dflt = runHistoricalBacktest(makeSeries(300, 5), cfg(noCal, { rolloverMode: 'CALENDAR' }));
  assert.equal(dflt.rollInfo?.intervalBars, 20);
});

test('legacy rolloverIntervalBars without a mode still means INTERVAL', async () => {
  const res = runHistoricalBacktest(makeSeries(300, 5), cfg(await gold(), { rolloverIntervalBars: 20 }));
  assert.equal(res.rollInfo?.mode, 'INTERVAL');
  assert.equal(getParamSchema('TREND_FOLLOWING').length > 0, true);
});
