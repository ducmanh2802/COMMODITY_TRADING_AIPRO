import test from 'node:test';
import assert from 'node:assert/strict';
import type { ContractSpecification } from '../../../shared/types/instrument';
import { classifyCurve, contractValue, convertCurrency, ILLUSTRATIVE_CURVES, marginCallDistance, marginLeverage, positionSize, rollCost, rMultiple, swingPlan, tickPnl } from './learnMath';

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

test('contractValue: ZC at 450 cents = 1800 ticks x 12.5 = 22500 USD; refuses unverified', () => {
  const r = contractValue(zc, 450);
  assert.ok(r.ok && r.notional === 22500);
  assert.equal(contractValue(unverified, 450).ok, false);
  assert.equal(contractValue(zc, 0).ok, false);
});

test('rollCost: contango costs, backwardation pays', () => {
  const c = rollCost(zc, 450, 455, 2);
  assert.ok(c.ok && c.state === 'CONTANGO' && c.spreadTicks === 20 && c.costPerContract === 250 && c.cost === 500);
  const b = rollCost(zc, 455, 450, 1);
  assert.ok(b.ok && b.state === 'BACKWARDATION' && b.cost === -250);
  assert.equal(rollCost(zc, 450, 450, 1).ok && (rollCost(zc, 450, 450, 1) as { state: string }).state, 'FLAT');
  assert.equal(rollCost(zc, 450, 455, 0).ok, false);
});

test('marginCallDistance: buffer / tick value', () => {
  const r = marginCallDistance(zc, 1500, 1250, 2);
  assert.ok(r.ok && r.bufferPerContract === 250 && r.bufferTotal === 500 && r.ticksToCall === 20 && r.priceMoveToCall === 5);
  assert.equal(marginCallDistance(zc, 1000, 1250, 1).ok, false);
  assert.equal(marginCallDistance(zc, 1500, 1250, 1.5).ok, false);
});

test('convertCurrency', () => {
  const r = convertCurrency(12.5, 25000);
  assert.ok(r.ok && r.value === 312500);
  assert.equal(convertCurrency(1, 0).ok, false);
});

test('swingPlan: ZC entry 450, ATR 8, 1.5x -> stop 12 cents = 48 ticks = 600 USD/contract', () => {
  const r = swingPlan(zc, 450, 8, 1.5, 10000, 1, 0);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.stopDistance, 12);
    assert.equal(r.stopPrice, 438);
    assert.equal(r.takeProfit2R, 474);
    assert.equal(r.riskBudget, 100);
    assert.equal(r.contracts, 0);
  }
  const big = swingPlan(zc, 450, 8, 1.5, 100000, 1, 0);
  assert.ok(big.ok && big.contracts === 1 && big.pnlAt1R === 600);
  assert.equal(swingPlan(zc, 450, 0, 1.5, 10000, 1, 0).ok, false);
  assert.equal(swingPlan(unverified, 450, 8, 1.5, 10000, 1, 0).ok, false);
});

test('rMultiple: risk 12 cents, exit +24 cents = 2R', () => {
  const r = rMultiple(zc, 450, 438, 474, 1);
  assert.ok(r.ok && r.r === 2 && r.pnl === 1200 && r.riskDollars === 600);
  const l = rMultiple(zc, 450, 438, 438, 1);
  assert.ok(l.ok && l.r === -1);
  assert.equal(rMultiple(zc, 450, 460, 470, 1).ok, false);
});
