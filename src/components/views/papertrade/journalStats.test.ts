import test from 'node:test';
import assert from 'node:assert/strict';
import { computeJournalStats, JOURNAL_MIN_TRADES, type JournalTrade } from './journalStats';

const t = (pnl: number, at: number, r: number | null = null, sl: number | null = null): JournalTrade => ({ pnlVnd: pnl, closedAtMs: at, rMultiple: r, stopLoss: sl });

test('basic metrics', () => {
  const s = computeJournalStats([t(100, 1, 2, 9), t(-50, 2, -1, 9), t(-30, 3), t(-20, 4), t(60, 5, 1, 9)]);
  assert.equal(s.trades, 5);
  assert.equal(s.enough, true);
  assert.equal(s.winRatePct, 40);
  assert.equal(s.avgWinVnd, 80);
  assert.equal(s.avgLossVnd, -33);
  assert.equal(s.avgR, 0.67);
  assert.equal(s.rCount, 3);
  assert.equal(s.maxDrawdownVnd, 100);
  assert.equal(s.longestLossStreak, 3);
  assert.deepEqual(s.cumulative, [100, 50, 20, 0, 60]);
});

test('too few trades flagged; empty safe', () => {
  assert.equal(computeJournalStats([t(1, 1)]).enough, false);
  assert.equal(JOURNAL_MIN_TRADES, 5);
  const e = computeJournalStats([]);
  assert.equal(e.winRatePct, null);
  assert.equal(e.avgR, null);
});

test('R ignored without stop', () => {
  assert.equal(computeJournalStats([t(1, 1, 3, null)]).avgR, null);
});
