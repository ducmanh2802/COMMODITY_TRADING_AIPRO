import test from 'node:test';
import assert from 'node:assert/strict';
import { computeAtr, detectCandlePatterns, detectSrZones, type OhlcBar } from './candlePatterns';

const bar = (open: number, high: number, low: number, close: number): OhlcBar => ({ open, high, low, close });
const down = (n: number, start = 120): OhlcBar[] =>
  Array.from({ length: n }, (_, i) => bar(start - i * 2, start - i * 2 + 1, start - i * 2 - 3, start - i * 2 - 2));
const up = (n: number, start = 100): OhlcBar[] =>
  Array.from({ length: n }, (_, i) => bar(start + i * 2, start + i * 2 + 3, start + i * 2 - 1, start + i * 2 + 2));
const kinds = (bars: OhlcBar[], idx: number) =>
  detectCandlePatterns(bars)
    .filter((p) => p.index === idx)
    .map((p) => p.kind);

test('computeAtr: null warm-up then constant for constant range', () => {
  const bars = Array.from({ length: 20 }, () => bar(10, 12, 8, 10));
  const atr = computeAtr(bars);
  assert.equal(atr[13], null);
  assert.equal(atr[14], 4);
  assert.equal(atr[19], 4);
  assert.deepEqual(computeAtr([bar(1, 2, 0, 1)]), [null]);
});

test('hammer after a downtrend', () => {
  const bars = [...down(6), bar(106, 106.5, 98, 105.5)];
  assert.ok(kinds(bars, 6).includes('hammer'));
});

test('same hammer shape without downtrend is not a hammer', () => {
  const bars = [...up(6), bar(118, 118.5, 110, 117.5)];
  assert.ok(!kinds(bars, 6).includes('hammer'));
});

test('shooting star after an uptrend', () => {
  const bars = [...up(6), bar(112, 121, 111.8, 112.4)];
  assert.ok(kinds(bars, 6).includes('shootingStar'));
});

test('bullish engulfing', () => {
  const bars = [...down(5), bar(100, 101, 96, 97), bar(96, 104, 95.5, 103)];
  assert.ok(kinds(bars, 6).includes('bullishEngulfing'));
  assert.ok(!kinds(bars, 6).includes('bearishEngulfing'));
});

test('bearish engulfing', () => {
  const bars = [...up(5), bar(110, 114, 109, 113), bar(114, 114.5, 107, 108)];
  assert.ok(kinds(bars, 6).includes('bearishEngulfing'));
});

test('engulfing requires a larger body and opposite colour', () => {
  const same = [bar(100, 105, 95, 96), bar(95, 104, 94, 103), bar(103, 105, 100, 102)];
  assert.ok(!kinds(same, 2).includes('bullishEngulfing'));
  const smaller = [bar(100, 105, 95, 96), bar(97, 101, 96, 99)];
  assert.ok(!kinds(smaller, 1).includes('bullishEngulfing'));
});

test('inside bar is strict', () => {
  assert.ok(kinds([bar(100, 110, 90, 105), bar(100, 107, 93, 102)], 1).includes('insideBar'));
  assert.ok(!kinds([bar(100, 110, 90, 105), bar(100, 110, 93, 102)], 1).includes('insideBar'));
});

test('doji detected for tiny body with balanced shadows', () => {
  const bars = [...up(4), bar(110, 114, 106, 110.2)];
  assert.ok(kinds(bars, 4).includes('doji'));
});

test('long-legged pin shape is not labelled doji', () => {
  const bars = [...down(6), bar(106, 106.2, 98, 106.1)];
  assert.ok(!kinds(bars, 6).includes('doji'));
});

test('zero-range and empty input are safe', () => {
  assert.deepEqual(detectCandlePatterns([]), []);
  assert.deepEqual(detectCandlePatterns([bar(5, 5, 5, 5), bar(5, 5, 5, 5)]), []);
});

test('directions are set', () => {
  const bars = [...down(6), bar(106, 106.5, 98, 105.5)];
  const h = detectCandlePatterns(bars).find((p) => p.kind === 'hammer');
  assert.equal(h?.direction, 'bullish');
});

/** Oscillating price producing repeated swing highs near 110 and lows near 90. */
function oscillator(cycles: number): OhlcBar[] {
  const out: OhlcBar[] = [];
  for (let c = 0; c < cycles; c++) {
    const hi = 110 + (c % 2 ? 0.3 : -0.3);
    const lo = 90 + (c % 2 ? -0.3 : 0.3);
    const path = [95, 100, 105, hi - 1, hi - 4, 104, 99, 94, lo + 1, lo + 4];
    for (let i = 0; i < path.length; i++) {
      const cl = path[i];
      out.push(bar(cl, i === 3 ? hi : cl + 1, i === 8 ? lo : cl - 1, cl));
    }
  }
  return out;
}

test('S/R zones cluster repeated swings into support and resistance', () => {
  const zones = detectSrZones(oscillator(5));
  const res = zones.find((z) => z.kind === 'resistance');
  const sup = zones.find((z) => z.kind === 'support');
  assert.ok(res, 'resistance zone');
  assert.ok(sup, 'support zone');
  assert.ok(res.low <= 110 && res.high >= 109.5);
  assert.ok(sup.low <= 90.5 && sup.high >= 89.5);
  assert.ok(res.touches >= 2 && sup.touches >= 2);
  for (const z of zones) assert.ok(z.low <= z.high);
});

test('S/R: too few bars or flat data gives no zones', () => {
  assert.deepEqual(detectSrZones([]), []);
  assert.deepEqual(detectSrZones(Array.from({ length: 30 }, () => bar(5, 5, 5, 5))), []);
});

test('S/R: respects maxZones', () => {
  assert.equal(detectSrZones(oscillator(8), { maxZones: 1 }).length, 1);
});

test('S/R: single touch is filtered by minTouches', () => {
  assert.equal(detectSrZones(oscillator(1), { minTouches: 2 }).length, 0);
});
