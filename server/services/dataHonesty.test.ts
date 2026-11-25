/**
 * Data-honesty: when every upstream fails (network error or HTTP 5xx / garbage body), services must
 * return null / UNAVAILABLE, never an invented number.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FxService } from './fx/service.ts';
import { MacroService } from '../macro/service.ts';

const NOW = () => new Date('2026-11-25T10:00:00Z');
const down = async (): Promise<Response> => {
  throw new TypeError('fetch failed');
};
const http503 = async (): Promise<Response> => new Response('Service Unavailable', { status: 503 });
const garbage = async (): Promise<Response> => new Response('<html>maintenance</html>', { status: 200 });

for (const [name, fetchFn] of [
  ['network error', down],
  ['HTTP 503', http503],
  ['garbage 200 body', garbage],
] as const) {
  test(`FX service: ${name} -> no value, no change, no spark (never fabricated)`, async () => {
    const rates = await new FxService({ fetchFn, now: NOW }).getAllRates();
    assert.ok(rates.length > 0);
    for (const r of rates) {
      assert.equal(r.value, null, `${r.pair} value`);
      assert.equal(r.asOf, null, `${r.pair} asOf`);
      assert.equal(r.change1w, null, `${r.pair} change1w`);
      assert.equal(r.change1m, null, `${r.pair} change1m`);
      assert.equal(r.spark.length, 0, `${r.pair} spark`);
      assert.ok(r.reason, `${r.pair} explains why there is no value`);
    }
  });

  test(`Macro service: ${name} -> every block UNAVAILABLE, no numeric payload`, async () => {
    const svc = new MacroService({ fetchFn, now: NOW, env: {} });
    const o = await svc.getOverview();
    for (const block of [o.eia, o.wasde, o.fx] as Array<{ status: string }>) {
      assert.equal(block.status, 'UNAVAILABLE');
    }
    const json = JSON.stringify(o);
    assert.doesNotMatch(json, /"(value|actual|price|rate)":\s*-?\d/, 'no numeric values on upstream failure');
  });
}
