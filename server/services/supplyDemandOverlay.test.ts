/**
 * T60 — enrichSupplyDemandItems tested with an injected MacroService (no network). Verifies slotted
 * blueprint rows are overlaid with WASDE/EIA/FAS/ERS data, key-missing rows degrade to friendly
 * Vietnamese NEEDS_KEY hints, already-filled rows are left alone, and a null macro is a no-op.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  enrichSupplyDemandItems,
  type SupplyMacroLike,
} from './supplyDemandOverlay.ts';
import { getTailoredSupplyDemandBlueprint } from '../../src/shared/data/commodityResearchCatalog.ts';
import type { TailoredSupplyDemandItem } from '../../src/shared/types/cycle.ts';
import type { MacroDatapoint, MacroDatapointId } from '../../src/shared/types/macro.ts';

const NOW = new Date('2026-11-18T12:00:00Z');
const blueprint = getTailoredSupplyDemandBlueprint('CBOT:ZC');
const wasdeBp = blueprint.find((b) => b.id === 'usda_wasde_ending_stocks')!;
const ethanolBp = blueprint.find((b) => b.id === 'ethanol_demand')!;
const exportBp = blueprint.find((b) => b.id === 'us_export_sales')!;
const costBp = blueprint.find((b) => b.id === 'fertilizer_crush_cost')!;

function item(bp: { id: string; label: string; labelVi: string; unit: string; sourceHint: string }, latest: number | null, state: TailoredSupplyDemandItem['state'] = 'UNAVAILABLE'): TailoredSupplyDemandItem {
  return {
    id: bp.id,
    label: bp.label,
    labelVi: bp.labelVi,
    unit: bp.unit,
    sourceHint: bp.sourceHint,
    latestValue: latest,
    previousValue: null,
    period: null,
    impact: 'UNAVAILABLE',
    state,
    notes: '',
    supportHintVi: '',
  };
}

const wasdeDp: MacroDatapoint = {
  id: 'WASDE_US_CORN_ENDING_STOCKS',
  label: 'U.S. corn ending stocks',
  value: 1758,
  previousValue: 1849,
  unit: 'million bushels',
  asOf: '2026/27 projection (Nov 2026 WASDE)',
  sourceName: 'USDA WAOB — WASDE report (official text file)',
  sourceUrl: 'https://example.com/wasde1126.txt',
  sourceQuality: 'OFFICIAL',
  fetchedAt: NOW.toISOString(),
  status: 'HISTORICAL',
  details: { stocksToUsePct: 13.5, previousStocksToUsePct: 14.2, useTotal: 13000, previousUseTotal: 13100 },
};

const emptyGroup = (status: MacroDatapoint['status'], reason: string): MacroDatapoint => ({
  id: 'X' as MacroDatapointId,
  label: 'X',
  value: null,
  unit: 'u',
  asOf: null,
  sourceName: 'S',
  sourceUrl: 'https://example.com/x',
  sourceQuality: 'OFFICIAL',
  fetchedAt: NOW.toISOString(),
  status,
  reason,
});

const costDp: MacroDatapoint = {
  id: 'ERS_BREAKEVEN_CORN',
  label: 'U.S. corn full cost per bushel (ERS)',
  value: 4.55,
  previousValue: 4.62,
  unit: 'US dollars per bushel',
  asOf: '2025',
  sourceName: 'USDA ERS Commodity Costs and Returns',
  sourceUrl: 'https://www.ers.usda.gov/data-products/commodity-costs-and-returns',
  sourceQuality: 'OFFICIAL',
  fetchedAt: NOW.toISOString(),
  status: 'HISTORICAL',
};

test('WASDE slot → OK value + change + asOf + stocks-to-use extra', async () => {
  const macro: SupplyMacroLike = {
    getWasde: async () => ({
      status: 'HISTORICAL', releases: [], upcoming: [], keyNumbers: [wasdeDp],
      calendarSourceUrl: 'https://example.com/esmis', fetchedAt: NOW.toISOString(),
    }),
    getEia: async () => ({ status: 'UNAVAILABLE', items: [], sourceUrl: '', fetchedAt: NOW.toISOString() }),
    getEthanol: async () => emptyGroup('UNAVAILABLE', 'EIA_API_KEY not configured'),
    getExportSales: async () => emptyGroup('UNAVAILABLE', 'FAS_API_KEY not configured'),
    getErsCosts: async () => costDp,
  };
  const out = await enrichSupplyDemandItems([item(wasdeBp, null)], blueprint, 'CBOT:ZC', macro);
  const [row] = out;
  assert.equal(row.state, 'OK');
  assert.equal(row.latestValue, 1758);
  assert.equal(row.previousValue, 1849);
  assert.equal(row.unit, 'triệu giạ (bushel)');
  assert.match(row.changeText ?? '', /so với dự báo tháng trước/);
  assert.match(row.asOf ?? '', /2026\/27/);
  assert.ok(Array.isArray(row.extras) && row.extras!.some((e) => e.label.includes('Tỷ lệ tồn kho')));
  assert.ok(row.sourceUrl?.includes('example.com/wasde1126.txt'));
});

test('ETHANOL slot without key → NEEDS_KEY friendly Vietnamese hint, no value', async () => {
  const macro: SupplyMacroLike = {
    getWasde: async () => ({ status: 'UNAVAILABLE', releases: [], upcoming: [], keyNumbers: [], calendarSourceUrl: '', fetchedAt: NOW.toISOString() }),
    getEia: async () => ({ status: 'UNAVAILABLE', items: [], sourceUrl: '', fetchedAt: NOW.toISOString() }),
    getEthanol: async () => emptyGroup('UNAVAILABLE', 'EIA_API_KEY not configured (free key: ...register.php)'),
    getExportSales: async () => emptyGroup('UNAVAILABLE', 'FAS_API_KEY not configured'),
    getErsCosts: async () => costDp,
  };
  const out = await enrichSupplyDemandItems([item(ethanolBp, null)], blueprint, 'CBOT:ZC', macro);
  const [row] = out;
  assert.equal(row.state, 'NEEDS_KEY');
  assert.equal(row.latestValue, null);
  assert.match(row.hintVi ?? '', /EIA_API_KEY/);
  assert.match(row.hintVi ?? '', /miễn phí/);
});

test('EXPORT slot without key → NEEDS_KEY hint mentions FAS_API_KEY', async () => {
  const macro: SupplyMacroLike = {
    getWasde: async () => ({ status: 'UNAVAILABLE', releases: [], upcoming: [], keyNumbers: [], calendarSourceUrl: '', fetchedAt: NOW.toISOString() }),
    getEia: async () => ({ status: 'UNAVAILABLE', items: [], sourceUrl: '', fetchedAt: NOW.toISOString() }),
    getEthanol: async () => emptyGroup('UNAVAILABLE', 'EIA_API_KEY not configured'),
    getExportSales: async () => emptyGroup('UNAVAILABLE', 'FAS_API_KEY not configured (free key: ...signup/)'),
    getErsCosts: async () => costDp,
  };
  const out = await enrichSupplyDemandItems([item(exportBp, null)], blueprint, 'CBOT:ZC', macro);
  const [row] = out;
  assert.equal(row.state, 'NEEDS_KEY');
  assert.match(row.hintVi ?? '', /FAS_API_KEY/);
  assert.match(row.hintVi ?? '', /miễn phí/);
});

test('COST slot → OK breakeven value with extras', async () => {
  const macro: SupplyMacroLike = {
    getWasde: async () => ({ status: 'UNAVAILABLE', releases: [], upcoming: [], keyNumbers: [], calendarSourceUrl: '', fetchedAt: NOW.toISOString() }),
    getEia: async () => ({ status: 'UNAVAILABLE', items: [], sourceUrl: '', fetchedAt: NOW.toISOString() }),
    getEthanol: async () => emptyGroup('UNAVAILABLE', 'EIA_API_KEY not configured'),
    getExportSales: async () => emptyGroup('UNAVAILABLE', 'FAS_API_KEY not configured'),
    getErsCosts: async () => costDp,
  };
  const out = await enrichSupplyDemandItems([item(costBp, null)], blueprint, 'CBOT:ZC', macro);
  const [row] = out;
  assert.equal(row.state, 'OK');
  assert.equal(row.latestValue, 4.55);
  assert.equal(row.previousValue, 4.62);
  assert.match(row.unit ?? '', /USD\/giạ/);
});

test('Already-filled row is left alone (not re-fetched)', async () => {
  let called = 0;
  const macro: SupplyMacroLike = {
    getWasde: async () => { called += 1; return ({ status: 'HISTORICAL', releases: [], upcoming: [], keyNumbers: [wasdeDp], calendarSourceUrl: '', fetchedAt: NOW.toISOString() }); },
    getEia: async () => ({ status: 'UNAVAILABLE', items: [], sourceUrl: '', fetchedAt: NOW.toISOString() }),
    getEthanol: async () => emptyGroup('UNAVAILABLE', 'EIA_API_KEY not configured'),
    getExportSales: async () => emptyGroup('UNAVAILABLE', 'FAS_API_KEY not configured'),
    getErsCosts: async () => costDp,
  };
  const filled = item(wasdeBp, 999);
  filled.state = 'OK';
  const out = await enrichSupplyDemandItems([filled], blueprint, 'CBOT:ZC', macro);
  assert.equal(called, 0, 'macro should not be called for an already-filled row');
  assert.equal(out[0].latestValue, 999);
});

test('Null macro → every row unchanged', async () => {
  const rows = [item(wasdeBp, null), item(ethanolBp, null)];
  const out = await enrichSupplyDemandItems(rows, blueprint, 'CBOT:ZC', null);
  assert.deepEqual(out, rows);
});

test('Rice (ZR) has no sdCommodity → WASDE/FAS/ERS slots not enriched, item unchanged', async () => {
  const macro: SupplyMacroLike = {
    getWasde: async () => ({ status: 'HISTORICAL', releases: [], upcoming: [], keyNumbers: [wasdeDp], calendarSourceUrl: '', fetchedAt: NOW.toISOString() }),
    getEia: async () => ({ status: 'UNAVAILABLE', items: [], sourceUrl: '', fetchedAt: NOW.toISOString() }),
    getEthanol: async () => emptyGroup('UNAVAILABLE', 'EIA_API_KEY not configured'),
    getExportSales: async () => emptyGroup('UNAVAILABLE', 'FAS_API_KEY not configured'),
    getErsCosts: async () => costDp,
  };
  const rice = item(wasdeBp, null);
  const out = await enrichSupplyDemandItems([rice], blueprint, 'CBOT:ZR', macro);
  assert.equal(out[0].latestValue, null, 'rice should not receive corn WASDE numbers');
  assert.equal(out[0].state, 'UNAVAILABLE');
});
