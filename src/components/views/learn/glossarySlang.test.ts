import test from 'node:test';
import assert from 'node:assert/strict';
import { filterSlang, SLANG, SLANG_TAGS } from './glossarySlang';

test('slang glossary integrity', () => {
  assert.ok(SLANG.length >= 60, `only ${SLANG.length}`);
  assert.equal(new Set(SLANG.map((s) => s.id)).size, SLANG.length);
  assert.equal(new Set(SLANG.map((s) => s.term)).size, SLANG.length);
  for (const s of SLANG) {
    for (const f of [s.id, s.term, s.meaning, s.example, s.related]) assert.ok(f.trim().length > 0, s.id);
    assert.ok(s.tags.length > 0, s.id);
    for (const t of s.tags) assert.ok(SLANG_TAGS.includes(t), s.id);
  }
  for (const id of ['sanma', 'keo']) assert.ok(SLANG.find((s) => s.id === id)?.warning, id);
});

test('filterSlang searches and filters', () => {
  assert.ok(filterSlang(SLANG, 'đòn bẩy', null).length >= 1);
  assert.ok(filterSlang(SLANG, '', 'phái sinh').every((s) => s.tags.includes('phái sinh')));
});
