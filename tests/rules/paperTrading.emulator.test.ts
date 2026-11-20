/**
 * Firestore security-rules tests for paper trading practice sessions (`paperSessions`, `paperPositions`,
 * `paperOrders`, T58), against the real Firestore emulator. Every denial is paired with the matching
 * legitimate operation so a deny-everything rule set cannot pass.
 * Run with `npm run test:rules` (needs Java). Own demo project id to avoid clearFirestore() races.
 */
import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

const PROJECT_ID = 'demo-commodity-aipro-paper';
const serverTimestamp = () => firebase.firestore.FieldValue.serverTimestamp();
const tsAt = (ms: number) => firebase.firestore.Timestamp.fromMillis(ms);

let env: RulesTestEnvironment;

before(async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  assert.ok(host, 'FIRESTORE_EMULATOR_HOST is not set - run these tests with `npm run test:rules`.');
  const [hostname, port] = host.split(':');
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: hostname, port: Number(port), rules: readFileSync(path.resolve('firestore.rules'), 'utf8') },
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

function as(uid: string, verified = true) {
  return env.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: verified }).firestore();
}

const settings = { marginPct: 10, feePerContractUsd: 2.5, slippageTicks: 1, marginCallPct: 100, stopOutPct: 50 };

function session(userId = 'userA', over: Record<string, unknown> = {}) {
  return {
    userId,
    name: 'Tập tháng 11',
    startingCapitalVnd: 200_000_000,
    balanceVnd: 200_000_000,
    settings: { ...settings },
    status: 'active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    closedAt: null,
    finalEquityVnd: null,
    ...over,
  };
}

function position(userId = 'userA', over: Record<string, unknown> = {}) {
  return {
    userId,
    sessionId: 's1',
    instrumentId: 'CBOT:ZC',
    side: 'LONG',
    contracts: 2,
    entryPrice: 450.25,
    stopLoss: 445,
    takeProfit: null,
    marginPerContractUsd: 2250,
    entryFeeVnd: 125_000,
    entryFxRate: 25_000,
    journal: '',
    researchNoteId: '',
    openedAt: serverTimestamp(),
    ...over,
  };
}

function order(userId = 'userA', over: Record<string, unknown> = {}) {
  return {
    userId,
    sessionId: 's1',
    instrumentId: 'CBOT:ZC',
    side: 'LONG',
    contracts: 2,
    entryPrice: 450.25,
    exitPrice: 455,
    stopLoss: 445,
    takeProfit: null,
    closeReason: 'MANUAL',
    grossPnlUsd: 475,
    feesVnd: 250_000,
    pnlUsd: 465,
    pnlVnd: 11_625_000,
    rMultiple: 0.9,
    fxRate: 25_000,
    journal: 'Vào lệnh theo kế hoạch',
    researchNoteId: '',
    openedAt: tsAt(1_700_000_000_000),
    closedAt: serverTimestamp(),
    ...over,
  };
}

async function seed(p: string, data: Record<string, unknown>): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(p).set(data);
  });
}

/** Seed a session as it would look when stored (concrete timestamps). */
async function seedSession(id: string, userId = 'userA', over: Record<string, unknown> = {}) {
  await seed(`paperSessions/${id}`, session(userId, { createdAt: tsAt(1_700_000_000_000), updatedAt: tsAt(1_700_000_000_000), ...over }));
}

// --------------------------------------------------------------------------- sessions

test('owner can create several sessions, get, list, update (balance/settings/name) and delete', async () => {
  const db = as('userA');
  await assertSucceeds(db.doc('paperSessions/s1').set(session()));
  await assertSucceeds(db.doc('paperSessions/s2').set(session('userA', { name: 'Tập tháng 12', startingCapitalVnd: 500_000_000, balanceVnd: 500_000_000 })));
  await assertSucceeds(db.doc('paperSessions/s1').get());
  await assertSucceeds(db.collection('paperSessions').where('userId', '==', 'userA').get());
  await assertSucceeds(
    db.doc('paperSessions/s1').update({ balanceVnd: 190_000_000, settings: { ...settings, marginPct: 15 }, name: 'Đổi tên', updatedAt: serverTimestamp() })
  );
  await assertSucceeds(db.doc('paperSessions/s1').update({ balanceVnd: 200_000_000, startingCapitalVnd: 200_000_000, updatedAt: serverTimestamp() }));
  await assertSucceeds(db.doc('paperSessions/s1').delete());
});

test('session: closing sets closedAt/finalEquity; closed sessions are frozen except the name', async () => {
  const db = as('userA');
  await assertSucceeds(db.doc('paperSessions/s1').set(session()));
  await assertFails(db.doc('paperSessions/s1').update({ status: 'closed', updatedAt: serverTimestamp() }));
  await assertFails(db.doc('paperSessions/s1').update({ status: 'closed', closedAt: tsAt(5), finalEquityVnd: 1, updatedAt: serverTimestamp() }));
  await assertSucceeds(db.doc('paperSessions/s1').update({ status: 'closed', closedAt: serverTimestamp(), finalEquityVnd: 205_000_000, updatedAt: serverTimestamp() }));
  await assertFails(db.doc('paperSessions/s1').update({ balanceVnd: 1_000_000_000, updatedAt: serverTimestamp() }));
  await assertFails(db.doc('paperSessions/s1').update({ status: 'active', closedAt: null, finalEquityVnd: null, updatedAt: serverTimestamp() }));
  await assertFails(db.doc('paperSessions/s1').update({ finalEquityVnd: 9_000_000_000, updatedAt: serverTimestamp() }));
  await assertSucceeds(db.doc('paperSessions/s1').update({ name: 'Tháng 11 (xong)', updatedAt: serverTimestamp() }));
});

test('session: other users, unverified and anonymous are denied', async () => {
  await seedSession('s1');
  await assertSucceeds(as('userA').doc('paperSessions/s1').get());
  const b = as('userB');
  await assertFails(b.doc('paperSessions/s1').get());
  await assertFails(b.collection('paperSessions').where('userId', '==', 'userA').get());
  await assertFails(b.collection('paperSessions').get());
  await assertFails(b.doc('paperSessions/s1').update({ balanceVnd: 1_000_000_000, updatedAt: serverTimestamp() }));
  await assertFails(b.doc('paperSessions/s1').delete());
  await assertFails(b.doc('paperSessions/s9').set(session('userA')));
  await assertSucceeds(b.doc('paperSessions/s9').set(session('userB')));
  await assertFails(as('userA', false).doc('paperSessions/s1').get());
  await assertFails(as('userA', false).doc('paperSessions/s5').set(session('userA')));
  await assertFails(env.unauthenticatedContext().firestore().doc('paperSessions/s1').get());
  await assertFails(env.unauthenticatedContext().firestore().doc('paperSessions/s5').set(session('userA')));
});

test('session: invalid payloads and immutable fields are denied', async () => {
  const db = as('userA');
  await assertFails(db.doc('paperSessions/a1').set(session('userA', { startingCapitalVnd: 999_999 })));
  await assertFails(db.doc('paperSessions/a2').set(session('userA', { startingCapitalVnd: 2_000_000_000_000 })));
  await assertFails(db.doc('paperSessions/a3').set(session('userA', { startingCapitalVnd: '200' })));
  await assertFails(db.doc('paperSessions/a4').set(session('userA', { settings: { ...settings, marginPct: 101 } })));
  await assertFails(db.doc('paperSessions/a5').set(session('userA', { settings: { ...settings, extra: 1 } })));
  await assertFails(db.doc('paperSessions/a6').set(session('userA', { settings: { marginPct: 10 } })));
  await assertFails(db.doc('paperSessions/a7').set(session('userA', { extra: true })));
  await assertFails(db.doc('paperSessions/a8').set(session('userA', { name: '' })));
  await assertFails(db.doc('paperSessions/a9').set(session('userA', { name: 'n'.repeat(81) })));
  await assertFails(db.doc('paperSessions/b1').set(session('userA', { status: 'paused' })));
  await assertFails(db.doc('paperSessions/b2').set(session('userA', { status: 'closed' })));
  await assertFails(db.doc('paperSessions/b3').set(session('userA', { status: 'active', closedAt: tsAt(1), finalEquityVnd: 1 })));
  await assertFails(db.doc('paperSessions/b4').set(session('userA', { createdAt: tsAt(Date.now() + 86_400_000) })));
  await assertFails(db.doc('paperSessions/bad id').set(session('userA')));
  await assertSucceeds(db.doc('paperSessions/ok1').set(session('userA', { name: 'n'.repeat(80) })));
  // Importing a local session keeps its original creation date.
  await assertSucceeds(db.doc('paperSessions/ok2').set(session('userA', { createdAt: tsAt(1_700_000_000_000) })));
  await assertFails(db.doc('paperSessions/ok1').update({ userId: 'userB', updatedAt: serverTimestamp() }));
  await assertFails(db.doc('paperSessions/ok1').update({ balanceVnd: 5 }));
  await assertFails(db.doc('paperSessions/ok1').update({ createdAt: tsAt(9), updatedAt: serverTimestamp() }));
  await assertFails(db.doc('paperSessions/ok1').update({ extra: 1, updatedAt: serverTimestamp() }));
});

// --------------------------------------------------------------------------- positions

test('owner can open (in an active session), adjust stops/journal, list and delete a position', async () => {
  await seedSession('s1');
  const db = as('userA');
  await assertSucceeds(db.doc('paperPositions/p1').set(position()));
  await assertSucceeds(db.doc('paperPositions/p2').set(position('userA', { side: 'SHORT', stopLoss: null, takeProfit: 440 })));
  await assertSucceeds(db.doc('paperPositions/p1').get());
  await assertSucceeds(db.collection('paperPositions').where('userId', '==', 'userA').get());
  await assertSucceeds(db.doc('paperPositions/p1').update({ stopLoss: 447, takeProfit: 460, journal: 'dời stop', researchNoteId: 'note_1' }));
  await assertSucceeds(db.doc('paperPositions/p1').update({ stopLoss: null }));
  await assertSucceeds(db.doc('paperPositions/p1').delete());
});

test('position: a batch may create the session and its position together; open + balance update in one batch', async () => {
  const db = as('userA');
  const batch = db.batch();
  batch.set(db.doc('paperSessions/s1'), session());
  batch.set(db.doc('paperPositions/p1'), position());
  await assertSucceeds(batch.commit());
  const b2 = db.batch();
  b2.set(db.doc('paperPositions/p2'), position());
  b2.update(db.doc('paperSessions/s1'), { balanceVnd: 199_875_000, updatedAt: serverTimestamp() });
  await assertSucceeds(b2.commit());
});

test('position: must belong to an existing active session of the same owner', async () => {
  await seedSession('s1');
  await seedSession('closed1', 'userA', { status: 'closed', closedAt: tsAt(1_700_000_100_000), finalEquityVnd: 200_000_000 });
  await seedSession('sB', 'userB');
  const a = as('userA');
  await assertFails(a.doc('paperPositions/n1').set(position('userA', { sessionId: 'missing' })));
  await assertFails(a.doc('paperPositions/n2').set(position('userA', { sessionId: 'sB' })));
  await assertFails(a.doc('paperPositions/n3').set(position('userA', { sessionId: 'closed1' })));
  await assertFails(a.doc('paperPositions/n4').set(position('userA', { sessionId: 'bad id' })));
  await assertSucceeds(a.doc('paperPositions/n5').set(position('userA', { sessionId: 's1' })));
});

test('position: isolation and immutability', async () => {
  await seedSession('s1');
  await seed('paperPositions/p1', position('userA', { openedAt: tsAt(1_700_000_000_000) }));
  const b = as('userB');
  await assertFails(b.doc('paperPositions/p1').get());
  await assertFails(b.collection('paperPositions').where('userId', '==', 'userA').get());
  await assertFails(b.collection('paperPositions').get());
  await assertFails(b.doc('paperPositions/p1').update({ stopLoss: 1 }));
  await assertFails(b.doc('paperPositions/p1').delete());
  await assertFails(b.doc('paperPositions/p9').set(position('userA')));
  await assertFails(as('userA', false).doc('paperPositions/p1').get());
  await assertFails(env.unauthenticatedContext().firestore().doc('paperPositions/p1').get());
  const a = as('userA');
  await assertFails(a.doc('paperPositions/p1').update({ entryPrice: 1 }));
  await assertFails(a.doc('paperPositions/p1').update({ contracts: 100 }));
  await assertFails(a.doc('paperPositions/p1').update({ side: 'SHORT' }));
  await assertFails(a.doc('paperPositions/p1').update({ userId: 'userB' }));
  await assertFails(a.doc('paperPositions/p1').update({ sessionId: 's2' }));
  await assertFails(a.doc('paperPositions/p1').update({ openedAt: serverTimestamp() }));
  await assertFails(a.doc('paperPositions/p1').update({ stopLoss: -4 }));
  await assertFails(a.doc('paperPositions/p1').update({ journal: 'j'.repeat(1001) }));
  await assertSucceeds(a.doc('paperPositions/p1').update({ journal: 'j'.repeat(1000) }));
});

test('position: invalid create payloads are denied', async () => {
  await seedSession('s1');
  const db = as('userA');
  await assertFails(db.doc('paperPositions/x1').set(position('userA', { contracts: 0 })));
  await assertFails(db.doc('paperPositions/x2').set(position('userA', { contracts: 1001 })));
  await assertFails(db.doc('paperPositions/x3').set(position('userA', { contracts: 1.5 })));
  await assertFails(db.doc('paperPositions/x4').set(position('userA', { side: 'BUY' })));
  await assertFails(db.doc('paperPositions/x5').set(position('userA', { entryPrice: 0 })));
  await assertFails(db.doc('paperPositions/x6').set(position('userA', { entryFxRate: 0 })));
  await assertFails(db.doc('paperPositions/x7').set(position('userA', { instrumentId: '' })));
  await assertFails(db.doc('paperPositions/x8').set(position('userA', { openedAt: tsAt(Date.now() + 86_400_000) })));
  await assertFails(db.doc('paperPositions/x9').set(position('userA', { extra: 1 })));
  await assertFails(db.doc('paperPositions/bad id').set(position('userA')));
  await assertSucceeds(db.doc('paperPositions/ok1').set(position('userA')));
});

// --------------------------------------------------------------------------- orders (closed trades)

test('owner can record a closed trade, annotate it and delete it', async () => {
  await seedSession('s1');
  const db = as('userA');
  await assertSucceeds(db.doc('paperOrders/o1').set(order()));
  await assertSucceeds(db.doc('paperOrders/o2').set(order('userA', { rMultiple: null, stopLoss: null, closeReason: 'STOP_OUT', pnlVnd: -50_000_000, pnlUsd: -2000 })));
  await assertSucceeds(db.doc('paperOrders/o1').get());
  await assertSucceeds(db.collection('paperOrders').where('userId', '==', 'userA').get());
  await assertSucceeds(db.doc('paperOrders/o1').update({ journal: 'Bài học: đừng vào lệnh trước WASDE', researchNoteId: 'note_1' }));
  await assertSucceeds(db.doc('paperOrders/o1').delete());
});

test('order: close-position batch (trade + position delete + session balance) and session close', async () => {
  await seedSession('s1');
  await seed('paperPositions/p1', position('userA', { openedAt: tsAt(1_700_000_000_000) }));
  const db = as('userA');
  const b = db.batch();
  b.set(db.doc('paperOrders/o1'), order());
  b.delete(db.doc('paperPositions/p1'));
  b.update(db.doc('paperSessions/s1'), { balanceVnd: 211_875_000, updatedAt: serverTimestamp() });
  await assertSucceeds(b.commit());
  await assertSucceeds(db.doc('paperSessions/s1').update({ status: 'closed', closedAt: serverTimestamp(), finalEquityVnd: 211_875_000, updatedAt: serverTimestamp() }));
  // Closed session: trades can still be annotated, but no new position can be opened.
  await assertSucceeds(db.doc('paperOrders/o1').update({ journal: 'review' }));
  await assertFails(db.doc('paperPositions/late').set(position()));
});

test('order: must belong to a session of the same owner', async () => {
  await seedSession('s1');
  await seedSession('sB', 'userB');
  const a = as('userA');
  await assertFails(a.doc('paperOrders/m1').set(order('userA', { sessionId: 'missing' })));
  await assertFails(a.doc('paperOrders/m2').set(order('userA', { sessionId: 'sB' })));
  await assertSucceeds(a.doc('paperOrders/m3').set(order('userA', { sessionId: 's1' })));
});

test('order: write-once result, isolation, validation', async () => {
  await seedSession('s1');
  await seed('paperOrders/o1', order('userA', { closedAt: tsAt(1_700_000_100_000) }));
  const b = as('userB');
  await assertFails(b.doc('paperOrders/o1').get());
  await assertFails(b.collection('paperOrders').where('userId', '==', 'userA').get());
  await assertFails(b.doc('paperOrders/o1').update({ journal: 'x' }));
  await assertFails(b.doc('paperOrders/o1').delete());
  await assertFails(as('userA', false).doc('paperOrders/o1').get());
  const a = as('userA');
  await assertFails(a.doc('paperOrders/o1').update({ pnlVnd: 999_000_000 }));
  await assertFails(a.doc('paperOrders/o1').update({ exitPrice: 500 }));
  await assertFails(a.doc('paperOrders/o1').update({ closeReason: 'TAKE_PROFIT' }));
  await assertFails(a.doc('paperOrders/o1').update({ sessionId: 'other' }));
  await assertSucceeds(a.doc('paperOrders/o1').update({ journal: 'ok' }));
  await assertFails(a.doc('paperOrders/n1').set(order('userA', { closeReason: 'WHATEVER' })));
  await assertFails(a.doc('paperOrders/n2').set(order('userA', { closedAt: tsAt(Date.now() + 86_400_000) })));
  await assertFails(a.doc('paperOrders/n2b').set(order('userA', { closedAt: tsAt(1_600_000_000_000) })));
  await assertFails(a.doc('paperOrders/n3').set(order('userA', { exitPrice: 0 })));
  await assertFails(a.doc('paperOrders/n4').set(order('userA', { feesVnd: -1 })));
  await assertFails(a.doc('paperOrders/n5').set(order('userA', { pnlVnd: 'lots' })));
  await assertFails(a.doc('paperOrders/n6').set(order('userA', { extra: 1 })));
  await assertFails(a.doc('paperOrders/n7').set(order('userB')));
  await assertSucceeds(a.doc('paperOrders/n8').set(order('userA')));
});
