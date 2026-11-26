import assert from 'node:assert/strict';
import { test } from 'node:test';
import { moveIndex, normalizeText, rankEntries } from './paletteMatch';

test('normalizeText strips Vietnamese marks and đ', () => {
  assert.equal(normalizeText('Hợp đồng Tương lai'), 'hop dong tuong lai');
  assert.equal(normalizeText('  ĐÒN   BẨY '), 'don bay');
});

test('diacritic-insensitive match both ways', () => {
  const es = [{ id: 'a', label: 'Ký quỹ ban đầu' }, { id: 'b', label: 'Tin hàng hoá' }];
  assert.deepEqual(rankEntries(es, 'ky quy').map((e) => e.id), ['a']);
  assert.deepEqual(rankEntries(es, 'hoá').map((e) => e.id), ['b']);
  assert.deepEqual(rankEntries(es, 'HANG HOA').map((e) => e.id), ['b']);
});

test('all tokens required, no match returns empty', () => {
  const es = [{ id: 'a', label: 'Giá dầu thô' }];
  assert.equal(rankEntries(es, 'dau vang').length, 0);
  assert.equal(rankEntries(es, 'dau tho').length, 1);
});

test('ranking: prefix before word start before substring before keywords', () => {
  const es = [
    { id: 'kw', label: 'Zzz', keywords: 'margin' },
    { id: 'sub', label: 'Xmargin' },
    { id: 'word', label: 'Ký margin' },
    { id: 'pre', label: 'Margin call' },
  ];
  assert.deepEqual(rankEntries(es, 'margin').map((e) => e.id), ['pre', 'word', 'sub', 'kw']);
});

test('empty query returns first entries up to limit', () => {
  const es = [1, 2, 3].map((n) => ({ id: String(n), label: `L${n}` }));
  assert.equal(rankEntries(es, '  ', 2).length, 2);
});

test('moveIndex wraps and handles empty', () => {
  assert.equal(moveIndex(-1, 1, 3), 0);
  assert.equal(moveIndex(-1, -1, 3), 2);
  assert.equal(moveIndex(2, 1, 3), 0);
  assert.equal(moveIndex(0, -1, 3), 2);
  assert.equal(moveIndex(0, 1, 0), -1);
});
