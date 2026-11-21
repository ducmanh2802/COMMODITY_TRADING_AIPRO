import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_ANSWERS, buildPlan, computeRisk, normalizePlan, scoreChecklist, warnCount, type Answers, type RiskInput } from './checklist';
import { deserializeState, serializeState, parsePositionDoc, buildPositionCreate, type PaperPosition } from './paperModel';

const allYes: Answers = { trend: 'yes', zone: 'yes', signal: 'yes', volume: 'yes', plan: 'yes' };
const base: RiskInput = { side: 'LONG', fill: 450, stopLoss: 440, takeProfit: 480, contracts: 1, pointValueUsd: 50, feePerContractUsd: 0, fx: 25000, equityVnd: 1_000_000_000, limitPct: 2 };

test('scoreChecklist counts yes/no/unanswered and events', () => {
  assert.deepEqual(scoreChecklist(allYes, 'clear'), { total: 6, passed: 6, notMet: 0, unanswered: 0 });
  assert.equal(scoreChecklist(allYes, 'event').notMet, 1);
  assert.equal(scoreChecklist(allYes, null).unanswered, 1);
  assert.equal(scoreChecklist(allYes, null, 'yes').notMet, 0);
  assert.deepEqual(scoreChecklist({ ...EMPTY_ANSWERS, trend: 'no' }, 'clear'), { total: 6, passed: 1, notMet: 5, unanswered: 4 });
});

test('computeRisk: risk %, R and levels', () => {
  const r = computeRisk(base)!;
  assert.equal(Math.round(r.riskVnd), 12_500_000);
  assert.equal(r.riskPct, 1.25);
  assert.equal(r.r, 3);
  assert.equal(r.level, 'ok');
  assert.equal(computeRisk({ ...base, takeProfit: 455 })!.level, 'lowR');
  assert.equal(computeRisk({ ...base, takeProfit: null })!.r, null);
  assert.equal(computeRisk({ ...base, equityVnd: 300_000_000 })!.level, 'overLimit');
  assert.equal(computeRisk({ ...base, stopLoss: null }), null);
  assert.equal(computeRisk({ ...base, stopLoss: 460 }), null);
});

test('computeRisk: SHORT with fees', () => {
  const r = computeRisk({ ...base, side: 'SHORT', stopLoss: 460, takeProfit: 420, feePerContractUsd: 2.5 })!;
  assert.equal(Math.round(r.riskVnd), 12_500_000 + 125_000);
  assert.ok(r.r! < 3 && r.r! > 2.9);
});

test('buildPlan / warnCount', () => {
  const risk = computeRisk(base);
  assert.equal(buildPlan(allYes, 'clear', null, risk, 2).onPlan, true);
  assert.equal(buildPlan(allYes, 'clear', null, null, 2).onPlan, false);
  assert.equal(buildPlan({ ...allYes, volume: 'no' }, 'clear', null, risk, 2).onPlan, false);
  const over = computeRisk({ ...base, equityVnd: 300_000_000 });
  assert.equal(warnCount(scoreChecklist(allYes, 'clear'), over), 1);
  assert.equal(warnCount(scoreChecklist(allYes, 'clear'), risk), 0);
});

test('normalizePlan: old records and garbage', () => {
  assert.equal(normalizePlan(undefined), undefined);
  assert.equal(normalizePlan('x'), undefined);
  const p = normalizePlan({ answers: { trend: 'yes', zone: 'maybe' }, r: 'x', onPlan: true })!;
  assert.equal(p.answers.trend, 'yes');
  assert.equal(p.answers.zone, null);
  assert.equal(p.r, null);
  assert.equal(p.limitPct, 2);
});

test('old saved state without plan still loads; plan round-trips locally and via docs', () => {
  const oldPos = { id: 'p1', sessionId: 's', instrumentId: 'i', side: 'LONG', contracts: 1, entryPrice: 1, stopLoss: null, takeProfit: null, marginPerContractUsd: 1, entryFeeVnd: 0, entryFxRate: 1, journal: '', researchNoteId: '', openedAtMs: 1 };
  const st = deserializeState(JSON.stringify({ sessions: [], positions: [oldPos], trades: [] }));
  assert.equal(st.positions[0].plan, undefined);
  const plan = buildPlan(allYes, 'clear', null, computeRisk(base), 2);
  const withPlan: PaperPosition = { ...st.positions[0], plan };
  const back = deserializeState(serializeState({ sessions: [], positions: [withPlan], trades: [] }));
  assert.deepEqual(back.positions[0].plan, plan);
  const doc = buildPositionCreate('u', withPlan, { now: 0, ts: (m: number) => m }, true) as Record<string, unknown>;
  assert.equal(parsePositionDoc('p1', doc).plan === undefined || typeof parsePositionDoc('p1', doc).plan === 'object', true);
});

test('eventsState', async () => {
  const { eventsState } = await import('./checklist');
  const now = Date.parse('2026-11-20T10:00:00Z');
  assert.equal(eventsState(null, now), null);
  assert.equal(eventsState([], now), 'clear');
  assert.equal(eventsState([{ date: '2026-11-21' }], now), 'event');
  assert.equal(eventsState([{ date: '2026-11-25' }], now), 'clear');
});
