import test from 'node:test';
import assert from 'node:assert/strict';
import { donchianSignal, tsmomSignal } from './trendRules.ts';

const rising = Array.from({ length: 300 }, (_, i) => 100 + i);
const falling = Array.from({ length: 300 }, (_, i) => 500 - i);

test('TSMOM: rising -> LONG, falling -> SHORT, flat -> NONE', () => {
  assert.equal(tsmomSignal(rising, 280, 252), 'LONG');
  assert.equal(tsmomSignal(falling, 280, 252), 'SHORT');
  assert.equal(tsmomSignal(new Array(300).fill(100), 280, 252), 'NONE');
});

test('TSMOM: not enough history -> NONE, and uses data up to t only', () => {
  assert.equal(tsmomSignal(rising, 100, 252), 'NONE');
  const s = [...rising.slice(0, 261), ...Array.from({ length: 39 }, () => 1)];
  assert.equal(tsmomSignal(s, 260, 252), 'LONG');
  assert.equal(tsmomSignal(s, 260, 252), tsmomSignal(rising.slice(0, 261), 260, 252));
});

function flatBars(n: number) {
  return { h: new Array<number>(n).fill(101), l: new Array<number>(n).fill(99), c: new Array<number>(n).fill(100) };
}

test('Donchian: breakout triggers on the exact bar, not before', () => {
  const { h, l, c } = flatBars(40);
  c[30] = 105;
  h[30] = 106;
  for (let t = 20; t < 30; t++) assert.equal(donchianSignal(h, l, c, t, 20, 10).side, 'NONE', `t=${t}`);
  const r = donchianSignal(h, l, c, 30, 20, 10);
  assert.equal(r.side, 'LONG');
  assert.equal(r.entryHigh, 101);
  assert.equal(r.exitLow, 99);
});

test('Donchian: breakdown -> SHORT; channel excludes current bar', () => {
  const { h, l, c } = flatBars(40);
  c[30] = 90;
  l[30] = 89;
  assert.equal(donchianSignal(h, l, c, 30, 20, 10).side, 'SHORT');
  const b = flatBars(40);
  b.h[30] = 200;
  assert.equal(donchianSignal(b.h, b.l, b.c, 30, 20, 10).side, 'NONE');
});

test('Donchian: no look-ahead and not enough bars -> NONE', () => {
  const { h, l, c } = flatBars(40);
  c[30] = 105;
  const before = donchianSignal(h, l, c, 30, 20, 10);
  c[35] = 500;
  h[35] = 500;
  assert.deepEqual(donchianSignal(h, l, c, 30, 20, 10), before);
  assert.equal(donchianSignal(h, l, c, 10, 20, 10).side, 'NONE');
});

test('Donchian: rising series breaks out long, falling short', () => {
  const up = Array.from({ length: 60 }, (_, i) => 100 + i);
  const dn = Array.from({ length: 60 }, (_, i) => 200 - i);
  assert.equal(donchianSignal(up.map((x) => x + 0.5), up.map((x) => x - 0.5), up, 50).side, 'LONG');
  assert.equal(donchianSignal(dn.map((x) => x + 0.5), dn.map((x) => x - 0.5), dn, 50).side, 'SHORT');
});
