import type { InstrumentDefinition } from '../../src/shared/types/instrument.ts';
import type { AccountCurrency } from '../../src/shared/types/risk.ts';

export interface RiskCalculationInput {
  instrument: InstrumentDefinition;
  accountEquity: number;
  accountCurrency: AccountCurrency;
  riskPercentagePerTrade: number;
  dailyLossLimitPct: number;
  maxOpenPositions: number;
  currentOpenPositions: number;
  maxPortfolioRiskPct: number;
  currentOpenRiskPct: number;
  maxContractsPerInstrument: number;
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice?: number;
  commissionPerContract: number;
  exchangeFeePerContract: number;
  brokerageFeePerContract: number;
  slippageTicks: number;
  fxRateContractToAccount?: number;
}

export interface RiskCalculationOutput {
  valid: boolean;
  rejectionReasons: string[];
  instrumentId: string;
  contractCurrency: string;
  accountCurrency: AccountCurrency;
  fxRateApplied: number | null;
  riskBudget: number | null;
  ticksAtRisk: number | null;
  grossRiskPerContract: number | null;
  estimatedCostsPerContract: number | null;
  riskPerContractInAccountCurrency: number | null;
  recommendedContracts: number | null;
  cappedByLimits: boolean;
  contractNotionalValue: number | null;
  maxLossEstimate: number | null;
  riskRewardRatio: number | null;
  projectedPortfolioRiskPct: number | null;
  marginStatus: 'VERIFIED' | 'UNAVAILABLE';
  marginRequirementPerContract: number | null;
}

/**
 * Deterministic Futures Risk Management & Position Sizing Engine.
 * Enforces Section 12 formulas and rejects unverified contract specs or missing FX conversions.
 */
export function calculateDeterministicRisk(input: RiskCalculationInput): RiskCalculationOutput {
  const rejectionReasons: string[] = [];
  const spec = input.instrument.specification;

  if (spec.verificationStatus !== 'VERIFIED') {
    rejectionReasons.push(
      `Contract specifications for ${input.instrument.id} are ${spec.verificationStatus}. Risk calculation rejected until specs are verified.`
    );
  }

  if (
    spec.minimumTickSize === null ||
    spec.tickValue === null ||
    spec.contractSize === null ||
    spec.minimumTickSize <= 0 ||
    spec.tickValue <= 0 ||
    spec.contractSize <= 0
  ) {
    rejectionReasons.push(
      `Missing verified tick size, tick value, or contract size for ${input.instrument.id}.`
    );
  }

  if (!Number.isFinite(input.accountEquity) || input.accountEquity <= 0) {
    rejectionReasons.push('Account equity must be greater than 0.');
  }
  if (
    !Number.isFinite(input.riskPercentagePerTrade) ||
    input.riskPercentagePerTrade <= 0 ||
    input.riskPercentagePerTrade > 10
  ) {
    rejectionReasons.push('Risk percentage per trade must be between 0.01% and 10%.');
  }
  if (!Number.isFinite(input.entryPrice) || input.entryPrice <= 0) {
    rejectionReasons.push('Entry price must be positive.');
  }
  if (!Number.isFinite(input.stopLossPrice) || input.stopLossPrice <= 0) {
    rejectionReasons.push('Stop loss price must be positive.');
  }
  if (input.entryPrice === input.stopLossPrice) {
    rejectionReasons.push('Entry price and Stop Loss price cannot be equal.');
  }

  let fxRate: number | null = null;
  if (spec.tradingCurrency === input.accountCurrency) {
    fxRate = 1;
  } else if (
    input.fxRateContractToAccount !== undefined &&
    Number.isFinite(input.fxRateContractToAccount) &&
    input.fxRateContractToAccount > 0
  ) {
    fxRate = input.fxRateContractToAccount;
  } else {
    rejectionReasons.push(
      `Currency conversion required (${spec.tradingCurrency} -> ${input.accountCurrency}), but no verified FX rate was provided.`
    );
  }

  if (input.currentOpenPositions >= input.maxOpenPositions) {
    rejectionReasons.push(
      `Maximum open positions limit reached (${input.currentOpenPositions}/${input.maxOpenPositions}).`
    );
  }

  if (rejectionReasons.length > 0) {
    return {
      valid: false,
      rejectionReasons,
      instrumentId: input.instrument.id,
      contractCurrency: spec.tradingCurrency,
      accountCurrency: input.accountCurrency,
      fxRateApplied: fxRate,
      riskBudget: null,
      ticksAtRisk: null,
      grossRiskPerContract: null,
      estimatedCostsPerContract: null,
      riskPerContractInAccountCurrency: null,
      recommendedContracts: null,
      cappedByLimits: false,
      contractNotionalValue: null,
      maxLossEstimate: null,
      riskRewardRatio: null,
      projectedPortfolioRiskPct: null,
      marginStatus: spec.marginRequirement !== null ? 'VERIFIED' : 'UNAVAILABLE',
      marginRequirementPerContract: spec.marginRequirement,
    };
  }

  const tickSize = spec.minimumTickSize!;
  const tickValue = spec.tickValue!;
  const contractSize = spec.contractSize!;

  const riskBudget = input.accountEquity * (input.riskPercentagePerTrade / 100);
  const priceRisk = Math.abs(input.entryPrice - input.stopLossPrice);
  const ticksAtRisk = priceRisk / tickSize;
  const grossRiskPerContract = ticksAtRisk * tickValue;

  const slippageCost = Math.max(0, input.slippageTicks) * tickValue;
  const estimatedCostsPerContract =
    Math.max(0, input.commissionPerContract) +
    Math.max(0, input.exchangeFeePerContract) +
    Math.max(0, input.brokerageFeePerContract) +
    slippageCost;

  const riskPerContractInContractCurrency = grossRiskPerContract + estimatedCostsPerContract;
  const riskPerContractInAccountCurrency = riskPerContractInContractCurrency * fxRate!;

  const uncappedContracts = Math.floor(riskBudget / riskPerContractInAccountCurrency);

  // Portfolio remaining risk budget check
  const remainingPortfolioRiskPct = Math.max(
    0,
    input.maxPortfolioRiskPct - input.currentOpenRiskPct
  );
  const remainingPortfolioBudget = input.accountEquity * (remainingPortfolioRiskPct / 100);
  const maxContractsByPortfolioRisk = Math.floor(
    remainingPortfolioBudget / riskPerContractInAccountCurrency
  );

  const recommendedContracts = Math.max(
    0,
    Math.min(
      uncappedContracts,
      input.maxContractsPerInstrument,
      maxContractsByPortfolioRisk
    )
  );
  const cappedByLimits = recommendedContracts < uncappedContracts;

  if (recommendedContracts === 0) {
    rejectionReasons.push(
      'Risk budget or remaining portfolio risk allowance is smaller than 1 contract risk.'
    );
  }

  const maxLossEstimate = recommendedContracts * riskPerContractInAccountCurrency;
  const projectedPortfolioRiskPct =
    input.currentOpenRiskPct + (maxLossEstimate / input.accountEquity) * 100;

  let riskRewardRatio: number | null = null;
  if (
    input.takeProfitPrice !== undefined &&
    Number.isFinite(input.takeProfitPrice) &&
    input.takeProfitPrice > 0
  ) {
    const reward = Math.abs(input.takeProfitPrice - input.entryPrice);
    riskRewardRatio = priceRisk > 0 ? reward / priceRisk : null;
  }

  // Note: For cents-quoted contracts (cents/bushel or cents/lb), divide entry price by 100 for USD notional
  const isCentsQuoted = spec.quotationUnit.toLowerCase().startsWith('cents/');
  const unitPriceInCurrency = isCentsQuoted ? input.entryPrice / 100 : input.entryPrice;
  const contractNotionalValue = unitPriceInCurrency * contractSize * fxRate!;

  return {
    valid: recommendedContracts > 0,
    rejectionReasons,
    instrumentId: input.instrument.id,
    contractCurrency: spec.tradingCurrency,
    accountCurrency: input.accountCurrency,
    fxRateApplied: fxRate,
    riskBudget,
    ticksAtRisk,
    grossRiskPerContract,
    estimatedCostsPerContract,
    riskPerContractInAccountCurrency,
    recommendedContracts,
    cappedByLimits,
    contractNotionalValue,
    maxLossEstimate,
    riskRewardRatio,
    projectedPortfolioRiskPct,
    marginStatus: spec.marginRequirement !== null ? 'VERIFIED' : 'UNAVAILABLE',
    marginRequirementPerContract: spec.marginRequirement,
  };
}
