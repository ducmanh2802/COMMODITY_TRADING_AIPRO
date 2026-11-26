import assert from 'node:assert/strict';
import test from 'node:test';
import { INITIAL_INSTRUMENTS } from '../../../../server/data/instruments.ts';
import {
  AI_REC_CACHE_TTL_MS,
  buildDirectFallbackRecommendations,
  buildSignalsSignature,
  buildStableSignalsKey,
  clearCachedAiRecommendation,
  clearRateLimitCooldown,
  getRateLimitCooldownMs,
  loadCachedAiRecommendation,
  normalizeOpenPositions,
  rankCandidateLessons,
  recordRateLimitCooldown,
  saveCachedAiRecommendation,
} from './aiRecommendations.ts';
import { CURRICULUM } from './curriculum/index.ts';
import type { LearnProgress } from './progress.ts';

const EMPTY_PROGRESS: LearnProgress = {
  lessons: {},
  checklist: {},
  notes: {},
  bookmarked: [],
};

test('normalizeOpenPositions resolves instruments and merges duplicate symbol+side contracts', () => {
  const positions = normalizeOpenPositions(
    [
      {
        id: 'p1',
        sessionId: 's1',
        instrumentId: 'CBOT:ZC',
        side: 'LONG',
        contracts: 2,
        entryPrice: 440,
        openedAtMs: 1000,
        entryFxRate: 25000,
        journal: '',
        researchNoteId: '',
        stopLoss: null,
        takeProfit: null,
        marginPerContractUsd: 0,
        entryFeeVnd: 0,
      },
      {
        id: 'p2',
        sessionId: 's1',
        instrumentId: 'ZC',
        side: 'LONG',
        contracts: 1,
        entryPrice: 445,
        openedAtMs: 2000,
        entryFxRate: 25000,
        journal: '',
        researchNoteId: '',
        stopLoss: null,
        takeProfit: null,
        marginPerContractUsd: 0,
        entryFeeVnd: 0,
      },
    ],
    [
      {
        instrumentId: 'ICE:RC',
        direction: 'SHORT',
        contracts: 3,
        status: 'OPEN',
      },
      {
        instrumentId: 'NYMEX:CL',
        direction: 'LONG',
        contracts: 2,
        status: 'CLOSED',
      },
    ],
    INITIAL_INSTRUMENTS
  );

  assert.equal(positions.length, 2);
  const zc = positions.find((p) => p.symbol === 'ZC');
  assert.ok(zc);
  assert.equal(zc.side, 'LONG');
  assert.equal(zc.contracts, 3);

  const rc = positions.find((p) => p.symbol === 'RC');
  assert.ok(rc);
  assert.equal(rc.side, 'SHORT');
  assert.equal(rc.contracts, 3);
});

test('rankCandidateLessons prioritizes lessons matching open positions and frequent searches', () => {
  const searched = [
    { symbol: 'CL', name: 'Dầu thô WTI', category: 'ENERGY', count: 5, lastAt: 1000 },
  ];
  const openPositions = [
    { symbol: 'RC', name: 'Cà phê Robusta', category: 'SOFT_COMMODITIES', side: 'SHORT' as const, contracts: 2 },
  ];

  const candidates = rankCandidateLessons(
    CURRICULUM,
    EMPTY_PROGRESS,
    INITIAL_INSTRUMENTS,
    searched,
    openPositions,
    12
  );

  const ids = candidates.map((c) => c.id);
  assert.ok(ids.includes('l3-coffee'), 'Expected coffee lesson for RC position');
  assert.ok(ids.includes('l10-robusta'), 'Expected Robusta A-Z lesson for RC position');
  assert.ok(ids.includes('l3-oil'), 'Expected oil lesson for CL search');
  assert.ok(ids.includes('l10-margin'), 'Expected margin lesson for open position');

  const oil = candidates.find((c) => c.id === 'l3-oil');
  assert.deepEqual(oil?.matchedSymbols, ['CL']);
});

test('rankCandidateLessons boosts unfinished lessons over completed ones with equal affinity', () => {
  const progress: LearnProgress = {
    lessons: {
      'l3-coffee': { done: true },
    },
    checklist: {},
    notes: {},
    bookmarked: [],
  };
  const candidates = rankCandidateLessons(
    CURRICULUM,
    progress,
    INITIAL_INSTRUMENTS,
    [{ symbol: 'RC', name: 'Robusta', category: 'SOFT_COMMODITIES', count: 3 }],
    [],
    10
  );

  const coffeeIdx = candidates.findIndex((c) => c.id === 'l3-coffee');
  const robustaIdx = candidates.findIndex((c) => c.id === 'l10-robusta');
  assert.ok(robustaIdx >= 0 && coffeeIdx >= 0);
  assert.ok(robustaIdx < coffeeIdx);
});

test('buildDirectFallbackRecommendations produces factual fallback items and deterministic signature', () => {
  const searched = [{ symbol: 'GC', name: 'Vàng COMEX', category: 'METALS', count: 4 }];
  const openPositions = [{ symbol: 'GC', name: 'Vàng COMEX', category: 'METALS', side: 'LONG' as const, contracts: 1 }];
  const candidates = rankCandidateLessons(CURRICULUM, EMPTY_PROGRESS, INITIAL_INSTRUMENTS, searched, openPositions, 8);
  const items = buildDirectFallbackRecommendations(candidates, searched, openPositions, 'vi', 3);

  assert.equal(items.length, 3);
  assert.ok(items[0].reason.includes('GC'));
  assert.equal(items[0].priority, 'HIGH');

  const sig1 = buildSignalsSignature(searched, openPositions, 'vi');
  const sig2 = buildSignalsSignature(searched, openPositions, 'vi');
  assert.equal(sig1, sig2);
});

test('buildStableSignalsKey ignores search count bumps and sessionStorage cache/cooldown respect TTL', () => {
  const k1 = buildStableSignalsKey(
    [{ symbol: 'RC', name: 'Robusta', count: 1 }],
    [{ symbol: 'ZC', name: 'Corn', side: 'LONG', contracts: 1 }],
    'vi'
  );
  const k2 = buildStableSignalsKey(
    [{ symbol: 'ICE:RC', name: 'Robusta', count: 7 }],
    [{ symbol: 'CBOT:ZC', name: 'Corn', side: 'LONG', contracts: 5 }],
    'vi'
  );
  assert.equal(k1, k2);

  const map = new Map<string, string>();
  const mockStorage = {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  } as Storage;

  const sampleResult = {
    status: 'OK' as const,
    headline: 'Cached headline',
    recommendations: [],
    generatedAt: '2026-11-26T00:00:00.000Z',
    language: 'vi' as const,
  };
  saveCachedAiRecommendation(k1, sampleResult, mockStorage, 10_000);
  assert.deepEqual(loadCachedAiRecommendation(k1, mockStorage, 20_000), sampleResult);
  assert.equal(loadCachedAiRecommendation('other-key', mockStorage, 20_000), null);
  assert.equal(loadCachedAiRecommendation(k1, mockStorage, 10_000 + AI_REC_CACHE_TTL_MS), null);

  clearCachedAiRecommendation(mockStorage);
  assert.equal(loadCachedAiRecommendation(k1, mockStorage, 20_000), null);

  recordRateLimitCooldown(15_000, mockStorage, 50_000);
  assert.equal(getRateLimitCooldownMs(mockStorage, 55_000), 10_000);
  assert.equal(getRateLimitCooldownMs(mockStorage, 66_000), 0);
  recordRateLimitCooldown(15_000, mockStorage, 70_000);
  clearRateLimitCooldown(mockStorage);
  assert.equal(getRateLimitCooldownMs(mockStorage, 71_000), 0);
});
