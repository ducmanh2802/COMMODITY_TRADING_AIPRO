import test from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { createRateLimiter, rateLimitOptionsFromEnv } from './rateLimit.ts';

interface Captured {
  headers: Record<string, string>;
  status: number | null;
  body: unknown;
  nextCalled: boolean;
}

function run(handler: ReturnType<typeof createRateLimiter>, method: string, ip: string): Captured {
  const out: Captured = { headers: {}, status: null, body: null, nextCalled: false };
  const req = { method, ip, socket: { remoteAddress: ip } } as unknown as Request;
  const res = {
    setHeader: (k: string, v: string) => void (out.headers[k] = v),
    status(code: number) {
      out.status = code;
      return this;
    },
    json(b: unknown) {
      out.body = b;
      return this;
    },
  } as unknown as Response;
  handler(req, res, () => void (out.nextCalled = true));
  return out;
}

test('rateLimit: allows max requests then 429 with Retry-After, resets after the window', () => {
  let t = 1_000;
  const h = createRateLimiter({ windowMs: 10_000, max: 2, now: () => t });
  assert.ok(run(h, 'POST', 'a').nextCalled);
  const second = run(h, 'POST', 'a');
  assert.ok(second.nextCalled);
  assert.equal(second.headers['RateLimit-Remaining'], '0');
  const blocked = run(h, 'POST', 'a');
  assert.equal(blocked.nextCalled, false);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers['Retry-After'], '10');
  t += 9_999;
  assert.equal(run(h, 'POST', 'a').status, 429);
  t += 1; // exactly windowMs after windowStart -> new window
  assert.ok(run(h, 'POST', 'a').nextCalled);
});

test('rateLimit: clients are isolated and reads use a separate bucket from writes', () => {
  const h = createRateLimiter({ windowMs: 60_000, max: 1, readMax: 3, now: () => 0 });
  assert.ok(run(h, 'POST', 'a').nextCalled);
  assert.equal(run(h, 'POST', 'a').status, 429);
  assert.ok(run(h, 'POST', 'b').nextCalled, 'other client unaffected');
  for (let i = 0; i < 3; i++) assert.ok(run(h, 'get', 'a').nextCalled, 'lowercase method counts as read');
  assert.equal(run(h, 'GET', 'a').status, 429);
  assert.equal(run(h, 'GET', 'a').headers['RateLimit-Limit'], '3');
});

test('rateLimit: without readMax, reads share the write budget', () => {
  const h = createRateLimiter({ windowMs: 60_000, max: 1, now: () => 0 });
  assert.ok(run(h, 'GET', 'a').nextCalled);
  assert.equal(run(h, 'POST', 'a').status, 429);
});

test('rateLimit: degenerate options are clamped (max<1, windowMs<1)', () => {
  const h = createRateLimiter({ windowMs: 0, max: 0, now: () => 5 });
  assert.ok(run(h, 'POST', 'a').nextCalled, 'max clamped to 1');
  assert.equal(run(h, 'POST', 'a').status, 429);
});

test('rateLimit: sweep drops expired keys without breaking live ones', () => {
  let t = 0;
  const h = createRateLimiter({ windowMs: 100, max: 1, now: () => t });
  run(h, 'POST', 'old');
  t = 60;
  run(h, 'POST', 'live');
  t = 150; // 'old' expired, 'live' still in window (started at 60)
  assert.ok(run(h, 'POST', 'other').nextCalled);
  assert.equal(run(h, 'POST', 'live').status, 429);
  assert.ok(run(h, 'POST', 'old').nextCalled);
});

test('rateLimitOptionsFromEnv: defaults, overrides, junk falls back, disabled', () => {
  assert.deepEqual(rateLimitOptionsFromEnv({}), { windowMs: 60_000, max: 300, readMax: 1200 });
  assert.deepEqual(
    rateLimitOptionsFromEnv({ API_RATE_LIMIT_WINDOW_MS: '5000', API_RATE_LIMIT_MAX: '10', API_RATE_LIMIT_READ_MAX: '20' }),
    { windowMs: 5000, max: 10, readMax: 20 }
  );
  assert.deepEqual(
    rateLimitOptionsFromEnv({ API_RATE_LIMIT_WINDOW_MS: 'abc', API_RATE_LIMIT_MAX: '-5', API_RATE_LIMIT_READ_MAX: '0' }),
    { windowMs: 60_000, max: 300, readMax: 1200 }
  );
  assert.equal(rateLimitOptionsFromEnv({ API_RATE_LIMIT_DISABLED: ' TRUE ' }), null);
  assert.notEqual(rateLimitOptionsFromEnv({ API_RATE_LIMIT_DISABLED: 'false' }), null);
});
