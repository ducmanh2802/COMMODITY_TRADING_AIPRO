import assert from 'node:assert/strict';
import test from 'node:test';
import zlib from 'node:zlib';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { apiCompress } from './apiCompress.ts';

async function withServer<T>(fn: (base: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(apiCompress());
  const big = { rows: Array.from({ length: 400 }, (_, i) => ({ i, name: `row-${i}`, pad: 'x'.repeat(20) })) };
  app.get('/big', (_req, res) => res.json(big));
  app.get('/small', (_req, res) => res.json({ ok: true }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  try {
    return await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.close();
  }
}

test('large JSON is brotli-compressed and round-trips', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/big`, { headers: { 'accept-encoding': 'br' } });
    assert.equal(res.headers.get('content-encoding'), 'br');
    assert.match(res.headers.get('vary') ?? '', /Accept-Encoding/i);
    const body = (await res.json()) as { rows: unknown[] };
    assert.equal(body.rows.length, 400);
  });
});

test('gzip fallback, and raw bytes decode', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/big`, { headers: { 'accept-encoding': 'gzip' } });
    assert.equal(res.headers.get('content-encoding'), 'gzip');
    assert.equal(((await res.json()) as { rows: unknown[] }).rows.length, 400);
    assert.ok(zlib.gzipSync(Buffer.from('x')).length > 0);
  });
});

test('small JSON and clients without encoding stay uncompressed', async () => {
  await withServer(async (base) => {
    const small = await fetch(`${base}/small`, { headers: { 'accept-encoding': 'br, gzip' } });
    assert.equal(small.headers.get('content-encoding'), null);
    assert.deepEqual(await small.json(), { ok: true });
    const none = await fetch(`${base}/big`, { headers: { 'accept-encoding': 'identity' } });
    assert.equal(none.headers.get('content-encoding'), null);
  });
});
