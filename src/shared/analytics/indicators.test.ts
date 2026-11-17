import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adx,
  atr,
  bollingerBands,
  donchian,
  ema,
  macd,
  pivotPoints,
  rsi,
  sma,
  stochastic,
  trueRange,
  vwap,
  wma,
} from './indicators';
import type { OhlcBar, SeriesPoint } from './core';
import { STOCKCHARTS_ADX, STOCKCHARTS_ATR, STOCKCHARTS_RSI } from './stockcharts.fixtures';

const day = (i: number) => new Date(Date.UTC(2024, 0, 1 + i)).toISOString();
const ser = (vs: number[]): SeriesPoint[] => vs.map((v, i) => ({ t: day(i), v }));
const bar = (i: number, h: number, l: number, c: number, o = c, volume: number | null = null): OhlcBar => ({
  timestamp: day(i),
  open: o,
  high: h,
  low: l,
  close: c,
  volume,
});
const close = (a: number | null | undefined, b: number, tol: number, msg?: string) => {
  assert.ok(a !== null && a !== undefined, `${msg ?? ''} expected number, got ${a}`);
  assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b}, got ${a} (tol ${tol})`);
};

// ---------------------------------------------------------------------------------------------
// Moving averages — hand-computed
// ---------------------------------------------------------------------------------------------

test('SMA hand-computed', () => {
  const r = sma(ser([1, 2, 3, 4, 5]), 3);
  assert.equal(r.status, 'OK');
  assert.deepEqual(r.values, [null, null, 2, 3, 4]);
  assert.equal(r.timestamps.length, 5);
});

test('EMA seeded with SMA, alpha = 2/(p+1), hand-computed', () => {
  // p=3 → α=0.5; seed idx2 = (10+11+13)/3 = 34/3; idx3 = .5·12 + .5·34/3 = 35/3; idx4 = .5·15 + .5·35/3 = 40/3
  const r = ema(ser([10, 11, 13, 12, 15]), 3);
  assert.equal(r.values[0], null);
  assert.equal(r.values[1], null);
  close(r.values[2], 34 / 3, 1e-12);
  close(r.values[3], 35 / 3, 1e-12);
  close(r.values[4], 40 / 3, 1e-12);
});

test('WMA hand-computed (weights 1..p, newest heaviest)', () => {
  const r = wma(ser([1, 2, 3, 4]), 3);
  assert.deepEqual(r.values.slice(0, 2), [null, null]);
  close(r.values[2], 14 / 6, 1e-12);
  close(r.values[3], 20 / 6, 1e-12);
});

// ---------------------------------------------------------------------------------------------
// RSI — StockCharts ChartSchool worked example (cs-rsi.xls)
// ---------------------------------------------------------------------------------------------

test('RSI(14) matches StockCharts cs-rsi.xls worked example', () => {
  const s = STOCKCHARTS_RSI.map((r) => ({ t: r.t, v: r.close }));
  const r = rsi(s, 14);
  assert.equal(r.status, 'OK');
  STOCKCHARTS_RSI.forEach((row, i) => {
    if (row.rsi === null) assert.equal(r.values[i], null, `idx ${i} should be warm-up`);
    else close(r.values[i], row.rsi, 1e-9, `RSI idx ${i}`);
  });
  // Published 2-decimal values shown on the ChartSchool page / spreadsheet: first RSI 70.53, last 37.77
  close(r.values[14], 70.53, 1e-2);
  close(r.values[32], 37.77, 1e-2);
});

test('RSI edge cases: all gains → 100, flat → null + warning, too short → INSUFFICIENT_DATA', () => {
  const up = rsi(ser([1, 2, 3, 4, 5, 6]), 3);
  assert.equal(up.values[3], 100);
  const flat = rsi(ser([5, 5, 5, 5, 5]), 3);
  assert.equal(flat.status, 'OK');
  assert.equal(flat.values[3], null);
  assert.ok(flat.warnings.length > 0);
  const down = rsi(ser([6, 5, 4, 3]), 3);
  assert.equal(down.values[3], 0);
  assert.equal(rsi(ser([1, 2, 3]), 3).status, 'INSUFFICIENT_DATA');
});

// ---------------------------------------------------------------------------------------------
// MACD — hand-computed with small periods
// ---------------------------------------------------------------------------------------------

test('MACD(2,3,2) hand-computed', () => {
  // EMA2 (α=2/3): idx1 1.5, idx2 19/6, idx3 115/18. EMA3 (α=1/2): idx2 7/3, idx3 31/6.
  // MACD idx2 = 5/6, idx3 = 11/9; signal(2) seeded idx3 = (5/6 + 11/9)/2 = 37/36; hist = 7/36.
  const r = macd(ser([1, 2, 4, 8]), { fast: 2, slow: 3, signal: 2 });
  assert.equal(r.status, 'OK');
  assert.equal(r.values[0], null);
  assert.equal(r.values[1], null);
  close(r.values[2]?.macd, 5 / 6, 1e-12);
  assert.equal(r.values[2]?.signal, null);
  assert.equal(r.values[2]?.histogram, null);
  close(r.values[3]?.macd, 11 / 9, 1e-12);
  close(r.values[3]?.signal, 37 / 36, 1e-12);
  close(r.values[3]?.histogram, 7 / 36, 1e-12);
});

test('MACD default 12/26/9: line equals EMA12 − EMA26, warm-up lengths, invalid fast>=slow', () => {
  const vs = Array.from({ length: 60 }, (_, i) => 100 + 10 * Math.sin(i / 5) + i * 0.3);
  const s = ser(vs);
  const r = macd(s);
  const e12 = ema(s, 12).values;
  const e26 = ema(s, 26).values;
  assert.equal(r.values[24], null);
  for (let i = 25; i < 60; i++) close(r.values[i]?.macd, (e12[i] as number) - (e26[i] as number), 1e-12);
  assert.equal(r.values[32]?.signal, null);
  assert.notEqual(r.values[33]?.signal, null);
  assert.equal(macd(ser(vs.slice(0, 33))).status, 'INSUFFICIENT_DATA');
  assert.equal(macd(s, { fast: 26, slow: 12 }).status, 'INVALID_INPUT');
});

// ---------------------------------------------------------------------------------------------
// Bollinger — hand-computed (population σ)
// ---------------------------------------------------------------------------------------------

test('Bollinger Bands use population σ (hand-computed)', () => {
  // [1..5]: mean 3, population variance (4+1+0+1+4)/5 = 2 → σ = √2
  const r = bollingerBands(ser([1, 2, 3, 4, 5]), { period: 5, k: 2 });
  const p = r.values[4];
  assert.ok(p);
  close(p.middle, 3, 1e-12);
  close(p.stdDev, Math.SQRT2, 1e-12);
  close(p.upper, 3 + 2 * Math.SQRT2, 1e-12);
  close(p.lower, 3 - 2 * Math.SQRT2, 1e-12);
  assert.equal(bollingerBands(ser([1, 2, 3]), { period: 5 }).status, 'INSUFFICIENT_DATA');
  assert.equal(bollingerBands(ser([1, 2, 3]), { period: 2, k: -1 }).status, 'INVALID_INPUT');
});

// ---------------------------------------------------------------------------------------------
// True Range / ATR — StockCharts cs-atr.xls
// ---------------------------------------------------------------------------------------------

const atrBars: OhlcBar[] = STOCKCHARTS_ATR.map((r) => ({ timestamp: r.t, open: r.close, high: r.high, low: r.low, close: r.close, volume: null }));

test('True Range matches StockCharts cs-atr.xls', () => {
  const r = trueRange(atrBars);
  assert.equal(r.status, 'OK');
  STOCKCHARTS_ATR.forEach((row, i) => close(r.values[i], row.tr, 1e-9, `TR idx ${i}`));
});

test('ATR(14) Wilder matches StockCharts cs-atr.xls', () => {
  const r = atr(atrBars, 14);
  assert.equal(r.status, 'OK');
  STOCKCHARTS_ATR.forEach((row, i) => {
    if (row.atr === null) assert.equal(r.values[i], null);
    else close(r.values[i], row.atr, 1e-9, `ATR idx ${i}`);
  });
  // ChartSchool text: "the first 14-day ATR value (.56)" and first TR 0.91
  close(r.values[13], 0.56, 1e-2);
  assert.equal(atr(atrBars.slice(0, 13), 14).status, 'INSUFFICIENT_DATA');
});

// ---------------------------------------------------------------------------------------------
// ADX — StockCharts cs-adx.xls
// ---------------------------------------------------------------------------------------------

test('ADX/+DI/−DI(14) Wilder matches StockCharts cs-adx.xls', () => {
  const bars: OhlcBar[] = STOCKCHARTS_ADX.map((r) => ({
    timestamp: r.t,
    open: r.close as number,
    high: r.high as number,
    low: r.low as number,
    close: r.close as number,
  }));
  const r = adx(bars, 14);
  assert.equal(r.status, 'OK', r.reason);
  let checkedAdx = 0;
  STOCKCHARTS_ADX.forEach((row, i) => {
    const p = r.values[i];
    if (row.plusDI === null) {
      assert.equal(p, null, `idx ${i} warm-up`);
      return;
    }
    assert.ok(p);
    close(p.plusDI, row.plusDI, 1e-9, `+DI idx ${i}`);
    close(p.minusDI, row.minusDI as number, 1e-9, `−DI idx ${i}`);
    close(p.dx, row.dx as number, 1e-9, `DX idx ${i}`);
    if (row.adx === null) assert.equal(p.adx, null, `ADX warm-up idx ${i}`);
    else {
      close(p.adx, row.adx, 1e-9, `ADX idx ${i}`);
      checkedAdx++;
    }
  });
  assert.ok(checkedAdx >= 30);
  assert.equal(adx(bars.slice(0, 27), 14).status, 'INSUFFICIENT_DATA');
});

// ---------------------------------------------------------------------------------------------
// Stochastic, Donchian, VWAP, Pivots — hand-computed
// ---------------------------------------------------------------------------------------------

const handBars = [bar(0, 10, 8, 9), bar(1, 11, 9, 10), bar(2, 12, 10, 11), bar(3, 13, 9, 9), bar(4, 12, 10, 12)];

test('Stochastic %K/%D hand-computed', () => {
  // kPeriod 3: idx2 HH12 LL8 C11 → 75; idx3 HH13 LL9 C9 → 0; idx4 HH13 LL9 C12 → 75. %D(2): 37.5, 37.5
  const r = stochastic(handBars, { kPeriod: 3, dPeriod: 2 });
  assert.equal(r.values[1], null);
  assert.deepEqual(r.values[2], { k: 75, d: null });
  assert.deepEqual(r.values[3], { k: 0, d: 37.5 });
  assert.deepEqual(r.values[4], { k: 75, d: 37.5 });
  // slow stochastic smoothK 2: K idx3 = 37.5, idx4 = 37.5 ; D(2) idx4 = 37.5
  const slow = stochastic(handBars, { kPeriod: 3, dPeriod: 2, smoothK: 2 });
  assert.equal(slow.values[2], null);
  assert.deepEqual(slow.values[4], { k: 37.5, d: 37.5 });
});

test('Stochastic undefined when HH = LL', () => {
  const r = stochastic([bar(0, 5, 5, 5), bar(1, 5, 5, 5)], { kPeriod: 2, dPeriod: 1 });
  assert.equal(r.values[1], null);
  assert.ok(r.warnings.length > 0);
});

test('Donchian channel (including / excluding current bar)', () => {
  const r = donchian(handBars, { period: 3 });
  assert.deepEqual(r.values[2], { upper: 12, lower: 8, middle: 10 });
  assert.deepEqual(r.values[4], { upper: 13, lower: 9, middle: 11 });
  const x = donchian(handBars, { period: 3, excludeCurrent: true });
  assert.equal(x.values[2], null);
  assert.deepEqual(x.values[3], { upper: 12, lower: 8, middle: 10 });
});

test('VWAP session-anchored, resets each UTC day (hand-computed)', () => {
  const bars: OhlcBar[] = [
    { timestamp: '2024-01-02T14:00:00Z', open: 9, high: 10, low: 8, close: 9, volume: 100 }, // TP 9
    { timestamp: '2024-01-02T15:00:00Z', open: 11, high: 12, low: 10, close: 11, volume: 300 }, // TP 11
    { timestamp: '2024-01-03T14:00:00Z', open: 19, high: 20, low: 18, close: 19, volume: 50 }, // TP 19, new session
  ];
  const r = vwap(bars);
  assert.equal(r.status, 'OK');
  close(r.values[0], 9, 1e-12);
  close(r.values[1], (9 * 100 + 11 * 300) / 400, 1e-12);
  close(r.values[2], 19, 1e-12);
  // with a −15h offset: bar0 → 2024-01-01 23:00 local (own session); bar1 → 2024-01-02 00:00 and
  // bar2 → 2024-01-02 23:00 local (same session)
  const shifted = vwap(bars, { sessionOffsetMinutes: -15 * 60 });
  close(shifted.values[0], 9, 1e-12);
  close(shifted.values[1], 11, 1e-12);
  close(shifted.values[2], (11 * 300 + 19 * 50) / 350, 1e-12);
});

test('VWAP fails closed on null volume', () => {
  const r = vwap([
    { timestamp: '2024-01-02T14:00:00Z', open: 9, high: 10, low: 8, close: 9, volume: 100 },
    { timestamp: '2024-01-02T15:00:00Z', open: 9, high: 10, low: 8, close: 9, volume: null },
  ]);
  assert.equal(r.status, 'INVALID_INPUT');
  assert.match(r.reason ?? '', /volume/);
  assert.ok(r.values.every((v) => v === null));
  assert.equal(vwap([bar(0, 10, 8, 9)]).status, 'INVALID_INPUT'); // volume missing
});

test('VWAP zero session volume → null with warning', () => {
  const r = vwap([{ timestamp: '2024-01-02T14:00:00Z', open: 9, high: 10, low: 8, close: 9, volume: 0 }]);
  assert.equal(r.values[0], null);
  assert.ok(r.warnings.some((w) => /zero cumulative/.test(w)));
});

test('Classic pivot points from prior bar (hand-computed)', () => {
  const r = pivotPoints([bar(0, 12, 8, 10), bar(1, 99, 1, 50)]);
  assert.equal(r.values[0], null);
  assert.deepEqual(r.values[1], { pivot: 10, r1: 12, s1: 8, r2: 14, s2: 6, r3: 16, s3: 4 });
});

// ---------------------------------------------------------------------------------------------
// Failure modes
// ---------------------------------------------------------------------------------------------

test('INVALID_INPUT: unsorted, duplicate, NaN, Infinity, bad timestamp, bad period', () => {
  const unsorted = [
    { t: '2024-01-02', v: 1 },
    { t: '2024-01-01', v: 2 },
    { t: '2024-01-03', v: 3 },
  ];
  const r1 = sma(unsorted, 2);
  assert.equal(r1.status, 'INVALID_INPUT');
  assert.match(r1.reason ?? '', /sorted/);
  assert.equal(r1.values.length, 3);
  assert.ok(r1.values.every((v) => v === null));

  const dup = sma([{ t: '2024-01-01', v: 1 }, { t: '2024-01-01T00:00:00Z', v: 2 }], 1);
  assert.equal(dup.status, 'INVALID_INPUT');
  assert.match(dup.reason ?? '', /duplicate/);

  assert.equal(ema(ser([1, NaN, 3]), 2).status, 'INVALID_INPUT');
  assert.equal(ema(ser([1, Infinity, 3]), 2).status, 'INVALID_INPUT');
  assert.equal(sma([{ t: 'not-a-date', v: 1 }], 1).status, 'INVALID_INPUT');
  assert.equal(sma(ser([1, 2, 3]), 0).status, 'INVALID_INPUT');
  assert.equal(sma(ser([1, 2, 3]), 1.5).status, 'INVALID_INPUT');
  assert.equal(sma(ser([1, 2]), 3).status, 'INSUFFICIENT_DATA');
});

test('INVALID_INPUT: inconsistent OHLC bars and unsorted bars', () => {
  assert.equal(atr([bar(0, 10, 12, 11)], 1).status, 'INVALID_INPUT'); // high < low
  assert.equal(atr([bar(0, 10, 8, 11)], 1).status, 'INVALID_INPUT'); // close > high
  assert.equal(atr([bar(1, 10, 8, 9), bar(0, 10, 8, 9)], 1).status, 'INVALID_INPUT');
  assert.equal(trueRange([bar(0, NaN, 8, 9)]).status, 'INVALID_INPUT');
});
