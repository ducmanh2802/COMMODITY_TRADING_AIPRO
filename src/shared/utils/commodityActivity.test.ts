import assert from 'node:assert/strict';
import { test } from 'node:test';
import { INITIAL_INSTRUMENTS } from '../../../server/data/instruments.ts';
import {
  applySearchHit,
  COMMODITY_SEARCH_STORAGE_KEY,
  getTopSearchedCommodities,
  loadCommoditySearchStats,
  normalizeActivitySymbol,
  recordCommoditySearch,
  resolveSearchMatchSymbols,
} from './commodityActivity.ts';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(k: string) {
      return map.get(k) ?? null;
    },
    key(i: number) {
      return Array.from(map.keys())[i] ?? null;
    },
    removeItem(k: string) {
      map.delete(k);
    },
    setItem(k: string, v: string) {
      map.set(k, v);
    },
  };
}

test('normalizeActivitySymbol strips exchange prefix and uppercases', () => {
  assert.equal(normalizeActivitySymbol('CBOT:zc'), 'ZC');
  assert.equal(normalizeActivitySymbol(' cl '), 'CL');
  assert.equal(normalizeActivitySymbol('   '), '');
});

test('applySearchHit and getTopSearchedCommodities order by count desc then recency', () => {
  let stats = applySearchHit({}, 'ZC', 100);
  stats = applySearchHit(stats, 'CL', 200);
  stats = applySearchHit(stats, 'CBOT:ZC', 300);
  stats = applySearchHit(stats, 'GC', 400);

  const top = getTopSearchedCommodities(stats, INITIAL_INSTRUMENTS, 5);
  assert.equal(top[0].symbol, 'ZC');
  assert.equal(top[0].count, 2);
  assert.equal(top[1].symbol, 'GC'); // count 1, more recent than CL
  assert.equal(top[2].symbol, 'CL');
});

test('recordCommoditySearch persists and handles corrupt storage gracefully', () => {
  const storage = memoryStorage();
  recordCommoditySearch('ICE:RC', storage, 1000);
  recordCommoditySearch('RC', storage, 2000);
  const loaded = loadCommoditySearchStats(storage);
  assert.equal(loaded.RC?.count, 2);

  storage.setItem(COMMODITY_SEARCH_STORAGE_KEY, '{broken');
  assert.deepEqual(loadCommoditySearchStats(storage), {});
});

test('resolveSearchMatchSymbols resolves exact symbols and narrow Vietnamese/English product names', () => {
  assert.deepEqual(resolveSearchMatchSymbols('zc', INITIAL_INSTRUMENTS), ['ZC']);
  assert.deepEqual(resolveSearchMatchSymbols('wti', INITIAL_INSTRUMENTS), ['CL']);
  assert.deepEqual(resolveSearchMatchSymbols('robusta', INITIAL_INSTRUMENTS), ['RC']);
  assert.deepEqual(
    resolveSearchMatchSymbols('dau tho', [
      {
        ...INITIAL_INSTRUMENTS.find((i) => i.exchangeSymbol === 'CL')!,
        commodityProfile: {
          vietnameseName: 'Dầu thô WTI',
          contractMonths: ['F', 'G'],
          contractCycleSummary: '',
          deliveryGrade: '',
          vietnamTradingSessionsIct: '',
          vietnamMarketRelevance: '',
          correlationGroup: 'Energy',
          fundamentalDrivers: [],
          seasonalPattern: '',
          fxSensitivity: '',
          riskNotes: '',
        },
      },
    ]),
    ['CL']
  );
  assert.deepEqual(resolveSearchMatchSymbols('c', INITIAL_INSTRUMENTS), []); // single char ignored
});
