/** Shared fault-injection helpers for provider resilience tests (no network). */
export type FetchLike = typeof fetch;

export interface Fault {
  name: string;
  /** Builds a fetch stub; `seen` collects the init objects passed in (to assert timeouts / headers). */
  make(seen: Array<RequestInit | undefined>): FetchLike;
}

const rec = (seen: Array<RequestInit | undefined>, init?: RequestInit) => {
  seen.push(init);
};

const respond = (body: string, status = 200, contentType = 'application/json'): Response =>
  new Response(body, { status, headers: { 'content-type': contentType } });

const stub =
  (fn: () => Promise<Response>) =>
  (seen: Array<RequestInit | undefined>): FetchLike =>
    (async (_url: unknown, init?: RequestInit) => {
      rec(seen, init);
      return fn();
    }) as unknown as FetchLike;

export const FAULTS: Fault[] = [
  { name: 'network error', make: stub(async () => { throw new TypeError('fetch failed'); }) },
  {
    name: 'timeout',
    make: stub(async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    }),
  },
  { name: 'HTTP 429', make: stub(async () => respond('{"message":"rate limited"}', 429)) },
  { name: 'HTTP 500 html', make: stub(async () => respond('<html>oops</html>', 500, 'text/html')) },
  { name: 'HTML instead of JSON', make: stub(async () => respond('<!doctype html><html><body>Blocked</body></html>', 200, 'text/html')) },
  { name: 'empty array', make: stub(async () => respond('[]')) },
  { name: 'empty object', make: stub(async () => respond('{}')) },
  { name: 'null body', make: stub(async () => respond('null')) },
  { name: 'empty body', make: stub(async () => respond('')) },
];

/** 200 JSON bodies with malformed numerics under many provider key names. */
export function malformedBodies(): Array<{ name: string; body: unknown }> {
  const ts = Math.floor(Date.now() / 1000);
  const mk = (v: unknown) => ({
    // Twelve Data / generic quote
    close: v, price: v, volume: v, datetime: new Date().toISOString(), timestamp: ts,
    // FMP quote array
    ...{},
  });
  return [
    { name: 'NaN string', body: mk('NaN') },
    { name: 'null price', body: mk(null) },
    { name: 'negative price', body: mk(-5) },
    { name: 'zero price', body: mk(0) },
    { name: 'empty-string price', body: mk('') },
    { name: 'FMP array NaN', body: [{ symbol: 'X', price: 'NaN', volume: 0, timestamp: ts }] },
    { name: 'FMP array negative', body: [{ symbol: 'X', price: -3, volume: -1, timestamp: ts }] },
    { name: 'FMP array null', body: [{ symbol: 'X', price: null, timestamp: ts }] },
    { name: 'values NaN', body: { values: [{ datetime: '2026-08-03 12:00:00', open: 'NaN', high: 'NaN', low: 'NaN', close: 'NaN' }] } },
    { name: 'values negative', body: { values: [{ datetime: '2026-08-03 12:00:00', open: '-1', high: '-1', low: '-1', close: '-1' }] } },
    { name: 'values null', body: { values: [{ datetime: '2026-08-03 12:00:00', open: null, high: null, low: null, close: null }] } },
  ];
}

export function jsonFetch(body: unknown, seen: Array<RequestInit | undefined> = []): FetchLike {
  return (async (_u: unknown, init?: RequestInit) => {
    rec(seen, init);
    return respond(JSON.stringify(body));
  }) as unknown as FetchLike;
}

export function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return fn().finally(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
}

/** Runs fn with globalThis.fetch replaced. */
export async function withGlobalFetch<T>(f: FetchLike, fn: () => Promise<T>): Promise<T> {
  const prev = globalThis.fetch;
  globalThis.fetch = f;
  try {
    return await fn();
  } finally {
    globalThis.fetch = prev;
  }
}
