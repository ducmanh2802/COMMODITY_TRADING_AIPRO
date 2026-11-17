import type { StrategyId } from '../../src/shared/types/analysis.ts';
import type { InstrumentDefinition, Timeframe } from '../../src/shared/types/instrument.ts';
import type { MarketCandle } from '../../src/shared/types/market.ts';
import { validateCandleSeries } from '../../src/shared/utils/validation.ts';
import { analyzeTechnicalSnapshot } from './technicalEngine.ts';
import { evaluateStrategy, STRATEGY_CATALOG } from './strategyEngine.ts';

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
}

export interface BacktestTrade {
  tradeNumber: number;
  direction: 'LONG' | 'SHORT';
  entryTimestamp: string;
  entryPrice: number;
  exitTimestamp: string;
  exitPrice: number;
  exitReason: 'TAKE_PROFIT' | 'STOP_LOSS' | 'END_OF_DATA' | 'ROLLOVER_CLOSE';
  contracts: number;
  grossPnl: number;
  costs: number;
  netPnl: number;
  rMultiple: number;
}

export interface BacktestEquityPoint {
  timestamp: string;
  equity: number;
  drawdownPct: number;
}

export interface BacktestResult {
  valid: boolean;
  error?: string;
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
  };
  assumptions: {
    lookAheadPrevention: string;
    intrabarFillOrder: string;
    commissionPerContract: number;
    slippageTicks: number;
    tickSize: number;
    tickValue: number;
    rolloverIntervalBars: number | null;
    disclaimer: string;
  };
  equityCurve: BacktestEquityPoint[];
  trades: BacktestTrade[];
}

/**
 * Deterministic Historical Backtesting Engine.
 * Evaluates signals strictly on closed bar `i` and executes entries on bar `i + 1` open
 * with slippage and conservative worst-case intrabar stop-loss-first checking.
 */
export function runHistoricalBacktest(
  rawCandles: MarketCandle[],
  config: BacktestConfig
): BacktestResult {
  const spec = config.instrument.specification;
  if (
    spec.verificationStatus !== 'VERIFIED' ||
    spec.minimumTickSize === null ||
    spec.tickValue === null
  ) {
    return emptyBacktestFailure(
      config,
      `Contract specifications for ${config.instrument.id} are not verified.`
    );
  }

  const validation = validateCandleSeries(rawCandles);
  const completeCandles = validation.validCandles.filter((c) => c.isComplete);
  const strategyMeta = STRATEGY_CATALOG.find((s) => s.id === config.strategyId);
  const warmup = strategyMeta ? strategyMeta.minCandlesRequired : 55;

  if (!validation.valid || completeCandles.length < warmup + 5) {
    return emptyBacktestFailure(
      config,
      `Insufficient validated complete candles (${completeCandles.length} available, need >= ${warmup + 5}).`
    );
  }

  const tickSize = spec.minimumTickSize;
  const tickValue = spec.tickValue;
  const slippagePrice = Math.max(0, config.slippageTicks) * tickSize;
  const roundTripCommission = Math.max(0, config.commissionPerContract) * 2 * config.contractsPerTrade;

  let equity = config.initialEquity;
  let peakEquity = equity;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;

  const trades: BacktestTrade[] = [];
  const equityCurve: BacktestEquityPoint[] = [
    { timestamp: completeCandles[warmup].timestamp, equity, drawdownPct: 0 },
  ];

  interface OpenPosition {
    direction: 'LONG' | 'SHORT';
    entryTimestamp: string;
    entryPrice: number;
    entryBarIndex: number;
    stopLoss: number;
    takeProfit: number;
    initialRiskPerUnit: number;
  }

  let openPos: OpenPosition | null = null;
  let pendingSignal: { direction: 'LONG' | 'SHORT'; slDistance: number; tpDistance: number } | null = null;

  for (let i = warmup; i < completeCandles.length; i++) {
    const bar = completeCandles[i];

    // 1. Execute any pending signal from previous closed bar at current bar open
    if (!openPos && pendingSignal) {
      const fillPrice =
        pendingSignal.direction === 'LONG'
          ? bar.open + slippagePrice
          : bar.open - slippagePrice;

      const sl =
        pendingSignal.direction === 'LONG'
          ? fillPrice - pendingSignal.slDistance
          : fillPrice + pendingSignal.slDistance;
      const tp =
        pendingSignal.direction === 'LONG'
          ? fillPrice + pendingSignal.tpDistance
          : fillPrice - pendingSignal.tpDistance;

      openPos = {
        direction: pendingSignal.direction,
        entryTimestamp: bar.timestamp,
        entryPrice: fillPrice,
        entryBarIndex: i,
        stopLoss: sl,
        takeProfit: tp,
        initialRiskPerUnit: pendingSignal.slDistance,
      };
      pendingSignal = null;
    }

    // 2. Check open position exits conservatively (Stop Loss checked BEFORE Take Profit on same bar)
    if (openPos) {
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
      } else {
        if (bar.high >= openPos.stopLoss) {
          exitPrice = Math.max(bar.open, openPos.stopLoss) + slippagePrice;
          exitReason = 'STOP_LOSS';
        } else if (bar.low <= openPos.takeProfit) {
          exitPrice = Math.min(bar.open, openPos.takeProfit) + slippagePrice;
          exitReason = 'TAKE_PROFIT';
        }
      }

      // Optional contract rollover close
      if (
        !exitReason &&
        config.rolloverIntervalBars &&
        config.rolloverIntervalBars > 0 &&
        i - openPos.entryBarIndex >= config.rolloverIntervalBars
      ) {
        exitPrice =
          openPos.direction === 'LONG' ? bar.close - slippagePrice : bar.close + slippagePrice;
        exitReason = 'ROLLOVER_CLOSE';
      }

      if (!exitReason && i === completeCandles.length - 1) {
        exitPrice = bar.close;
        exitReason = 'END_OF_DATA';
      }

      if (exitPrice !== null && exitReason) {
        const priceDiff =
          openPos.direction === 'LONG'
            ? exitPrice - openPos.entryPrice
            : openPos.entryPrice - exitPrice;
        const grossPnl = (priceDiff / tickSize) * tickValue * config.contractsPerTrade;
        const rolloverFee =
          exitReason === 'ROLLOVER_CLOSE'
            ? (config.rolloverCostPerContract ?? 0) * config.contractsPerTrade
            : 0;
        const totalCosts = roundTripCommission + rolloverFee;
        const netPnl = grossPnl - totalCosts;

        const riskDollars =
          (openPos.initialRiskPerUnit / tickSize) * tickValue * config.contractsPerTrade;
        const rMultiple = riskDollars > 0 ? netPnl / riskDollars : 0;

        equity += netPnl;
        if (equity > peakEquity) peakEquity = equity;
        const dd = peakEquity - equity;
        const ddPct = peakEquity > 0 ? (dd / peakEquity) * 100 : 0;
        if (dd > maxDrawdown) maxDrawdown = dd;
        if (ddPct > maxDrawdownPct) maxDrawdownPct = ddPct;

        trades.push({
          tradeNumber: trades.length + 1,
          direction: openPos.direction,
          entryTimestamp: openPos.entryTimestamp,
          entryPrice: openPos.entryPrice,
          exitTimestamp: bar.timestamp,
          exitPrice,
          exitReason,
          contracts: config.contractsPerTrade,
          grossPnl,
          costs: totalCosts,
          netPnl,
          rMultiple,
        });

        equityCurve.push({
          timestamp: bar.timestamp,
          equity,
          drawdownPct: ddPct,
        });

        openPos = null;
        continue;
      }
    }

    // 3. Evaluate strategy strictly using bars [0..i] (zero look-ahead)
    if (!openPos && i < completeCandles.length - 1) {
      const slice = completeCandles.slice(0, i + 1);
      const snapshot = analyzeTechnicalSnapshot(
        slice,
        config.instrument.exchangeSymbol,
        config.instrument.exchange,
        config.timeframe
      );
      const evalRes = evaluateStrategy(config.strategyId, snapshot, slice);
      if (
        evalRes.confirmationStatus === 'CONFIRMED' &&
        (evalRes.direction === 'LONG' || evalRes.direction === 'SHORT') &&
        evalRes.stopLoss !== null &&
        evalRes.takeProfits.length > 0
      ) {
        const refEntry = snapshot.lastClose!;
        const slDistance = Math.abs(refEntry - evalRes.stopLoss);
        const tpDistance = Math.abs(evalRes.takeProfits[0] - refEntry);
        if (slDistance > 0 && tpDistance > 0) {
          pendingSignal = {
            direction: evalRes.direction,
            slDistance,
            tpDistance,
          };
        }
      }
    }
  }

  const grossProfit = trades
    .filter((t) => t.netPnl > 0)
    .reduce((acc, t) => acc + t.netPnl, 0);
  const grossLoss = Math.abs(
    trades.filter((t) => t.netPnl < 0).reduce((acc, t) => acc + t.netPnl, 0)
  );
  const netProfit = equity - config.initialEquity;
  const winCount = trades.filter((t) => t.netPnl > 0).length;
  const winRatePct = trades.length > 0 ? (winCount / trades.length) * 100 : 0;
  const profitFactor =
    grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? null : 0;
  const averageR =
    trades.length > 0
      ? trades.reduce((acc, t) => acc + t.rMultiple, 0) / trades.length
      : 0;
  const expectancy = trades.length > 0 ? netProfit / trades.length : 0;

  let sharpeRatio: number | null = null;
  if (trades.length >= 2) {
    const returns = trades.map((t) => t.netPnl / config.initialEquity);
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance =
      returns.reduce((acc, r) => acc + (r - mean) * (r - mean), 0) / (returns.length - 1);
    const std = Math.sqrt(variance);
    sharpeRatio = std > 0 ? (mean / std) * Math.sqrt(trades.length) : null;
  }

  return {
    valid: true,
    instrumentId: config.instrument.id,
    strategyId: config.strategyId,
    timeframe: config.timeframe,
    metrics: {
      netProfit,
      grossProfit,
      grossLoss,
      winRatePct,
      profitFactor,
      maxDrawdown,
      maxDrawdownPct,
      averageR,
      expectancy,
      sharpeRatio,
      tradeCount: trades.length,
      finalEquity: equity,
    },
    assumptions: {
      lookAheadPrevention: 'STRICT_BAR_CLOSE — Signals evaluated on bar[i] close and filled at bar[i+1] open.',
      intrabarFillOrder: 'Conservative: Stop Loss tested prior to Take Profit within each candle.',
      commissionPerContract: config.commissionPerContract,
      slippageTicks: config.slippageTicks,
      tickSize,
      tickValue,
      rolloverIntervalBars: config.rolloverIntervalBars ?? null,
      disclaimer:
        'Historical simulation on imported OHLCV data. Backtest results are not indicative or guaranteed of future performance.',
    },
    equityCurve,
    trades,
  };
}

function emptyBacktestFailure(config: BacktestConfig, error: string): BacktestResult {
  return {
    valid: false,
    error,
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
    },
    assumptions: {
      lookAheadPrevention: 'STRICT_BAR_CLOSE',
      intrabarFillOrder: 'Conservative SL-first',
      commissionPerContract: config.commissionPerContract,
      slippageTicks: config.slippageTicks,
      tickSize: config.instrument.specification.minimumTickSize ?? 0,
      tickValue: config.instrument.specification.tickValue ?? 0,
      rolloverIntervalBars: config.rolloverIntervalBars ?? null,
      disclaimer:
        'Historical simulation on imported OHLCV data. Backtest results are not indicative or guaranteed of future performance.',
    },
    equityCurve: [],
    trades: [],
  };
}
