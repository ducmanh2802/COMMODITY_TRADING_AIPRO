import test from 'node:test';
import assert from 'node:assert/strict';
import { instrumentRepository } from '../services/instrumentRegistry.ts';
import { calculateDeterministicRisk } from './riskEngine.ts';

test('calculateDeterministicRisk computes exact futures position size, tick risk, and costs', async () => {
  const gold = await instrumentRepository.findBySymbol('GC');
  assert.ok(gold);
  // Gold: tickSize = 0.10, tickValue = 10.00
  // Entry = 2650.0, SL = 2645.0 => 5.0 / 0.10 = 50 ticks => $500 gross risk per contract
  // Costs = $10 total => $510 risk per contract
  // Equity = $100,000, Risk = 1% => Risk Budget = $1,000 => floor(1000 / 510) = 1 contract
  const res = calculateDeterministicRisk({
    instrument: gold,
    accountEquity: 100000,
    accountCurrency: 'USD',
    riskPercentagePerTrade: 1.0,
    dailyLossLimitPct: 3.0,
    maxOpenPositions: 4,
    currentOpenPositions: 0,
    maxPortfolioRiskPct: 5.0,
    currentOpenRiskPct: 0,
    maxContractsPerInstrument: 5,
    entryPrice: 2650.0,
    stopLossPrice: 2645.0,
    takeProfitPrice: 2660.0,
    commissionPerContract: 5,
    exchangeFeePerContract: 3,
    brokerageFeePerContract: 2,
    slippageTicks: 0,
  });

  assert.equal(res.valid, true);
  assert.equal(res.ticksAtRisk, 50);
  assert.equal(res.grossRiskPerContract, 500);
  assert.equal(res.estimatedCostsPerContract, 10);
  assert.equal(res.riskPerContractInAccountCurrency, 510);
  assert.equal(res.recommendedContracts, 1);
  assert.equal(res.riskRewardRatio, 2);
});

test('calculateDeterministicRisk converts USD contract risk to VND using verified FX rate and rejects missing FX', async () => {
  const corn = await instrumentRepository.findBySymbol('ZC');
  assert.ok(corn);

  // Missing FX rate for VND account must fail closed
  const missingFx = calculateDeterministicRisk({
    instrument: corn,
    accountEquity: 500_000_000,
    accountCurrency: 'VND',
    riskPercentagePerTrade: 2.0,
    dailyLossLimitPct: 5.0,
    maxOpenPositions: 4,
    currentOpenPositions: 0,
    maxPortfolioRiskPct: 6.0,
    currentOpenRiskPct: 0,
    maxContractsPerInstrument: 10,
    entryPrice: 430.0,
    stopLossPrice: 420.0, // 10 cents = 40 ticks * $12.50 = $500
    commissionPerContract: 0,
    exchangeFeePerContract: 0,
    brokerageFeePerContract: 0,
    slippageTicks: 0,
  });
  assert.equal(missingFx.valid, false);
  assert.match(missingFx.rejectionReasons[0], /FX rate/i);

  // With FX rate = 25,000 VND/USD => $500 * 25,000 = 12,500,000 VND per contract
  // Risk budget = 500,000,000 * 2% = 10,000,000 VND => 0 contracts; raise equity to 1,000,000,000 => 20,000,000 / 12,500,000 = 1 contract
  const withFx = calculateDeterministicRisk({
    instrument: corn,
    accountEquity: 1_000_000_000,
    accountCurrency: 'VND',
    riskPercentagePerTrade: 2.0,
    dailyLossLimitPct: 5.0,
    maxOpenPositions: 4,
    currentOpenPositions: 0,
    maxPortfolioRiskPct: 6.0,
    currentOpenRiskPct: 0,
    maxContractsPerInstrument: 10,
    entryPrice: 430.0,
    stopLossPrice: 420.0,
    commissionPerContract: 0,
    exchangeFeePerContract: 0,
    brokerageFeePerContract: 0,
    slippageTicks: 0,
    fxRateContractToAccount: 25000,
  });
  assert.equal(withFx.valid, true);
  assert.equal(withFx.recommendedContracts, 1);
  assert.equal(withFx.riskPerContractInAccountCurrency, 12_500_000);
});

test('calculateDeterministicRisk rejects UNVERIFIED contract specs (Iron Ore TIO)', async () => {
  const ironOre = await instrumentRepository.findBySymbol('TIO');
  assert.ok(ironOre);
  const res = calculateDeterministicRisk({
    instrument: ironOre,
    accountEquity: 50000,
    accountCurrency: 'USD',
    riskPercentagePerTrade: 1.0,
    dailyLossLimitPct: 3.0,
    maxOpenPositions: 4,
    currentOpenPositions: 0,
    maxPortfolioRiskPct: 5.0,
    currentOpenRiskPct: 0,
    maxContractsPerInstrument: 5,
    entryPrice: 105,
    stopLossPrice: 100,
    commissionPerContract: 5,
    exchangeFeePerContract: 0,
    brokerageFeePerContract: 0,
    slippageTicks: 1,
  });

  assert.equal(res.valid, false);
  assert.ok(res.rejectionReasons.some((r) => r.includes('UNVERIFIED')));
});
