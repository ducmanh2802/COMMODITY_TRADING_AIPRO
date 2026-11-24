import test from 'node:test';
import assert from 'node:assert/strict';
import { computeMonthMistakes, normalizeMistakeNote, normalizeMistakeTags, shiftMonth, vnMonthKey, type MistakeStatTrade } from './mistakeStats';

const NOV = Date.UTC(2026, 10, 10, 3);

test('normalizeMistakeTags keeps known tags, dedupes, canonical order', () => {
  assert.deepEqual(normalizeMistakeTags(['revenge', 'fomo', 'bogus', 'fomo', 3]), ['fomo', 'revenge']);
  assert.deepEqual(normalizeMistakeTags(undefined), []);
  assert.deepEqual(normalizeMistakeTags('fomo'), []);
});

test('normalizeMistakeNote trims and caps length', () => {
  assert.equal(normalizeMistakeNote('  hi  '), 'hi');
  assert.equal(normalizeMistakeNote('x'.repeat(500)).length, 140);
  assert.equal(normalizeMistakeNote(null), '');
});

test('vnMonthKey uses UTC+7 and shiftMonth wraps years', () => {
  // 2026-11-30 17:30 UTC = 2026-12-01 00:30 in Vietnam.
  assert.equal(vnMonthKey(Date.UTC(2026, 10, 30, 17, 30)), '2026-12');
  assert.equal(vnMonthKey(Date.UTC(2026, 10, 30, 16, 30)), '2026-11');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
});

test('monthly counts, split loss attribution and top-3', () => {
  const trades: MistakeStatTrade[] = [
    { pnlVnd: -1_000_000, closedAtMs: NOV, mistakeTags: ['fomo', 'oversized'] },
    { pnlVnd: -600_000, closedAtMs: NOV + 1, mistakeTags: ['fomo'] },
    { pnlVnd: -300_000, closedAtMs: NOV + 2, mistakeTags: ['noStop'] },
    { pnlVnd: 200_000, closedAtMs: NOV + 3, mistakeTags: ['heldTooLong'] },
    { pnlVnd: -50_000, closedAtMs: NOV + 4, mistakeTags: ['revenge'] },
    { pnlVnd: -999, closedAtMs: NOV + 5 },
    { pnlVnd: -5_000_000, closedAtMs: Date.UTC(2026, 9, 10), mistakeTags: ['fomo'] },
  ];
  const s = computeMonthMistakes(trades, '2026-11');
  assert.equal(s.trades, 6);
  assert.equal(s.taggedTrades, 5);
  assert.equal(s.attributedLossVnd, 1_950_000);
  const fomo = s.rows.find((r) => r.tag === 'fomo')!;
  assert.equal(fomo.count, 2);
  assert.equal(fomo.lossVnd, 1_100_000);
  assert.equal(s.rows.find((r) => r.tag === 'oversized')!.lossVnd, 500_000);
  assert.equal(s.rows.find((r) => r.tag === 'heldTooLong')!.lossVnd, 0);
  assert.deepEqual(s.top3.map((r) => r.tag), ['fomo', 'oversized', 'noStop']);
  assert.equal(s.rows.reduce((a, r) => a + r.lossVnd, 0), s.attributedLossVnd);
});

test('empty month', () => {
  const s = computeMonthMistakes([], '2026-11');
  assert.equal(s.trades, 0);
  assert.deepEqual(s.top3, []);
});
