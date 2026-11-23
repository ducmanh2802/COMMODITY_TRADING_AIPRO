import test from 'node:test';
import assert from 'node:assert/strict';
import { RequestCache } from './requestCache';

function setup() {
  let t = 1000;
  const cache = new RequestCache(() => t);
  let calls = 0;
  const loader = (v = 'x') => async () => {
    calls += 1;
    return `${v}${calls}`;
  };
  return { cache, loader, advance: (ms: number) => (t += ms), calls: () => calls };
}

test('serves cached value within TTL', async () => {
  const s = setup();
  assert.equal(await s.cache.get('/a', s.loader(), { ttlMs: 100 }), 'x1');
  s.advance(50);
  assert.equal(await s.cache.get('/a', s.loader(), { ttlMs: 100 }), 'x1');
  assert.equal(s.calls(), 1);
});

test('dedupes in-flight identical requests', async () => {
  const s = setup();
  const [a, b] = await Promise.all([s.cache.get('/a', s.loader()), s.cache.get('/a', s.loader())]);
  assert.equal(a, b);
  assert.equal(s.calls(), 1);
});

test('stale-while-revalidate returns stale then refreshes', async () => {
  const s = setup();
  await s.cache.get('/a', s.loader(), { ttlMs: 100 });
  s.advance(150);
  assert.equal(await s.cache.get('/a', s.loader(), { ttlMs: 100 }), 'x1');
  await new Promise((r) => setImmediate(r));
  assert.equal(s.calls(), 2);
  assert.equal(await s.cache.get('/a', s.loader(), { ttlMs: 100 }), 'x2');
});

test('too-stale entry is awaited, not served', async () => {
  const s = setup();
  await s.cache.get('/a', s.loader(), { ttlMs: 100, maxStaleMs: 200 });
  s.advance(250);
  assert.equal(await s.cache.get('/a', s.loader(), { ttlMs: 100, maxStaleMs: 200 }), 'x2');
});

test('invalidate(prefix) drops matching entries only', async () => {
  const s = setup();
  await s.cache.get('/api/domestic-prices', s.loader('d'));
  await s.cache.get('/api/today', s.loader('t'));
  s.cache.invalidate('/api/domestic');
  assert.equal(await s.cache.get('/api/domestic-prices', s.loader('d')), 'd3');
  assert.equal(await s.cache.get('/api/today', s.loader('t')), 't2');
});

test('ttlMs 0 bypasses cache; failures are not cached', async () => {
  const s = setup();
  await s.cache.get('/a', s.loader(), { ttlMs: 0 });
  await s.cache.get('/a', s.loader(), { ttlMs: 0 });
  assert.equal(s.calls(), 2);
  await assert.rejects(s.cache.get('/b', async () => { throw new Error('boom'); }));
  assert.equal(await s.cache.get('/b', s.loader('b')), 'b3');
});
