import test from 'node:test';
import assert from 'node:assert/strict';
import type { MarketCandle } from '../types/market.ts';
import {
  DEFAULT_SESSION_DISPLAY_LIMIT,
  MIN_ANALYSIS_SESSIONS,
  buildBenchmarkSessionRows,
  buildCandleSessionRows,
  hasSufficientSessionsForAnalysis,
  sliceSessionRows,
} from './sessionHistory.ts';

function makeCandles(count: number): MarketCandle[] {
  const baseMs = Date.parse('2026-09-01T00:00:00Z');
  return Array.from({ length: count }, (_, i) => {
    const close = 100 + i * 2;
    return {
      symbol: 'ZC',
      exchange: 'CBOT',
      timeframe: 'D1',
      timestamp: new Date(baseMs + i * 86_400_000).toISOString(),
      retrievedAt: '2026-11-23T00:00:00.000Z',
      open: close - 1,
      high: close + 2,
      low: close - 2,
      close,
      volume: 1000 + i,
      openInterest: null,
      isComplete: true,
      source: 'YAHOO_UNOFFICIAL:ZC=F',
      status: 'HISTORICAL',
    };
  });
}

test('buildCandleSessionRows computes bar-over-bar deltas ascending then returns newest-first', () => {
  assert.ok(DEFAULT_SESSION_DISPLAY_LIMIT > MIN_ANALYSIS_SESSIONS, 'default row limit must exceed 20 sessions');

  const input = makeCandles(35);
  // Add an incomplete bar at the end — must be excluded
  input.push({ ...input[input.length - 1], timestamp: '2026-10-15T00:00:00.000Z', isComplete: false });
  // Shuffle input slightly to verify chronological sorting
  const shuffled = [...input].reverse();

  const rows = buildCandleSessionRows(shuffled);
  assert.equal(rows.length, 35);
  // Newest first (index 34 has close = 100 + 34*2 = 168, prev = 166)
  assert.equal(rows[0].close, 168);
  assert.equal(rows[0].changeAbs, 2);
  assert.ok(Math.abs((rows[0].changePct ?? 0) - (2 / 166) * 100) < 1e-9);
  assert.equal(rows[0].rangeAbs, 4);

  // Oldest row has null bar-over-bar delta
  assert.equal(rows[34].close, 100);
  assert.equal(rows[34].changeAbs, null);
  assert.equal(rows[34].changePct, null);

  const page = sliceSessionRows(rows, DEFAULT_SESSION_DISPLAY_LIMIT);
  assert.equal(page.length, 30);
  assert.equal(hasSufficientSessionsForAnalysis(rows.length), true);
  assert.equal(hasSufficientSessionsForAnalysis(20), false);
});

test('buildBenchmarkSessionRows sorts dates, calculates delta %, and ignores non-positive points', () => {
  const rows = buildBenchmarkSessionRows([
    { date: '2026-10-01', value: 110 },
    { date: '2026-08-01', value: 100 },
    { date: '2026-09-01', value: 105 },
    { date: '2026-07-01', value: 0 },
  ]);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].date, '2026-10-01');
  assert.equal(rows[0].changeAbs, 5);
  assert.ok(Math.abs((rows[0].changePct ?? 0) - (5 / 105) * 100) < 1e-9);
  assert.equal(rows[2].changeAbs, null);
});
