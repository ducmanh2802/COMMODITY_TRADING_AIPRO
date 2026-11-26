import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { apiCacheHints, staticCacheControl, staticSetHeaders } from './cacheHeaders.ts';
import { staticCompress } from './staticCompress.ts';

async function withServer<T>(app: express.Express, fn: (base: string) => Promise<T>): Promise<T> {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  try {
    return await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.close();
  }
}

test('staticCacheControl policy', () => {
  assert.equal(staticCacheControl('/assets/index-abc123.js'), 'public, max-age=31536000, immutable');
  assert.equal(staticCacheControl('/index.html'), 'no-cache');
  assert.equal(staticCacheControl('/sw.js'), 'no-cache');
  assert.equal(staticCacheControl('/manifest.webmanifest'), 'no-cache');
  assert.equal(staticCacheControl('/markets'), 'no-cache');
});

test('static server sends immutable for /assets and no-cache for index.html and sw.js', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dist-'));
  try {
    fs.mkdirSync(path.join(dir, 'assets'));
    fs.writeFileSync(path.join(dir, 'assets', 'app-1.js'), 'a'.repeat(3000));
    fs.writeFileSync(path.join(dir, 'assets', 'logo-1.png'), 'png');
    fs.writeFileSync(path.join(dir, 'index.html'), '<html></html>');
    fs.writeFileSync(path.join(dir, 'sw.js'), 'self.x=1');
    const app = express();
    app.use(staticCompress(dir));
    app.use(express.static(dir, { index: false, setHeaders: staticSetHeaders(dir) }));
    await withServer(app, async (base) => {
      const cc = async (p: string, enc = 'identity') =>
        (await fetch(base + p, { headers: { 'accept-encoding': enc } })).headers.get('cache-control');
      assert.equal(await cc('/assets/app-1.js', 'br'), 'public, max-age=31536000, immutable');
      assert.equal(await cc('/assets/logo-1.png'), 'public, max-age=31536000, immutable');
      assert.equal(await cc('/index.html'), 'no-cache');
      assert.equal(await cc('/sw.js'), 'no-cache');
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('apiCacheHints: private short cache + 304, never on errors/auth/unlisted', async () => {
  const app = express();
  app.use(apiCacheHints());
  app.get('/api/strategies', (_req, res) => res.json({ a: 1 }));
  app.get('/api/macro/overview', (_req, res) => res.status(503).json({ error: 'x' }));
  app.get('/api/market/quotes', (_req, res) => res.json({ price: 1 }));
  await withServer(app, async (base) => {
    const r = await fetch(`${base}/api/strategies`);
    assert.equal(r.headers.get('cache-control'), 'private, max-age=3600');
    const etag = r.headers.get('etag');
    assert.ok(etag);
    // fetch() never surfaces 304s, so use node:http for the conditional request.
    const status = await new Promise<number>((resolve, reject) => {
      http.get(`${base}/api/strategies`, { headers: { 'if-none-match': etag } }, (m) => {
        m.resume();
        resolve(m.statusCode ?? 0);
      }).on('error', reject);
    });
    assert.equal(status, 304);
    const auth = await fetch(`${base}/api/strategies`, { headers: { authorization: 'Bearer x' } });
    assert.equal(auth.headers.get('cache-control'), null);
    const err = await fetch(`${base}/api/macro/overview`);
    assert.equal(err.headers.get('cache-control'), 'no-store');
    const q = await fetch(`${base}/api/market/quotes`);
    assert.equal(q.headers.get('cache-control'), null);
  });
});
