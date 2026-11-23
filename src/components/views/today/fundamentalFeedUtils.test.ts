import test from 'node:test';
import assert from 'node:assert/strict';
import type { FundamentalMacroRecord } from '../../../shared/types/analysis';
import {
  buildFundamentalFeedEntries,
  parseFundamentalStreamPayload,
  summarizeFundamentalFeed,
  type FundamentalNewsRecord,
} from './fundamentalFeedUtils';

const SAMPLE_NEWS: FundamentalNewsRecord[] = [
  {
    id: 'n1',
    headline: 'Dak Lak harvest delayed by unseasonal rain',
    source: 'VICOFA',
    publicationTimestamp: '2026-11-22T09:00:00.000Z',
    category: 'WEATHER',
    relatedSymbols: ['rc', 'KC'],
    classification: 'BULLISH',
    summary: 'Heavy rainfall slowed cherry drying across Central Highlands.',
  },
  {
    id: 'n2',
    headline: 'EIA weekly stocks edge higher',
    source: 'EIA',
    publicationTimestamp: '2026-11-21T15:30:00.000Z',
    category: 'EIA_REPORT',
    relatedSymbols: ['CL', 'BRN'],
    classification: 'BEARISH',
    summary: 'Commercial crude inventories rose modestly.',
  },
];

const SAMPLE_RECORDS: FundamentalMacroRecord[] = [
  {
    id: 'm1',
    dataset: 'IMF_FRED_ROBUSTA_BENCHMARK',
    source: 'FRED Public CSV (PCOFFROBUSDM)',
    publicationTimestamp: '2026-11-23T01:00:00.000Z',
    observationDate: '2026-10-01',
    dataPeriod: '2026-10-01',
    category: 'GLOBAL_SD',
    relatedSymbols: ['RC'],
    actualValue: 4850,
    previousValue: 4720,
    forecastValue: null,
    unit: 'cents/kg',
    revisionStatus: 'FINAL',
    impactAssessment: 'UNCERTAIN',
  },
  {
    id: 'm2',
    dataset: 'FRED_FED_FUNDS_RATE',
    source: 'FRED Public CSV (FEDFUNDS)',
    publicationTimestamp: '2026-11-20T12:00:00.000Z',
    observationDate: '2026-10-01',
    dataPeriod: '2026-10-01',
    category: 'MACRO',
    relatedSymbols: [],
    actualValue: 4.5,
    previousValue: 4.75,
    forecastValue: null,
    unit: 'PCT',
    revisionStatus: 'FINAL',
    impactAssessment: 'SIDEWAYS',
  },
];

test('buildFundamentalFeedEntries merges, deduplicates, and sorts newest first', () => {
  const entries = buildFundamentalFeedEntries(
    SAMPLE_RECORDS,
    [...SAMPLE_NEWS, SAMPLE_NEWS[0]]
  );
  assert.equal(entries.length, 4);
  assert.deepEqual(
    entries.map((e) => e.id),
    ['m1', 'n1', 'n2', 'm2']
  );
  assert.deepEqual(entries[1].relatedSymbols, ['RC', 'KC']);
});

test('buildFundamentalFeedEntries filters by kind, direction, symbol, query, and limit', () => {
  const newsOnly = buildFundamentalFeedEntries(SAMPLE_RECORDS, SAMPLE_NEWS, {
    kindFilter: 'NEWS',
  });
  assert.deepEqual(
    newsOnly.map((e) => e.id),
    ['n1', 'n2']
  );

  const macroOnly = buildFundamentalFeedEntries(SAMPLE_RECORDS, SAMPLE_NEWS, {
    kindFilter: 'MACRO',
  });
  assert.deepEqual(
    macroOnly.map((e) => e.id),
    ['m1', 'm2']
  );

  const rcBullish = buildFundamentalFeedEntries(SAMPLE_RECORDS, SAMPLE_NEWS, {
    symbolFilter: 'rc',
    directionFilter: 'BULLISH',
  });
  assert.deepEqual(
    rcBullish.map((e) => e.id),
    ['n1']
  );

  const queryMatch = buildFundamentalFeedEntries(SAMPLE_RECORDS, SAMPLE_NEWS, {
    query: 'dak lak',
  });
  assert.deepEqual(
    queryMatch.map((e) => e.id),
    ['n1']
  );

  const capped = buildFundamentalFeedEntries(SAMPLE_RECORDS, SAMPLE_NEWS, {
    limit: 2,
  });
  assert.equal(capped.length, 2);
});

test('buildFundamentalFeedEntries and summarizeFundamentalFeed fail closed on empty store', () => {
  const empty = buildFundamentalFeedEntries([], []);
  assert.deepEqual(empty, []);

  const summary = summarizeFundamentalFeed([], []);
  assert.deepEqual(summary, {
    total: 0,
    newsCount: 0,
    macroCount: 0,
    bullishCount: 0,
    bearishCount: 0,
    latestTimestamp: null,
  });

  const populated = summarizeFundamentalFeed(SAMPLE_RECORDS, SAMPLE_NEWS);
  assert.equal(populated.total, 4);
  assert.equal(populated.newsCount, 2);
  assert.equal(populated.macroCount, 2);
  assert.equal(populated.bullishCount, 1);
  assert.equal(populated.bearishCount, 1);
  assert.equal(populated.latestTimestamp, '2026-11-23T01:00:00.000Z');
});

test('parseFundamentalStreamPayload rejects invalid JSON or malformed payloads safely', () => {
  assert.equal(parseFundamentalStreamPayload('{bad json'), null);
  assert.equal(parseFundamentalStreamPayload('{"records":"nope"}'), null);
  const valid = parseFundamentalStreamPayload(
    JSON.stringify({
      status: 'HISTORICAL',
      asOf: null,
      records: SAMPLE_RECORDS,
      news: SAMPLE_NEWS,
      serverTime: '2026-11-23T01:05:00.000Z',
    })
  );
  assert.ok(valid);
  assert.equal(valid.status, 'HISTORICAL');
  assert.equal(valid.records.length, 2);
  assert.equal(valid.news.length, 2);
});
