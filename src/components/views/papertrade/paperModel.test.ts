import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_STATE,
  PAPER_LIMITS,
  applyOps,
  buildPositionCreate,
  buildSessionCreate,
  buildSessionUpdate,
  buildTradeCreate,
  deleteSessionOps,
  deserializeState,
  importOps,
  newSession,
  parsePositionDoc,
  parseSessionDoc,
  parseTradeDoc,
  resetSessionOps,
  sanitizeSettings,
  serializeState,
  validateCapital,
  validateSessionName,
  type PaperPosition,
  type PaperState,
  type PaperTrade,
} from './paperModel';

const F = { now: 'NOW', ts: (ms: number) => `T${ms}` };

const position: PaperPosition = {
  id: 'p1', sessionId: 's1', instrumentId: 'ZC', side: 'SHORT', contracts: 2, entryPrice: 450, stopLoss: 460, takeProfit: null,
  marginPerContractUsd: 2250, entryFeeVnd: 125000, entryFxRate: 25000, journal: 'x'.repeat(2000), researchNoteId: '', openedAtMs: 1000,
};
const trade: PaperTrade = {
  id: 't1', sessionId: 's1', instrumentId: 'ZC', side: 'SHORT', contracts: 2, entryPrice: 450, exitPrice: 440, stopLoss: 460, takeProfit: null,
  closeReason: 'TAKE_PROFIT', grossPnlUsd: 1000, feesVnd: 250000, pnlUsd: 990, pnlVnd: 24750000, rMultiple: 1, fxRate: 25000,
  journal: '', researchNoteId: 'note_1', openedAtMs: 1000, closedAtMs: 2000,
};

function state(): PaperState {
  const s = newSession('s1', ' Tập tháng 11 ', 300_000_000, 500);
  return { sessions: [s, newSession('s2', 'Khác', 100_000_000, 600)], positions: [position, { ...position, id: 'p2', sessionId: 's2' }], trades: [trade, { ...trade, id: 't2', sessionId: 's2' }] };
}

test('validation helpers', () => {
  assert.equal(validateCapital(200_000_000), null);
  assert.equal(validateCapital(PAPER_LIMITS.capitalMin - 1), 'capitalRange');
  assert.equal(validateCapital(PAPER_LIMITS.capitalMax + 1), 'capitalRange');
  assert.equal(validateCapital(NaN), 'capitalRange');
  assert.equal(validateSessionName('  '), 'nameRequired');
  assert.equal(validateSessionName('a'.repeat(81)), 'nameTooLong');
  assert.equal(validateSessionName('a'.repeat(80)), null);
});

test('sanitizeSettings clamps and fills defaults', () => {
  const s = sanitizeSettings({ marginPct: 500, feePerContractUsd: -3, slippageTicks: NaN });
  assert.equal(s.marginPct, 100);
  assert.equal(s.feePerContractUsd, 0);
  assert.equal(s.slippageTicks, 1);
  assert.equal(s.stopOutPct, 50);
});

test('newSession trims name and starts active at full balance', () => {
  const s = newSession('s', '  Tập  ', 5_000_000, 7);
  assert.equal(s.name, 'Tập');
  assert.equal(s.balanceVnd, 5_000_000);
  assert.equal(s.status, 'active');
  assert.equal(s.closedAtMs, null);
  assert.equal(s.finalEquityVnd, null);
});

test('payload builders only emit rule-allowed keys', () => {
  const s = state().sessions[0];
  const c = buildSessionCreate('u', s, F, false);
  assert.deepEqual(Object.keys(c).sort(), ['balanceVnd', 'closedAt', 'createdAt', 'finalEquityVnd', 'name', 'settings', 'startingCapitalVnd', 'status', 'updatedAt', 'userId']);
  assert.equal(c.createdAt, 'NOW');
  assert.equal(buildSessionCreate('u', s, F, true).createdAt, 'T500');
  const closed = { ...s, status: 'closed' as const, closedAtMs: 900, finalEquityVnd: 1 };
  assert.equal(buildSessionCreate('u', closed, F, true).closedAt, 'T900');
  assert.equal(buildSessionCreate('u', closed, F, false).closedAt, 'NOW');

  assert.deepEqual(buildSessionUpdate({ balanceVnd: 5 }, F), { updatedAt: 'NOW', balanceVnd: 5 });
  assert.deepEqual(buildSessionUpdate({ status: 'closed', closedAtMs: 1, finalEquityVnd: 9 }, F), { updatedAt: 'NOW', status: 'closed', closedAt: 'NOW', finalEquityVnd: 9 });
  assert.equal(buildSessionUpdate({ name: ' x ' }, F).name, 'x');

  const p = buildPositionCreate('u', position, F, false);
  assert.equal(p.journal.length, PAPER_LIMITS.journalMax);
  assert.equal(p.openedAt, 'NOW');
  assert.equal(Object.keys(p).length, 14);
  assert.equal(buildPositionCreate('u', position, F, true).openedAt, 'T1000');
  const t = buildTradeCreate('u', trade, F, false);
  assert.equal(t.openedAt, 'T1000');
  assert.equal(t.closedAt, 'NOW');
  assert.equal(Object.keys(t).length, 20);
  assert.equal(buildTradeCreate('u', trade, F, true).closedAt, 'T2000');
});

test('parsers are defensive', () => {
  const s = parseSessionDoc('a', { name: 5, status: 'weird', settings: { marginPct: 20 }, closedAt: { toMillis: () => 3 } });
  assert.equal(s.status, 'active');
  assert.equal(s.closedAtMs, null);
  assert.equal(s.settings.marginPct, 20);
  const c = parseSessionDoc('a', { status: 'closed', closedAt: { toMillis: () => 3 }, finalEquityVnd: 7 });
  assert.equal(c.closedAtMs, 3);
  assert.equal(c.finalEquityVnd, 7);
  const p = parsePositionDoc('a', { side: 'weird', stopLoss: null, openedAt: { toMillis: () => 5 } });
  assert.equal(p.side, 'LONG');
  assert.equal(p.stopLoss, null);
  assert.equal(p.openedAtMs, 5);
  const o = parseTradeDoc('b', { closeReason: 'nope', rMultiple: 1.5, closedAt: { toMillis: () => 9 } });
  assert.equal(o.closeReason, 'MANUAL');
  assert.equal(o.rMultiple, 1.5);
  assert.equal(o.closedAtMs, 9);
});

test('applyOps: create / update / delete', () => {
  let s = applyOps(EMPTY_STATE, importOps(state()));
  assert.equal(s.sessions.length, 2);
  assert.equal(s.positions.length, 2);
  assert.equal(s.trades.length, 2);
  s = applyOps(s, [{ t: 'sessionUpdate', id: 's1', patch: { balanceVnd: 1 } }, { t: 'positionUpdate', id: 'p1', patch: { stopLoss: null } }, { t: 'tradeUpdate', id: 't1', patch: { journal: 'j' } }]);
  assert.equal(s.sessions.find((x) => x.id === 's1')?.balanceVnd, 1);
  assert.equal(s.positions.find((x) => x.id === 'p1')?.stopLoss, null);
  assert.equal(s.trades.find((x) => x.id === 't1')?.journal, 'j');
  s = applyOps(s, [{ t: 'positionDelete', id: 'p1' }, { t: 'tradeDelete', id: 't1' }]);
  assert.deepEqual([s.positions.length, s.trades.length], [1, 1]);
  s = applyOps(s, [{ t: 'sessionDelete', id: 's2' }]);
  assert.deepEqual([s.sessions.length, s.positions.length, s.trades.length], [1, 0, 0]);
});

test('resetSessionOps / deleteSessionOps only touch that session', () => {
  const st = state();
  const reset = applyOps(st, resetSessionOps(st, 's1'));
  assert.equal(reset.sessions[0].balanceVnd, reset.sessions[0].startingCapitalVnd);
  assert.deepEqual(reset.positions.map((p) => p.id), ['p2']);
  assert.deepEqual(reset.trades.map((p) => p.id), ['t2']);
  assert.deepEqual(resetSessionOps(st, 'nope'), []);
  const ops = deleteSessionOps(st, 's1');
  assert.equal(ops[ops.length - 1].t, 'sessionDelete');
  assert.ok(!ops.some((o) => o.t === 'sessionUpdate'));
  const del = applyOps(st, ops);
  assert.deepEqual(del.sessions.map((x) => x.id), ['s2']);
});

test('importOps orders sessions before children', () => {
  const kinds = importOps(state()).map((o) => o.t);
  assert.deepEqual(kinds, ['sessionCreate', 'sessionCreate', 'positionCreate', 'positionCreate', 'tradeCreate', 'tradeCreate']);
});

test('local state round trip and corrupt input', () => {
  const back = deserializeState(serializeState(state()));
  assert.equal(back.sessions[0].startingCapitalVnd, 300_000_000);
  assert.equal(back.sessions[0].createdAtMs, 500);
  assert.equal(back.sessions[0].name, 'Tập tháng 11');
  assert.equal(back.positions[0].openedAtMs, 1000);
  assert.equal(back.trades[0].closedAtMs, 2000);
  assert.equal(back.trades[0].researchNoteId, 'note_1');
  assert.deepEqual(deserializeState(null), EMPTY_STATE);
  assert.deepEqual(deserializeState('{not json'), EMPTY_STATE);
});

import { closeOps, closeSessionOps, openOps } from './paperModel';

test('openOps / closeOps / closeSessionOps keep the balance consistent', () => {
  const st = state();
  const sess = st.sessions[0];
  const pos = { ...position, id: 'pNew', sessionId: 's1', journal: 'j', researchNoteId: 'n' };
  let s = applyOps(st, openOps(sess, pos));
  assert.equal(s.sessions[0].balanceVnd, sess.balanceVnd - pos.entryFeeVnd);
  assert.ok(s.positions.some((p) => p.id === 'pNew'));
  const calc = { grossPnlUsd: 100, feesVnd: 250000, pnlUsd: 90, pnlVnd: 2_250_000, rMultiple: 1 };
  const ops = closeOps(s.sessions[0], [{ position: pos, exitPrice: 440, calc, reason: 'STOP_LOSS' }], 777, 25000, 9999);
  s = applyOps(s, ops);
  assert.ok(!s.positions.some((p) => p.id === 'pNew'));
  const t = s.trades.find((x) => x.closeReason === 'STOP_LOSS');
  assert.equal(t?.journal, 'j');
  assert.equal(t?.researchNoteId, 'n');
  assert.equal(t?.closedAtMs, 9999);
  assert.equal(t?.openedAtMs, 1000);
  assert.equal(t?.fxRate, 25000);
  assert.equal(s.sessions[0].balanceVnd, 777);
  assert.deepEqual(closeOps(s.sessions[0], [], 1, 1, 1), []);
  const two = closeOps(s.sessions[0], [{ position: pos, exitPrice: 1, calc, reason: 'MANUAL' }, { position: { ...pos, id: 'q' }, exitPrice: 1, calc, reason: 'MANUAL' }], 1, 1, 5);
  const ids = two.filter((o) => o.t === 'tradeCreate').map((o) => (o as { trade: { id: string } }).trade.id);
  assert.equal(new Set(ids).size, 2);
  const closed = applyOps(s, closeSessionOps(s.sessions[0], 123));
  assert.equal(closed.sessions[0].status, 'closed');
  assert.equal(closed.sessions[0].finalEquityVnd, 777);
  assert.equal(closed.sessions[0].closedAtMs, 123);
});
