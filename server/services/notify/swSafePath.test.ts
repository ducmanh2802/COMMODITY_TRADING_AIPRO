import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

test('sw.js safePath only allows same-origin paths (no open redirect via push payload url)', () => {
  const src = readFileSync('public/sw.js', 'utf8');
  const m = /function safePath\(u\) \{[\s\S]*?\n\}/.exec(src);
  assert.ok(m, 'safePath present');
  const safePath = vm.runInNewContext(`(${m[0].replace('function safePath', 'function')})`) as (u: unknown) => string;
  assert.equal(safePath('/contest'), '/contest');
  for (const bad of ['//evil.example', '/\\evil.example', 'https://evil.example', 'javascript:alert(1)', 42, undefined]) assert.equal(safePath(bad), '/');
});
