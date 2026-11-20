import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SwrCache } from './swrCache.ts';

function setup(ttlMs = 1000) {
  let t = 0;
  let n = 0;
  let release: (() => void) | null = null;
  let fail = false;
  const cache = new SwrCache<number>({
    ttlMs,
    now: () => t,
    compute: async () => {
      if (release === null && n > 0) await new Promise<void>((r) => (release = r));
      if (fail) throw new Error('boom');
      return ++n;
    },
  });
  return { cache, tick: (ms: number) => (t += ms), release: () => { const r = release; release = null; r?.(); }, fail: (v: boolean) => (fail = v), calls: () => n };
}

test('first call waits; fresh calls reuse value', async () => {
  const s = setup();
  const a = await s.cache.get();
  assert.equal(a.value, 1);
  assert.equal(a.stale, false);
  assert.equal((await s.cache.get()).value, 1);
  assert.equal(s.calls(), 1);
});

test('stale value is served immediately while a single background refresh runs', async () => {
  const s = setup();
  await s.cache.get();
  s.tick(2000);
  const b = await s.cache.get(); // does not block on the blocked compute
  assert.equal(b.value, 1);
  assert.equal(b.stale, true);
  assert.equal(b.refreshing, true);
  const c = await s.cache.get();
  assert.equal(c.value, 1);
  s.release();
  await s.cache.refresh();
  const d = await s.cache.get();
  assert.equal(d.value, 2);
  assert.equal(d.stale, false);
});

test('failed refresh keeps previous value and records the error', async () => {
  const s = setup();
  await s.cache.get();
  s.tick(2000);
  s.fail(true);
  const b = await s.cache.get();
  s.release();
  await s.cache.refresh();
  assert.equal(b.value, 1);
  assert.equal((await s.cache.get()).value, 1);
  assert.equal(s.cache.lastError, 'boom');
});

test('invalidate marks stale without dropping the value', async () => {
  const s = setup();
  await s.cache.get();
  s.cache.invalidate();
  assert.equal(s.cache.peek()?.stale, true);
  assert.equal(s.cache.peek()?.value, 1);
});

test('first-call failure rejects', async () => {
  const cache = new SwrCache<number>({ ttlMs: 10, compute: async () => { throw new Error('x'); } });
  await assert.rejects(() => cache.get(), /x/);
});
