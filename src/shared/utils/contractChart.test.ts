import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dayChangePct,
  formatContractMonthVi,
  readChartSeriesPref,
  resolveChartSeries,
  shouldWarnRollMismatch,
  writeChartSeriesPref,
} from './contractChart.ts';

const cont = [{ close: 100 }, { close: 101 }];
const ctr = [{ close: 110 }, { close: 111 }, { close: 112 }];
const ok = { status: 'OK' as const, contractMonth: '2027-03', candles: ctr };

test('formatContractMonthVi', () => {
  assert.equal(formatContractMonthVi('2027-03'), '3/2027');
  assert.equal(formatContractMonthVi('2026-12'), '12/2026');
  assert.equal(formatContractMonthVi('2026-13'), null);
  assert.equal(formatContractMonthVi(null), null);
});

test('contract series chosen when quote month matches and data is OK', () => {
  const r = resolveChartSeries({ quoteContractMonth: '2027-03', pref: 'CONTRACT', timeframe: 'D1', contract: ok, continuous: cont });
  assert.equal(r.source, 'CONTRACT');
  assert.equal(r.contractMonth, '2027-03');
  assert.equal(r.candles, ctr);
  assert.equal(r.note, null);
});

test('fallback to continuous with note when unavailable, wrong month, empty, or intraday', () => {
  const base = { quoteContractMonth: '2027-03', pref: 'CONTRACT' as const, timeframe: 'D1', continuous: cont };
  assert.equal(resolveChartSeries({ ...base, contract: { status: 'UNAVAILABLE', contractMonth: '2027-03', reason: 'x' } }).note, 'unavailable');
  assert.equal(resolveChartSeries({ ...base, contract: { ...ok, contractMonth: '2027-05' } }).note, 'unavailable');
  assert.equal(resolveChartSeries({ ...base, contract: { ...ok, candles: [] } }).source, 'CONTINUOUS');
  const intra = resolveChartSeries({ ...base, timeframe: 'H1', contract: ok });
  assert.equal(intra.source, 'CONTINUOUS');
  assert.equal(intra.note, 'intraday');
});

test('pending while loading; continuous when no quote month or user chose continuous', () => {
  const base = { timeframe: 'D1', continuous: cont };
  const p = resolveChartSeries({ ...base, quoteContractMonth: '2027-03', pref: 'CONTRACT', contract: null });
  assert.deepEqual([p.source, p.pending, p.note], ['CONTINUOUS', true, null]);
  assert.equal(resolveChartSeries({ ...base, quoteContractMonth: null, pref: 'CONTRACT', contract: ok }).source, 'CONTINUOUS');
  const c = resolveChartSeries({ ...base, quoteContractMonth: '2027-03', pref: 'CONTINUOUS', contract: ok });
  assert.deepEqual([c.source, c.note, c.pending], ['CONTINUOUS', null, false]);
});

test('day change uses the same series last two closes', () => {
  assert.ok(Math.abs((dayChangePct(ctr) ?? 0) - ((112 - 111) / 111) * 100) < 1e-9);
  assert.equal(dayChangePct([{ close: 1 }]), null);
  assert.equal(dayChangePct([{ close: 0 }, { close: 1 }]), null);
});

test('roll warning: gone for contract series, kept for continuous, silent while pending', () => {
  const cs = { source: 'CONTRACT' as const, pending: false };
  const cn = { source: 'CONTINUOUS' as const, pending: false };
  assert.equal(shouldWarnRollMismatch({ series: cs, quotePrice: 448.75, lastClose: 434.5 }).warn, false);
  assert.equal(shouldWarnRollMismatch({ series: cn, quotePrice: 448.75, lastClose: 434.5 }).warn, true);
  assert.equal(shouldWarnRollMismatch({ series: cn, quotePrice: 436, lastClose: 434.5 }).warn, false);
  assert.equal(shouldWarnRollMismatch({ series: { source: 'CONTINUOUS', pending: true }, quotePrice: 448.75, lastClose: 434.5 }).warn, false);
  assert.equal(shouldWarnRollMismatch({ series: cn, quotePrice: null, lastClose: 434.5 }).warn, false);
});

test('preference persists per instrument and survives throwing storage', () => {
  const mem = new Map<string, string>();
  const st = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
  assert.equal(readChartSeriesPref('CBOT:ZC', st), 'CONTRACT');
  writeChartSeriesPref('CBOT:ZC', 'CONTINUOUS', st);
  assert.equal(readChartSeriesPref('CBOT:ZC', st), 'CONTINUOUS');
  assert.equal(readChartSeriesPref('ICE:KC', st), 'CONTRACT');
  const bad = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
  assert.equal(readChartSeriesPref('CBOT:ZC', bad), 'CONTRACT');
  assert.doesNotThrow(() => writeChartSeriesPref('CBOT:ZC', 'CONTRACT', bad));
});
