import type { ExchangeCode, Timeframe, TradingStyle } from './instrument';

export type AccountCurrency = 'USD' | 'VND';

export type DisplayTimezone =
  | 'Asia/Ho_Chi_Minh'
  | 'UTC'
  | 'America/Chicago'
  | 'Europe/London';

export interface UserRiskSettings {
  userId: string;
  accountEquity: number;
  accountCurrency: AccountCurrency;
  riskPercentagePerTrade: number;
  dailyLossLimitPct: number;
  maxOpenPositions: number;
  maxPortfolioRiskPct: number;
  maxContractsPerInstrument: number;
  defaultTradingStyle: TradingStyle;
  defaultTimeframe: Timeframe;
  displayTimezone: DisplayTimezone;
}

export interface PositionSizingRequest {
  instrumentId: string;
  accountEquity: number;
  accountCurrency: AccountCurrency;
  riskPercentage: number;
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice?: number;
  estimatedCostsPerContract: number;
  fxRateToAccountCurrency?: number;
}

export interface PositionSizingResult {
  valid: boolean;
  rejectionReason?: string;
  riskBudget: number | null;
  riskPerContract: number | null;
  recommendedContracts: number | null;
  maxLossEstimate: number | null;
  riskRewardRatio: number | null;
}

export interface BacktestAssumptions {
  commissionPerContract: number;
  slippageTicks: number;
  handleRollovers: boolean;
  sessionFilterEnabled: boolean;
  lookAheadBiasPrevention: 'STRICT_BAR_CLOSE';
}

export interface TradeJournalEntry {
  id: string;
  userId: string;
  instrument: string;
  exchange: ExchangeCode;
  direction: 'LONG' | 'SHORT';
  strategy: string;
  timeframe: Timeframe;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  positionSize: number;
  entryTimestamp: string;
  exitTimestamp: string | null;
  exitPrice: number | null;
  realizedPnl: number | null;
  tradingCosts: number;
  resultInR: number | null;
  rationale: string;
  notes: string;
}

export type AppModuleId =
  | 'overview'
  | 'commodity-world'
  | 'commodity-profile'
  | 'cycle-hunter'
  | 'research-report'
  | 'radar'
  | 'markets'
  | 'explorer'
  | 'term-structure'
  | 'charts'
  | 'technical'
  | 'analysis'
  | 'brief'
  | 'scorecard'
  | 'cot'
  | 'fundamental'
  | 'ai-analyst'
  | 'scanner'
  | 'signals'
  | 'risk'
  | 'portfolio'
  | 'backtest'
  | 'journal'
  | 'paper'
  | 'news'
  | 'data-health'
  | 'data-import'
  | 'settings'
  | 'learn'
  | 'market-hub'
  | 'analysis-hub'
  | 'instrument'
  | 'mine-hub';

export interface PhaseModuleDescriptor {
  id: AppModuleId;
  label: string;
  phase: number;
  status: 'OPERATIONAL' | 'PLANNED';
  summary: string;
  dependencies: string[];
  failClosedBehavior: string;
}
