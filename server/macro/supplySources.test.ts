/**
 * T60 — Supply/demand source adapters tested only against recorded fixtures through an injected
 * fetch (no network, no keys leaked into sourceUrl).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  EIA_ETHANOL_BASE,
  ETHANOL_SERIES,
  FAS_ESR_BASE,
  FAS_KEY_URL,
  FAS_COMMODITIES,
  fasMarketYear,
  fasUrl,
  fetchEiaEthanol,
  fetchErsCosts,
  fetchFasExportSales,
  parseEiaEthanol,
  parseErsCosts,
  parseFasExportSales,
} from './supplySources.ts';
import type { FetchLike } from './sources.ts';
import { ERS_COSTS_PAGE, findErsCsvUrl } from './supplySources.ts';

const fx = (name: string) => readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), 'utf8');
const ETHANOL = fx('eia_ethanol_prod_2026-11-13.json');
const ERS_CORN = fx('ers_corn.csv');
const ERS_SOY = fx('ers_soybeans.csv');
const ERS_WHEAT = fx('ers_wheat.csv');
const NOW = new Date('2026-11-18T12:00:00Z');

function router(routes: Record<string, () => Response>, calls: string[] = []): FetchLike {
  return async (url) => {
    calls.push(url);
    for (const [prefix, make] of Object.entries(routes)) if (url.startsWith(prefix)) return make();
    throw new Error(`unexpected network call in test: ${url}`);
  };
}
const ok = (body: string) => () => new Response(body, { status: 200 });

test('EIA ethanol: no key → UNAVAILABLE, no network call', async () => {
  const calls: string[] = [];
  const r = await fetchEiaEthanol(router({}, calls), undefined, NOW);
  assert.equal(r.status, 'UNAVAILABLE');
  assert.equal(r.value, null);
  assert.equal(calls.length, 0);
  assert.match(r.reason ?? '', /EIA_API_KEY/);
  assert.ok(!r.sourceUrl.includes('SECRET'));
});

test('EIA ethanol: parses recorded weekly production with previous week', async () => {
  const calls: string[] = [];
  const r = await fetchEiaEthanol(router({ 'https://api.eia.gov/': ok(ETHANOL) }, calls), 'SECRET123', NOW);
  assert.equal(r.status, 'HISTORICAL');
  assert.equal(r.value, 1126);
  assert.equal(r.previousValue, 1130);
  assert.equal(r.asOf, '2026-11-13');
  assert.equal(r.previousAsOf, '2026-11-06');
  assert.equal(r.unit, 'thousand barrels per day');
  assert.equal(r.sourceQuality, 'OFFICIAL');
  assert.match(calls[0], /api_key=SECRET123/);
  assert.ok(!r.sourceUrl.includes('SECRET123'));
});

test('EIA ethanol: old week → STALE; HTTP error → UNAVAILABLE; bad units → INVALID', async () => {
  const late = await fetchEiaEthanol(router({ 'https://api.eia.gov/': ok(ETHANOL) }), 'k', new Date('2026-12-30T00:00:00Z'));
  assert.equal(late.status, 'STALE');

  const err = await fetchEiaEthanol(router({ 'https://api.eia.gov/': () => new Response('{}', { status: 403 }) }), 'k', NOW);
  assert.equal(err.status, 'UNAVAILABLE');
  assert.equal(err.value, null);

  const bad = ETHANOL.replace('MBBL\\/D', 'MBBL');
  const inv = await fetchEiaEthanol(router({ 'https://api.eia.gov/': ok(bad) }), 'k', NOW);
  assert.equal(inv.status, 'INVALID');
  assert.equal(inv.value, null);
});

test('EIA ethanol: network error message never leaks the key', async () => {
  const r = await fetchEiaEthanol(
    async () => {
      throw new Error('connect failed for ...api_key=TOPSECRET');
    },
    'TOPSECRET',
    NOW
  );
  assert.equal(r.status, 'UNAVAILABLE');
  assert.ok(!JSON.stringify(r).includes('TOPSECRET'));
});

test('parseEiaEthanol: parses fixture directly', () => {
  const dp = parseEiaEthanol(JSON.parse(ETHANOL), NOW, NOW.toISOString());
  assert.equal(dp.value, 1126);
  assert.equal(dp.previousValue, 1130);
  assert.equal(dp.asOf, '2026-11-13');
});

// ───────────────────────────── FAS Export Sales ─────────────────────────────

const FAS_CORN_JSON = JSON.stringify([
  { weekEndingDate: '2026-11-12', weeklyExports: 123456, accumulatedExports: 500000, outstandingSales: 100000, currentMYNetSales: 80000 },
  { weekEndingDate: '2026-11-05', weeklyExports: 98765, accumulatedExports: 400000, outstandingSales: 90000, currentMYNetSales: 70000 },
]);

test('FAS: no key → UNAVAILABLE, no network call', async () => {
  const calls: string[] = [];
  const r = await fetchFasExportSales(router({}, calls), undefined, 'CORN', NOW);
  assert.equal(r.status, 'UNAVAILABLE');
  assert.equal(r.value, null);
  assert.equal(calls.length, 0);
  assert.match(r.reason ?? '', /FAS_API_KEY/);
});

test('FAS: parses recorded weekly shipments with previous week', async () => {
  const calls: string[] = [];
  const my = fasMarketYear('CORN', NOW);
  assert.equal(my, 2026);
  const r = await fetchFasExportSales(router({ [fasUrl('CORN', my)]: ok(FAS_CORN_JSON) }, calls), 'SECRET123', 'CORN', NOW);
  assert.equal(r.status, 'HISTORICAL');
  assert.equal(r.value, 123456);
  assert.equal(r.previousValue, 98765);
  assert.equal(r.asOf, '2026-11-12');
  assert.equal(r.previousAsOf, '2026-11-05');
  assert.equal(r.unit, 'metric tons per week');
  assert.equal(r.sourceQuality, 'OFFICIAL');
  assert.deepEqual(r.details, {
    accumulatedExports: 500000,
    outstandingSales: 100000,
    currentMYNetSales: 80000,
    marketYear: 2026,
  });
  assert.ok(!r.sourceUrl.includes('SECRET123'));
});

test('FAS: wheat market year starts June', () => {
  assert.equal(fasMarketYear('WHEAT', new Date('2026-05-01T00:00:00Z')), 2025);
  assert.equal(fasMarketYear('WHEAT', new Date('2026-09-01T00:00:00Z')), 2026);
});

test('FAS: invalid / empty response → INVALID / UNAVAILABLE, no values', () => {
  assert.equal(parseFasExportSales(null, 'CORN', 2026, NOW, NOW.toISOString()).status, 'INVALID');
  assert.equal(parseFasExportSales('not json', 'CORN', 2026, NOW, NOW.toISOString()).status, 'INVALID');
});

test('FAS: network error message never leaks the key', async () => {
  const my = fasMarketYear('CORN', NOW);
  const r = await fetchFasExportSales(
    async () => {
      throw new Error('connect failed for ...API_KEY=TOPSECRET');
    },
    'TOPSECRET',
    'CORN',
    NOW
  );
  assert.equal(r.status, 'UNAVAILABLE');
  assert.ok(!JSON.stringify(r).includes('TOPSECRET'));
});

// ───────────────────────────── USDA ERS Costs & Returns ─────────────────────────────

test('ERS corn: breakeven = total cost / yield, prior year carried', () => {
  const dp = parseErsCosts(ERS_CORN, 'CORN', 'https://www.ers.usda.gov/media/1/corn.csv', NOW.toISOString());
  assert.equal(dp.status, 'HISTORICAL');
  assert.equal(dp.value, 4.55); // 900.52 / 198
  assert.equal(dp.previousValue, 4.62); // 878.31 / 190
  assert.equal(dp.asOf, '2025');
  assert.equal(dp.previousAsOf, '2024');
  assert.equal(dp.unit, 'US dollars per bushel');
  assert.equal(dp.sourceQuality, 'OFFICIAL');
  assert.deepEqual(dp.details, {
    costPerAcre: 900.52,
    yieldBuPerAcre: 198,
    operatingCostPerAcre: 455.8,
    operatingCostPerBushel: 2.3,
    priceReceivedPerBushel: 3.93,
  });
});

test('ERS soybeans: breakeven', () => {
  const dp = parseErsCosts(ERS_SOY, 'SOYBEAN', 'https://www.ers.usda.gov/media/2/soybeans.csv', NOW.toISOString());
  assert.equal(dp.value, 11.39); // 660.62 / 58
  assert.equal(dp.previousValue, 11.83); // 650.83 / 55
  assert.deepEqual(dp.details, {
    costPerAcre: 660.62,
    yieldBuPerAcre: 58,
    operatingCostPerAcre: 250.88,
    operatingCostPerBushel: 4.33,
    priceReceivedPerBushel: 9.76,
  });
});

test('ERS wheat: breakeven', () => {
  const dp = parseErsCosts(ERS_WHEAT, 'WHEAT', 'https://www.ers.usda.gov/media/3/wheat.csv', NOW.toISOString());
  assert.equal(dp.value, 7.57); // 408.55 / 54
  assert.equal(dp.previousValue, 7.66); // 398.35 / 52
  assert.deepEqual(dp.details, {
    costPerAcre: 408.55,
    yieldBuPerAcre: 54,
    operatingCostPerAcre: 162.96,
    operatingCostPerBushel: 3.02,
    priceReceivedPerBushel: 5.07,
  });
});

test('ERS: unrecognized header → INVALID', () => {
  const dp = parseErsCosts('Bad,Header\n', 'CORN', 'https://x/corn.csv', NOW.toISOString());
  assert.equal(dp.status, 'INVALID');
  assert.equal(dp.value, null);
});

test('ERS: no year with both cost and yield → UNAVAILABLE', () => {
  const csv = '"Commodity","Item","Units","Region","Year","Value"\nCorn,"Total, costs listed","dollars per planted acre","U.S. total",2025,900\n';
  const dp = parseErsCosts(csv, 'CORN', 'https://x/corn.csv', NOW.toISOString());
  assert.equal(dp.status, 'UNAVAILABLE');
  assert.equal(dp.value, null);
});

// fetchErsCosts end-to-end: discovers the CSV link on the ERS page, then parses the CSV.
test('ERS fetch: discovers CSV link from page and parses corn', async () => {
  const calls: string[] = [];
  const pageHtml = '<html><body><a href="/media/999/corn.csv?foo=1&amp;bar=2">Corn costs CSV</a></body></html>';
  const r = await fetchErsCosts(
    router({
      [ERS_COSTS_PAGE]: ok(pageHtml),
      'https://www.ers.usda.gov/media/999/corn.csv': ok(ERS_CORN),
    },
    calls),
    'CORN',
    NOW
  );
  assert.equal(r.status, 'HISTORICAL');
  assert.equal(r.value, 4.55);
  assert.ok(calls.some((c) => c === ERS_COSTS_PAGE));
  assert.ok(calls.some((c) => c.startsWith('https://www.ers.usda.gov/media/999/corn.csv')));
});

test('ERS fetch: page down → UNAVAILABLE', async () => {
  const r = await fetchErsCosts(
    router({ [ERS_COSTS_PAGE]: () => new Response('', { status: 503 }) }),
    'CORN',
    NOW
  );
  assert.equal(r.status, 'UNAVAILABLE');
  assert.equal(r.value, null);
});

test('ERS fetch: CSV link not found on page → UNAVAILABLE', async () => {
  const r = await fetchErsCosts(
    router({ [ERS_COSTS_PAGE]: ok('<html>no csv link here</html>') }),
    'CORN',
    NOW
  );
  assert.equal(r.status, 'UNAVAILABLE');
  assert.equal(r.value, null);
});

test('findErsCsvUrl: extracts media link', () => {
  const url = findErsCsvUrl('<a href="/media/42/corn.csv?x=1">', 'CORN');
  assert.equal(url, 'https://www.ers.usda.gov/media/42/corn.csv?x=1');
  assert.equal(findErsCsvUrl('<a href="/media/42/soybeans.csv">', 'CORN'), null);
});
