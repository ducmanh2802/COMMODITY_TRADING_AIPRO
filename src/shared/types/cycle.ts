import type { InstrumentDefinition, ProductCategory } from './instrument';
import type { DataQualityStatus, MarketQuote } from './market';

export type CyclePhase =
  | 'PHASE_1_ACCUMULATION'
  | 'PHASE_2_EARLY_RECOVERY'
  | 'PHASE_3_MARKUP'
  | 'PHASE_4_DISTRIBUTION'
  | 'DATA_UNAVAILABLE';

export type CycleTimeframeKey = 'MONTHLY' | 'WEEKLY' | 'DAILY' | 'H4';

export type BottomClassification =
  | 'EXTREME_BOTTOM_OPPORTUNITY'
  | 'STRONG_BOTTOM_CANDIDATE'
  | 'EARLY_ACCUMULATION_ZONE'
  | 'NEUTRAL'
  | 'NO_BOTTOM_SIGNAL'
  | 'DATA_UNAVAILABLE';

export type SetupDirection = 'LONG_ACCUMULATE' | 'LONG_BREAKOUT' | 'WAIT_CONFIRMATION' | 'AVOID_OR_SHORT' | 'UNAVAILABLE';

export type SupplyDemandBias = 'TIGHTENING' | 'BALANCED' | 'LOOSENING' | 'SURPLUS_PRESSURE' | 'DATA_UNAVAILABLE';

export interface MultiTimeframeCycleState {
  timeframe: CycleTimeframeKey;
  available: boolean;
  candleCount: number;
  phase: CyclePhase;
  trendDirection: 'UP' | 'DOWN' | 'SIDEWAYS' | 'UNAVAILABLE';
  lastClose: number | null;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  rsi14: number | null;
  macdHist: number | null;
  atrPct: number | null;
  percentile10Y: number | null;
  bbWidthRatio: number | null;
  volumeRatio: number | null;
  summary: string;
}

export interface BottomFactorScore {
  key:
    | 'HISTORICAL_VALUATION'
    | 'LONG_TERM_PRICE_POSITION'
    | 'SUPPLY_DEMAND_REVERSAL'
    | 'TECHNICAL_DIVERGENCE'
    | 'SPECULATIVE_POSITIONING'
    | 'VOLATILITY_CONTRACTION'
    | 'MACRO_ENVIRONMENT'
    | 'VOLUME_CONFIRMATION';
  label: string;
  labelVi: string;
  weight: number;
  score: number | null;
  available: boolean;
  evidence: string;
}

export interface BottomDetectionResult {
  status: 'COMPUTED' | 'PARTIAL' | 'DATA_UNAVAILABLE';
  totalScore: number | null;
  maxObservableWeight: number;
  observedWeight: number;
  classification: BottomClassification;
  classificationLabelVi: string;
  /** Internal model metric derived from factor agreement and data completeness (NOT a calibrated statistical probability). */
  modelConfidenceScore: number | null;
  confirmationConditions: string[];
  invalidationTriggers: string[];
  factors: BottomFactorScore[];
  methodologyNote: string;
}

export interface PerformanceHorizonReturns {
  w1: number | null;
  m1: number | null;
  m3: number | null;
  m6: number | null;
  y1: number | null;
  y3: number | null;
  y5: number | null;
  y10: number | null;
}

export interface MonthlySeasonalityStat {
  month: number; // 1..12
  label: string;
  sampleYears: number;
  avgReturnPct: number | null;
  winRatePct: number | null;
}

export interface TradeSetupPlan {
  horizonType: 'LONG_TERM_CYCLE' | 'SWING_TRADING';
  title: string;
  status: 'ACTIVE_CANDIDATE' | 'WATCH_ONLY' | 'NO_SETUP' | 'DATA_UNAVAILABLE';
  direction: SetupDirection;
  autoExecutionAllowed: false;
  entryZone: { low: number | null; high: number | null; note: string };
  stopLoss: number | null;
  takeProfits: number[];
  riskRewardRatio: number | null;
  positionSizingGuidance: string;
  confirmationRequired: string[];
  invalidationCondition: string;
}

export interface TailoredSupplyDemandItem {
  id: string;
  label: string;
  labelVi: string;
  unit: string;
  sourceHint: string;
  latestValue: number | string | null;
  previousValue: number | string | null;
  period: string | null;
  impact: 'BULLISH' | 'BEARISH' | 'SIDEWAYS' | 'UNCERTAIN' | 'UNAVAILABLE';
  notes: string;
}

export interface MacroTrackerMetric {
  id: 'DXY' | 'FED_FUNDS' | 'US_10Y' | 'US_CPI' | 'WTI_CRUDE' | 'GOLD_SPOT' | 'BASKET_INDEX' | 'GLOBAL_SD';
  label: string;
  labelVi: string;
  value: number | string | null;
  unit: string;
  changeLabel: string | null;
  source: string;
  timestamp: string | null;
  status: DataQualityStatus;
  cycleImplication: string;
}

export interface CommodityCycleSummary {
  instrument: InstrumentDefinition;
  quote: MarketQuote;
  cyclePhase: CyclePhase;
  cyclePhaseLabelVi: string;
  bottomScore: number | null;
  bottomClassification: BottomClassification;
  modelConfidenceScore: number | null;
  opportunityScore: number | null;
  percentile10Y: number | null;
  returns: PerformanceHorizonReturns;
  supplyDemandBias: SupplyDemandBias;
  cotNetPctOi: number | null;
  cotIndex: number | null;
  lastUpdated: string | null;
  dataStatus: DataQualityStatus;
  missingInputs: string[];
}

export interface CommodityProfileDossier {
  summary: CommodityCycleSummary;
  timeframes: Record<CycleTimeframeKey, MultiTimeframeCycleState>;
  bottomDetection: BottomDetectionResult;
  tradePlans: {
    longTermCycle: TradeSetupPlan;
    swingTrading: TradeSetupPlan;
  };
  supplyDemandMatrix: TailoredSupplyDemandItem[];
  seasonality: MonthlySeasonalityStat[];
  cotSnapshot: {
    available: boolean;
    reportDate: string | null;
    releaseDate: string | null;
    managedMoneyNet: number | null;
    managedMoneyNetPctOi: number | null;
    cotIndex: number | null;
    commercialNet: number | null;
    note: string;
  };
  macroContext: MacroTrackerMetric[];
  historicalCandlesCount: number;
}

export interface EightQuestionVerdict {
  symbol: string;
  generatedAt: string;
  model: string;
  status: 'OK' | 'DATA_UNAVAILABLE' | 'AI_UNCONFIGURED' | 'AI_ERROR';
  message?: string;
  answers: {
    q1CyclePhase: string;
    q2SupplyDemandState: string;
    q3ValuableOrTrap: string;
    q4BottomProbabilityAssessment: string;
    q5KeyDriversAndRisks: string;
    q6ShouldActNowOrWait: string;
    q7EntryZoneInvalidationTargets: string;
    q8ConfirmationTriggers: string;
  } | null;
}

export interface CycleMarketOverview {
  generatedAt: string;
  marketBreadth: {
    totalTracked: number;
    withPriceData: number;
    risingCount: number;
    fallingCount: number;
    accumulationCount: number;
    bottomCandidateCount: number;
    markupCount: number;
    distributionCount: number;
    unavailableCount: number;
  };
  opportunityRadar: CommodityCycleSummary[];
  commodities: CommodityCycleSummary[];
  macroTracker: MacroTrackerMetric[];
  dataNotices: string[];
}

export interface DailyResearchReportPayload {
  generatedAt: string;
  aiStatus: 'OK' | 'AI_UNCONFIGURED' | 'DATA_UNAVAILABLE' | 'AI_ERROR';
  model?: string;
  message?: string;
  topWatch: CommodityCycleSummary[];
  topBottomCandidates: CommodityCycleSummary[];
  topDownsideRisk: CommodityCycleSummary[];
  supplyDemandShifts: Array<{
    symbol: string;
    dataset: string;
    source: string;
    period: string;
    impact: string;
    summary: string;
  }>;
  phaseTransitions: Array<{
    symbol: string;
    name: string;
    phase: CyclePhase;
    note: string;
  }>;
  vietnamEventsToday: Array<{
    timeIct: string;
    title: string;
    impact: string;
    affectedCommodities: string[];
  }>;
  aiExecutiveBriefing: {
    headline: string;
    macroRegimeSummary: string;
    vietnamFocusCommentary: string;
    bottomWatchHighlights: string[];
    riskWarnings: string[];
    actionableChecklist: string[];
  } | null;
}

export type CommodityGroupFilter = 'ALL' | ProductCategory;
