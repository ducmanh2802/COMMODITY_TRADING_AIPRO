import test from 'node:test';
import assert from 'node:assert/strict';
import { atrPercent, garmanKlassVolatility, parkinsonVolatility, realizedVolatility } from './volatility';
import type { OhlcBar, SeriesPoint } from './core';
import { STOCKCHARTS_ATR } from './stockcharts.fixtures';

const day = (i: number) => new Date(Date.UTC(2024, 0, 1 + i)).toISOString();
const near = (a: number | null | undefined, b: number, tol = 1e-12) => {
  assert.ok(a !== null && a !== undefined && Math.abs(a - b) <= tol, `expected ${b}, got ${a}`);
};

// Prices whose log returns alternate +a, −a exactly
const a = 0.01;
const alt: SeriesPoint[] = Array.from({ length: 9 }, (_, i) => ({ t: day(i), v: 100 * Math.exp(i % 2 === 1 ? a : 0) }));

test('realized vol: sample σ of log returns × √252 (hand-computed)', () => {
  // window 2: returns {a, −a}: mean 0, Σd² = 2a², /(n−1)=2a² → σ = a√2
  const r2 = realizedVolatility(alt, { window: 2 });
  assert.equal(r2.values[1], null);
  near(r2.values[2], a * Math.SQRT2 * Math.sqrt(252), 1e-12);
  // window 4: returns {a,−a,a,−a}: Σd² = 4a², /3 → σ = 2a/√3
  const r4 = realizedVolatility(alt, { window: 4, annualizationFactor: 1 });
  assert.equal(r4.values[3], null);
  near(r4.values[4], (2 * a) / Math.sqrt(3), 1e-12);
  near(r4.values[8], (2 * a) / Math.sqrt(3), 1e-12);
});

test('realized vol failure modes', () => {
  assert.equal(realizedVolatility(alt.slice(0, 4), { window: 4 }).status, 'INSUFFICIENT_DATA');
  assert.equal(realizedVolatility(alt, { window: 1 }).status, 'INVALID_INPUT');
  assert.equal(realizedVolatility(alt, { window: 2, annualizationFactor: 0 }).status, 'INVALID_INPUT');
  assert.equal(realizedVolatility([{ t: day(0), v: 1 }, { t: day(1), v: 0 }], { window: 1 }).status, 'INVALID_INPUT');
});

const hlBars = (n: number, hl: number, co: number): OhlcBar[] =>
  Array.from({ length: n }, (_, i) => {
    const low = 100;
    const high = low * Math.exp(hl);
    const open = low * Math.exp(hl / 4);
    return { timestamp: day(i), open, high, low, close: open * Math.exp(co) };
  });

test('Parkinson estimator (hand-computed)', () => {
  // ln(H/L) = 0.02 each bar → σ² = 0.0004 / (4 ln2)
  const r = parkinsonVolatility(hlBars(5, 0.02, 0), { window: 3 });
  assert.equal(r.values[1], null);
  near(r.values[2], Math.sqrt((0.0004 / (4 * Math.LN2)) * 252), 1e-12);
});

test('Garman–Klass estimator (hand-computed)', () => {
  // ln(H/L) = 0.02, ln(C/O) = 0.005 → σ² = 0.5·0.0004 − (2ln2 − 1)·0.000025
  const r = garmanKlassVolatility(hlBars(4, 0.02, 0.005), { window: 2, annualizationFactor: 1 });
  near(r.values[1], Math.sqrt(0.5 * 0.0004 - (2 * Math.LN2 - 1) * 0.000025), 1e-12);
  const flat = garmanKlassVolatility(hlBars(4, 0.02, 0), { window: 2, annualizationFactor: 1 });
  near(flat.values[3], Math.sqrt(0.0002), 1e-12);
});

test('ATR% = 100·ATR/close using StockCharts cs-atr.xls ATR values', () => {
  const bars: OhlcBar[] = STOCKCHARTS_ATR.map((r) => ({ timestamp: r.t, open: r.close, high: r.high, low: r.low, close: r.close }));
  const r = atrPercent(bars, 14);
  STOCKCHARTS_ATR.forEach((row, i) => {
    if (row.atr === null) assert.equal(r.values[i], null);
    else near(r.values[i], (100 * row.atr) / row.close, 1e-9);
  });
});
