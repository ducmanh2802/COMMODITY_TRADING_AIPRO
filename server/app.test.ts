import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApiApp } from './app.ts';

async function withTestServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const app = createApiApp();
  const server = await new Promise<import('node:http').Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    const addr = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${addr.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test('GET /api/health returns 200 with Asia/Ho_Chi_Minh timezone and honest capability flags', async () => {
  await withTestServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'OK');
    assert.equal(body.timezone, 'Asia/Ho_Chi_Minh');
    assert.equal(body.capabilities.firebaseConfigured, true);
    assert.equal(body.capabilities.marketDataProvidersConnected, 0);
    assert.equal(body.capabilities.marketDataOverallStatus, 'UNAVAILABLE');
  });
});

test('GET /api/providers/health reports all adapters without fabricating live connections', async () => {
  await withTestServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/providers/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.overallStatus, 'UNAVAILABLE');
    assert.ok(Array.isArray(body.providers));
    assert.ok(body.providers.length >= 5);
    for (const provider of body.providers) {
      assert.equal(provider.dataStatus, 'UNAVAILABLE');
    }
  });
});

test('GET /api/instruments filters by category and marketScope and rejects invalid filters', async () => {
  await withTestServer(async (baseUrl) => {
    const metalsRes = await fetch(`${baseUrl}/api/instruments?category=METALS`);
    assert.equal(metalsRes.status, 200);
    const metalsBody = await metalsRes.json();
    assert.ok(metalsBody.count >= 5);
    assert.ok(metalsBody.instruments.every((i: { category: string }) => i.category === 'METALS'));

    const invalidRes = await fetch(`${baseUrl}/api/instruments?category=CRYPTO`);
    assert.equal(invalidRes.status, 400);
    const invalidBody = await invalidRes.json();
    assert.equal(invalidBody.error, 'VALIDATION_ERROR');
  });
});

test('GET /api/market/quotes fails closed with DATA_UNAVAILABLE and null prices', async () => {
  await withTestServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/market/quotes`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.overallStatus, 'UNAVAILABLE');
    assert.match(body.notice, /DATA_UNAVAILABLE/);
    assert.ok(body.quotes.length > 0);
    for (const q of body.quotes) {
      assert.equal(q.status, 'UNAVAILABLE');
      assert.equal(q.price, null);
      assert.equal(q.bid, null);
      assert.equal(q.ask, null);
      assert.equal(q.volume, null);
      assert.equal(q.openInterest, null);
      assert.equal(q.timestamp, null);
    }
  });
});
