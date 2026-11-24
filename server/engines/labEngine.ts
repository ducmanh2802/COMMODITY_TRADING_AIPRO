/**
 * Strategy Lab: walk-forward (out-of-sample) analysis and Monte Carlo bootstrap.
 * Education/research only - these are historical simulations, never promises about the future.
 *
 * Walk-forward: the usable bars [warmup, n-1] are split into an initial in-sample (IS) block plus
 * `folds` consecutive out-of-sample (OOS) windows of equal length. Parameters are chosen on the IS
 * window only (bounded grid, <= MAX_GRID_COMBOS) and then run unchanged on the next OOS window.
 * No bar of an OOS window is ever visible to the IS optimisation: IS ends at oosStart-1 and the
 * engine never reads past the bar it processes.
 */
import {
  metricsFromSimulation,
  PERIODS_PER_YEAR,
  prepareBacktest,
  simulateRange,
  type BacktestConfig,
  type BacktestEquityPoint,
} from './backtestEngine.ts';
import { getParamSchema, validateStrategyParams, type StrategyParams } from './strategyParams.ts';
import type { MarketCandle } from '../../src/shared/types/market.ts';

export const MAX_GRID_COMBOS = 50;
const MAX_VALUES_PER_PARAM = 7;
const MAX_WALK_FORWARD_BARS = 4000;
const MIN_OOS_BARS = 10;
export const MC_MAX_RUNS = 2000;
const MC_DEFAULT_RUNS = 1000;
const MC_MAX_TRADES = 2000;
const MC_MIN_TRADES = 5;

// ---------------------------------------------------------------------------------------------
// Grid + fold planning
// ---------------------------------------------------------------------------------------------

export type ParamGrid = Record<string, number[]>;

export type GridExpansion = { ok: true; combos: StrategyParams[] } | { ok: false; errors: string[] };

/** Cartesian product of the grid values on top of `base` params; every value is schema-validated. */
export function expandParamGrid(
  strategyId: BacktestConfig['strategyId'],
  base: StrategyParams,
  grid: ParamGrid | undefined
): GridExpansion {
  const keys = Object.keys(grid ?? {});
  if (!grid || keys.length === 0) return { ok: true, combos: [base] };
  const errors: string[] = [];
  const known = new Set(getParamSchema(strategyId).map((d) => d.key));
  let total = 1;
  for (const key of keys) {
    if (!known.has(key)) errors.push(`Unknown parameter "${key}" for ${strategyId}.`);
    const values = grid[key];
    if (!Array.isArray(values) || values.length === 0) {
      errors.push(`Grid for "${key}" must be a non-empty array.`);
      continue;
    }
    if (values.length > MAX_VALUES_PER_PARAM) {
      errors.push(`Grid for "${key}" has ${values.length} values (max ${MAX_VALUES_PER_PARAM}).`);
    }
    total *= Math.max(1, new Set(values).size);
  }
  if (errors.length > 0) return { ok: false, errors };
  if (total > MAX_GRID_COMBOS) {
    return { ok: false, errors: [`Grid has ${total} combinations (max ${MAX_GRID_COMBOS}).`] };
  }
  let combos: StrategyParams[] = [{}];
  for (const key of keys) {
    const values = [...new Set(grid[key])].sort((a, b) => a - b);
    const next: StrategyParams[] = [];
    for (const c of combos) for (const v of values) next.push({ ...c, [key]: v });
    combos = next;
  }
  const out: StrategyParams[] = [];
  for (const c of combos) {
    const v = validateStrategyParams(strategyId, { ...base, ...c });
    if (!v.ok) return { ok: false, errors: v.errors };
    out.push(v.params);
  }
  return { ok: true, combos: out };
}

interface FoldPlan {
  fold: number;
  isStart: number;
  isEnd: number;
  oosStart: number;
  oosEnd: number;
}

export type FoldPlanResult = { ok: true; folds: FoldPlan[]; isBars: number; oosBars: number } | { ok: false; reason: string };

/**
 * Split bar indices [rangeStart, rangeEnd] (inclusive). IS = isOosRatio x OOS (+ remainder); the
 * last OOS window ends exactly at rangeEnd. ROLLING keeps the IS length fixed; ANCHORED grows it
 * from rangeStart.
 */
export function planFolds(
  rangeStart: number,
  rangeEnd: number,
  folds: number,
  mode: 'ROLLING' | 'ANCHORED',
  isOosRatio: number
): FoldPlanResult {
  if (!Number.isInteger(folds) || folds < 2 || folds > 10) return { ok: false, reason: 'folds must be an integer 2-10.' };
  if (!(isOosRatio >= 1 && isOosRatio <= 8)) return { ok: false, reason: 'isOosRatio must be between 1 and 8.' };
  const total = rangeEnd - rangeStart + 1;
  const oosBars = Math.floor(total / (folds + isOosRatio));
  if (oosBars < MIN_OOS_BARS) {
    return { ok: false, reason: `Not enough bars (${total}) for ${folds} folds: each out-of-sample window needs >= ${MIN_OOS_BARS} bars.` };
  }
  const isBars = total - folds * oosBars;
  const plan: FoldPlan[] = [];
  for (let k = 0; k < folds; k++) {
    const oosStart = rangeStart + isBars + k * oosBars;
    plan.push({
      fold: k + 1,
      isStart: mode === 'ROLLING' ? oosStart - isBars : rangeStart,
      isEnd: oosStart - 1,
      oosStart,
      oosEnd: oosStart + oosBars - 1,
    });
  }
  return { ok: true, folds: plan, isBars, oosBars };
}

// ---------------------------------------------------------------------------------------------
// Walk-forward
// ---------------------------------------------------------------------------------------------

export interface WalkForwardOptions {
  folds?: number;
  mode?: 'ROLLING' | 'ANCHORED';
  /** IS length divided by OOS length. Default 3. */
  isOosRatio?: number;
  grid?: ParamGrid;
}

export interface FoldMetrics {
  netProfit: number;
  returnPct: number;
  tradeCount: number;
  winRatePct: number;
  profitFactor: number | null;
  maxDrawdownPct: number;
  expectancy: number;
}

interface WalkForwardFold {
  fold: number;
  isRange: { from: string; to: string; bars: number };
  oosRange: { from: string; to: string; bars: number };
  combosTested: number;
  bestParams: StrategyParams;
  inSample: FoldMetrics;
  outOfSample: FoldMetrics;
}

type OverfitLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'INSUFFICIENT' | 'NO_EDGE';

interface OverfitAssessment {
  level: OverfitLevel;
  /** Mean IS return per fold, rescaled to the OOS window length so the two are comparable. */
  isReturnPctPerOosWindow: number;
  oosReturnPct: number;
  /** oosReturn / isReturn (null when IS return <= 0). */
  efficiency: number | null;
  oosProfitableFolds: number;
  folds: number;
  oosTradeCount: number;
}

export interface WalkForwardResult {
  valid: boolean;
  error?: string;
  mode: 'ROLLING' | 'ANCHORED';
  isOosRatio: number;
  isBars: number;
  oosBars: number;
  combosPerFold: number;
  barsUsed: number;
  barsCapped: boolean;
  folds: WalkForwardFold[];
  stitchedOosEquity: Array<{ timestamp: string; equity: number }>;
  stitchedOos: { netProfit: number; returnPct: number; maxDrawdownPct: number; tradeCount: number };
  overfit: OverfitAssessment | null;
  disclaimer: string;
}

const WF_DISCLAIMER =
  'Walk-forward is still a historical simulation. Parameters chosen in-sample are applied unchanged to the next unseen window; this reduces, but does not remove, overfitting and is not a promise of future results.';

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

function foldMetrics(
  sim: ReturnType<typeof simulateRange>,
  initialEquity: number,
  periodsPerYear: number
): FoldMetrics {
  const m = metricsFromSimulation(sim, initialEquity, periodsPerYear);
  return {
    netProfit: m.netProfit,
    returnPct: initialEquity > 0 ? (m.netProfit / initialEquity) * 100 : 0,
    tradeCount: m.tradeCount,
    winRatePct: m.winRatePct,
    profitFactor: m.profitFactor,
    maxDrawdownPct: m.maxDrawdownPct,
    expectancy: m.expectancy,
  };
}

function assessOverfit(folds: WalkForwardFold[]): OverfitAssessment {
  const n = folds.length;
  const isScaled = folds.map((f) => f.inSample.returnPct * (f.oosRange.bars / Math.max(1, f.isRange.bars)));
  const isMean = n > 0 ? isScaled.reduce((a, b) => a + b, 0) / n : 0;
  const oosMean = n > 0 ? folds.reduce((a, f) => a + f.outOfSample.returnPct, 0) / n : 0;
  const oosTrades = folds.reduce((a, f) => a + f.outOfSample.tradeCount, 0);
  const efficiency = isMean > 0 ? oosMean / isMean : null;
  let level: OverfitLevel;
  if (oosTrades < 5) level = 'INSUFFICIENT';
  else if (isMean <= 0) level = 'NO_EDGE';
  else if (oosMean <= 0 || (efficiency !== null && efficiency < 0.3)) level = 'HIGH';
  else if (efficiency !== null && efficiency < 0.6) level = 'MEDIUM';
  else level = 'LOW';
  return {
    level,
    isReturnPctPerOosWindow: isMean,
    oosReturnPct: oosMean,
    efficiency,
    oosProfitableFolds: folds.filter((f) => f.outOfSample.netProfit > 0).length,
    folds: n,
    oosTradeCount: oosTrades,
  };
}

export async function runWalkForward(
  rawCandles: MarketCandle[],
  config: BacktestConfig,
  opts: WalkForwardOptions = {}
): Promise<WalkForwardResult> {
  const mode = opts.mode ?? 'ROLLING';
  const isOosRatio = opts.isOosRatio ?? 3;
  const fail = (error: string, extra: Partial<WalkForwardResult> = {}): WalkForwardResult => ({
    valid: false,
    error,
    mode,
    isOosRatio,
    isBars: 0,
    oosBars: 0,
    combosPerFold: 0,
    barsUsed: 0,
    barsCapped: false,
    folds: [],
    stitchedOosEquity: [],
    stitchedOos: { netProfit: 0, returnPct: 0, maxDrawdownPct: 0, tradeCount: 0 },
    overfit: null,
    disclaimer: WF_DISCLAIMER,
    ...extra,
  });

  const barsCapped = rawCandles.length > MAX_WALK_FORWARD_BARS;
  const candlesIn = barsCapped ? rawCandles.slice(-MAX_WALK_FORWARD_BARS) : rawCandles;
  const ctx = prepareBacktest(candlesIn, config);
  if ('error' in ctx) return fail(ctx.error);

  const grid = expandParamGrid(config.strategyId, ctx.params, opts.grid);
  if (!grid.ok) return fail(grid.errors.join(' '));
  const plan = planFolds(ctx.warmup, ctx.candles.length - 1, opts.folds ?? 4, mode, isOosRatio);
  if (!plan.ok) return fail(plan.reason);

  // Fill the shared snapshot cache in chunks so the event loop stays responsive.
  for (let i = ctx.warmup; i < ctx.candles.length; i++) {
    ctx.snapshotAt(i);
    if ((i - ctx.warmup) % 60 === 59) await tick();
  }

  const periodsPerYear = PERIODS_PER_YEAR[config.timeframe] ?? 252;
  const ts = (i: number) => ctx.candles[i].timestamp;
  const folds: WalkForwardFold[] = [];
  const stitched: Array<{ timestamp: string; equity: number }> = [];
  let base = config.initialEquity;
  let peak = base;
  let stitchedMaxDd = 0;
  let stitchedTrades = 0;

  for (const f of plan.folds) {
    let best: { params: StrategyParams; net: number; sim: ReturnType<typeof simulateRange> } | null = null;
    for (const combo of grid.combos) {
      const sim = simulateRange(ctx, combo, f.isStart, f.isEnd);
      const net = sim.finalEquity - config.initialEquity;
      // Prefer the highest in-sample net profit; combos with no trades never beat one that traded.
      const eligible = sim.trades.length > 0;
      if (!best || (eligible && (best.sim.trades.length === 0 || net > best.net))) {
        best = { params: combo, net, sim };
      }
      await tick();
    }
    const chosen = best!;
    const oosSim = simulateRange(ctx, chosen.params, f.oosStart, f.oosEnd);
    const oosMetrics = foldMetrics(oosSim, config.initialEquity, periodsPerYear);
    folds.push({
      fold: f.fold,
      isRange: { from: ts(Math.max(f.isStart, ctx.warmup)), to: ts(f.isEnd), bars: f.isEnd - Math.max(f.isStart, ctx.warmup) + 1 },
      oosRange: { from: ts(f.oosStart), to: ts(f.oosEnd), bars: f.oosEnd - f.oosStart + 1 },
      combosTested: grid.combos.length,
      bestParams: chosen.params,
      inSample: foldMetrics(chosen.sim, config.initialEquity, periodsPerYear),
      outOfSample: oosMetrics,
    });
    for (const p of oosSim.equityCurve as BacktestEquityPoint[]) {
      const eq = base + (p.equity - config.initialEquity);
      stitched.push({ timestamp: p.timestamp, equity: eq });
      if (eq > peak) peak = eq;
      const dd = peak > 0 ? ((peak - eq) / peak) * 100 : 0;
      if (dd > stitchedMaxDd) stitchedMaxDd = dd;
    }
    base += oosSim.finalEquity - config.initialEquity;
    stitchedTrades += oosSim.trades.length;
  }

  const netProfit = base - config.initialEquity;
  return {
    valid: true,
    mode,
    isOosRatio,
    isBars: plan.isBars,
    oosBars: plan.oosBars,
    combosPerFold: grid.combos.length,
    barsUsed: ctx.candles.length,
    barsCapped,
    folds,
    stitchedOosEquity: stitched,
    stitchedOos: {
      netProfit,
      returnPct: config.initialEquity > 0 ? (netProfit / config.initialEquity) * 100 : 0,
      maxDrawdownPct: stitchedMaxDd,
      tradeCount: stitchedTrades,
    },
    overfit: assessOverfit(folds),
    disclaimer: WF_DISCLAIMER,
  };
}

// ---------------------------------------------------------------------------------------------
// Monte Carlo
// ---------------------------------------------------------------------------------------------

/** Small, fast, seedable PRNG (mulberry32). Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Linear-interpolated percentile (q in 0..100) of an ascending-sorted array. */
export function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (Math.min(100, Math.max(0, q)) / 100) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export interface Band {
  p5: number;
  p50: number;
  p95: number;
  mean: number;
}

export interface MonteCarloOptions {
  runs?: number;
  seed?: number;
  /** Report P(max drawdown > this %). */
  drawdownThresholdPct?: number;
}

export interface MonteCarloResult {
  valid: boolean;
  error?: string;
  runs: number;
  seed: number;
  tradeCount: number;
  tradesCapped: boolean;
  initialEquity: number;
  drawdownThresholdPct: number;
  finalReturnPct: Band;
  maxDrawdownPct: Band;
  expectancy: Band;
  probDrawdownAbove: number;
  probLoss: number;
  /** Final-return histogram (equal-width bins). */
  histogram: Array<{ from: number; to: number; count: number }>;
  /** Equity percentile bands after k resampled trades (k sampled at <= 41 points). */
  equityBands: Array<{ trade: number; p5: number; p50: number; p95: number }>;
  method: string;
  disclaimer: string;
}

const MC_DISCLAIMER =
  'Bootstrap of past trades with replacement. It assumes trades are independent and drawn from the same distribution as the backtest; real markets change. A distribution of simulated outcomes, not a forecast.';

function band(values: number[]): Band {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p5: percentile(sorted, 5),
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    mean: values.reduce((a, b) => a + b, 0) / values.length,
  };
}

export function runMonteCarlo(
  tradePnls: number[],
  initialEquity: number,
  opts: MonteCarloOptions = {}
): MonteCarloResult {
  const runs = Math.min(MC_MAX_RUNS, Math.max(1, Math.trunc(opts.runs ?? MC_DEFAULT_RUNS)));
  const seed = opts.seed ?? 20260101;
  const ddThreshold = opts.drawdownThresholdPct ?? 20;
  const empty = (error: string): MonteCarloResult => {
    const zero: Band = { p5: 0, p50: 0, p95: 0, mean: 0 };
    return {
      valid: false,
      error,
      runs,
      seed,
      tradeCount: tradePnls.length,
      tradesCapped: false,
      initialEquity,
      drawdownThresholdPct: ddThreshold,
      finalReturnPct: zero,
      maxDrawdownPct: zero,
      expectancy: zero,
      probDrawdownAbove: 0,
      probLoss: 0,
      histogram: [],
      equityBands: [],
      method: '',
      disclaimer: MC_DISCLAIMER,
    };
  };
  if (!(initialEquity > 0)) return empty('initialEquity must be positive.');
  if (tradePnls.length < MC_MIN_TRADES) {
    return empty(`Need at least ${MC_MIN_TRADES} trades for a meaningful Monte Carlo (got ${tradePnls.length}).`);
  }
  const tradesCapped = tradePnls.length > MC_MAX_TRADES;
  const pnls = tradesCapped ? tradePnls.slice(-MC_MAX_TRADES) : tradePnls;
  const n = pnls.length;
  const rand = mulberry32(seed);

  const sampleSteps = new Set<number>();
  const stepCount = Math.min(40, n);
  for (let s = 0; s <= stepCount; s++) sampleSteps.add(Math.round((s / stepCount) * n));
  const stepList = [...sampleSteps].sort((a, b) => a - b);
  const stepValues: number[][] = stepList.map(() => []);

  const finals: number[] = [];
  const dds: number[] = [];
  const exps: number[] = [];
  let ddExceed = 0;
  let losses = 0;

  for (let r = 0; r < runs; r++) {
    let eq = initialEquity;
    let peak = eq;
    let maxDd = 0;
    let sum = 0;
    let nextStep = 0;
    if (stepList[0] === 0) {
      stepValues[0].push(eq);
      nextStep = 1;
    }
    for (let k = 1; k <= n; k++) {
      const pnl = pnls[Math.floor(rand() * n)];
      eq += pnl;
      sum += pnl;
      if (eq > peak) peak = eq;
      const dd = peak > 0 ? ((peak - eq) / peak) * 100 : 100;
      if (dd > maxDd) maxDd = dd;
      if (nextStep < stepList.length && stepList[nextStep] === k) {
        stepValues[nextStep].push(eq);
        nextStep += 1;
      }
    }
    finals.push(((eq - initialEquity) / initialEquity) * 100);
    dds.push(maxDd);
    exps.push(sum / n);
    if (maxDd > ddThreshold) ddExceed += 1;
    if (eq < initialEquity) losses += 1;
  }

  const lo = Math.min(...finals);
  const hi = Math.max(...finals);
  const bins = 20;
  const width = (hi - lo) / bins || 1;
  const histogram = Array.from({ length: bins }, (_, b) => ({ from: lo + b * width, to: lo + (b + 1) * width, count: 0 }));
  for (const v of finals) histogram[Math.min(bins - 1, Math.floor((v - lo) / width))].count += 1;

  return {
    valid: true,
    runs,
    seed,
    tradeCount: n,
    tradesCapped,
    initialEquity,
    drawdownThresholdPct: ddThreshold,
    finalReturnPct: band(finals),
    maxDrawdownPct: band(dds),
    expectancy: band(exps),
    probDrawdownAbove: ddExceed / runs,
    probLoss: losses / runs,
    histogram,
    equityBands: stepList.map((trade, idx) => {
      const sorted = [...stepValues[idx]].sort((a, b) => a - b);
      return { trade, p5: percentile(sorted, 5), p50: percentile(sorted, 50), p95: percentile(sorted, 95) };
    }),
    method: `Bootstrap with replacement, ${runs} runs of ${n} trades each, seed ${seed}.`,
    disclaimer: MC_DISCLAIMER,
  };
}
