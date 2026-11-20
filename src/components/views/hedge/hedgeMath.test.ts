import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CROPS, buildScenarios, futuresPnlVnd, initialMargin, localBasis, pickContractMonth, planContracts, quoteToUsdPerKg, quoteToVndPerKg,
} from './hedgeMath';

const rc = CROPS[0];
const near = (a: number, b: number, eps = 1e-3) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} vs ${b}`);
{
  test('converts units', () => {
    near(quoteToUsdPerKg(4000, 'usd_per_mt'), 4);
    near(quoteToUsdPerKg(100, 'cents_per_lb'), 2.2046);
    near(quoteToVndPerKg(4000, rc, 25000), 100000);
  });
  test('plans contracts with leftover', () => {
    assert.deepEqual(planContracts(5000, 10000), { contracts: 1, hedgedKg: 10000, leftoverKg: -5000 });
    assert.deepEqual(planContracts(24000, 10000), { contracts: 2, hedgedKg: 20000, leftoverKg: 4000 });
    assert.equal(planContracts(0, 10000).contracts, 0);
    assert.equal(planContracts(3000, 10000).contracts, 0);
  });
  test('futures P&L signs', () => {
    assert.equal(futuresPnlVnd('seller', 100, 80, 10), 200);
    assert.equal(futuresPnlVnd('seller', 100, 120, 10), -200);
    assert.equal(futuresPnlVnd('buyer', 100, 120, 10), 200);
  });
  test('basis and margin', () => {
    assert.equal(localBasis(95000, 100000), -5000);
    assert.equal(initialMargin(10000, 100000, 10), 100_000_000);
  });
  test('seller scenarios lock price when basis unchanged', () => {
    const s = buildScenarios({ role: 'seller', quantityKg: 10000, hedgedKg: 10000, entryVndKg: 100000, basisVndKg: -5000 });
    for (const x of s) near(x.withHedge, 950_000_000);
    near(s[0].withoutHedge, 750_000_000);
    near(s[4].extraCashNeeded, 200_000_000);
    assert.equal(s[0].extraCashNeeded, 0);
  });
  test('basis change shifts hedged result', () => {
    const s = buildScenarios(
      { role: 'seller', quantityKg: 10000, hedgedKg: 10000, entryVndKg: 100000, basisVndKg: -5000, basisChangeVndKg: -2000 },
      [0]
    );
    near(s[0].withHedge, 930_000_000);
  });
  test('buyer cost is locked', () => {
    const s = buildScenarios({ role: 'buyer', quantityKg: 10000, hedgedKg: 10000, entryVndKg: 100000, basisVndKg: 3000 });
    for (const x of s) near(x.withHedge, 1_030_000_000);
    assert.ok(s[0].extraCashNeeded > 0);
  });
  test('picks nearest listed month', () => {
    assert.equal(pickContractMonth(['2027-01', '2027-03', '2027-05'], '2027-02'), '2027-03');
    assert.equal(pickContractMonth(['2027-01'], '2027-02'), null);
  });
}
