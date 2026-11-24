import test from 'node:test';
import assert from 'node:assert/strict';
import { CURRICULUM } from '../../components/views/learn/curriculum';
import {
  PROGRAM,
  PROGRAM_WEEKS,
  checkpoint,
  computeMetrics,
  disciplineScore,
  evaluateReadiness,
  parseProgram,
  serializeProgram,
  startMs,
  taskStatus,
  tradesSince,
  weekInfo,
  weekProgress,
  type ProgramData,
  type ProgramState,
  type ProgramTrade,
} from './threeMonth';

const DAY = 86_400_000;
const START = '2026-01-05';
const S = startMs(START);
const ids = new Set(CURRICULUM.flatMap((l) => l.lessons.map((x) => x.id)));
const levelIds = new Set(CURRICULUM.map((l) => l.id));

const noState: ProgramState = { startDate: START, manual: {} };
const baseData = (over: Partial<ProgramData> = {}): ProgramData => ({
  lessons: {},
  examsPassed: {},
  trades: [],
  startingCapitalVnd: 200_000_000,
  reviewDue: 0,
  ...over,
});

function trade(i: number, over: Partial<ProgramTrade> = {}): ProgramTrade {
  return {
    openedAtMs: S + i * 3_600_000,
    closedAtMs: S + i * 3_600_000 + 1000 + i * DAY,
    hasStop: true,
    riskPct: 1,
    pnlVnd: 1_000_000,
    rMultiple: 0.5,
    hasJournal: true,
    checklistDone: true,
    ...over,
  };
}

test('program has 12 weeks in 3 phases and every lesson / exam id exists', () => {
  assert.equal(PROGRAM.length, PROGRAM_WEEKS);
  assert.deepEqual(PROGRAM.map((w) => w.phase), [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3]);
  const seen = new Set<string>();
  for (const w of PROGRAM) {
    assert.ok(w.lessonIds.length > 0);
    for (const id of w.lessonIds) {
      assert.ok(ids.has(id), `missing lesson ${id}`);
      assert.ok(!seen.has(id), `duplicate lesson ${id}`);
      seen.add(id);
    }
    const tid = new Set(w.tasks.map((t) => t.id));
    assert.equal(tid.size, w.tasks.length, `duplicate task id in week ${w.week}`);
    for (const t of w.tasks) if (t.kind === 'exam') assert.ok(t.examId === 'final' || levelIds.has(t.examId), t.examId);
  }
  assert.ok(ids.has('l5-who-profits'));
});

test('week calculation: day 0..6 = week 1, catch-up and clamping', () => {
  assert.equal(weekInfo(START, S).week, 1);
  assert.equal(weekInfo(START, S + 6.9 * DAY).week, 1);
  assert.equal(weekInfo(START, S + 7 * DAY).week, 2);
  assert.equal(weekInfo(START, S + 83 * DAY).week, 12);
  assert.equal(weekInfo(START, S + 83 * DAY).pastEnd, false);
  const after = weekInfo(START, S + 84 * DAY);
  assert.equal(after.week, 12);
  assert.equal(after.pastEnd, true);
  const future = weekInfo(START, S - 3 * DAY);
  assert.equal(future.week, 1);
  assert.equal(future.notYet, true);
});

test('state parse / serialize is safe', () => {
  assert.deepEqual(parseProgram(null), { startDate: null, manual: {} });
  assert.deepEqual(parseProgram('{bad'), { startDate: null, manual: {} });
  assert.equal(parseProgram(JSON.stringify({ startDate: '2026-02-31' })).startDate, null);
  const s: ProgramState = { startDate: START, manual: { 'w8.backtest': true } };
  assert.deepEqual(parseProgram(serializeProgram(s)), s);
  assert.deepEqual(parseProgram(JSON.stringify({ startDate: START, manual: { a: 'yes', b: true } })).manual, { b: true });
});

test('lesson and quiz tasks are auto-checked only from lesson data', () => {
  const w1 = PROGRAM[0];
  const lessons = Object.fromEntries(w1.lessonIds.map((id) => [id, { done: true, best: 70 }]));
  const data = baseData({ lessons });
  const m = computeMetrics(data, ids.size, []);
  const p = weekProgress(1, data, m, noState);
  const les = p.tasks.find((t) => t.spec.kind === 'lessons')!;
  const quiz = p.tasks.find((t) => t.spec.kind === 'quiz')!;
  assert.equal(les.status.auto, true);
  assert.equal(quiz.status.done, false, 'best 70 < 80');
  const data2 = baseData({ lessons: Object.fromEntries(w1.lessonIds.map((id) => [id, { done: true, best: 80 }])) });
  const q2 = taskStatus(quiz.spec, data2, computeMetrics(data2, ids.size, []), noState);
  assert.equal(q2.auto, true);
});

test('trade, journal and review tasks use only trades since the start date', () => {
  const before = trade(0, { closedAtMs: S - DAY });
  const mine = [trade(1), trade(2), trade(3, { hasStop: false, hasJournal: false })];
  const since = tradesSince([before, ...mine], S);
  assert.equal(since.length, 3);
  const data = baseData({ trades: [before, ...mine], lessons: { 'l1-commodity': { done: true } } });
  const m = computeMetrics(data, ids.size, since);
  assert.equal(m.trades, 3);
  assert.equal(m.tradesWithStop, 2);
  assert.equal(m.stopPct, 66.7);
  const w3 = weekProgress(3, data, m, noState);
  assert.equal(w3.tasks.find((t) => t.spec.kind === 'trades')!.status.auto, true);
  const w5 = weekProgress(5, data, m, noState);
  assert.equal(w5.tasks.find((t) => t.spec.kind === 'stopTrades')!.status.auto, false);
  const review = weekProgress(2, data, m, noState).tasks.find((t) => t.spec.kind === 'review')!;
  assert.equal(review.status.auto, true);
  const empty = computeMetrics(baseData(), ids.size, []);
  assert.equal(weekProgress(2, baseData(), empty, noState).tasks.find((t) => t.spec.kind === 'review')!.status.auto, false, 'empty queue with no study proves nothing');
  assert.equal(weekProgress(2, baseData({ reviewDue: 3, lessons: { a: { done: true } } }), computeMetrics(baseData({ lessons: { a: { done: true } } }), 9, []), noState).tasks.find((t) => t.spec.kind === 'review')!.status.done, false);
});

test('manual tasks are never auto-checked; ticking is labelled manual', () => {
  const m = computeMetrics(baseData(), ids.size, []);
  const spec = PROGRAM[7].tasks.find((t) => t.id === 'w8.backtest')!;
  const off = taskStatus(spec, baseData(), m, noState);
  assert.deepEqual([off.auto, off.manual, off.done], [false, false, false]);
  const on = taskStatus(spec, baseData(), m, { startDate: START, manual: { 'w8.backtest': true } });
  assert.deepEqual([on.auto, on.manual, on.done], [false, true, true]);
});

test('exam task follows exam results', () => {
  const spec = PROGRAM[11].tasks.find((t) => t.kind === 'exam')!;
  const m = computeMetrics(baseData(), ids.size, []);
  assert.equal(taskStatus(spec, baseData(), m, noState).auto, false);
  assert.equal(taskStatus(spec, baseData({ examsPassed: { final: true } }), m, noState).auto, true);
});

test('metrics: risk, expectancy over last 30, drawdown, win rate', () => {
  const ts = Array.from({ length: 40 }, (_, i) => trade(i, { rMultiple: i < 10 ? -1 : 1, pnlVnd: i < 10 ? -1_000_000 : 2_000_000, riskPct: i % 2 ? 1 : 2 }));
  const m = computeMetrics(baseData({ trades: ts }), ids.size, tradesSince(ts, S));
  assert.equal(m.trades, 40);
  assert.equal(m.expectancyCount, 30);
  assert.equal(m.expectancyR, 1);
  assert.equal(m.avgRiskPct, 1.5);
  assert.equal(m.winRatePct, 75);
  assert.ok(m.maxDrawdownPct !== null && Math.abs(m.maxDrawdownPct - 5) < 0.01, String(m.maxDrawdownPct));
  assert.equal(checkpoint('avgRisk', m, 5).state, 'met');
  assert.equal(checkpoint('expectancy', m, 8).state, 'met');
  assert.equal(checkpoint('winRate', m, 6).state, 'noData');
  const none = computeMetrics(baseData(), ids.size, []);
  assert.equal(checkpoint('drawdown', none, 7).state, 'noData');
});

test('discipline score mirrors the contest formula', () => {
  assert.equal(disciplineScore([], 0), null);
  const good = Array.from({ length: 5 }, (_, i) => ({ hasStop: true, riskPct: 1, createdAtMs: S + i * DAY, checklistDone: null }));
  assert.equal(disciplineScore(good, 3), 100);
  const noStops = good.map((o) => ({ ...o, hasStop: false, riskPct: null }));
  assert.equal(disciplineScore(noStops, 3), 45);
  assert.equal(disciplineScore(good, 20), 75);
});

test('readiness: passes only when every criterion is met', () => {
  const ts = Array.from({ length: 50 }, (_, i) => trade(i));
  const m = computeMetrics(baseData({ trades: ts }), ids.size, tradesSince(ts, S));
  const ok = evaluateReadiness(m, true);
  assert.equal(ok.passed, true);
  assert.deepEqual(ok.missing, []);
  const noExam = evaluateReadiness(m, false);
  assert.equal(noExam.passed, false);
  assert.deepEqual(noExam.missing, ['exam']);
  const few = computeMetrics(baseData({ trades: ts.slice(0, 20) }), ids.size, tradesSince(ts.slice(0, 20), S));
  const r = evaluateReadiness(few, true);
  assert.ok(r.missing.includes('trades') && r.missing.includes('expectancy'));
  const noStop = Array.from({ length: 50 }, (_, i) => trade(i, { hasStop: i % 10 === 0 ? false : true }));
  const m3 = computeMetrics(baseData({ trades: noStop }), ids.size, tradesSince(noStop, S));
  assert.ok(evaluateReadiness(m3, true).missing.includes('stopPct'));
  const losing = Array.from({ length: 50 }, (_, i) => trade(i, { rMultiple: -0.5, pnlVnd: -100_000 }));
  const m4 = computeMetrics(baseData({ trades: losing }), ids.size, tradesSince(losing, S));
  assert.ok(evaluateReadiness(m4, true).missing.includes('expectancy'));
  assert.equal(evaluateReadiness(computeMetrics(baseData(), ids.size, []), false).passed, false);
});
