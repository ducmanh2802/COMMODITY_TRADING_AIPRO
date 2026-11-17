import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApiApp, type CreateApiAppOptions } from './app.ts';
import { ProviderRegistry } from './providers/registry.ts';
import { InMemoryCandleRepository } from './storage/candleRepository.ts';

async function withTestServer(
  run: (baseUrl: string) => Promise<void>,
  options?: CreateApiAppOptions
): Promise<void> {
  // Always inject an in-memory candle store so tests never open the real data/market.db.
  const app = createApiApp({ candles: new InMemoryCandleRepository(), ...options });
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

test('central error handler returns a generic message with request id and logs the full error', async () => {
  const secret = 'db password=hunter2 at /internal/path';
  const logged: unknown[] = [];
  const throwingProviders = new ProviderRegistry();
  throwingProviders.getAllHealth = async () => {
    throw new Error(secret);
  };
  await withTestServer(
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/health`);
      assert.equal(res.status, 500);
      const text = await res.text();
      assert.ok(!text.includes('hunter2'), 'response must not leak the error message');
      const body = JSON.parse(text);
      assert.equal(body.error, 'INTERNAL_SERVER_ERROR');
      assert.equal(body.message, 'An unexpected server error occurred.');
      assert.equal(typeof body.requestId, 'string');
      assert.ok(body.requestId.length > 0);
      assert.equal(res.headers.get('x-request-id'), body.requestId);
      assert.equal(logged.length, 1);
      assert.ok(logged[0] instanceof Error && logged[0].message === secret);
    },
    {
      providers: throwingProviders,
      logError: (_message, err) => {
        logged.push(err);
      },
    }
  );
});

test('malformed JSON body returns 400 VALIDATION_ERROR without echoing parser details', async () => {
  await withTestServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"broken": ',
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'VALIDATION_ERROR');
    assert.equal(body.message, 'Malformed JSON request body.');
    assert.equal(typeof body.requestId, 'string');
  });
});

test('unknown /api route returns 404 JSON', async () => {
  await withTestServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/does-not-exist`);
    assert.equal(res.status, 404);
    assert.match(res.headers.get('content-type') ?? '', /application\/json/);
    const body = await res.json();
    assert.equal(body.error, 'NOT_FOUND');
  });
});

test('GET /api/market/quotes/:symbol returns 404 for unknown and 400 for invalid symbols', async () => {
  await withTestServer(async (baseUrl) => {
    const unknownRes = await fetch(`${baseUrl}/api/market/quotes/NOTREAL123`);
    assert.equal(unknownRes.status, 404);
    const unknownBody = await unknownRes.json();
    assert.equal(unknownBody.error, 'INSTRUMENT_NOT_FOUND');

    const invalidRes = await fetch(`${baseUrl}/api/market/quotes/${encodeURIComponent('bad$symbol!')}`);
    assert.equal(invalidRes.status, 400);
    const invalidBody = await invalidRes.json();
    assert.equal(invalidBody.error, 'VALIDATION_ERROR');

    const tooLongRes = await fetch(`${baseUrl}/api/market/quotes/${'A'.repeat(25)}`);
    assert.equal(tooLongRes.status, 400);
  });
});

test('GET /api/market/quotes/:symbol for a known symbol fails closed with null price', async () => {
  await withTestServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/market/quotes/ZS`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.quote.status, 'UNAVAILABLE');
    assert.equal(body.quote.price, null);
    assert.equal(body.quote.source, 'CME_GROUP');
  });
});

test('security headers are set and X-Powered-By is disabled', async () => {
  await withTestServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/architecture`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.equal(res.headers.get('x-powered-by'), null);
    assert.equal(res.headers.get('content-security-policy'), null);
  });
});

test('rate limiter returns 429 with Retry-After after the configured limit', async () => {
  await withTestServer(
    async (baseUrl) => {
      for (let i = 0; i < 3; i += 1) {
        const ok = await fetch(`${baseUrl}/api/architecture`);
        assert.equal(ok.status, 200);
        await ok.arrayBuffer();
      }
      const limited = await fetch(`${baseUrl}/api/architecture`);
      assert.equal(limited.status, 429);
      const retryAfter = Number(limited.headers.get('retry-after'));
      assert.ok(Number.isInteger(retryAfter) && retryAfter >= 1 && retryAfter <= 60);
      const body = await limited.json();
      assert.equal(body.error, 'RATE_LIMITED');
    },
    { rateLimit: { windowMs: 60_000, max: 3 } }
  );
});

test('rate limiter can be disabled via options', async () => {
  await withTestServer(
    async (baseUrl) => {
      for (let i = 0; i < 5; i += 1) {
        const res = await fetch(`${baseUrl}/api/architecture`);
        assert.equal(res.status, 200);
        await res.arrayBuffer();
      }
    },
    { rateLimit: false }
  );
});

test('provider registry routes each exchange to its explicit provider and fails closed otherwise', () => {
  const registry = new ProviderRegistry();
  const expected: Record<string, string> = {
    CBOT: 'CME_GROUP',
    CME: 'CME_GROUP',
    COMEX: 'CME_GROUP',
    NYMEX: 'NYMEX_ENERGY',
    ICE: 'ICE_FUTURES',
    MXV: 'MXV_OFFICIAL',
  };
  for (const [exchange, providerId] of Object.entries(expected)) {
    assert.equal(registry.getProviderForExchange(exchange)?.providerId, providerId, exchange);
  }
  assert.equal(registry.getProviderForExchange('LME'), null);
  assert.equal(registry.getProviderForExchange(''), null);
});

test('provider registry rejects routing to unregistered or unsupported providers', () => {
  assert.throws(() => new ProviderRegistry({ routing: { LME: 'CME_GROUP' } }), /does not declare support/);
  assert.throws(
    () => new ProviderRegistry({ configs: [], routing: { CME: 'CME_GROUP' } }),
    /unregistered provider/
  );
});
