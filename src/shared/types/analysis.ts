import type { DataQualityStatus } from './market';
import type { ExchangeCode, ProductCategory, Timeframe, TradingStyle } from './instrument';

export type MarketDirection = 'BULLISH' | 'BEARISH' | 'SIDEWAYS' | 'UNCERTAIN';

export type TradeAction = 'STRONG_BUY' | 'BUY' | 'SELL' | 'NO_TRADE';

export type StrategyId =
  | 'TREND_FOLLOWING'
  | 'EMA_PULLBACK'
  | 'BREAKOUT'
  | 'RANGE_TRADING'
  | 'SR_REVERSAL'
  | 'RSI_REVERSAL'
  | 'MACD_MOMENTUM'
  | 'ATR_VOLATILITY_BREAKOUT';

export interface StrategyDefinition {
  id: StrategyId;
  name: string;
  applicableTimeframes: Timeframe[];
  requiredIndicators: string[];
  entryConditions: string;
  exitConditions: string;
  stopLossLogic: string;
  takeProfitLogic: string;
  invalidationConditions: string;
}

export interface AiAnalystOutput {
  instrument: string;
  marketStatus: MarketDirection;
  action: TradeAction;
  timeframe: Timeframe;
  confidence: number;
  trendAnalysis: Record<string, unknown>;
  technicalEvidence: string[];
  fundamentalEvidence: string[];
  bullishScenario: Record<string, unknown>;
  bearishScenario: Record<string, unknown>;
  entryZone: Record<string, unknown>;
  stopLoss: Record<string, unknown>;
  takeProfits: Record<string, unknown>[];
  riskReward: number | null;
  invalidationConditions: string[];
  riskWarnings: string[];
  dataQuality: {
    status: DataQualityStatus;
    source: string;
    timestamp: string | null;
  };
}

export interface TradeScannerOpportunity {
  instrument: string;
  exchange: ExchangeCode;
  category: ProductCategory;
  tradingStyle: TradingStyle;
  timeframe: Timeframe;
  marketPrice: number | null;
  marketTimestamp: string | null;
  direction: 'LONG' | 'SHORT' | 'NONE';
  strategy: StrategyId;
  setupQualityScore: number | null;
  entryZone: [number, number] | null;
  stopLoss: number | null;
  takeProfitLevels: number[];
  riskReward: number | null;
  dataQuality: DataQualityStatus;
  confirmationStatus: 'CONFIRMED' | 'PENDING' | 'INVALIDATED' | 'UNAVAILABLE';
  invalidationCondition: string;
}

export interface FundamentalMacroRecord {
  id: string;
  dataset: string;
  source: string;
  publicationTimestamp: string;
  dataPeriod: string;
  actualValue: number | string | null;
  previousValue: number | string | null;
  forecastValue: number | string | null;
  unit: string;
  revisionStatus: 'PRELIMINARY' | 'FINAL' | 'REVISED';
  impactAssessment: MarketDirection;
}
