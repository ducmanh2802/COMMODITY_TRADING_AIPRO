import test from 'node:test';
import assert from 'node:assert/strict';
import { computeWeeklyReview, reviewSummaryForAi, vnWeekBounds, type WeeklyTrade } from './weeklyReview';

// Wed 2026-11-25 10:00 VN = 03:00Z. VN week: Mon 2026-11-23 00:00 VN = 2026-11-22T17:00Z
const NOW = Date.parse('2026-11-25T03:00:00Z');
const MON = Date.parse('2026-11-22T17:00:00Z');
const H = 3_600_000;

const tr = (o: Partial<WeeklyTrade>): WeeklyTrade => ({ instrumentId: 'cl', pnlVnd: 0, rMultiple: null, stopLoss: 1, closedAtMs: MON + H, ...o });

test('vnWeekBounds: Monday 00:00 Vietnam time, previous week offset', () => {
  assert.deepEqual(vnWeekBounds(NOW), { startMs: MON, endMs: MON + 7 * 24 * H });
  assert.equal(vnWeekBounds(NOW, -1).startMs, MON - 7 * 24 * H);
  // Sunday 23:30 VN still belongs to the same week
  assert.equal(vnWeekBounds(MON + 7 * 24 * H - 30 * 60_000).startMs, MON);
  // Monday 00:00 VN exactly starts the week
  assert.equal(vnWeekBounds(MON).startMs, MON);
});

test('empty week -> noTrades observation and practice focus', () => {
  const r = computeWeeklyReview([], 100_000_000, NOW);
  assert.equal(r.trades, 0);
  assert.equal(r.winRatePct, null);
  assert.equal(r.weekStart, '2026-11-23');
  assert.equal(r.weekEnd, '2026-11-29');
  assert.deepEqual(r.observations.map((o) => o.key), ['wr.obs.noTrades']);
  assert.deepEqual(r.focus.map((o) => o.key), ['wr.focus.practice']);
});

test('stats: win rate, averages, expectancy, drawdown, stop share, biggest loss', () => {
  const trades = [
    tr({ pnlVnd: -10_000_000, closedAtMs: MON - H }), // previous week: affects start equity only
    tr({ pnlVnd: 2_000_000, rMultiple: 2, closedAtMs: MON + 1 * H }),
    tr({ pnlVnd: -1_000_000, rMultiple: -1, closedAtMs: MON + 2 * H }),
    tr({ pnlVnd: -3_000_000, rMultiple: null, stopLoss: null, instrumentId: 'zc', closedAtMs: MON + 3 * H }),
    tr({ pnlVnd: 4_000_000, rMultiple: 1, closedAtMs: MON + 4 * H }),
  ];
  const r = computeWeeklyReview(trades, 100_000_000, NOW);
  assert.equal(r.trades, 4);
  assert.equal(r.wins, 2);
  assert.equal(r.losses, 2);
  assert.equal(r.winRatePct, 50);
  assert.equal(r.avgWinVnd, 3_000_000);
  assert.equal(r.avgLossVnd, -2_000_000);
  assert.equal(r.totalPnlVnd, 2_000_000);
  assert.equal(r.expectancyVnd, 500_000);
  assert.equal(r.expectancyR, 0.67);
  // start equity 90M -> 92M peak -> 88M trough
  assert.equal(r.maxDrawdownVnd, 4_000_000);
  assert.equal(r.stopLossPct, 75);
  assert.deepEqual(r.biggestLoss, { vnd: -3_000_000, instrumentId: 'zc' });
  assert.equal(r.flags.noStop, 1);
  assert.equal(r.observations[0].key, 'wr.obs.posExp');
  assert.ok(r.observations.some((o) => o.key === 'wr.obs.noStop'));
  assert.equal(r.focus[0].key, 'wr.focus.alwaysStop');
  assert.ok(r.observations.length >= 2 && r.observations.length <= 4);
  assert.ok(r.focus.length >= 1 && r.focus.length <= 2);
});

test('oversized: plan risk over limit or a loss > 5% of week-start equity', () => {
  const trades = [
    tr({ pnlVnd: -6_000_000 }),
    tr({ pnlVnd: 100_000, plan: { riskPct: 4, limitPct: 2, onPlan: false } }),
    tr({ pnlVnd: 100_000, plan: { riskPct: 1, limitPct: 2, onPlan: true } }),
  ];
  const r = computeWeeklyReview(trades, 100_000_000, NOW);
  assert.equal(r.flags.oversized, 2);
  assert.equal(r.flags.offPlan, 1);
  assert.ok(r.focus.some((f) => f.key === 'wr.focus.size'));
});

test('mistake tags: top tag used when present, ignored when absent', () => {
  const r = computeWeeklyReview(
    [tr({ pnlVnd: -1, mistakeTags: ['fomo', 'late'] }), tr({ pnlVnd: -1, mistakeTags: ['fomo', 'fomo'] }), tr({ pnlVnd: 5 })],
    1_000_000,
    NOW
  );
  assert.deepEqual(r.topMistakeTag, { tag: 'fomo', count: 2 });
  assert.ok(r.observations.some((o) => o.key === 'wr.obs.topTag'));
  assert.equal(computeWeeklyReview([tr({ pnlVnd: 1 })], 1_000_000, NOW).topMistakeTag, null);
});

test('previous week toggle and small-sample caveat kept', () => {
  const r = computeWeeklyReview([tr({ pnlVnd: 1_000, closedAtMs: MON - 24 * H })], 1_000_000, NOW, -1);
  assert.equal(r.trades, 1);
  assert.equal(r.weekStart, '2026-11-16');
  assert.ok(r.observations.some((o) => o.key === 'wr.obs.fewTrades'));
});

test('AI summary carries numbers only', () => {
  const s = reviewSummaryForAi(computeWeeklyReview([tr({ pnlVnd: -5, instrumentId: 'secret-id' })], 1_000_000, NOW));
  assert.equal(JSON.stringify(s).includes('secret-id'), false);
  assert.equal(s.trades, 1);
});
