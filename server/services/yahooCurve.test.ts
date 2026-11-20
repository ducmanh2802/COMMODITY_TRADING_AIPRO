import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  clearYahooCurveCache,
  getYahooCurve,
  YAHOO_CURVE_LABEL,
  YAHOO_CURVE_TTL_MS,
  type YahooCurveResponse,
} from './yahooCurve.ts';
import { instrumentRepository } from './instrumentRegistry.ts';
import type { InstrumentDefinition } from '../../src/shared/types/instrument.ts';

/**
 * Recorded live responses (fetched 2026-11-20 from query1.finance.yahoo.com):
 * - chart_ZCZ26.CBT.json : GET /v8/finance/chart/ZCZ26.CBT?range=5d&interval=1d (front-month metadata)
 * - spark_ZC.json        : GET /v8/finance/spark?symbols=ZCZ26.CBT,ZCH27.CBT,ZCK27.CBT,ZCN27.CBT&range=5d&interval=1d
 * Tests never touch the network.
 */
const readFixture = (name: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./__fixtures__/yahooCurve/${name}`, import.meta.url)), 'utf8'));

const chartFixture = () => readFixture('chart_ZCZ26.CBT.json') as Record<string, unknown>;
const sparkFixture = () => readFixture('spark_ZC.json') as Record<string, Record<string, unknown>>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

interface FakeYahoo {
  fetchFn: typeof fetch;
  calls: string[];
}

/** Routes chart vs spark requests to the given bodies; records every URL requested. */
function fakeYahoo(chart: unknown, spark: unknown): FakeYahoo {
  const calls: string[] = [];
  const fetchFn: typeof fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/chart/')) return json(chart);
    if (url.includes('/spark')) return json(spark);
    throw new Error(`Unexpected URL: ${url}`);
  };
  return { fetchFn, calls };
}

const FIXED_NOW = Date.parse('2026-11-20T12:00:00.000Z');
const NOW = () => FIXED_NOW;
const VALUATION_DATE = '2026-11-20';

async function corn(): Promise<InstrumentDefinition> {
  const inst = await instrumentRepository.findBySymbol('CBOT:ZC');
  assert.ok(inst, 'CBOT:ZC must be registered');
  return inst;
}

function setMeta(chart: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(chart));
  Object.assign((clone as any).chart.result[0].meta, patch);
  return clone;
}

function sparkWithout(spark: Record<string, Record<string, unknown>>, symbol: string): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(spark));
  delete clone[symbol];
  return clone;
}

test('prices the next listed contract months from one spark request (UNOFFICIAL, labelled)', async () => {
  clearYahooCurveCache();
  const inst = await corn();
  const y = fakeYahoo(chartFixture(), sparkFixture());
  const r = await getYahooCurve(inst, 4, 'VERIFIED', { fetchFn: y.fetchFn, now: NOW });

  assert.equal(r.status, 'OK');
  assert.equal(r.instrumentId, 'CBOT:ZC');
  assert.equal(r.source, YAHOO_CURVE_LABEL);
  assert.equal(r.unit, 'cents/bushel');
  assert.equal(r.valuationDate, VALUATION_DATE);
  assert.deepEqual(r.excluded, []);
  // one chart request (front-month validation) + one spark request (all months)
  assert.equal(y.calls.length, 2);
  assert.match(y.calls[0], /\/chart\/ZCZ26\.CBT/);
  assert.match(y.calls[1], /\/spark/);

  assert.equal(r.contracts.length, 4);
  assert.deepEqual(
    r.contracts.map((c) => c.contract),
    ['ZCZ26', 'ZCH27', 'ZCK27', 'ZCN27']
  );
  assert.ok(r.contracts.every((c) => c.yahooSymbol.endsWith('.CBT')));
  assert.ok(r.contracts.every((c) => c.calendarStatus === 'VERIFIED'));
  assert.ok(r.contracts.every((c) => c.lastTradingDay >= VALUATION_DATE));
  // prices come from the last spark bar, unaltered (USX == cents/bushel)
  assert.deepEqual(r.contracts.map((c) => c.price), [437.25, 450.75, 459, 466.25]);
  assert.ok(r.contracts.every((c) => c.asOf.startsWith(VALUATION_DATE)));

  assert.ok(r.result && r.result.status === 'OK');
  if (r.result?.status === 'OK') {
    assert.equal(r.result.shape, 'CONTANGO'); // 437.25 < 450.75 < 459 < 466.25
    assert.equal(r.result.points.length, 4);
    assert.equal(r.result.spreads.length, 3);
    assert.ok(r.result.points.every((p) => p.daysToExpiry > 0));
    assert.ok(r.result.spreads.every((s) => s.direction === 'CONTANGO'));
  }
  assert.ok(r.notes.some((n) => n.includes(YAHOO_CURVE_LABEL)));
});

test('refuses the whole curve when the front month is not the expected exchange', async () => {
  clearYahooCurveCache();
  const inst = await corn();
  const chart = setMeta(chartFixture(), { exchangeName: 'NYM' });
  const y = fakeYahoo(chart, sparkFixture());
  const r = await getYahooCurve(inst, 4, 'VERIFIED', { fetchFn: y.fetchFn, now: NOW });
  assert.equal(r.status, 'UNAVAILABLE');
  if (r.status === 'UNAVAILABLE') assert.match(r.reason, /returned exchange "NYM"/);
  assert.equal(y.calls.length, 1, 'must not fetch prices after metadata validation fails');
});

test('refuses the curve when the Yahoo currency cannot be reconciled with the quotation unit', async () => {
  clearYahooCurveCache();
  const inst = await corn();
  const chart = setMeta(chartFixture(), { currency: 'EUR' });
  const y = fakeYahoo(chart, sparkFixture());
  const r = await getYahooCurve(inst, 4, 'VERIFIED', { fetchFn: y.fetchFn, now: NOW });
  assert.equal(r.status, 'UNAVAILABLE');
  if (r.status === 'UNAVAILABLE') assert.match(r.reason, /currency "EUR"/);
});

test('refuses a symbol that is not an outright future', async () => {
  clearYahooCurveCache();
  const inst = await corn();
  const chart = setMeta(chartFixture(), { instrumentType: 'INDEX' });
  const y = fakeYahoo(chart, sparkFixture());
  const r = await getYahooCurve(inst, 4, 'VERIFIED', { fetchFn: y.fetchFn, now: NOW });
  assert.equal(r.status, 'UNAVAILABLE');
  if (r.status === 'UNAVAILABLE') assert.match(r.reason, /instrumentType "INDEX"/);
});

test('marks the curve PARTIAL and lists the reason when a month has no Yahoo bar', async () => {
  clearYahooCurveCache();
  const inst = await corn();
  const y = fakeYahoo(chartFixture(), sparkWithout(sparkFixture() as any, 'ZCK27.CBT'));
  const r = await getYahooCurve(inst, 4, 'VERIFIED', { fetchFn: y.fetchFn, now: NOW });
  assert.equal(r.status, 'PARTIAL');
  assert.equal(r.contracts.length, 3);
  assert.deepEqual(
    r.contracts.map((c) => c.contract),
    ['ZCZ26', 'ZCH27', 'ZCN27']
  );
  const excluded = 'excluded' in r ? r.excluded : [];
  assert.equal(excluded.length, 1);
  assert.equal(excluded[0].contract, 'ZCK27');
  assert.match(excluded[0].reason, /no daily price/);
});

test('excludes a month whose last bar is not on the common valuation date', async () => {
  clearYahooCurveCache();
  const inst = await corn();
  const spark = sparkFixture() as Record<string, { timestamp: number[]; close: number[] }>;
  // drop ZCK27's final bar so its last trade date is one day older than the others
  spark['ZCK27.CBT'].timestamp = spark['ZCK27.CBT'].timestamp.slice(0, -1);
  spark['ZCK27.CBT'].close = spark['ZCK27.CBT'].close.slice(0, -1);
  const y = fakeYahoo(chartFixture(), spark);
  const r = await getYahooCurve(inst, 4, 'VERIFIED', { fetchFn: y.fetchFn, now: NOW });
  assert.equal(r.status, 'PARTIAL');
  assert.equal(r.valuationDate, VALUATION_DATE);
  if ('excluded' in r) {
    assert.ok(!r.contracts.some((c) => c.contract === 'ZCK27'));
    assert.ok(r.excluded.some((e) => e.contract === 'ZCK27' && /common valuation date/.test(e.reason)));
  }
});

test('returns UNAVAILABLE when fewer than two months can be priced', async () => {
  clearYahooCurveCache();
  const inst = await corn();
  const spark = sparkFixture() as Record<string, Record<string, unknown>>;
  const y = fakeYahoo(chartFixture(), { 'ZCZ26.CBT': spark['ZCZ26.CBT'] });
  const r = await getYahooCurve(inst, 4, 'VERIFIED', { fetchFn: y.fetchFn, now: NOW });
  assert.equal(r.status, 'UNAVAILABLE');
  if (r.status === 'UNAVAILABLE') assert.match(r.reason, /Fewer than two usable contract months \(1\)/);
});

test('passes UNVERIFIED through to every contract when the calendar is unverified', async () => {
  clearYahooCurveCache();
  const inst = await corn();
  const y = fakeYahoo(chartFixture(), sparkFixture());
  const r = await getYahooCurve(inst, 4, 'UNVERIFIED', { fetchFn: y.fetchFn, now: NOW });
  assert.notEqual(r.status, 'UNAVAILABLE');
  if (r.status !== 'UNAVAILABLE') {
    assert.ok(r.contracts.every((c) => c.calendarStatus === 'UNVERIFIED'));
  }
});

test('caches a successful curve for the TTL and reuses it without another request', async () => {
  clearYahooCurveCache();
  const inst = await corn();
  const y = fakeYahoo(chartFixture(), sparkFixture());
  const first = await getYahooCurve(inst, 4, 'VERIFIED', { fetchFn: y.fetchFn, now: NOW });
  assert.equal(y.calls.length, 2);
  const clock = { t: FIXED_NOW };
  const second = await getYahooCurve(inst, 4, 'VERIFIED', { fetchFn: y.fetchFn, now: () => clock.t });
  assert.equal(y.calls.length, 2, 'second call inside the TTL must be served from cache');
  assert.equal(second, first);
  clock.t = FIXED_NOW + YAHOO_CURVE_TTL_MS + 1;
  await getYahooCurve(inst, 4, 'VERIFIED', { fetchFn: y.fetchFn, now: () => clock.t });
  assert.equal(y.calls.length, 4, 'after the TTL the curve is fetched again');
});

test('does not cache an UNAVAILABLE result (so it can recover)', async () => {
  clearYahooCurveCache();
  const inst = await corn();
  let calls = 0;
  const fetchFn: typeof fetch = async (input) => {
    calls += 1;
    if (String(input).includes('/chart/')) return json(setMeta(chartFixture(), { exchangeName: 'NYM' }));
    return json(sparkFixture());
  };
  const a = await getYahooCurve(inst, 4, 'VERIFIED', { fetchFn, now: NOW });
  const b = await getYahooCurve(inst, 4, 'VERIFIED', { fetchFn, now: NOW });
  assert.equal(a.status, 'UNAVAILABLE');
  assert.equal(b.status, 'UNAVAILABLE');
  assert.equal(calls, 2, 'each call re-attempts because failures are not cached');
});

test('supports the Yahoo curve only for instruments with a verified mapping', async () => {
  clearYahooCurveCache();
  const unsupported = await instrumentRepository.findBySymbol('CME:TIO');
  assert.ok(unsupported);
  const y = fakeYahoo(chartFixture(), sparkFixture());
  const r: YahooCurveResponse = await getYahooCurve(unsupported, 4, 'VERIFIED', { fetchFn: y.fetchFn, now: NOW });
  assert.equal(r.status, 'UNAVAILABLE');
  assert.equal(y.calls.length, 0, 'no request for an instrument without a Yahoo symbol mapping');
});