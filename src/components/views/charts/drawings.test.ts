import test from 'node:test';
import assert from 'node:assert/strict';
import { DRAWINGS_STORAGE_KEY, fibLevels, loadDrawings, sanitizeDrawings, saveDrawings, type Drawing } from './drawings';

function mem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}
const d1: Drawing = { id: 'a', tool: 'trend', points: [{ ts: '2026-01-01', price: 1 }, { ts: '2026-01-05', price: 2 }] };

test('fibLevels: seven levels, 0% at p2 and 100% at p1', () => {
  const lv = fibLevels(100, 200);
  assert.equal(lv.length, 7);
  assert.deepEqual(lv.map((l) => l.ratio), [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]);
  assert.equal(lv[0].price, 200);
  assert.equal(lv[6].price, 100);
  assert.ok(Math.abs(lv[3].price - 150) < 1e-9);
});

test('save/load round trip per symbol+timeframe bucket', () => {
  const s = mem();
  saveDrawings('ZC', 'D1', [d1], s);
  assert.deepEqual(loadDrawings('ZC', 'D1', s), [{ ...d1, text: undefined }]);
  assert.deepEqual(loadDrawings('ZC', 'W1', s), []);
  assert.deepEqual(loadDrawings('ZW', 'D1', s), []);
  assert.ok(s.m.has(DRAWINGS_STORAGE_KEY));
});

test('saving empty list removes bucket', () => {
  const s = mem();
  saveDrawings('ZC', 'D1', [d1], s);
  saveDrawings('ZC', 'D1', [], s);
  assert.deepEqual(loadDrawings('ZC', 'D1', s), []);
});

test('corrupt storage and throwing storage are tolerated', () => {
  const s = mem();
  s.m.set(DRAWINGS_STORAGE_KEY, '{not json');
  assert.deepEqual(loadDrawings('ZC', 'D1', s), []);
  const bad = {
    getItem: (): string | null => {
      throw new Error('x');
    },
    setItem: (): void => {
      throw new Error('x');
    },
  };
  assert.deepEqual(loadDrawings('ZC', 'D1', bad), []);
  assert.doesNotThrow(() => saveDrawings('ZC', 'D1', [d1], bad));
  assert.deepEqual(loadDrawings('ZC', 'D1', null), []);
});

test('sanitizeDrawings drops invalid entries', () => {
  const out = sanitizeDrawings([
    d1,
    { id: 'b', tool: 'nope', points: [] },
    { id: 'c', tool: 'hline', points: [] },
    null,
    { id: 'd', tool: 'hline', points: [{ ts: 'x', price: NaN }] },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'a');
  assert.deepEqual(sanitizeDrawings('x'), []);
});
