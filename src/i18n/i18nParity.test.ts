import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vi } from './vi';
import { en } from './en';

const placeholders = (s: string): string[] =>
  [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();

test('vi and en have identical key sets', () => {
  const v = new Set(Object.keys(vi));
  const e = new Set(Object.keys(en));
  const missingEn = [...v].filter((k) => !e.has(k));
  const missingVi = [...e].filter((k) => !v.has(k));
  assert.deepEqual(missingEn, [], `keys missing in en: ${missingEn.join(', ')}`);
  assert.deepEqual(missingVi, [], `keys missing in vi: ${missingVi.join(', ')}`);
});

test('vi and en use identical placeholders per key', () => {
  const bad: string[] = [];
  for (const k of Object.keys(vi)) {
    const a = placeholders((vi as Record<string, string>)[k] ?? '');
    const b = placeholders((en as Record<string, string>)[k] ?? '');
    if (a.join(',') !== b.join(',')) bad.push(`${k}: vi{${a}} en{${b}}`);
  }
  assert.deepEqual(bad, []);
});
