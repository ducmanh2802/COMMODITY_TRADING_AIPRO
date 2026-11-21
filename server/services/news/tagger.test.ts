import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyImpact, tagInstruments, tagNews } from './tagger.ts';

test('tags corn in English and Vietnamese', () => {
  assert.deepEqual(tagInstruments('Corn futures slip as maize harvest advances'), ['CBOT:ZC']);
  assert.deepEqual(tagInstruments('Giá ngô tăng mạnh'), ['CBOT:ZC']);
});

test('coffee maps to both KC and RC; robusta only RC-specific alias also hits both via coffee', () => {
  const ids = tagInstruments('Giá cà phê robusta tăng');
  assert.ok(ids.includes('ICE:KC') && ids.includes('ICE:RC'));
});

test('oil/OPEC maps to WTI and Brent; gold in Vietnamese', () => {
  const ids = tagInstruments('OPEC+ cuts output');
  assert.ok(ids.includes('NYMEX:CL') && ids.includes('ICE:BRN'));
  assert.deepEqual(tagInstruments('Giá vàng thế giới'), ['COMEX:GC']);
});

test('no substring false positives', () => {
  assert.deepEqual(tagInstruments('Cornell university report on boiling'), []);
});

test('impact rules', () => {
  assert.equal(classifyImpact('USDA WASDE report due'), 'CAO');
  assert.equal(classifyImpact('Frost hits Brazil'), 'CAO');
  assert.equal(classifyImpact('Soy demand steady in China'), 'TRUNG BÌNH');
  assert.equal(classifyImpact('Analyst chats about markets'), 'THẤP');
});

test('tagNews merges relatedSymbols', () => {
  const r = tagNews({ title: 'Quiet day', relatedSymbols: ['CBOT:ZW', 'FOO'] });
  assert.deepEqual(r.instruments, ['CBOT:ZW']);
});
