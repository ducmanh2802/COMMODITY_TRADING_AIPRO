import test from 'node:test';
import assert from 'node:assert/strict';
import { riskSizing } from './riskSizing';

const spec = { tick: 0.25, tickValueUsd: 12.5, pointValueUsd: 50 };
const base = { spec, side: 'LONG' as const, entry: 450, stop: 445, equityVnd: 250_000_000, riskPct: 1, fx: 25000 };

test('long: 20 ticks x 12.5 = 250 USD = 6.25M VND; budget 2.5M -> 0 contracts', () => {
  const r = riskSizing(base);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.stopTicks, 20);
    assert.equal(r.riskPerContractUsd, 250);
    assert.equal(r.riskPerContractVnd, 6_250_000);
    assert.equal(r.contracts, 0);
  }
});
test('floor to whole contracts', () => {
  const r = riskSizing({ ...base, stop: 449, equityVnd: 1_000_000_000 }); // 4 ticks = 50 USD = 1.25M; budget 10M
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.contracts, 8);
});
test('short mirrors long; wrong side rejected', () => {
  const s = riskSizing({ ...base, side: 'SHORT', entry: 450, stop: 451, equityVnd: 1_000_000_000 });
  assert.ok(s.ok && s.contracts === 8);
  assert.deepEqual(riskSizing({ ...base, stop: 455 }), { ok: false, reason: 'STOP_WRONG_SIDE' });
  assert.deepEqual(riskSizing({ ...base, side: 'SHORT' }), { ok: false, reason: 'STOP_WRONG_SIDE' });
});
test('rounds distance to tick; sub-tick distance rejected', () => {
  const r = riskSizing({ ...base, stop: 449.9 }); // 0.1 -> 0 ticks
  assert.deepEqual(r, { ok: false, reason: 'ZERO_DISTANCE' });
  const r2 = riskSizing({ ...base, stop: 449.88 }); // 0.12 -> 0 ticks; 0.13 -> 1
  assert.equal(r2.ok, false);
  const r3 = riskSizing({ ...base, stop: 449.87 });
  assert.ok(r3.ok && r3.stopTicks === 1);
});
test('guards: NaN, zero, negative, pct > 100', () => {
  for (const o of [{ entry: NaN }, { stop: 0 }, { stop: -1 }, { equityVnd: 0 }, { fx: NaN }, { riskPct: 0 }, { riskPct: -1 }, { riskPct: 101 }, { entry: Infinity }]) {
    assert.deepEqual(riskSizing({ ...base, ...o }), { ok: false, reason: 'BAD_INPUT' });
  }
});
