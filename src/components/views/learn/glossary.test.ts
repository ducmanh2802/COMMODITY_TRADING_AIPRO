import test from 'node:test';
import assert from 'node:assert/strict';
import { GLOSSARY } from './glossary';

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .toLowerCase()
    .trim();

test('glossary has no duplicate terms (case/diacritic-insensitive)', () => {
  const seen = new Set<string>();
  for (const g of GLOSSARY) {
    const k = norm(g.term);
    assert.ok(!seen.has(k), `duplicate glossary term: ${g.term}`);
    seen.add(k);
    assert.ok(g.def.trim().length > 0, `empty def: ${g.term}`);
  }
});
