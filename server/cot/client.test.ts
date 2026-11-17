import test from 'node:test';
import assert from 'node:assert/strict';
import { CftcClient, CftcFetchError } from './client.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

test('builds a SoQL URL filtered by market code and report date', () => {
  const c = new CftcClient({ appToken: null, fetchImpl: async () => jsonResponse([]) });
  const url = new URL(c.buildUrl({ reportType: 'DISAGGREGATED', marketCode: '002602', from: '2023-01-01' }));
  assert.equal(url.origin + url.pathname, 'https://publicreporting.cftc.gov/resource/72hh-3qpy.json');
  assert.equal(
    url.searchParams.get('$where'),
    "cftc_contract_market_code='002602' AND report_date_as_yyyy_mm_dd >= '2023-01-01T00:00:00.000'"
  );
  assert.equal(url.searchParams.get('$order'), 'report_date_as_yyyy_mm_dd ASC');
  assert.match(c.buildUrl({ reportType: 'LEGACY', marketCode: '002602', from: '2023-01-01' }), /6dca-aqww\.json/);
  assert.throws(() => c.buildUrl({ reportType: 'LEGACY', marketCode: "0' OR 1=1", from: '2023-01-01' }));
});

test('retries 5xx/429/network errors with backoff, sends X-App-Token, paginates sequentially', async () => {
  const calls: { url: string; token: string | null }[] = [];
  const sleeps: number[] = [];
  const script: Array<() => Response> = [
    () => jsonResponse({ message: 'busy' }, 503),
    () => {
      throw new TypeError('fetch failed');
    },
    () => jsonResponse([{ a: 1 }, { a: 2 }]), // full page (pageSize 2) → next page
    () => jsonResponse({}, 429),
    () => jsonResponse([{ a: 3 }]),
  ];
  const c = new CftcClient({
    appToken: 'tok',
    pageSize: 2,
    backoffBaseMs: 100,
    pageDelayMs: 7,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    fetchImpl: (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), token: new Headers(init?.headers).get('X-App-Token') });
      return script.shift()!();
    }) as typeof fetch,
  });
  const res = await c.fetchReports({ reportType: 'DISAGGREGATED', marketCode: '002602', from: '2026-01-01' });
  assert.equal(res.records.length, 3);
  assert.equal(res.pages, 2);
  assert.equal(calls.length, 5);
  assert.ok(calls.every((x) => x.token === 'tok'));
  assert.equal(new URL(calls[4].url).searchParams.get('$offset'), '2');
  assert.deepEqual(sleeps, [100, 200, 7, 100]);
});

test('does not retry a 403 and gives up after maxAttempts on persistent 5xx', async () => {
  let n = 0;
  const c403 = new CftcClient({
    appToken: null,
    sleep: async () => {},
    fetchImpl: (async () => {
      n += 1;
      return new Response('Forbidden', { status: 403 });
    }) as typeof fetch,
  });
  await assert.rejects(
    c403.fetchReports({ reportType: 'LEGACY', marketCode: '002602', from: '2026-01-01' }),
    (e: unknown) => e instanceof CftcFetchError && e.httpStatus === 403 && e.attempts === 1
  );
  assert.equal(n, 1);

  n = 0;
  const c500 = new CftcClient({
    appToken: null,
    maxAttempts: 3,
    sleep: async () => {},
    fetchImpl: (async () => {
      n += 1;
      return new Response('err', { status: 500 });
    }) as typeof fetch,
  });
  await assert.rejects(
    c500.fetchReports({ reportType: 'LEGACY', marketCode: '002602', from: '2026-01-01' }),
    (e: unknown) => e instanceof CftcFetchError && e.httpStatus === 500
  );
  assert.equal(n, 3);
});

test('rejects non-array JSON bodies', async () => {
  const c = new CftcClient({ appToken: null, fetchImpl: (async () => jsonResponse({ error: true })) as typeof fetch });
  await assert.rejects(c.fetchReports({ reportType: 'LEGACY', marketCode: '002602', from: '2026-01-01' }), CftcFetchError);
});
