import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Scorecard } from '../../src/shared/types/scorecard.ts';
import type { CycleMarketOverview } from '../../src/shared/types/cycle.ts';
import { SwrCache } from '../services/swrCache.ts';
import { buildToday } from './today.ts';

test('buildToday serves cached values instantly and flags stale without waiting for the refresh', async () => {
  let t = 0;
  let slow = false;
  const scorecards = new SwrCache<Scorecard[]>({
    ttlMs: 100,
    now: () => t,
    compute: async () => {
      if (slow) await new Promise(() => undefined); // never resolves: simulates a hung Yahoo call
      return [] as Scorecard[];
    },
  });
  const cycle = new SwrCache<CycleMarketOverview>({ ttlMs: 100, now: () => t, compute: async () => ({ generatedAt: 'x', commodities: [] }) as unknown as CycleMarketOverview });
  const first = await buildToday({ scorecards, cycle });
  assert.equal(first.stale, false);
  assert.ok(first.scorecard && first.cycle);
  t = 500;
  slow = true;
  const second = await buildToday({ scorecards, cycle });
  assert.equal(second.stale, true);
  assert.equal(second.scorecard?.stale, true);
  assert.ok(second.cycle);
});

test('buildToday returns the other part when one fails', async () => {
  const scorecards = new SwrCache<Scorecard[]>({ ttlMs: 100, compute: async () => { throw new Error('down'); } });
  const r = await buildToday({ scorecards, cycle: null });
  assert.equal(r.scorecard, null);
  assert.equal(r.cycle, null);
  assert.equal(r.asOf, null);
});
