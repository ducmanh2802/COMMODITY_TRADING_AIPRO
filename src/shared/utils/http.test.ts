import test from 'node:test';
import assert from 'node:assert/strict';
import { safeReadJson } from './http';

test('safeReadJson parses valid JSON responses cleanly', async () => {
  const res = new Response(JSON.stringify({ ok: true, count: 5 }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  const data = await safeReadJson<{ ok: boolean; count: number }>(res);
  assert.deepEqual(data, { ok: true, count: 5 });
});

test('safeReadJson rejects HTML proxy error responses with clear message instead of SyntaxError', async () => {
  const res = new Response('<html><head><title>502 Bad Gateway</title></head><body>Restarting</body></html>', {
    status: 502,
    headers: { 'content-type': 'text/html' },
  });
  await assert.rejects(
    () => safeReadJson(res),
    (err: unknown) =>
      err instanceof Error &&
      err.message.includes('HTTP 502') &&
      !err.message.includes('Unexpected token')
  );
});

test('safeReadJson surfaces JSON error message when status is not ok', async () => {
  const res = new Response(JSON.stringify({ message: 'Rate limit exceeded' }), {
    status: 429,
    headers: { 'content-type': 'application/json' },
  });
  await assert.rejects(
    () => safeReadJson(res),
    (err: unknown) => err instanceof Error && err.message === 'Rate limit exceeded'
  );
});
