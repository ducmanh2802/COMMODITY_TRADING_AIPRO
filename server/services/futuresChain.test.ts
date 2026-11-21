import test from 'node:test';
import assert from 'node:assert/strict';
import { pickBarStats } from './futuresChain.ts';

const d = (s: string) => Date.parse(`${s}T14:30:00Z`) / 1000;

test('pickBarStats: change vs previous close and volume on the as-of day', () => {
  const r = pickBarStats(
    { timestamps: [d('2026-11-18'), d('2026-11-19'), d('2026-11-20')], closes: [440, 442, 445], volumes: [100, 200, 300] },
    '2026-11-20T14:30:00.000Z',
    1
  );
  assert.equal(r.volume, 300);
  assert.equal(r.change, 3);
});

test('pickBarStats: missing volume and missing previous bar stay null', () => {
  const r = pickBarStats({ timestamps: [d('2026-11-20')], closes: [445], volumes: [null] }, '2026-11-20T10:00:00Z', 1);
  assert.deepEqual(r, { change: null, volume: null });
});

test('pickBarStats: no bar on the as-of day gives nulls', () => {
  const r = pickBarStats({ timestamps: [d('2026-11-19')], closes: [445], volumes: [5] }, '2026-11-20T10:00:00Z', 1);
  assert.deepEqual(r, { change: null, volume: null });
});
