import test from 'node:test';
import assert from 'node:assert/strict';
import { isStaticAsset, isApiGetRequest } from './pwa';

test('isStaticAsset identifies JS, CSS, font, image, and manifest files', () => {
  assert.equal(isStaticAsset('https://example.com/app.js'), true);
  assert.equal(isStaticAsset('https://example.com/styles.css'), true);
  assert.equal(isStaticAsset('https://example.com/font.woff2'), true);
  assert.equal(isStaticAsset('https://example.com/icon.png'), true);
  assert.equal(isStaticAsset('https://example.com/logo.svg'), true);
  assert.equal(isStaticAsset('https://example.com/favicon.ico'), true);
  assert.equal(isStaticAsset('https://example.com/manifest.webmanifest'), true);
});

test('isStaticAsset rejects HTML pages and API endpoints', () => {
  assert.equal(isStaticAsset('https://example.com/'), false);
  assert.equal(isStaticAsset('https://example.com/index.html'), false);
  assert.equal(isStaticAsset('https://example.com/api/market/candles'), false);
  assert.equal(isStaticAsset('https://example.com/api/data'), false);
});

test('isStaticAsset handles invalid URLs gracefully', () => {
  assert.equal(isStaticAsset('not-a-url'), false);
  assert.equal(isStaticAsset(''), false);
});

test('isApiGetRequest matches GET requests to /api/* paths', () => {
  const getReq = new Request('https://example.com/api/market/candles', { method: 'GET' });
  assert.equal(isApiGetRequest(getReq), true);
});

test('isApiGetRequest rejects POST requests to /api/*', () => {
  const postReq = new Request('https://example.com/api/market/candles', { method: 'POST' });
  assert.equal(isApiGetRequest(postReq), false);
});

test('isApiGetRequest rejects non-API paths', () => {
  const getReq = new Request('https://example.com/app.js', { method: 'GET' });
  assert.equal(isApiGetRequest(getReq), false);
});

test('isApiGetRequest handles invalid URLs gracefully', () => {
  // Request constructor throws on invalid URLs, but we test the internal logic
  // by mocking a Request-like object
  const invalidReq = { url: 'not-a-url', method: 'GET' } as unknown as Request;
  assert.equal(isApiGetRequest(invalidReq), false);
});