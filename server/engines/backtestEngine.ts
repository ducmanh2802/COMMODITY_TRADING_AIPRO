/**
 * PRIMARY backtest engine (used by POST /api/backtest/run and the BacktestView).
 *
 * Execution model (all deterministic, no randomness):
 * - Signals are evaluated on CLOSED bar i using only bars [0..i]; an entry is filled at the OPEN of
 *   bar i+1 (never at bar i's close) +/- slippage. No signal is evaluated on the last bar.
 * - Exits: stop-loss is checked before take-profit inside a bar (conservative). A gap through the
 *   level fills at the bar open. END_OF_DATA closes at the last close. Every fill pays slippage.
 * - Costs: commission per contract per side (entry and exit), slippage in ticks per fill.
 * - Rolls (optional `rolloverIntervalBars`): every N bars an open position is ROLLED, not closed:
 *   it stays open on the continuous series and pays rolloverCostPerContract + 2 x commission + 2 x
 *   slippage (two legs) per contract. The roll schedule is a fixed bar interval, not the exchange
 *   calendar - an approximation disclosed in `disclosure`.
 * - Equity is marked to market at every bar close; drawdown and Sharpe use that curve.
 */
import type { StrategyId } from '../../src/shared/types/analysis.ts';
import type { InstrumentDefinition, Timeframe } from '../../src/shared/types/instrument.ts';
import type { MarketCandle } from '../../src/shared/types/market.ts';
import { validateCandleSeries } from '../../src/shared/utils/validation.ts';
import { analyzeTechnicalSnapshot } from './technicalEngine.ts';
import { evaluateStrategy, STRATEGY_CATALOG } from './strategyEngine.ts';

export const BACKTEST_ENGINE_VERSION = '2.0.0';

export interface BacktestDataProvenance {
  origin: 'SQLITE' | 'MEMORY' | 'NONE' | 'TEST';
  source: string | null;
  warnings: string[];
}

export interface BacktestConfig {
  instrument: InstrumentDefinition;
  strategyId: StrategyId;
  timeframe: Timeframe;
  initialEquity: number;
  contractsPerTrade: number;
  commissionPerContract: number;
  slippageTicks: number;
  rolloverIntervalBars?: number;
  rolloverCostPerContract?: number;
  /** Where the candles came from (echoed in `disclosure`). */
  dataProvenance?: BacktestDataProvenance;
}

export interface BacktestTrade {
  tradeNumber: number;
  direction: 'LONG' | 'SHORT';
  /** Bar whose close produced the signal. */
  signalTimestamp: string;
  entryTimestamp: string;
  entryPrice: number;
  exitTimestamp: string;
  exitPrice: number;
  exitReason: 'TAKE_PROFIT' | 'STOP_LOSS' | 'END_OF_DATA';
  contracts: number;
  rollCount: number;
  grossPnl: number;
  /** commission (both sides) + roll costs; slippage is already inside entry/exit prices. */
  costs: number;
  rollCosts: number;
  netPnl: number;
  rMultiple: number;
}

export interface BacktestEquityPoint {
  timestamp: string;
  equity: number;
  drawdownPct: number;
}

export interface BacktestMetricDefinition {
  name: string;
  formula: string;
}

export interface BacktestResult {
  valid: boolean;
  error?: string;
  engine: { id: 'server/engines/backtestEngine.ts'; version: string };
  instrumentId: string;
  strategyId: StrategyId;
  timeframe: Timeframe;
  metrics: {
    netProfit: number;
    grossProfit: number;
    grossLoss: number;
    winRatePct: number;
    profitFactor: number | null;
    maxDrawdown: number;
    maxDrawdownPct: number;
    averageR: number;
    expectancy: number;
    sharpeRatio: number | null;
    tradeCount: number;
    finalEquity: number;
    totalCommission: number;
    totalRollCosts: number;
    totalSlippageCost: number;
    rollCount: number;
    exposurePct: number;
  };
  metricDefinitions: BacktestMetricDefinition[];
  assumptions: {
    lookAheadPrevention: string;
    intrabarFillOrder: string;
    commissionPerContract: number;
    slippageTicks: number;
    tickSize: number;
    tickValue: number;
    rolloverIntervalBars: number | null;
    rolloverCostPerContract: number;
    disclaimer: string;
  };
  disclosure: {
    dataOrigin: BacktestDataProvenance['origin'];
    dataSource: string | null;
    barCount: number;
    firstBar: string | null;
    lastBar: string | null;
    warmupBars: number;
    fillModel: string;
    costModel: string;
    rollModel: string;
    annualizationPeriodsPerYear: number;
    limitations: string[];
    dataWarnings: string[];
    notInvestmentAdvice: string;
  };
  equityCurve: BacktestEquityPoint[];
  trades: BacktestTrade[];
}

const DISCLAIMER =
  'Historical simulation on stored OHLCV data. Backtest results are not indicative or guaranteed of future performance.';

/** Approximate bars per year used to annualize Sharpe (futures trade ~23h/day, 252 days/year). */
export const PERIODS_PER_YEAR: Record<Timeframe, number> = {
  M1: 252 * 23 * 60,
  M5: 252 * 23 * 12,
  M15: 252 * 23 * 4,
  M30: 252 * 23 * 2,
  H1: 252 * 23,
  H4: 252 * 6,
  D1: 252,
  W1: 52,
};

export const METRIC_DEFINITIONS: BacktestMetricDefinition[] = [
  { name: 'netProfit', formula: 'finalEquity - initialEquity (after commission, slippage and roll costs)' },
  { name: 'grossProfit / grossLoss', formula: 'sum of netPnl of winning trades / |sum of netPnl of losing trades|' },
  { name: 'winRatePct', formula: '100 * (#trades with netPnl > 0) / #trades' },
  { name: 'profitFactor', formula: 'grossProfit / grossLoss; null when grossLoss = 0 and grossProfit > 0' },
  { name: 'maxDrawdown / maxDrawdownPct', formula: 'max over bars of (runningPeak - equity) and 100 * that / runningPeak, on the mark-to-market equity curve' },
  { name: 'averageR', formula: 'mean of netPnl / initialRiskDollars, initialRisk = |entry - stop| / tickSize * tickValue * contracts' },
  { name: 'expectancy', formula: 'netProfit / #trades (currency per trade)' },
  { name: 'sharpeRatio', formula: 'mean(r) / stdev(r) * sqrt(periodsPerYear), r = bar-to-bar simple return of mark-to-market equity, risk-free rate 0, sample stdev; null if < 2 returns or stdev = 0' },
  { name: 'exposurePct', formula: '100 * bars with an open position / bars simulated' },
  { name: 'totalSlippageCost', formula: 'sum over fills of slippageTicks * tickValue * contracts (already inside fill prices)' },
];

interface OpenPosition {
  direction: 'LONG' | 'SHORT';
  signalTimestamp: string;
  entryTimestamp: string;
  entryPrice: number;
  barsSinceRoll: number;
  stopLoss: number;
  takeProfit: number;
  initialRiskPerUnit: number;
  rollCount: number;
  rollCosts: number;
  commission: number;
}

export function runHistoricalBacktest(rawCandles: MarketCandle[], config: BacktestConfig): BacktestResult {
  const spec = config.instrument.specification;
  if (spec.verificationStatus !== 'VERIFIED' || spec.minimumTickSize === null || spec.tickValue === null) {
    return emptyBacktestFailure(config, `Contract specifications for ${config.instrument.id} are not verified.`);
  }

  const validation = validateCandleSeries(rawCandles);
  const candles = validation.validCandles.filter((c) => c.isComplete);
  const strategyMeta = STRATEGY_CATALOG.find((s) => s.id === config.strategyId);
  const warmup = strategyMeta ? strategyMeta.minCandlesRequired : 55;

  if (!validation.valid || candles.length < warmup + 5) {
    return emptyBacktestFailure(
      config,
      `Insufficient validated complete candles (${candles.length} available, need >= ${warmup + 5}).`
    );
  }

  const tickSize = spec.minimumTickSize;
  const tickValue = spec.tickValue;
  const qty = config.contractsPerTrade;
  const slippagePrice = Math.max(0, config.slippageTicks) * tickSize;
  const slippageCostPerFill = Math.max(0, config.slippageTicks) * tickValue * qty;
  const commissionPerSide = Math.max(0, config.commissionPerContract) * qty;
  const rollInterval = config.rolloverIntervalBars && config.rolloverIntervalBars > 0 ? config.rolloverIntervalBars : null;
  const rollCostPerRoll =
    (Math.max(0, config.rolloverCostPerContract ?? 0) * qty) + 2 * commissionPerSide + 2 * slippageCostPerFill;
  const pointValue = tickValue / tickSize; // currency per 1.0 price move per contract

  let realized = config.initialEquity; // cash equity: realized P&L minus all costs paid so far
  let peak = config.initialEquity;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;
  let totalCommission = 0;
  let totalRollCosts = 0;
  let totalSlippageCost = 0;
  let totalRolls = 0;
  let barsInMarket = 0;

  const trades: BacktestTrade[] = [];
  const equityCurve: BacktestEquityPoint[] = [];
  let openPos: OpenPosition | null = null;
  let pending: { direction: 'LONG' | 'SHORT'; slDistance: number; tpDistance: number; signalTimestamp: string } | null = null;

  const markToMarket = (close: number): number => {
    if (!openPos) return realized;
    const diff = openPos.direction === 'LONG' ? close - openPos.entryPrice : openPos.entryPrice - close;
    return realized + diff * pointValue * qty;
  };

  for (let i = warmup; i < candles.length; i++) {
    const bar = candles[i];

    // 1. Fill the pending signal (from bar i-1's close) at this bar's open.
    if (!openPos && pending) {
      const fill = pending.direction === 'LONG' ? bar.open + slippagePrice : bar.open - slippagePrice;
      openPos = {
        direction: pending.direction,
        signalTimestamp: pending.signalTimestamp,
        entryTimestamp: bar.timestamp,
        entryPrice: fill,
        barsSinceRoll: 0,
        stopLoss: pending.direction === 'LONG' ? fill - pending.slDistance : fill + pending.slDistance,
        takeProfit: pending.direction === 'LONG' ? fill + pending.tpDistance : fill - pending.tpDistance,
        initialRiskPerUnit: pending.slDistance,
        rollCount: 0,
        rollCosts: 0,
        commission: commissionPerSide,
      };
      realized -= commissionPerSide;
      totalCommission += commissionPerSide;
      totalSlippageCost += slippageCostPerFill;
      pending = null;
    }

    let closedThisBar = false;
    if (openPos) {
      barsInMarket += 1;
      // 2. Exits: stop-loss before take-profit (conservative); gaps fill at the open.
      let exitPrice: number | null = null;
      let exitReason: BacktestTrade['exitReason'] | null = null;
      if (openPos.direction === 'LONG') {
        if (bar.low <= openPos.stopLoss) {
          exitPrice = Math.min(bar.open, openPos.stopLoss) - slippagePrice;
          exitReason = 'STOP_LOSS';
        } else if (bar.high >= openPos.takeProfit) {
          exitPrice = Math.max(bar.open, openPos.takeProfit) - slippagePrice;
          exitReason = 'TAKE_PROFIT';
        }
      } else if (bar.high >= openPos.stopLoss) {
        exitPrice = Math.max(bar.open, openPos.stopLoss) + slippagePrice;
        exitReason = 'STOP_LOSS';
      } else if (bar.low <= openPos.takeProfit) {
        exitPrice = Math.min(bar.open, openPos.takeProfit) + slippagePrice;
        exitReason = 'TAKE_PROFIT';
      }
      if (!exitReason && i === candles.length - 1) {
        exitPrice = openPos.direction === 'LONG' ? bar.close - slippagePrice : bar.close + slippagePrice;
        exitReason = 'END_OF_DATA';
      }

      if (exitPrice !== null && exitReason) {
        const diff = openPos.direction === 'LONG' ? exitPrice - openPos.entryPrice : openPos.entryPrice - exitPrice;
        const grossPnl = diff * pointValue * qty;
        realized += grossPnl - commissionPerSide;
        totalCommission += commissionPerSide;
        totalSlippageCost += slippageCostPerFill;
        const costs = openPos.commission + commissionPerSide + openPos.rollCosts;
        const netPnl = grossPnl - costs;
        const riskDollars = openPos.initialRiskPerUnit * pointValue * qty;
        trades.push({
          tradeNumber: trades.length + 1,
          direction: openPos.direction,
          signalTimestamp: openPos.signalTimestamp,
          entryTimestamp: openPos.entryTimestamp,
          entryPrice: openPos.entryPrice,
          exitTimestamp: bar.timestamp,
          exitPrice,
          exitReason,
          contracts: qty,
          rollCount: openPos.rollCount,
          grossPnl,
          costs,
          rollCosts: openPos.rollCosts,
          netPnl,
          rMultiple: riskDollars > 0 ? netPnl / riskDollars : 0,
        });
        openPos = null;
        closedThisBar = true;
      } else if (rollInterval !== null) {
        // 3. Roll in place at the bar close when the interval elapses (position stays open).
        openPos.barsSinceRoll += 1;
        if (openPos.barsSinceRoll >= rollInterval) {
          openPos.barsSinceRoll = 0;
          openPos.rollCount += 1;
          openPos.rollCosts += rollCostPerRoll;
          realized -= rollCostPerRoll;
          totalRollCosts += rollCostPerRoll;
          totalRolls += 1;
        }
      }
    }

    // 4. Signal on this CLOSED bar using bars [0..i] only; filled next bar (none on the last bar).
    if (!openPos && !closedThisBar && i < candles.length - 1) {
      const slice = candles.slice(0, i + 1);
      const snapshot = analyzeTechnicalSnapshot(slice, config.instrument.exchangeSymbol, config.instrument.exchange, config.timeframe);
      const evalRes = evaluateStrategy(config.strategyId, snapshot, slice);
      if (
        evalRes.confirmationStatus === 'CONFIRMED' &&
        (evalRes.direction === 'LONG' || evalRes.direction === 'SHORT') &&
        evalRes.stopLoss !== null &&
        evalRes.takeProfits.length > 0 &&
        snapshot.lastClose !== null
      ) {
        const ref = snapshot.lastClose;
        const slDistance = Math.abs(ref - evalRes.stopLoss);
        const tpDistance = Math.abs(evalRes.takeProfits[0] - ref);
        if (slDistance > 0 && tpDistance > 0) {
          pending = { direction: evalRes.direction, slDistance, tpDistance, signalTimestamp: bar.timestamp };
        }
      }
    }

    // 5. Mark to market at the close.
    const equity = markToMarket(bar.close);
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    const ddPct = peak > 0 ? (dd / peak) * 100 : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;
    if (ddPct > maxDrawdownPct) maxDrawdownPct = ddPct;
    equityCurve.push({ timestamp: bar.timestamp, equity, drawdownPct: ddPct });
  }

  const finalEquity = realized; // every position is closed by END_OF_DATA
  const grossProfit = trades.filter((t) => t.netPnl > 0).reduce((a, t) => a + t.netPnl, 0);
  const grossLoss = Math.abs(trades.filter((t) => t.netPnl < 0).reduce((a, t) => a + t.netPnl, 0));
  const netProfit = finalEquity - config.initialEquity;
  const wins = trades.filter((t) => t.netPnl > 0).length;
  const periodsPerYear = PERIODS_PER_YEAR[config.timeframe] ?? 252;

  return {
    valid: true,
    engine: { id: 'server/engines/backtestEngine.ts', version: BACKTEST_ENGINE_VERSION },
    instrumentId: config.instrument.id,
    strategyId: config.strategyId,
    timeframe: config.timeframe,
    metrics: {
      netProfit,
      grossProfit,
      grossLoss,
      winRatePct: trades.length > 0 ? (wins / trades.length) * 100 : 0,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? null : 0,
      maxDrawdown,
      maxDrawdownPct,
      averageR: trades.length > 0 ? trades.reduce((a, t) => a + t.rMultiple, 0) / trades.length : 0,
      expectancy: trades.length > 0 ? netProfit / trades.length : 0,
      sharpeRatio: sharpeFromEquity(equityCurve.map((p) => p.equity), periodsPerYear),
      tradeCount: trades.length,
      finalEquity,
      totalCommission,
      totalRollCosts,
      totalSlippageCost,
      rollCount: totalRolls,
      exposurePct: equityCurve.length > 0 ? (barsInMarket / equityCurve.length) * 100 : 0,
    },
    metricDefinitions: METRIC_DEFINITIONS,
    assumptions: assumptionsFor(config, tickSize, tickValue),
    disclosure: disclosureFor(config, candles, warmup, periodsPerYear, validation.warnings ?? []),
    equityCurve,
    trades,
  };
}

/** Annualized Sharpe of bar-to-bar simple returns of an equity series (risk-free 0, sample stdev). */
export function sharpeFromEquity(equity: number[], periodsPerYear: number): number | null {
  const r: number[] = [];
  for (let k = 1; k < equity.length; k++) {
    if (equity[k - 1] > 0) r.push(equity[k] / equity[k - 1] - 1);
  }
  if (r.length < 2) return null;
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  const variance = r.reduce((a, x) => a + (x - mean) ** 2, 0) / (r.length - 1);
  const sd = Math.sqrt(variance);
  return sd > 0 ? (mean / sd) * Math.sqrt(periodsPerYear) : null;
}

function assumptionsFor(config: BacktestConfig, tickSize: number, tickValue: number): BacktestResult['assumptions'] {
  return {
    lookAheadPrevention: 'STRICT_BAR_CLOSE — Signals evaluated on bar[i] close using bars [0..i] and filled at bar[i+1] open.',
    intrabarFillOrder: 'Conservative: Stop Loss tested prior to Take Profit within each candle; gaps fill at the open.',
    commissionPerContract: config.commissionPerContract,
    slippageTicks: config.slippageTicks,
    tickSize,
    tickValue,
    rolloverIntervalBars: config.rolloverIntervalBars ?? null,
    rolloverCostPerContract: config.rolloverCostPerContract ?? 0,
    disclaimer: DISCLAIMER,
  };
}

function disclosureFor(
  config: BacktestConfig,
  candles: MarketCandle[],
  warmup: number,
  periodsPerYear: number,
  validationWarnings: string[]
): BacktestResult['disclosure'] {
  const prov = config.dataProvenance ?? { origin: 'NONE' as const, source: null, warnings: [] };
  return {
    dataOrigin: prov.origin,
    dataSource: prov.source,
    barCount: candles.length,
    firstBar: candles[0]?.timestamp ?? null,
    lastBar: candles[candles.length - 1]?.timestamp ?? null,
    warmupBars: warmup,
    fillModel: 'Next-bar-open entries; stop-loss before take-profit inside a bar; gap fills at the open; END_OF_DATA at last close.',
    costModel: `Commission ${config.commissionPerContract} per contract per side; slippage ${config.slippageTicks} tick(s) per fill.`,
    rollModel: config.rolloverIntervalBars
      ? `Roll in place every ${config.rolloverIntervalBars} bars: ${config.rolloverCostPerContract ?? 0} per contract + 2 x commission + 2 x slippage (two legs). Fixed interval, not the exchange expiry calendar.`
      : 'No roll costs modeled (rolloverIntervalBars not set).',
    annualizationPeriodsPerYear: periodsPerYear,
    limitations: [
      'Single instrument, fixed contract count; no margin calls, financing or position limits.',
      'Fills assume liquidity at the bar open/stop level; limit-locked or illiquid sessions are not modeled.',
      'Continuous series: UNADJUSTED data contains roll gaps that appear as P&L; BACK/RATIO-adjusted prices are not tradeable levels.',
      'Strategy parameters were not optimized out-of-sample; results are in-sample.',
    ],
    dataWarnings: [...prov.warnings, ...validationWarnings],
    notInvestmentAdvice: DISCLAIMER,
  };
}

function emptyBacktestFailure(config: BacktestConfig, error: string): BacktestResult {
  const tickSize = config.instrument.specification.minimumTickSize ?? 0;
  const tickValue = config.instrument.specification.tickValue ?? 0;
  return {
    valid: false,
    error,
    engine: { id: 'server/engines/backtestEngine.ts', version: BACKTEST_ENGINE_VERSION },
    instrumentId: config.instrument.id,
    strategyId: config.strategyId,
    timeframe: config.timeframe,
    metrics: {
      netProfit: 0,
      grossProfit: 0,
      grossLoss: 0,
      winRatePct: 0,
      profitFactor: null,
      maxDrawdown: 0,
      maxDrawdownPct: 0,
      averageR: 0,
      expectancy: 0,
      sharpeRatio: null,
      tradeCount: 0,
      finalEquity: config.initialEquity,
      totalCommission: 0,
      totalRollCosts: 0,
      totalSlippageCost: 0,
      rollCount: 0,
      exposurePct: 0,
    },
    metricDefinitions: METRIC_DEFINITIONS,
    assumptions: assumptionsFor(config, tickSize, tickValue),
    disclosure: disclosureFor(config, [], 0, PERIODS_PER_YEAR[config.timeframe] ?? 252, []),
    equityCurve: [],
    trades: [],
  };
}
