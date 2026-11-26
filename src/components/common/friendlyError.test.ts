import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyError, toUserError } from './friendlyError';
import { vi } from '../../i18n/vi';

const k = (e: unknown, online = true) => classifyError(e, online);

test('TypeError failed to fetch -> network / offline', () => {
  assert.equal(k(new TypeError('Failed to fetch')), 'network');
  assert.equal(k(new TypeError('Failed to fetch'), false), 'offline');
});

test('TypeError programming bug -> unknown (raw text only in detail)', () => {
  const u = toUserError(new TypeError("Cannot read properties of undefined (reading 'x')"), undefined, undefined, true);
  assert.equal(u.kind, 'unknown');
  assert.equal(u.message, vi['err2.unknown']);
  assert.match(u.detail, /Cannot read properties/);
  assert.ok(!u.message.includes('Cannot read'));
});

test('AbortError / TimeoutError -> timeout', () => {
  assert.equal(k(new DOMException('The operation was aborted', 'AbortError')), 'timeout');
  assert.equal(k({ name: 'TimeoutError', message: 'x' }), 'timeout');
});

test('Response-like status codes', () => {
  assert.equal(k({ status: 429 }), 'rateLimited');
  assert.equal(k({ httpStatus: 502, message: 'bad' }), 'server');
  assert.equal(k({ status: 503 }), 'server');
  assert.equal(k({ status: 504 }), 'timeout');
  assert.equal(k({ status: 401 }), 'auth');
  assert.equal(k({ status: 404 }), 'notFound');
  assert.equal(k({ status: 400 }), 'client');
  const u = toUserError({ status: 429 }, undefined, undefined, true);
  assert.equal(u.message, 'Bạn thao tác quá nhanh, thử lại sau ít giây.');
  assert.equal(u.detail, 'HTTP 429');
});

test('strings', () => {
  assert.equal(k('HTTP 502'), 'server');
  assert.equal(k('Máy chủ đang khởi động lại (HTTP 503). Vui lòng thử lại'), 'server');
  assert.equal(k('Phản hồi không phải JSON hợp lệ (HTTP 200).'), 'parse');
  assert.equal(k('something odd'), 'unknown');
});

test('JSON parse errors -> parse', () => {
  assert.equal(k(new SyntaxError('Unexpected token < in JSON at position 0')), 'parse');
});

test('unknown inputs and fallback', () => {
  assert.equal(k(null), 'unknown');
  assert.equal(k(undefined), 'unknown');
  assert.equal(k({ foo: 1 }), 'unknown');
  assert.equal(toUserError(42, 'Không tải được biểu đồ', undefined, true).message, 'Không tải được biểu đồ');
  assert.equal(toUserError(new Error('boom'), undefined, undefined, true).message, vi['err2.unknown']);
});
