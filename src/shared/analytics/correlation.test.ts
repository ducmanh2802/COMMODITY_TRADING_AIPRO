import test from 'node:test';
import assert from 'node:assert/strict';
import { alignSeries, correlation, correlationMatrix, olsBeta, pearson, rollingBeta, rollingCorrelation } from './correlation';
import type { SeriesPoint } from './core';

const day = (i: number) => new Date(Date.UTC(2024, 0, 1 + i)).toISOString();
const near = (a: number | null | undefined, b: number, tol = 1e-9) => {
  assert.ok(a !== null && a !== undefined && Math.abs(a - b) <= tol, `expected ${b}, got ${a}`);
};

// Deterministic, non-trivial price path
const N = 60;
const A: SeriesPoint[] = [];
{
  let p = 100;
  for (let i = 0; i < N; i++) {
    if (i > 0) p *= Math.exp(0.01 * Math.sin(i * 1.7) + 0.004 * Math.cos(i * 0.3));
    A.push({ t: day(i), v: p });
  }
}
const Asq = A.map((x) => ({ t: x.t, v: x.v * x.v })); // log returns exactly 2× those of A
const Ainv = A.map((x) => ({ t: x.t, v: 1 / x.v })); // log returns exactly −1× those of A

test('pearson on Anscombe quartet set I = 0.816 (Anscombe 1973)', () => {
  // F. J. Anscombe, "Graphs in Statistical Analysis", The American Statistician 27(1):17–21, 1973.
  // Published: correlation of x and y = 0.816 (3 decimals) for each set.
  const x = [10, 8, 13, 9, 11, 14, 6, 4, 12, 7, 5];
  const y1 = [8.04, 6.95, 7.58, 8.81, 8.33, 9.96, 7.24, 4.26, 10.84, 4.82, 5.68];
  const y2 = [9.14, 8.14, 8.74, 8.77, 9.26, 8.1, 6.13, 3.1, 9.13, 7.26, 4.74];
  near(pearson(x, y1), 0.816, 1e-3);
  near(pearson(x, y2), 0.816, 1e-3);
  // Published regression line y = 3.00 + 0.500x
  near(olsBeta(y1, x), 0.5, 1e-3);
});

test('pearson: perfect, anti, degenerate', () => {
  near(pearson([1, 2, 3], [2, 4, 6]), 1, 1e-12);
  near(pearson([1, 2, 3], [3, 2, 1]), -1, 1e-12);
  assert.equal(pearson([1, 1, 1], [1, 2, 3]), null);
  assert.equal(pearson([1], [1]), null);
});

test('correlation of returns: perfectly correlated / anti-correlated', () => {
  const c = correlation(A, Asq);
  assert.equal(c.status, 'OK');
  near(c.value, 1, 1e-12);
  assert.equal(c.n, N - 1);
  near(correlation(A, Ainv).value, -1, 1e-12);
});

test('correlation is on returns, not prices', () => {
  // Two trending price series whose daily returns alternate in opposite directions:
  // price correlation is strongly positive, return correlation is exactly −1.
  const X: SeriesPoint[] = [];
  const Y: SeriesPoint[] = [];
  let x = 100;
  let y = 100;
  for (let i = 0; i < 40; i++) {
    if (i > 0) {
      const s = i % 2 === 0 ? 1 : -1;
      x *= Math.exp(0.01 + 0.005 * s);
      y *= Math.exp(0.01 - 0.005 * s);
    }
    X.push({ t: day(i), v: x });
    Y.push({ t: day(i), v: y });
  }
  const priceCorr = pearson(X.map((p) => p.v), Y.map((p) => p.v)) as number;
  assert.ok(priceCorr > 0.99);
  near(correlation(X, Y).value, -1, 1e-9);
});

test('alignment drops non-common timestamps and reports counts', () => {
  const a = [0, 1, 2, 3, 4].map((i) => ({ t: day(i), v: 1 + i }));
  const b = [1, 2, 4, 5].map((i) => ({ t: day(i).slice(0, 10), v: 10 + i })); // date-only spelling still matches
  const al = alignSeries(a, b);
  assert.equal(al.status, 'OK');
  assert.deepEqual(al.timestamps, [day(1), day(2), day(4)]);
  assert.deepEqual(al.a, [2, 3, 5]);
  assert.deepEqual(al.b, [11, 12, 14]);
  assert.equal(al.droppedA, 2);
  assert.equal(al.droppedB, 1);
  assert.ok(al.warnings.length === 1);
});

test('correlation reports alignment drops and enforces minObservations', () => {
  const B = Asq.filter((_, i) => i % 10 !== 3);
  const c = correlation(A, B);
  assert.equal(c.droppedA, 6);
  assert.equal(c.droppedB, 0);
  near(c.value, 1, 1e-12);
  const short = correlation(A.slice(0, 10), Asq.slice(0, 10));
  assert.equal(short.status, 'INSUFFICIENT_DATA');
  assert.equal(short.value, null);
  assert.equal(correlation(A.slice(0, 10), Asq.slice(0, 10), { minObservations: 5 }).status, 'OK');
});

test('correlation failure modes', () => {
  const flat = A.map((p) => ({ t: p.t, v: 5 }));
  assert.equal(correlation(A, flat).status, 'INSUFFICIENT_DATA');
  assert.equal(correlation(A, [...Asq].reverse()).status, 'INVALID_INPUT');
  assert.equal(correlation(A, Asq.map((p, i) => (i === 3 ? { t: p.t, v: NaN } : p))).status, 'INVALID_INPUT');
  assert.equal(correlation(A, Asq.map((p, i) => (i === 3 ? { t: p.t, v: -1 } : p))).status, 'INVALID_INPUT');
});

test('rolling correlation and rolling beta', () => {
  const rc = rollingCorrelation(A, Asq, { window: 10 });
  assert.equal(rc.status, 'OK');
  for (let i = 0; i < 10; i++) assert.equal(rc.values[i], null);
  for (let i = 10; i < N; i++) near(rc.values[i], 1, 1e-9);
  const rb = rollingBeta(Asq, A, { window: 10 });
  for (let i = 10; i < N; i++) near(rb.values[i], 2, 1e-9);
  const rbInv = rollingBeta(Ainv, A, { window: 10, returns: 'log' });
  near(rbInv.values[N - 1], -1, 1e-9);
  assert.equal(rollingCorrelation(A.slice(0, 5), Asq.slice(0, 5), { window: 10 }).status, 'INSUFFICIENT_DATA');
});

test('rolling beta hand-computed with simple returns', () => {
  // benchmark prices 100,110,99,108.9 → returns .1, −.1, .1 ; asset returns .2, −.1, .3
  const bench = [100, 110, 99, 108.9].map((v, i) => ({ t: day(i), v }));
  const asset = [100, 120, 108, 140.4].map((v, i) => ({ t: day(i), v }));
  // x = [.1,−.1,.1], mean 1/30; y = [.2,−.1,.3], mean 2/15
  // Sxy = Σ(x−x̄)(y−ȳ) = (1/15)(1/15)+(−2/15)(−7/30)+(1/15)(1/6) = 1/225 + 14/450 + 1/90 = 0.0466…
  // Sxx = (1/15)² + (2/15)² + (1/15)² = 6/225 → β = Sxy/Sxx = (21/450)/(12/450) = 1.75
  const rb = rollingBeta(asset, bench, { window: 3, returns: 'simple' });
  near(rb.values[3], 1.75, 1e-9);
});

test('correlation matrix on common intersection', () => {
  const m = correlationMatrix({ A, Asq: Asq.filter((_, i) => i !== 7), Ainv });
  assert.equal(m.status, 'OK');
  assert.deepEqual(m.labels, ['A', 'Asq', 'Ainv']);
  assert.equal(m.n, N - 2);
  assert.deepEqual(m.dropped, { A: 1, Asq: 0, Ainv: 1 });
  const exp = [
    [1, 1, -1],
    [1, 1, -1],
    [-1, -1, 1],
  ];
  m.matrix.forEach((row, i) => row.forEach((v, j) => near(v, exp[i][j], 1e-12)));
  assert.equal(correlationMatrix({ A }).status, 'INVALID_INPUT');
  assert.equal(correlationMatrix({ A: A.slice(0, 5), B: Asq.slice(0, 5) }).status, 'INSUFFICIENT_DATA');
});
