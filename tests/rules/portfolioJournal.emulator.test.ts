/**
 * Firestore security-rules tests for `positions`, `tradeJournal`, `users`, `userSettings`, `auditLogs`
 * and extra `paperOrders` mistake-tag edge cases, against the real Firestore emulator.
 * Every denial is paired with the matching legitimate operation so a deny-everything rule set cannot pass.
 * Run with `npm run test:rules` (needs Java). Own demo project id to avoid clearFirestore() races.
 */
import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

const PROJECT_ID = 'demo-commodity-aipro-portfolio';
const serverTimestamp = () => firebase.firestore.FieldValue.serverTimestamp();
const tsAt = (ms: number) => firebase.firestore.Timestamp.fromMillis(ms);
const T0 = 1_700_000_000_000;

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
const anon = () => env.unauthenticatedContext().firestore();

async function seed(p: string, data: Record<string, unknown>): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(p).set(data);
  });
}

function pos(userId = 'userA', over: Record<string, unknown> = {}) {
  return {
    userId,
    instrumentId: 'CBOT:ZC',
    productName: 'Corn',
    category: 'AGRICULTURE',
    exchange: 'CBOT',
    direction: 'LONG',
    contracts: 1,
    entryPrice: 450,
    stopLoss: 440,
    takeProfit: 470,
    estimatedMargin: 1000,
    marginVerified: false,
    status: 'OPEN',
    notes: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...over,
  };
}
const posSeed = (userId = 'userA', over: Record<string, unknown> = {}) =>
  pos(userId, { createdAt: tsAt(T0), updatedAt: tsAt(T0), ...over });

function entry(userId = 'userA', over: Record<string, unknown> = {}) {
  return {
    userId,
    instrument: 'ZC',
    exchange: 'CBOT',
    direction: 'LONG',
    strategy: 'Breakout',
    timeframe: 'D1',
    entryPrice: 450,
    stopLoss: 440,
    takeProfit: 470,
    positionSize: 1,
    entryTimestamp: '2026-01-01T00:00:00Z',
    exitTimestamp: '',
    exitPrice: 0,
    realizedPnl: 0,
    tradingCosts: 0,
    resultInR: 0,
    rationale: 'why',
    notes: '',
    status: 'OPEN',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...over,
  };
}
const entrySeed = (userId = 'userA', over: Record<string, unknown> = {}) =>
  entry(userId, { createdAt: tsAt(T0), updatedAt: tsAt(T0), ...over });

// --------------------------------------------------------------------------- positions

test('positions: owner can create, get, list, update stops/notes, close and delete', async () => {
  const a = as('userA');
  await assertSucceeds(a.doc('positions/p1').set(pos()));
  await assertSucceeds(a.doc('positions/p1').get());
  await assertSucceeds(a.collection('positions').where('userId', '==', 'userA').get());
  await assertSucceeds(a.doc('positions/p1').update({ stopLoss: 445, takeProfit: 480, notes: 'n', updatedAt: serverTimestamp() }));
  await assertSucceeds(a.doc('positions/p1').update({ status: 'CLOSED', notes: 'done', updatedAt: serverTimestamp() }));
  await assertSucceeds(a.doc('positions/p1').delete());
});

test('positions: anonymous, unverified and other users are denied', async () => {
  await seed('positions/p1', posSeed());
  const b = as('userB');
  await assertFails(anon().doc('positions/p1').get());
  await assertFails(anon().doc('positions/n1').set(pos()));
  await assertFails(as('userA', false).doc('positions/p1').get());
  await assertFails(as('userA', false).doc('positions/n1').set(pos()));
  await assertFails(b.doc('positions/p1').get());
  await assertFails(b.collection('positions').where('userId', '==', 'userA').get());
  await assertFails(b.collection('positions').get());
  await assertFails(b.doc('positions/p1').update({ notes: 'x', updatedAt: serverTimestamp() }));
  await assertFails(b.doc('positions/p1').delete());
  await assertFails(b.doc('positions/n2').set(pos('userA')));
  await assertSucceeds(as('userA').doc('positions/p1').get());
});

test('positions: validation, immutable fields and terminal CLOSED state', async () => {
  await seed('positions/p1', posSeed());
  const a = as('userA');
  await assertFails(a.doc('positions/n1').set(pos('userA', { extra: 1 })));
  await assertFails(a.doc('positions/n2').set(pos('userA', { notes: 'x'.repeat(501) })));
  await assertFails(a.doc('positions/n3').set(pos('userA', { contracts: 0 })));
  await assertFails(a.doc('positions/n4').set(pos('userA', { contracts: 1.5 })));
  await assertFails(a.doc('positions/n5').set(pos('userA', { entryPrice: '450' })));
  await assertFails(a.doc('positions/n6').set(pos('userA', { direction: 'UP' })));
  await assertFails(a.doc('positions/n7').set(pos('userA', { status: 'CLOSED' })));
  await assertFails(a.doc('positions/n8').set(pos('userA', { productName: 'x'.repeat(81) })));
  await assertFails(a.doc('positions/n9').set(pos('userA', { createdAt: tsAt(T0) })));
  await assertFails(a.doc('positions/bad$id').set(pos()));
  await assertSucceeds(a.doc('positions/n10').set(pos()));
  await assertFails(a.doc('positions/p1').update({ userId: 'userB', updatedAt: serverTimestamp() }));
  await assertFails(a.doc('positions/p1').update({ createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  await assertFails(a.doc('positions/p1').update({ contracts: 5, updatedAt: serverTimestamp() }));
  await assertFails(a.doc('positions/p1').update({ notes: 'x', role: 'admin', updatedAt: serverTimestamp() }));
  await assertSucceeds(a.doc('positions/p1').update({ notes: 'ok', updatedAt: serverTimestamp() }));
  await assertSucceeds(a.doc('positions/p1').update({ status: 'CLOSED', updatedAt: serverTimestamp() }));
  await assertFails(a.doc('positions/p1').update({ notes: 'reopen', updatedAt: serverTimestamp() }));
});

// --------------------------------------------------------------------------- tradeJournal

test('tradeJournal: owner can create, get, list, update notes, close and delete', async () => {
  const a = as('userA');
  await assertSucceeds(a.doc('tradeJournal/e1').set(entry()));
  await assertSucceeds(a.doc('tradeJournal/e1').get());
  await assertSucceeds(a.collection('tradeJournal').where('userId', '==', 'userA').get());
  await assertSucceeds(a.doc('tradeJournal/e1').update({ notes: 'n', rationale: 'r2', stopLoss: 442, updatedAt: serverTimestamp() }));
  await assertSucceeds(
    a.doc('tradeJournal/e1').update({
      status: 'CLOSED',
      exitTimestamp: '2026-01-02T00:00:00Z',
      exitPrice: 460,
      realizedPnl: 500,
      tradingCosts: 5,
      resultInR: 1,
      updatedAt: serverTimestamp(),
    })
  );
  await assertFails(a.doc('tradeJournal/e1').update({ notes: 'after close', updatedAt: serverTimestamp() }));
  await assertSucceeds(a.doc('tradeJournal/e1').delete());
});

test('tradeJournal: anonymous, unverified and other users are denied', async () => {
  await seed('tradeJournal/e1', entrySeed());
  const b = as('userB');
  await assertFails(anon().doc('tradeJournal/e1').get());
  await assertFails(anon().doc('tradeJournal/n1').set(entry()));
  await assertFails(as('userA', false).doc('tradeJournal/e1').get());
  await assertFails(as('userA', false).doc('tradeJournal/n1').set(entry()));
  await assertFails(b.doc('tradeJournal/e1').get());
  await assertFails(b.collection('tradeJournal').where('userId', '==', 'userA').get());
  await assertFails(b.collection('tradeJournal').get());
  await assertFails(b.doc('tradeJournal/e1').update({ notes: 'x', updatedAt: serverTimestamp() }));
  await assertFails(b.doc('tradeJournal/e1').delete());
  await assertFails(b.doc('tradeJournal/n2').set(entry('userA')));
  await assertSucceeds(as('userA').doc('tradeJournal/e1').get());
});

test('tradeJournal: validation and immutable fields', async () => {
  await seed('tradeJournal/e1', entrySeed());
  const a = as('userA');
  await assertFails(a.doc('tradeJournal/n1').set(entry('userA', { extra: 1 })));
  await assertFails(a.doc('tradeJournal/n2').set(entry('userA', { notes: 'x'.repeat(1001) })));
  await assertFails(a.doc('tradeJournal/n3').set(entry('userA', { rationale: 'x'.repeat(1001) })));
  await assertFails(a.doc('tradeJournal/n4').set(entry('userA', { strategy: '' })));
  await assertFails(a.doc('tradeJournal/n5').set(entry('userA', { positionSize: 1.5 })));
  await assertFails(a.doc('tradeJournal/n6').set(entry('userA', { timeframe: 'M2' })));
  await assertFails(a.doc('tradeJournal/n7').set(entry('userA', { entryPrice: 'x' })));
  await assertFails(a.doc('tradeJournal/n8').set(entry('userA', { createdAt: tsAt(T0) })));
  await assertFails(a.doc('tradeJournal/bad$id').set(entry()));
  await assertSucceeds(a.doc('tradeJournal/n9').set(entry()));
  await assertFails(a.doc('tradeJournal/e1').update({ userId: 'userB', updatedAt: serverTimestamp() }));
  await assertFails(a.doc('tradeJournal/e1').update({ createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  await assertFails(a.doc('tradeJournal/e1').update({ entryPrice: 1, updatedAt: serverTimestamp() }));
  await assertFails(a.doc('tradeJournal/e1').update({ notes: 'x', role: 'admin', updatedAt: serverTimestamp() }));
  await assertSucceeds(a.doc('tradeJournal/e1').update({ notes: 'ok', updatedAt: serverTimestamp() }));
});

// --------------------------------------------------------------------------- users / userSettings / auditLogs extras

function profile(uid = 'userA', over: Record<string, unknown> = {}) {
  return { uid, email: `${uid}@example.com`, displayName: 'Trader', createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...over };
}

test('users: owner create/get/update displayName; uid and createdAt immutable; no delete; anonymous denied', async () => {
  const a = as('userA');
  await assertSucceeds(a.doc('users/userA').set(profile()));
  await assertSucceeds(a.doc('users/userA').get());
  await assertSucceeds(a.doc('users/userA').update({ displayName: 'New', updatedAt: serverTimestamp() }));
  await assertFails(a.doc('users/userA').update({ uid: 'userB', updatedAt: serverTimestamp() }));
  await assertFails(a.doc('users/userA').update({ createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  await assertFails(a.doc('users/userA').update({ displayName: 'x'.repeat(121), updatedAt: serverTimestamp() }));
  await assertFails(a.doc('users/userA').update({ displayName: 5, updatedAt: serverTimestamp() }));
  await assertFails(a.doc('users/userA').update({ displayName: 'N', isAdmin: true, updatedAt: serverTimestamp() }));
  await assertFails(a.doc('users/userA').delete());
  await assertFails(anon().doc('users/userA').get());
  await assertFails(as('userB').doc('users/userA').update({ displayName: 'x', updatedAt: serverTimestamp() }));
  await assertFails(as('userB').doc('users/userA').delete());
  await assertFails(as('userB').doc('users/userB').set(profile('userA')));
  await assertFails(a.doc('users/userC').set(profile('userA')));
});

function settingsDoc(userId = 'userA') {
  return {
    userId,
    accountEquity: 10_000,
    accountCurrency: 'USD',
    riskPercentagePerTrade: 1,
    dailyLossLimitPct: 3,
    maxOpenPositions: 5,
    maxPortfolioRiskPct: 6,
    maxContractsPerInstrument: 10,
    defaultTradingStyle: 'SWING',
    defaultTimeframe: 'D1',
    displayTimezone: 'Asia/Ho_Chi_Minh',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

test('userSettings: owner CRUD limits, createdAt immutable, no delete, others/anonymous/unverified denied', async () => {
  const a = as('userA');
  await assertSucceeds(a.doc('userSettings/userA').set(settingsDoc()));
  await assertSucceeds(a.doc('userSettings/userA').get());
  await assertFails(a.collection('userSettings').get());
  await assertFails(a.doc('userSettings/userA').update({ createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  await assertFails(a.doc('userSettings/userA').update({ accountCurrency: 'EUR', updatedAt: serverTimestamp() }));
  await assertFails(a.doc('userSettings/userA').update({ displayTimezone: 'x'.repeat(40), updatedAt: serverTimestamp() }));
  await assertFails(a.doc('userSettings/userA').delete());
  await assertFails(anon().doc('userSettings/userA').get());
  await assertFails(as('userA', false).doc('userSettings/userA').get());
  await assertFails(as('userA', false).doc('userSettings/userA').update({ displayTimezone: 'UTC', updatedAt: serverTimestamp() }));
  const b = as('userB');
  await assertFails(b.doc('userSettings/userA').get());
  await assertFails(b.doc('userSettings/userA').update({ displayTimezone: 'UTC', updatedAt: serverTimestamp() }));
  await assertFails(b.doc('userSettings/userA').delete());
});

test('auditLogs: owner create/get/list; other, anonymous, unverified, extra fields, oversize denied', async () => {
  const log = (userId = 'userA', over: Record<string, unknown> = {}) => ({
    userId,
    action: 'X',
    resource: 'userSettings/userA',
    createdAt: serverTimestamp(),
    ...over,
  });
  const a = as('userA');
  await assertSucceeds(a.doc('auditLogs/l1').set(log()));
  await assertSucceeds(a.doc('auditLogs/l1').get());
  await assertSucceeds(a.collection('auditLogs').where('userId', '==', 'userA').get());
  await assertFails(a.collection('auditLogs').get());
  await assertFails(a.doc('auditLogs/l2').set(log('userB')));
  await assertFails(a.doc('auditLogs/l3').set(log('userA', { extra: 1 })));
  await assertFails(a.doc('auditLogs/l4').set(log('userA', { action: 'x'.repeat(81) })));
  await assertFails(a.doc('auditLogs/l5').set(log('userA', { resource: 5 })));
  await assertFails(a.doc('auditLogs/l6').set(log('userA', { createdAt: tsAt(T0) })));
  await assertFails(anon().doc('auditLogs/l7').set(log()));
  await assertFails(as('userA', false).doc('auditLogs/l8').set(log()));
  await assertFails(anon().doc('auditLogs/l1').get());
  await assertFails(as('userB').doc('auditLogs/l1').get());
  await assertFails(as('userB').collection('auditLogs').where('userId', '==', 'userA').get());
});

// --------------------------------------------------------------------------- paperOrders mistake tags: extra edge cases

test('paperOrders: mistakeTags/mistakeNote boundary and type validation on create and update', async () => {
  await seed('paperSessions/s1', {
    userId: 'userA',
    name: 'S',
    startingCapitalVnd: 200_000_000,
    balanceVnd: 200_000_000,
    settings: { marginPct: 10, feePerContractUsd: 2.5, slippageTicks: 1, marginCallPct: 100, stopOutPct: 50 },
    status: 'active',
    createdAt: tsAt(T0),
    updatedAt: tsAt(T0),
    closedAt: null,
    finalEquityVnd: null,
  });
  const base = (over: Record<string, unknown> = {}) => ({
    userId: 'userA',
    sessionId: 's1',
    instrumentId: 'CBOT:ZC',
    side: 'LONG',
    contracts: 1,
    entryPrice: 450,
    exitPrice: 455,
    stopLoss: 445,
    takeProfit: null,
    closeReason: 'MANUAL',
    grossPnlUsd: 1,
    feesVnd: 1,
    pnlUsd: 1,
    pnlVnd: 1,
    rMultiple: null,
    fxRate: 25_000,
    journal: '',
    researchNoteId: '',
    openedAt: tsAt(T0),
    closedAt: tsAt(T0 + 1000),
    ...over,
  });
  const a = as('userA');
  await assertSucceeds(a.doc('paperOrders/o1').set(base({ mistakeTags: ['fomo'], mistakeNote: 'x'.repeat(140) })));
  await assertSucceeds(a.doc('paperOrders/o2').set(base({ mistakeTags: [] })));
  await assertFails(a.doc('paperOrders/o3').set(base({ mistakeTags: ['luck'] })));
  await assertFails(a.doc('paperOrders/o4').set(base({ mistakeNote: 'x'.repeat(141) })));
  await assertFails(a.doc('paperOrders/o5').set(base({ mistakeNote: 5 })));
  await assertFails(a.doc('paperOrders/o6').set(base({ mistakeTags: [1, 2] })));
  await assertFails(a.doc('paperOrders/o7').set(base({ mistakeTags: null })));
  await assertSucceeds(
    a.doc('paperOrders/o2').update({
      mistakeTags: ['fomo', 'revenge', 'offPlan', 'ignoredNews', 'heldTooLong', 'other', 'noStop', 'movedStop', 'oversized'],
    })
  );
  await assertFails(a.doc('paperOrders/o2').update({ mistakeNote: 5 }));
  await assertFails(a.doc('paperOrders/o2').update({ userId: 'userB' }));
  await assertFails(a.doc('paperOrders/o2').update({ openedAt: tsAt(T0 + 5) }));
  await assertFails(anon().doc('paperOrders/o2').update({ mistakeTags: ['fomo'] }));
  await assertFails(as('userA', false).doc('paperOrders/o2').update({ mistakeTags: ['fomo'] }));
});
