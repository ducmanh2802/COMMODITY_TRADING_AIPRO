import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ContractSpecification } from '../types/instrument';
import { calcOrder, rRatioBand, type OrderCalcInput } from './orderCalc';

const spec = (tick: number, tickValue: number, over: Partial<ContractSpecification> = {}): ContractSpecification =>
  ({
    contractSize: 1,
    contractSizeUnit: 'x',
    minimumTickSize: tick,
    tickValue,
    tradingCurrency: 'USD',
    quotationUnit: 'u',
    expirationDate: null,
    firstNoticeDate: null,
    tradingHoursTimezone: '',
    tradingHoursSummary: '',
    marginRequirement: null,
    marginCurrency: null,
    settlementMethod: 'PHYSICAL',
    dataSource: '',
    verificationStatus: 'VERIFIED',
    ...over,
  }) as ContractSpecification;

const ZC = spec(0.25, 12.5);
const KC = spec(0.05, 18.75);
const RC = spec(1, 10);
const GC = spec(0.1, 10);

const base = (o: Partial<OrderCalcInput>): OrderCalcInput => ({
  spec: ZC, direction: 'LONG', capitalVnd: 1_000_000_000, usdVnd: 25_000, riskPct: 1,
  entry: 439, stop: 432, target: 453, costUsd: 10, marginUsd: null, ...o,
});
const ok = (o: Partial<OrderCalcInput>) => {
  const r = calcOrder(base(o));
  assert.ok(r.ok, JSON.stringify(r));
  return r;
};

test('USD per price unit: ZC 1 cent = 50, KC 1 cent = 375, RC 1 USD/t = 10, GC 1 USD/oz = 100', () => {
  assert.equal(ok({ spec: ZC }).usdPerUnit, 50);
  assert.equal(ok({ spec: KC, entry: 300, stop: 295, target: 310 }).usdPerUnit, 375);
  assert.equal(ok({ spec: RC, entry: 4500, stop: 4400, target: 4700 }).usdPerUnit, 10);
  assert.equal(ok({ spec: GC, entry: 2000, stop: 1990, target: 2020 }).usdPerUnit, 100);
});

test('corn example: 40k USD, 1%, 7 cent stop, 10 USD cost -> 1 contract', () => {
  const r = ok({});
  assert.equal(r.capitalUsd, 40000);
  assert.equal(r.riskBudgetUsd, 400);
  assert.equal(r.riskBudgetVnd, 10_000_000);
  assert.equal(r.lossPerContractUsd, 350);
  assert.equal(r.riskPerContractUsd, 360);
  assert.equal(r.maxContracts, 1);
  assert.equal(r.pnlAtStopUsd, -360);
  assert.equal(r.pnlAtTargetUsd, 690);
  assert.equal(r.pnlAtStopVnd, -9_000_000);
  assert.ok(Math.abs(r.rRatio - 690 / 360) < 1e-9);
});

test('max contracts rounds down and zero is flagged', () => {
  const r = ok({ capitalVnd: 2_000_000_000 }); // budget 800 / 360 = 2.22
  assert.equal(r.maxContracts, 2);
  assert.equal(r.tooSmall, false);
  const z = ok({ capitalVnd: 300_000_000 }); // budget 120
  assert.equal(z.maxContracts, 0);
  assert.equal(z.tooSmall, true);
  assert.equal(z.notionalUsd, 0);
});

test('notional, leverage and margin used', () => {
  const r = ok({ capitalVnd: 2_000_000_000, marginUsd: 1000 });
  assert.equal(r.notionalUsd, (439 / 0.25) * 12.5 * 2);
  assert.ok(Math.abs(r.leverage - r.notionalUsd / 80000) < 1e-9);
  assert.equal(r.marginUsedUsd, 2000);
  assert.equal(r.marginUsedPct, 2.5);
  assert.equal(ok({}).marginUsedPct, null);
});

test('short direction mirrors long', () => {
  const r = ok({ direction: 'SHORT', entry: 4500, stop: 4560, target: 4350, spec: RC, capitalVnd: 2_000_000_000 });
  assert.equal(r.stopDistance, 60);
  assert.equal(r.lossPerContractUsd, 600);
  assert.equal(r.profitPerContractUsd, 1500);
  assert.equal(r.maxContracts, 1); // 800 / 610
  assert.ok(r.rRatio > 2);
});

test('direction validation', () => {
  const a = calcOrder(base({ stop: 440 }));
  assert.ok(!a.ok && a.errors.stop);
  const b = calcOrder(base({ target: 430 }));
  assert.ok(!b.ok && b.errors.target);
  const c = calcOrder(base({ direction: 'SHORT', stop: 430, target: 450 }));
  assert.ok(!c.ok && c.errors.stop && c.errors.target);
  const d = calcOrder(base({ stop: 439 }));
  assert.ok(!d.ok && d.errors.stop);
});

test('invalid inputs and unverified spec', () => {
  for (const o of [{ capitalVnd: 0 }, { usdVnd: 0 }, { riskPct: 0 }, { riskPct: 101 }, { entry: NaN }, { costUsd: -1 }, { marginUsd: -5 }]) {
    assert.equal(calcOrder(base(o)).ok, false, JSON.stringify(o));
  }
  const u = calcOrder(base({ spec: spec(0.25, 12.5, { verificationStatus: 'UNVERIFIED' as never }) }));
  assert.ok(!u.ok && u.errors.spec);
  const n = calcOrder(base({ spec: null }));
  assert.ok(!n.ok && n.errors.spec);
  const e = calcOrder(base({ spec: spec(0.25, 12.5, { tradingCurrency: 'EUR' }) }));
  assert.ok(!e.ok && e.errors.spec);
});

test('R band', () => {
  assert.equal(rRatioBand(1.2), 'warn');
  assert.equal(rRatioBand(1.5), 'good');
  assert.equal(rRatioBand(-1), 'bad');
});
