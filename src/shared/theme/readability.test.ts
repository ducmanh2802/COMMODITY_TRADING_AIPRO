import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadReadability,
  parseContrast,
  parseTextSize,
  readabilityAttrs,
  saveReadability,
  CONTRAST_KEY,
  TEXT_SIZE_KEY,
} from './readability';

function mem(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

test('parse falls back to normal on junk', () => {
  assert.equal(parseTextSize('xl'), 'xl');
  assert.equal(parseTextSize('lg'), 'lg');
  assert.equal(parseTextSize('huge'), 'normal');
  assert.equal(parseTextSize(null), 'normal');
  assert.equal(parseContrast('high'), 'high');
  assert.equal(parseContrast('x'), 'normal');
});

test('save then load round-trips', () => {
  const s = mem();
  assert.equal(saveReadability({ textSize: 'xl', contrast: 'high' }, s), true);
  assert.equal(s.m.get(TEXT_SIZE_KEY), 'xl');
  assert.equal(s.m.get(CONTRAST_KEY), 'high');
  assert.deepEqual(loadReadability(s), { textSize: 'xl', contrast: 'high' });
});

test('load/save survive throwing storage', () => {
  const bad = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  };
  assert.deepEqual(loadReadability(bad), { textSize: 'normal', contrast: 'normal' });
  assert.equal(saveReadability({ textSize: 'lg', contrast: 'normal' }, bad), false);
});

test('attrs map normal to null', () => {
  assert.deepEqual(readabilityAttrs({ textSize: 'normal', contrast: 'normal' }), { 'data-text-size': null, 'data-contrast': null });
  assert.deepEqual(readabilityAttrs({ textSize: 'lg', contrast: 'high' }), { 'data-text-size': 'lg', 'data-contrast': 'high' });
});
