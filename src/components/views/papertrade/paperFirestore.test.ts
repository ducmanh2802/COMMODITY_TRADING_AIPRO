import test from 'node:test';
import assert from 'node:assert/strict';
import type { WriteBatch } from 'firebase/firestore';
import { BATCH_MAX, COL, addOpToBatch, cachedLoader, type PaperFs } from './paperFirestore';
import {
  buildPositionCreate,
  buildSessionCreate,
  buildSessionUpdate,
  buildTradeCreate,
  newSession,
  type PaperOp,
  type PaperPosition,
  type PaperTrade,
} from './paperModel';

const F = { now: 'NOW', ts: (ms: number) => `T${ms}` };
const fakeFs = {
  db: 'DB',
  doc: (db: unknown, col: string, id: string) => `${String(db)}/${col}/${id}`,
  serverTimestamp: () => 'NOW',
  Timestamp: { fromMillis: (ms: number) => `T${ms}` },
} as unknown as PaperFs;

type Call = [string, unknown, unknown?];
function fakeBatch() {
  const calls: Call[] = [];
  const batch = {
    set: (ref: unknown, data: unknown) => calls.push(['set', ref, data]),
    update: (ref: unknown, data: unknown) => calls.push(['update', ref, data]),
    delete: (ref: unknown) => calls.push(['delete', ref]),
  } as unknown as WriteBatch;
  return { batch, calls };
}

const position: PaperPosition = {
  id: 'p1', sessionId: 's1', instrumentId: 'ZC', side: 'SHORT', contracts: 2, entryPrice: 450, stopLoss: 460, takeProfit: null,
  marginPerContractUsd: 2250, entryFeeVnd: 125000, entryFxRate: 25000, journal: 'j', researchNoteId: '', openedAtMs: 1000,
};
const trade: PaperTrade = {
  id: 't1', sessionId: 's1', instrumentId: 'ZC', side: 'SHORT', contracts: 2, entryPrice: 450, exitPrice: 440, stopLoss: 460, takeProfit: null,
  closeReason: 'TAKE_PROFIT', grossPnlUsd: 1000, feesVnd: 250000, pnlUsd: 990, pnlVnd: 24750000, rMultiple: 1, fxRate: 25000,
  journal: '', researchNoteId: 'note_1', openedAtMs: 1000, closedAtMs: 2000,
};

test('collection names and batch size stay rules-compatible', () => {
  assert.deepEqual(COL, { sessions: 'paperSessions', positions: 'paperPositions', trades: 'paperOrders' });
  assert.equal(BATCH_MAX, 400);
});

test('addOpToBatch maps every op to the same Firestore write as the model builders', () => {
  const session = newSession('s1', 'Tập', 300_000_000, 500);
  const ops: PaperOp[] = [
    { t: 'sessionCreate', session },
    { t: 'sessionUpdate', id: 's1', patch: { balanceVnd: 1 } },
    { t: 'sessionDelete', id: 's1' },
    { t: 'positionCreate', position },
    { t: 'positionUpdate', id: 'p1', patch: { stopLoss: 455 } },
    { t: 'positionDelete', id: 'p1' },
    { t: 'tradeCreate', trade },
    { t: 'tradeUpdate', id: 't1', patch: { journal: 'note' } },
    { t: 'tradeDelete', id: 't1' },
  ];
  for (const preserve of [false, true]) {
    const { batch, calls } = fakeBatch();
    for (const op of ops) addOpToBatch(fakeFs, batch, 'u1', op, preserve);
    assert.deepEqual(calls, [
      ['set', 'DB/paperSessions/s1', buildSessionCreate('u1', session, F, preserve)],
      ['update', 'DB/paperSessions/s1', buildSessionUpdate({ balanceVnd: 1 }, F)],
      ['delete', 'DB/paperSessions/s1'],
      ['set', 'DB/paperPositions/p1', buildPositionCreate('u1', position, F, preserve)],
      ['update', 'DB/paperPositions/p1', { stopLoss: 455 }],
      ['delete', 'DB/paperPositions/p1'],
      ['set', 'DB/paperOrders/t1', buildTradeCreate('u1', trade, F, preserve)],
      ['update', 'DB/paperOrders/t1', { journal: 'note' }],
      ['delete', 'DB/paperOrders/t1'],
    ]);
  }
});

test('cachedLoader: one load shared by concurrent callers, resolved in call order', async () => {
  let loads = 0;
  const load = cachedLoader(async () => {
    loads += 1;
    return 'fs';
  });
  const order: number[] = [];
  await Promise.all([1, 2, 3].map((n) => load().then(() => order.push(n))));
  assert.equal(await load(), 'fs');
  assert.equal(loads, 1);
  assert.deepEqual(order, [1, 2, 3]);
});

test('cachedLoader: a failed load is surfaced and retried on the next call', async () => {
  let loads = 0;
  const load = cachedLoader(async () => {
    loads += 1;
    if (loads === 1) throw new Error('chunk failed');
    return 'fs';
  });
  await assert.rejects(load(), /chunk failed/);
  assert.equal(await load(), 'fs');
  assert.equal(await load(), 'fs');
  assert.equal(loads, 2);
});
