import test from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { adminAuthStartupWarning, createRequireAdminToken, isDirectLoopbackRequest, tokensMatch } from './adminAuth.ts';

function call(
  mw: ReturnType<typeof createRequireAdminToken>,
  opts: { authorization?: string; remote?: string; headers?: Record<string, string> } = {}
): { status: number | null; next: boolean; headers: Record<string, string> } {
  const out = { status: null as number | null, next: false, headers: {} as Record<string, string> };
  const req = {
    headers: { ...(opts.authorization !== undefined ? { authorization: opts.authorization } : {}), ...(opts.headers ?? {}) },
    socket: { remoteAddress: opts.remote ?? '203.0.113.9' },
  } as unknown as Request;
  const res = {
    setHeader: (k: string, v: string) => void (out.headers[k] = v),
    status(c: number) {
      out.status = c;
      return this;
    },
    json() {
      return this;
    },
  } as unknown as Response;
  mw(req, res, () => void (out.next = true));
  return out;
}

test('adminAuth: token set requires exact Bearer token, even from loopback', () => {
  const mw = createRequireAdminToken({ token: 'secret-token-value-123' });
  assert.ok(call(mw, { authorization: 'Bearer secret-token-value-123' }).next);
  assert.ok(call(mw, { authorization: 'bearer   secret-token-value-123  ' }).next, 'scheme case-insensitive, whitespace tolerated');
  for (const bad of [undefined, '', 'Bearer', 'Bearer wrong', 'Basic secret-token-value-123', 'Bearer secret-token-value-123 extra', 'secret-token-value-123', 'Bearer secret-token-value-12']) {
    const r = call(mw, { authorization: bad, remote: '127.0.0.1' });
    assert.equal(r.next, false, `rejects ${String(bad)}`);
    assert.equal(r.status, 401);
    assert.equal(r.headers['WWW-Authenticate'], 'Bearer realm="admin"');
  }
});

test('adminAuth: token is trimmed; blank token means loopback-only mode', () => {
  assert.ok(call(createRequireAdminToken({ token: '  abc  ' }), { authorization: 'Bearer abc' }).next);
  for (const blank of ['', '   ', null]) {
    const mw = createRequireAdminToken({ token: blank });
    assert.ok(call(mw, { remote: '127.0.0.1' }).next);
    assert.equal(call(mw, { remote: '203.0.113.9' }).status, 403);
    assert.equal(call(mw, { remote: '203.0.113.9', authorization: 'Bearer anything' }).status, 403);
  }
});

test('adminAuth: loopback-only mode accepts only direct peers and refuses proxy headers', () => {
  const mw = createRequireAdminToken({ token: null });
  for (const addr of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) assert.ok(call(mw, { remote: addr }).next, addr);
  for (const addr of ['127.0.0.2', '::ffff:10.0.0.1', '', 'localhost']) assert.equal(call(mw, { remote: addr }).status, 403, addr);
  for (const h of ['x-forwarded-for', 'forwarded', 'x-real-ip']) {
    const r = call(mw, { remote: '127.0.0.1', headers: { [h]: '1.2.3.4' } });
    assert.equal(r.status, 403, `${h} makes loopback request non-direct`);
  }
});

test('adminAuth: default middleware follows ADMIN_API_TOKEN at request time', () => {
  const prev = process.env.ADMIN_API_TOKEN;
  try {
    const mw = createRequireAdminToken();
    delete process.env.ADMIN_API_TOKEN;
    assert.equal(call(mw).status, 403);
    process.env.ADMIN_API_TOKEN = 'late-bound-token';
    assert.equal(call(mw).status, 401);
    assert.ok(call(mw, { authorization: 'Bearer late-bound-token' }).next);
  } finally {
    if (prev === undefined) delete process.env.ADMIN_API_TOKEN;
    else process.env.ADMIN_API_TOKEN = prev;
  }
});

test('adminAuth helpers: tokensMatch, isDirectLoopbackRequest without socket, startup warning', () => {
  assert.equal(tokensMatch('a', 'a'), true);
  assert.equal(tokensMatch('a', 'b'), false);
  assert.equal(tokensMatch('', 'x'), false);
  assert.equal(isDirectLoopbackRequest({ headers: {} } as unknown as Request), false);
  assert.match(adminAuthStartupWarning(null) ?? '', /not set/);
  assert.match(adminAuthStartupWarning('short') ?? '', /shorter than 16/);
  assert.equal(adminAuthStartupWarning('0123456789abcdef'), null);
});
