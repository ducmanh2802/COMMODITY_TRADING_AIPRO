import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FRED_BENCHMARK_DEFS, benchmarkStatus, buildBenchmarkQuote, parseFredCsv } from './fredBenchmarks.ts';

const fx = (id: string) => readFileSync(new URL(`./__fixtures__/fred_${id}.csv`, import.meta.url), 'utf8');
const NOW = new Date('2026-11-20T00:00:00Z');
const def = (id: string) => FRED_BENCHMARK_DEFS.find((d) => d.seriesId === id)!;
const latest = (id: string) => {
  const o = parseFredCsv(fx(id));
  return o[o.length - 1];
};

test('parseFredCsv skips "." rows and rejects bad headers', () => {
  const o = parseFredCsv(fx('DCOILBRENTEU'));
  assert.equal(o.length, 3);
  assert.equal(o[2].date, '2026-11-17');
  assert.deepEqual(parseFredCsv('<html>503</html>'), []);
});

test('robusta: cents/lb converted exactly to USD/MT with the conversion stated; labelled benchmark, never live', () => {
  const q = buildBenchmarkQuote(def('PCOFFROBUSDM'), 'RC', latest('PCOFFROBUSDM'), NOW);
  assert.equal(q.kind, 'BENCHMARK');
  assert.equal(q.unit, 'USD/MT');
  assert.ok(Math.abs((q.price as number) - 167.50714285714290 * 22.0462262185) < 0.01);
  assert.match(q.benchmark!.conversion ?? '', /22,0462/);
  assert.equal(q.benchmark!.nativeUnit, 'cents/lb');
  assert.equal(q.benchmark!.period, '2026-09');
  assert.equal(q.status, 'HISTORICAL');
  assert.match(q.statusReason ?? '', /không phải giá hợp đồng tương lai/);
});

test('cotton/rubber/iron ore keep the native unit; iron ore serves both TIO and FEF', () => {
  const ct = buildBenchmarkQuote(def('PCOTTINDUSDM'), 'CT', latest('PCOTTINDUSDM'), NOW);
  assert.equal(ct.unit, 'cents/lb');
  assert.ok(Math.abs((ct.price as number) - 95.8404761904762) < 1e-9);
  assert.equal(ct.benchmark!.conversion, null);
  const jru = buildBenchmarkQuote(def('PRUBBUSDM'), 'JRU', latest('PRUBBUSDM'), NOW);
  assert.equal(jru.currency, 'USD');
  assert.equal(jru.unit, 'cents/lb');
  assert.deepEqual(def('PIORECRUSDM').symbols, ['TIO', 'FEF']);
  assert.equal(buildBenchmarkQuote(def('PIORECRUSDM'), 'TIO', latest('PIORECRUSDM'), NOW).unit, 'USD/MT');
});

test('status is HISTORICAL or STALE by age, never CURRENT/DELAYED', () => {
  assert.equal(benchmarkStatus('MONTHLY', '2026-09-01', NOW), 'HISTORICAL');
  assert.equal(benchmarkStatus('MONTHLY', '2026-06-01', NOW), 'STALE');
  assert.equal(benchmarkStatus('DAILY', '2026-11-17', NOW), 'HISTORICAL');
  assert.equal(benchmarkStatus('DAILY', '2026-11-01', NOW), 'STALE');
  const brn = buildBenchmarkQuote(def('DCOILBRENTEU'), 'BRN', latest('DCOILBRENTEU'), NOW);
  assert.equal(brn.reasonCode, 'BENCHMARK_DAILY');
  assert.equal(brn.unit, 'USD/barrel');
});
