import test from 'node:test';
import assert from 'node:assert/strict';
import type { ContractSpecification } from '../../../shared/types/instrument';
import { classifyCurve, ILLUSTRATIVE_CURVES, marginLeverage, positionSize, tickPnl } from './learnMath';

// Mirrors the CBOT Corn (ZC) entry in server/data/instruments.ts.
const zc: ContractSpecification = {
  contractSize: 5000,
  contractSizeUnit: 'bushels',
  minimumTickSize: 0.25,
  tickValue: 12.5,
  tradingCurrency: 'USD',
  quotationUnit: 'cents/bushel',
  expirationDate: null,
  firstNoticeDate: null,
  tradingHoursTimezone: 'America/Chicago',
  tradingHoursSummary: '',
  marginRequirement: null,
  marginCurrency: null,
  settlementMethod: 'PHYSICAL',
  dataSource: 'test',
  verificationStatus: 'VERIFIED',
};
const unverified: ContractSpecification = { ...zc, verificationStatus: 'UNVERIFIED' };

test('corn +10 cents = 40 ticks = 500 USD per contract', () => {
  const r = tickPnl(zc, 10, 2);
  assert.ok(r.ok);
  assert.equal(r.ticks, 40);
  assert.equal(r.pnlPerContract, 500);
  assert.equal(r.pnl, 1000);
  assert.equal(r.fractionalTicks, false);
});

test('every exercise refuses an UNVERIFIED spec or missing spec', () => {
  for (const r of [
    tickPnl(unverified, 10, 1),
    marginLeverage(unverified, 450, 1000, 1, 1),
    positionSize(unverified, 10000, 1, 8, 0),
    tickPnl(null, 10, 1),
  ]) {
    assert.equal(r.ok, false);
  }
  assert.equal(tickPnl({ ...zc, tickValue: null }, 10, 1).ok, false);
});

test('notional and leverage from verified tick fields with user margin in VND', () => {
  // 450 cents/bu x 5000 bu = 22,500 USD notional; margin 31,100,000 VND at 25,000 VND/USD = 1,244 USD.
  const r = marginLeverage(zc, 450, 31_100_000, 25_000, -2);
  assert.ok(r.ok);
  assert.ok(Math.abs(r.notional - 22_500) < 1e-9);
  assert.ok(Math.abs(r.marginInTradingCurrency - 1244) < 1e-9);
  assert.ok(Math.abs(r.leverage - 22_500 / 1244) < 1e-9);
  assert.ok(Math.abs(r.movePnl + 450) < 1e-9);
});

test('position sizing floors and returns 0 when one contract is too risky', () => {
  const none = positionSize(zc, 10_000, 1, 8, 0); // 32 ticks x 12.5 = 400 > 100 budget
  assert.ok(none.ok);
  assert.equal(none.riskPerContract, 400);
  assert.equal(none.contracts, 0);
  const some = positionSize(zc, 100_000, 1, 8, 10); // budget 1000 / 410 = 2.43
  assert.ok(some.ok);
  assert.equal(some.contracts, 2);
  assert.equal(some.actualRisk, 820);
});

test('curve classification of the illustrative curves', () => {
  assert.deepEqual(
    ILLUSTRATIVE_CURVES.map((c) => classifyCurve(c.points.map((p) => p.price))),
    ['CONTANGO', 'BACKWARDATION', 'MIXED'],
  );
});
