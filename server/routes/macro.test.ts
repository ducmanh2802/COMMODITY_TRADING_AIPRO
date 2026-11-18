import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { registerMacroRoutes } from './macro.ts';
import { MacroService } from '../macro/service.ts';

test('GET /api/macro/* serve fail-closed results without network (no keys, Yahoo off, fetch failing)', async () => {
  const calls: string[] = [];
  const service = new MacroService({
    env: {},
    now: () => new Date('2026-11-18T12:00:00Z'),
    fetchFn: async (url) => {
      calls.push(url);
      throw new Error('offline');
    },
  });
  const app = express();
  registerMacroRoutes(app, { service });
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const ov = await (await fetch(`${base}/api/macro/overview`)).json();
    assert.equal(ov.eia.status, 'UNAVAILABLE');
    assert.equal(ov.wasde.status, 'UNAVAILABLE');
    assert.equal(ov.fx.status, 'UNAVAILABLE');
    for (const item of [...ov.eia.items, ...ov.fx.items, ...ov.wasde.keyNumbers]) {
      assert.equal(item.value, null);
      assert.ok(item.sourceUrl.startsWith('https://'));
      assert.ok(item.sourceQuality === 'OFFICIAL' || item.sourceQuality === 'UNOFFICIAL');
    }
    // EIA (no key) and Yahoo (disabled) never hit the network.
    assert.ok(calls.every((c) => !c.includes('eia.gov') && !c.includes('yahoo')));
    for (const p of ['eia', 'wasde', 'fx']) {
      const r = await fetch(`${base}/api/macro/${p}`);
      assert.equal(r.status, 200);
    }
  } finally {
    server.close();
  }
});
