import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { Logger, redact, redactUrl } from './logger.ts';
import { ErrorRing, LatencyTracker, percentile } from './observability.ts';
import { createApiApp } from '../app.ts';
import { InMemoryCandleRepository } from '../storage/candleRepository.ts';

test('logger emits JSON lines and redacts secrets', () => {
  const lines: string[] = [];
  const log = new Logger({ level: 'info', pretty: false, sink: (l) => lines.push(l) });
  log.debug('hidden');
  log.info('hello Bearer abc.def', {
    reqId: 'r1',
    route: '/x',
    durationMs: 5,
    authorization: 'Bearer zzz',
    nested: { adminToken: 's', ok: 1 },
    key: 'k',
  });
  assert.equal(lines.length, 1);
  const rec = JSON.parse(lines[0]);
  assert.equal(rec.level, 'info');
  assert.equal(rec.reqId, 'r1');
  assert.equal(rec.authorization, '[REDACTED]');
  assert.equal(rec.nested.adminToken, '[REDACTED]');
  assert.equal(rec.nested.ok, 1);
  assert.equal(rec.key, '[REDACTED]');
  assert.ok(!lines[0].includes('abc.def') && !lines[0].includes('zzz'));
  assert.equal((redact({ apiKey: 'x' }) as { apiKey: string }).apiKey, '[REDACTED]');
});

test('redactUrl hides key|token|secret query params', () => {
  assert.equal(
    redactUrl('/api/a?x=1&token=abc&apikey=q&secret=z'),
    '/api/a?x=1&token=[REDACTED]&apikey=[REDACTED]&secret=[REDACTED]',
  );
  assert.equal(redactUrl('/api/a'), '/api/a');
});

test('error ring keeps last N and counts by route', () => {
  const ring = new ErrorRing(3);
  const mk = (route: string, i: number) => ({
    ts: new Date().toISOString(),
    route,
    method: 'GET',
    status: 500,
    name: 'E',
    message: `m${i}`,
    reqId: '',
  });
  for (let i = 0; i < 5; i++) ring.record(mk(i % 2 ? '/a' : '/b', i));
  assert.equal(ring.list().length, 3);
  assert.equal(ring.list()[0].message, 'm4');
  assert.equal(ring.countsByRoute()['/b'], 3);
  assert.equal(ring.countSince(60_000), 3);
});

test('latency percentiles', () => {
  const t = new LatencyTracker(100);
  for (let i = 1; i <= 100; i++) t.record('/r', i);
  const [s] = t.summary();
  assert.equal(s.p50, 50);
  assert.equal(s.p95, 95);
  assert.equal(percentile([], 50), 0);
});

async function withApp(run: (base: string) => Promise<void>, adminToken: string | null) {
  const app = createApiApp({
    candles: new InMemoryCandleRepository(),
    rateLimit: false,
    adminToken,
    adminIsLoopback: () => false,
  });
  const server = await new Promise<import('node:http').Server>((r) => {
    const s = app.listen(0, '127.0.0.1', () => r(s));
  });
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

test('GET /api/status is public with expected shape; /errors needs admin', async () => {
  await withApp(async (base) => {
    const res = await fetch(`${base}/api/status`);
    assert.equal(res.status, 200);
    const b = await res.json();
    for (const k of ['uptimeSec', 'version', 'nodeVersion', 'memory', 'scheduler', 'providers', 'db', 'errors', 'latency']) {
      assert.ok(k in b, k);
    }
    assert.equal(b.scheduler.enabled, false);
    assert.equal(typeof b.errors.last1h, 'number');
    assert.equal((await fetch(`${base}/api/status/errors`)).status, 401);
    const ok = await fetch(`${base}/api/status/errors`, { headers: { Authorization: 'Bearer tok' } });
    assert.equal(ok.status, 200);
    assert.ok(Array.isArray((await ok.json()).recent));
  }, 'tok');
});
