import assert from 'node:assert/strict';
import test from 'node:test';
import {
  averageReturns,
  breadth,
  changeOver,
  correlationLast,
  parseFredSeries,
  pctChange,
  percentileRank,
  realizedVolSeries,
  returnsByDate,
  spreadSeries,
  volLevel,
  yoySeries,
} from './math.ts';
import { PULSE_DISCLAIMER, PULSE_EXPLANATIONS, buildPulseSummary } from './templates.ts';
import { buildMarketPulse, clearMarketPulseCache, computeCommodityPulse } from './service.ts';
import type { InstrumentDefinition } from '../../../src/shared/types/instrument.ts';

test('parseFredSeries keeps negatives, skips "." and bad header', () => {
  const s = parseFredSeries('DATE,X\n2026-01-01,-0.5\n2026-01-02,.\n2026-01-03,1.25\n');
  assert.deepEqual(s, [{ date: '2026-01-01', value: -0.5 }, { date: '2026-01-03', value: 1.25 }]);
  assert.deepEqual(parseFredSeries('<html>'), []);
});

test('yoy = (X_t / X_t-12m - 1) * 100, same calendar month', () => {
  const m = [
    { date: '2025-03-01', value: 300 },
    { date: '2025-04-01', value: 301 },
    { date: '2026-03-01', value: 309 },
  ];
  const y = yoySeries(m);
  assert.equal(y.length, 1);
  assert.equal(y[0].date, '2026-03-01');
  assert.ok(Math.abs(y[0].value - 3) < 1e-9);
});

test('spread = 10Y - 2Y on common dates; changeOver pp and pct', () => {
  const a = [{ date: '2026-01-01', value: 4 }, { date: '2026-02-01', value: 4.5 }, { date: '2026-03-02', value: 4.2 }];
  const b = [{ date: '2026-01-01', value: 4.5 }, { date: '2026-03-02', value: 3.9 }];
  const sp = spreadSeries(a, b);
  assert.deepEqual(sp.map((p) => Math.round(p.value * 100) / 100), [-0.5, 0.3]);
  assert.ok(Math.abs((changeOver(a, 30, 'pp') ?? 0) - (4.2 - 4)) < 1e-9);
  assert.ok(Math.abs((changeOver(a, 30, 'pct') ?? 0) - (4.2 / 4 - 1) * 100) < 1e-9);
  assert.equal(changeOver([a[0]], 30, 'pp'), null);
});

test('breadth counts up/down/flat and ignores null', () => {
  assert.deepEqual(breadth([1, -1, 0, null, 2]), { up: 2, down: 1, flat: 1 });
  assert.ok(Math.abs((pctChange([100, 110], 1) ?? 0) - 10) < 1e-9);
  assert.equal(pctChange([100], 1), null);
});

test('vol percentile and level', () => {
  const hist = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.equal(percentileRank(90, hist), 90);
  assert.equal(percentileRank(5, hist.slice(0, 10)), null);
  assert.equal(volLevel(90), 'HIGH');
  assert.equal(volLevel(50), 'NORMAL');
  assert.equal(volLevel(10), 'LOW');
  assert.equal(volLevel(null), null);
  const flat = realizedVolSeries(Array(30).fill(100), 20);
  assert.equal(flat[29], 0);
  assert.equal(flat[5], null);
});

test('correlation: identical returns = 1, needs >= 30 common dates', () => {
  const pts = Array.from({ length: 70 }, (_, i) => ({
    date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
    value: 100 + Math.sin(i) * 5 + i * 0.1,
  }));
  const r = returnsByDate(pts);
  const c = correlationLast(r, r, 60);
  assert.equal(c.n, 60);
  assert.ok(Math.abs((c.r ?? 0) - 1) < 1e-9);
  assert.equal(correlationLast(r, new Map(), 60).r, null);
  assert.equal(averageReturns([r, r]).size, r.size);
});

function inst(sym: string, category: InstrumentDefinition['category']): InstrumentDefinition {
  return { id: `X:${sym}`, exchangeSymbol: sym, productName: sym, category } as InstrumentDefinition;
}
function series(n: number, drift: number, wiggle: number) {
  return Array.from({ length: n }, (_, i) => ({
    date: new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10),
    value: 100 * (1 + drift) ** i * (1 + (i % 2 ? wiggle : -wiggle)),
  }));
}

test('computeCommodityPulse: breadth, movers, groups, correlation omitted without USD', () => {
  const data = [
    { inst: inst('ZC', 'AGRICULTURE'), group: 'AGRI' as const, points: series(300, 0.001, 0.002), source: 'S', quality: 'UNOFFICIAL' },
    { inst: inst('GC', 'METALS'), group: 'METALS' as const, points: series(300, -0.001, 0.004), source: 'S', quality: 'UNOFFICIAL' },
    { inst: inst('CL', 'ENERGY'), group: 'ENERGY' as const, points: [{ date: '2026-01-01', value: 1 }], source: 'S', quality: 'UNOFFICIAL' },
  ];
  const r = computeCommodityPulse(data, []);
  assert.equal(r.breadth.instrumentsWithData, 2);
  assert.equal(r.breadth.up5d + r.breadth.down5d + r.breadth.flat5d, 2);
  assert.ok(r.groups.every((g) => g.corrUsd60d === null));
  assert.equal(r.groups.find((g) => g.group === 'ENERGY')?.volLevel, null);
  assert.ok(r.groups.find((g) => g.group === 'AGRI')?.volPercentile !== null);
  assert.equal(r.quality, 'UNOFFICIAL');
});

const BANNED = /(nên|hãy|khuyến nghị)\s+(mua|bán|vào lệnh)|\b(buy|sell|should buy|should sell)\b|sẽ (tăng|giảm)|will (rise|fall)/i;

test('templates: no recommendation or forecast wording', () => {
  const fed = ['FED_FUNDS', 'DGS10', 'SPREAD_10Y2Y', 'CPI_YOY', 'REAL_10Y', 'USD_BROAD'].map((id, i) => ({
    id, label: { vi: id, en: id }, value: i === 2 ? -0.3 : 3.5, unit: '%', asOf: '2026-11-18', changeKind: 'pp', change1m: 0.2, change3m: -0.1,
    formula: null, source: 's', sourceUrl: 'u', quality: 'OFFICIAL', spark: [],
  })) as never;
  const summary = buildPulseSummary({
    fed,
    commodities: {
      breadth: { instrumentsWithData: 10, up1d: 6, down1d: 4, up5d: 5, down5d: 5, asOf: '2026-11-18' },
      avg5d: 1, avg20d: 2,
      groups: [{ group: 'AGRI', label: { vi: 'Nông sản', en: 'Agriculture' }, volLevel: 'HIGH' }],
    },
  });
  assert.ok(summary.length >= 3 && summary.length <= 5);
  for (const s of summary) for (const k of ['vi', 'en'] as const) assert.doesNotMatch(s[k], BANNED);
  for (const e of PULSE_EXPLANATIONS) for (const k of ['vi', 'en'] as const) assert.doesNotMatch(e.body[k], BANNED);
  assert.match(summary[1].vi, /đảo ngược/);
  assert.match(PULSE_DISCLAIMER.vi, /không phải khuyến nghị/);
});

test('buildMarketPulse: degrades without fabricating when FRED fails', async () => {
  clearMarketPulseCache();
  const out = await buildMarketPulse({
    listInstruments: async () => [],
    getHistory: async () => ({ candles: [], source: null, quality: null }),
    fetchFred: async () => {
      throw new Error('offline');
    },
  });
  assert.ok(out.fed.every((i) => i.value === null && i.asOf === null));
  assert.equal(out.fomc.available, false);
  assert.match(out.fomc.calendarUrl, /federalreserve\.gov/);
  assert.ok(out.warnings.length > 0);
  assert.equal(out.summary.length, 0);
  clearMarketPulseCache();
});
