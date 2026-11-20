import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchJsonWithRetry, safeReadJson } from './http';

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

test('fetchJsonWithRetry recovers cleanly when initial response is HTTP 200 proxy HTML', async () => {
  let calls = 0;
  const data = await fetchJsonWithRetry<{ commodities: number }>(
    '/api/cycle/overview',
    undefined,
    {
      retries: 2,
      delayMs: 5,
      fetchFn: async () => {
        calls += 1;
        if (calls === 1) {
          return new Response('<html><body>Warming up</body></html>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
          });
        }
        return new Response(JSON.stringify({ commodities: 21 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    }
  );
  assert.equal(calls, 2);
  assert.deepEqual(data, { commodities: 21 });
});

test('fetchJsonWithRetry does not retry permanent 4xx JSON API errors', async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      fetchJsonWithRetry('/api/cycle/profile/BAD', undefined, {
        retries: 2,
        delayMs: 5,
        fetchFn: async () => {
          calls += 1;
          return new Response(JSON.stringify({ message: 'Instrument not found' }), {
            status: 404,
            headers: { 'content-type': 'application/json' },
          });
        },
      }),
    (err: unknown) => err instanceof Error && err.message === 'Instrument not found'
  );
  assert.equal(calls, 1);
});

test('fetchJsonWithRetry stops immediately if aborted', async () => {
  const controller = new AbortController();
  controller.abort(new Error('Cancelled by caller'));
  let calls = 0;
  await assert.rejects(
    () =>
      fetchJsonWithRetry(
        '/api/cycle/overview',
        { signal: controller.signal },
        {
          retries: 2,
          delayMs: 5,
          fetchFn: async () => {
            calls += 1;
            return new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } });
          },
        }
      ),
    /Cancelled by caller|HTML/
  );
  assert.equal(calls, 1);
});
