import test from 'node:test';
import assert from 'node:assert/strict';
import { sortCommoditiesByPotential } from './commoditySort';
import type { CommodityCycleSummary, CyclePhase } from '../types/cycle';

function makeSummary(overrides: {
  symbol: string;
  phase?: CyclePhase;
  opportunityScore?: number | null;
  bottomScore?: number | null;
  price?: number | null;
  isMvxListed?: boolean;
}): CommodityCycleSummary {
  return {
    instrument: {
      id: `CBOT:${overrides.symbol}`,
      productName: overrides.symbol,
      category: 'AGRICULTURE',
      exchange: 'CBOT',
      exchangeSymbol: overrides.symbol,
      contractMonth: null,
      contractYear: null,
      isMvxListed: overrides.isMvxListed ?? true,
      mxvMapping: null,
      specification: {
        contractSize: 5000,
        contractSizeUnit: 'bushels',
        minimumTickSize: 0.25,
        tickValue: 12.5,
        quotationUnit: 'cents/bushel',
        tradingCurrency: 'USD',
        tradingHoursTimezone: 'America/Chicago',
        tradingHoursSummary: 'CME',
        settlementMethod: 'PHYSICAL',
        dataSource: 'https://cmegroup.com',
        expirationDate: null,
        firstNoticeDate: null,
        marginRequirement: null,
        marginCurrency: null,
        verificationStatus: 'VERIFIED',
      },
      enabled: true,
    },
    quote: {
      symbol: overrides.symbol,
      exchange: 'CBOT',
      contractMonth: null,
      price: overrides.price ?? null,
      bid: null,
      ask: null,
      volume: null,
      openInterest: null,
      currency: 'USD',
      unit: 'cents/bushel',
      source: 'TEST',
      timestamp: overrides.price != null ? '2026-11-20T00:00:00Z' : null,
      retrievedAt: '2026-11-20T00:00:00Z',
      status: overrides.price != null ? 'DELAYED' : 'UNAVAILABLE',
    },
    dataStatus: overrides.price != null ? 'DELAYED' : 'UNAVAILABLE',
    cyclePhase: overrides.phase ?? 'DATA_UNAVAILABLE',
    cyclePhaseLabelVi: 'Test',
    bottomScore: overrides.bottomScore ?? null,
    bottomClassification: 'DATA_UNAVAILABLE',
    modelConfidenceScore: null,
    opportunityScore: overrides.opportunityScore ?? null,
    percentile10Y: null,
    returns: { w1: null, m1: null, m3: null, m6: null, y1: null, y3: null, y5: null, y10: null },
    supplyDemandBias: 'DATA_UNAVAILABLE',
    cotNetPctOi: null,
    cotIndex: null,
    lastUpdated: overrides.price != null ? '2026-11-20T00:00:00Z' : null,
    missingInputs: [],
  };
}

test('sortCommoditiesByPotential ranks highest opportunityScore and bottomScore first and puts DATA_UNAVAILABLE last', () => {
  const input = [
    makeSummary({ symbol: 'RC', phase: 'DATA_UNAVAILABLE', price: null, opportunityScore: null, bottomScore: null }),
    makeSummary({ symbol: 'ZS', phase: 'PHASE_3_MARKUP', price: 1210, opportunityScore: 34, bottomScore: 33 }),
    makeSummary({ symbol: 'ZC', phase: 'PHASE_2_EARLY_RECOVERY', price: 450, opportunityScore: 63, bottomScore: 57 }),
    makeSummary({ symbol: 'CC', phase: 'PHASE_1_ACCUMULATION', price: 6200, opportunityScore: 68, bottomScore: 72 }),
    makeSummary({ symbol: 'BRN', phase: 'DATA_UNAVAILABLE', price: 92.9, opportunityScore: null, bottomScore: null }),
  ];

  const sorted = sortCommoditiesByPotential(input);
  assert.deepEqual(
    sorted.map((item) => item.instrument.exchangeSymbol),
    ['CC', 'ZC', 'ZS', 'BRN', 'RC']
  );
  // Original array must not be mutated
  assert.equal(input[0].instrument.exchangeSymbol, 'RC');
});

test('sortCommoditiesByPotential breaks equal opportunityScore ties using bottomScore, phase priority, and MXV status', () => {
  const input = [
    makeSummary({ symbol: 'A', phase: 'PHASE_4_DISTRIBUTION', bottomScore: 60, opportunityScore: 60, isMvxListed: true }),
    makeSummary({ symbol: 'B', phase: 'PHASE_2_EARLY_RECOVERY', bottomScore: 60, opportunityScore: 60, isMvxListed: false }),
    makeSummary({ symbol: 'C', phase: 'PHASE_1_ACCUMULATION', bottomScore: 65, opportunityScore: 60, isMvxListed: true }),
  ];

  const sorted = sortCommoditiesByPotential(input);
  assert.deepEqual(
    sorted.map((item) => item.instrument.exchangeSymbol),
    ['C', 'B', 'A']
  );
});
