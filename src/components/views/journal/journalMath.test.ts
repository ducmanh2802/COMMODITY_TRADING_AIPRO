import test from 'node:test';
import assert from 'node:assert/strict';
import type { ContractSpecification } from '../../../shared/types/instrument.ts';
import { computeJournalExit } from './journalMath.ts';

// Synthetic test spec (values chosen for arithmetic, not a claim about any real contract).
const spec: ContractSpecification = {
  contractSize: 100,
  contractSizeUnit: 'units',
  minimumTickSize: 0.1,
  tickValue: 10,
  tradingCurrency: 'USD',
  quotationUnit: 'USD per unit',
  expirationDate: null,
  firstNoticeDate: null,
  tradingHoursTimezone: 'UTC',
  tradingHoursSummary: '',
  marginRequirement: null,
  marginCurrency: null,
  settlementMethod: 'PHYSICAL',
  dataSource: 'test',
  verificationStatus: 'VERIFIED',
};

test('computeJournalExit: long winner net of costs and R from entry/stop', () => {
  const r = computeJournalExit(spec, { direction: 'LONG', entryPrice: 100, stopLoss: 99, exitPrice: 102, contracts: 2, tradingCosts: 5 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.grossPnl, 400); // 20 ticks x 10 x 2
  assert.equal(r.realizedPnl, 395);
  assert.equal(r.resultInR, 2);
});

test('computeJournalExit: short loser is negative', () => {
  const r = computeJournalExit(spec, { direction: 'SHORT', entryPrice: 100, stopLoss: 101, exitPrice: 100.5, contracts: 1, tradingCosts: 0 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.realizedPnl, -50);
  assert.equal(r.resultInR, -0.5);
});

test('computeJournalExit refuses unverified or incomplete specs and bad inputs', () => {
  const base = { direction: 'LONG' as const, entryPrice: 100, stopLoss: 99, exitPrice: 101, contracts: 1, tradingCosts: 0 };
  assert.equal(computeJournalExit({ ...spec, verificationStatus: 'UNVERIFIED' }, base).ok, false);
  assert.equal(computeJournalExit({ ...spec, tickValue: null }, base).ok, false);
  assert.equal(computeJournalExit(null, base).ok, false);
  assert.equal(computeJournalExit({ ...spec, tradingCurrency: 'VND' }, base).ok, false);
  assert.equal(computeJournalExit(spec, { ...base, exitPrice: NaN }).ok, false);
  assert.equal(computeJournalExit(spec, { ...base, stopLoss: 100 }).ok, false);
});
