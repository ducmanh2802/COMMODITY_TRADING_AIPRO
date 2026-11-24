import assert from 'node:assert/strict';
import test from 'node:test';
import { INITIAL_INSTRUMENTS } from '../../../../server/data/instruments.ts';
import {
  buildDirectFallbackRecommendations,
  buildSignalsSignature,
  normalizeOpenPositions,
  rankCandidateLessons,
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
