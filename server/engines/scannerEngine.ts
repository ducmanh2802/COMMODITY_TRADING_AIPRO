import type { TradeScannerOpportunity } from '../../src/shared/types/analysis.ts';
import type {
  ExchangeCode,
  InstrumentDefinition,
  ProductCategory,
  Timeframe,
  TradingStyle,
} from '../../src/shared/types/instrument.ts';
import { historicalCandleStore } from '../services/candleStore.ts';
import { analyzeTechnicalSnapshot } from './technicalEngine.ts';
import { evaluateAllStrategies } from './strategyEngine.ts';

export interface ScannerFilterConfig {
  category?: ProductCategory;
  exchange?: ExchangeCode;
  tradingStyle: TradingStyle;
  timeframe: Timeframe;
  minRiskReward: number;
  minSetupScore: number;
  maxVolatilityAtrPct?: number;
}

export interface ScannerResult {
  scannedAt: string;
  tradingStyle: TradingStyle;
  timeframe: Timeframe;
  opportunities: TradeScannerOpportunity[];
  unavailableInstruments: Array<{ symbol: string; exchange: ExchangeCode; reason: string }>;
}

/** Candle lookup used by the scanner; defaults to the in-memory store. app.ts passes SQLite-first data. */
export type ScannerCandleLookup = (
  inst: InstrumentDefinition,
  timeframe: Timeframe
) => ReturnType<typeof historicalCandleStore.getCandles>;

export function runTradeScanner(
  instruments: InstrumentDefinition[],
  config: ScannerFilterConfig,
  candleLookup: ScannerCandleLookup = (inst, tf) => historicalCandleStore.getCandles(inst.exchangeSymbol, tf)
): ScannerResult {
  const opportunities: TradeScannerOpportunity[] = [];
  const unavailableInstruments: Array<{ symbol: string; exchange: ExchangeCode; reason: string }> = [];

  for (const inst of instruments) {
    if (!inst.enabled) continue;
    if (config.category && inst.category !== config.category) continue;
    if (config.exchange && inst.exchange !== config.exchange) continue;

    const candleRes = candleLookup(inst, config.timeframe);
    if (candleRes.status === 'UNAVAILABLE' || candleRes.status === 'INVALID' || candleRes.candles.length === 0) {
      unavailableInstruments.push({
        symbol: inst.exchangeSymbol,
        exchange: inst.exchange,
        reason: candleRes.reason ?? 'DATA_UNAVAILABLE',
      });
      continue;
    }

    const snapshot = analyzeTechnicalSnapshot(
      candleRes.candles,
      inst.exchangeSymbol,
      inst.exchange,
      config.timeframe
    );

    if (snapshot.status === 'UNAVAILABLE' || snapshot.status === 'INVALID') {
      unavailableInstruments.push({
        symbol: inst.exchangeSymbol,
        exchange: inst.exchange,
        reason: snapshot.reason ?? snapshot.status,
      });
      continue;
    }

    if (
      config.maxVolatilityAtrPct !== undefined &&
      snapshot.atrPct !== null &&
      snapshot.atrPct > config.maxVolatilityAtrPct
    ) {
      continue;
    }

    const signals = evaluateAllStrategies(snapshot, candleRes.candles, config.timeframe);
    for (const sig of signals) {
      if (sig.confirmationStatus !== 'CONFIRMED' || sig.direction === 'NONE') continue;
      if ((sig.setupQualityScore ?? 0) < config.minSetupScore) continue;
      if ((sig.riskReward ?? 0) < config.minRiskReward) continue;

      opportunities.push({
        instrument: inst.exchangeSymbol,
        exchange: inst.exchange,
        category: inst.category,
        tradingStyle: config.tradingStyle,
        timeframe: config.timeframe,
        marketPrice: snapshot.lastClose,
        marketTimestamp: snapshot.lastTimestamp,
        direction: sig.direction,
        strategy: sig.strategyId,
        setupQualityScore: sig.setupQualityScore,
        entryZone: sig.entryZone,
        stopLoss: sig.stopLoss,
        takeProfitLevels: sig.takeProfits,
        riskReward: sig.riskReward,
        dataQuality: snapshot.status,
        confirmationStatus: sig.confirmationStatus,
        invalidationCondition: sig.invalidationCondition,
      });
    }
  }

  opportunities.sort((a, b) => (b.setupQualityScore ?? 0) - (a.setupQualityScore ?? 0));

  return {
    scannedAt: new Date().toISOString(),
    tradingStyle: config.tradingStyle,
    timeframe: config.timeframe,
    opportunities,
    unavailableInstruments,
  };
}
