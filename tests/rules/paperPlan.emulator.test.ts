/**
 * Firestore security-rules tests for the optional `plan` field on paper positions and orders (T85/T97).
 * Covers: create with/without plan (allowed), malformed plan (denied), extra unknown key (denied),
 * other user's uid (denied). Same pattern as paperTrading.emulator.test.ts.
 *
 * Run with `npm run test:rules` (starts the emulator via firebase emulators:exec). Requires Java.
 * Uses its own demo project id so it can run in parallel with the other rules test files.
 */
import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

const PROJECT_ID = 'demo-commodity-aipro-plan';
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

function basePosition(userId = 'userA', over: Record<string, unknown> = {}) {
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

function baseOrder(userId = 'userA', over: Record<string, unknown> = {}) {
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

function validPlan(over: Record<string, unknown> = {}) {
  return {
    answers: { trend: 'yes', zone: 'yes', signal: 'yes', volume: 'yes', plan: 'yes' },
    eventsOk: true,
    r: 2.5,
    riskPct: 1.2,
    limitPct: 2,
    onPlan: true,
    ...over,
  };
}

async function seedSession(id: string, userId = 'userA', over: Record<string, unknown> = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(`paperSessions/${id}`).set(session(userId, { createdAt: tsAt(1_700_000_000_000), updatedAt: tsAt(1_700_000_000_000), ...over }));
  });
}

// --------------------------------------------------------------------------- positions: plan field

test('position: create without plan is allowed', async () => {
  await seedSession('s1');
  const db = as('userA');
  await assertSucceeds(db.doc('paperPositions/p1').set(basePosition()));
});

test('position: create with valid plan is allowed', async () => {
  await seedSession('s1');
  const db = as('userA');
  await assertSucceeds(db.doc('paperPositions/p1').set(basePosition('userA', { plan: validPlan() })));
});

test('position: create with plan missing optional fields is allowed', async () => {
  await seedSession('s1');
  const db = as('userA');
  const minimalPlan = { answers: { trend: 'yes', zone: null, signal: 'no', volume: 'yes', plan: null }, eventsOk: null, r: null, riskPct: null, limitPct: 2, onPlan: false };
  await assertSucceeds(db.doc('paperPositions/p1').set(basePosition('userA', { plan: minimalPlan })));
});

test('position: create with malformed plan (answers not a map) is denied', async () => {
  await seedSession('s1');
  const db = as('userA');
  await assertFails(db.doc('paperPositions/p1').set(basePosition('userA', { plan: { ...validPlan(), answers: 'not-a-map' } })));
});

test('position: create with malformed plan (unknown answer key) is denied', async () => {
  await seedSession('s1');
  const db = as('userA');
  await assertFails(db.doc('paperPositions/p1').set(basePosition('userA', { plan: { ...validPlan(), answers: { ...validPlan().answers, extra: 'yes' } } })));
});

test('position: create with malformed plan (invalid answer value) is denied', async () => {
  await seedSession('s1');
  const db = as('userA');
  await assertFails(db.doc('paperPositions/p1').set(basePosition('userA', { plan: { ...validPlan(), answers: { ...validPlan().answers, trend: 'maybe' } } })));
});

test('position: create with malformed plan (eventsOk not bool/null) is denied', async () => {
  await seedSession('s1');
  const db = as('userA');
  await assertFails(db.doc('paperPositions/p1').set(basePosition('userA', { plan: { ...validPlan(), eventsOk: 'yes' } })));
});

test('position: create with malformed plan (r out of bounds) is denied', async () => {
  await seedSession('s1');
  const db = as('userA');
  await assertFails(db.doc('paperPositions/p1').set(basePosition('userA', { plan: { ...validPlan(), r: 200 } })));
  await assertFails(db.doc('paperPositions/p1').set(basePosition('userA', { plan: { ...validPlan(), r: -200 } })));
});

test('position: create with malformed plan (riskPct out of bounds) is denied', async () => {
  await seedSession('s1');
  const db = as('userA');
  await assertFails(db.doc('paperPositions/p1').set(basePosition('userA', { plan: { ...validPlan(), riskPct: -1 } })));
  await assertFails(db.doc('paperPositions/p1').set(basePosition('userA', { plan: { ...validPlan(), riskPct: 101 } })));
});

test('position: create with malformed plan (limitPct out of bounds) is denied', async () => {
  await seedSession('s1');
  const db = as('userA');
  await assertFails(db.doc('paperPositions/p1').set(basePosition('userA', { plan: { ...validPlan(), limitPct: 0.04 } })));
  await assertFails(db.doc('paperPositions/p1').set(basePosition('userA', { plan: { ...validPlan(), limitPct: 101 } })));
});

test('position: create with malformed plan (onPlan not bool) is denied', async () => {
  await seedSession('s1');
  const db = as('userA');
  await assertFails(db.doc('paperPositions/p1').set(basePosition('userA', { plan: { ...validPlan(), onPlan: 'true' } })));
});

test('position: create with extra unknown key in plan is denied', async () => {
  await seedSession('s1');
  const db = as('userA');
  await assertFails(db.doc('paperPositions/p1').set(basePosition('userA', { plan: { ...validPlan(), extraField: 123 } })));
});

test('position: other user uid in plan position is denied', async () => {
  await seedSession('s1');
  await seedSession('sB', 'userB');
  const a = as('userA');
  await assertFails(a.doc('paperPositions/p1').set(basePosition('userB', { plan: validPlan() })));
});

test('position: other user cannot read/write position with plan', async () => {
  await seedSession('s1');
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc('paperPositions/p1').set(basePosition('userA', { plan: validPlan(), openedAt: tsAt(1_700_000_000_000) }));
  });
  const b = as('userB');
  await assertFails(b.doc('paperPositions/p1').get());
  await assertFails(b.doc('paperPositions/p1').update({ journal: 'hack', plan: validPlan() }));
  await assertFails(b.doc('paperPositions/p1').delete());
});

// --------------------------------------------------------------------------- orders: plan field

test('order: create without plan is allowed', async () => {
  await seedSession('s1');
  const db = as('userA');
  await assertSucceeds(db.doc('paperOrders/o1').set(baseOrder()));
});

test('order: create with valid plan is allowed', async () => {
  await seedSession('s1');
  const db = as('userA');
  await assertSucceeds(db.doc('paperOrders/o1').set(baseOrder('userA', { plan: validPlan() })));
});

test('order: create with plan missing optional fields is allowed', async () => {
  await seedSession('s1');
  const db = as('userA');
  const minimalPlan = { answers: { trend: 'yes', zone: null, signal: 'no', volume: 'yes', plan: null }, eventsOk: null, r: null, riskPct: null, limitPct: 2, onPlan: false };
  await assertSucceeds(db.doc('paperOrders/o1').set(baseOrder('userA', { plan: minimalPlan })));
});

test('order: create with malformed plan (answers not a map) is denied', async () => {
  await seedSession('s1');
  const db = as('userA');
  await assertFails(db.doc('paperOrders/o1').set(baseOrder('userA', { plan: { ...validPlan(), answers: 'not-a-map' } })));
});

test('order: create with malformed plan (unknown answer key) is denied', async () => {
  await seedSession('s1');
  const db = as('userA');
  await assertFails(db.doc('paperOrders/o1').set(baseOrder('userA', { plan: { ...validPlan(), answers: { ...validPlan().answers, extra: 'yes' } } })));
});

test('order: create with malformed plan (invalid answer value) is denied', async () => {
  await seedSession('s1');
  const db = as('userA');
  await assertFails(db.doc('paperOrders/o1').set(baseOrder('userA', { plan: { ...validPlan(), answers: { ...validPlan().answers, trend: 'maybe' } } })));
});

test('order: create with malformed plan (eventsOk not bool/null) is denied', async () => {
  await seedSession('s1');
  const db = as('userA');
  await assertFails(db.doc('paperOrders/o1').set(baseOrder('userA', { plan: { ...validPlan(), eventsOk: 'yes' } })));
});

test('order: create with malformed plan (r out of bounds) is denied', async () => {
  await seedSession('s1');
  const db = as('userA');
  await assertFails(db.doc('paperOrders/o1').set(baseOrder('userA', { plan: { ...validPlan(), r: 200 } })));
  await assertFails(db.doc('paperOrders/o1').set(baseOrder('userA', { plan: { ...validPlan(), r: -200 } })));
});

test('order: create with malformed plan (riskPct out of bounds) is denied', async () => {
  await seedSession('s1');
  const db = as('userA');
  await assertFails(db.doc('paperOrders/o1').set(baseOrder('userA', { plan: { ...validPlan(), riskPct: -1 } })));
  await assertFails(db.doc('paperOrders/o1').set(baseOrder('userA', { plan: { ...validPlan(), riskPct: 101 } })));
});

test('order: create with malformed plan (limitPct out of bounds) is denied', async () => {
  await seedSession('s1');
  const db = as('userA');
  await assertFails(db.doc('paperOrders/o1').set(baseOrder('userA', { plan: { ...validPlan(), limitPct: 0.04 } })));
  await assertFails(db.doc('paperOrders/o1').set(baseOrder('userA', { plan: { ...validPlan(), limitPct: 101 } })));
});

test('order: create with malformed plan (onPlan not bool) is denied', async () => {
  await seedSession('s1');
  const db = as('userA');
  await assertFails(db.doc('paperOrders/o1').set(baseOrder('userA', { plan: { ...validPlan(), onPlan: 'true' } })));
});

test('order: create with extra unknown key in plan is denied', async () => {
  await seedSession('s1');
  const db = as('userA');
  await assertFails(db.doc('paperOrders/o1').set(baseOrder('userA', { plan: { ...validPlan(), extraField: 123 } })));
});

test('order: other user uid in plan order is denied', async () => {
  await seedSession('s1');
  await seedSession('sB', 'userB');
  const a = as('userA');
  await assertFails(a.doc('paperOrders/o1').set(baseOrder('userB', { plan: validPlan() })));
});

test('order: other user cannot read/write order with plan', async () => {
  await seedSession('s1');
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc('paperOrders/o1').set(baseOrder('userA', { plan: validPlan(), closedAt: tsAt(1_700_000_100_000) }));
  });
  const b = as('userB');
  await assertFails(b.doc('paperOrders/o1').get());
  await assertFails(b.doc('paperOrders/o1').update({ journal: 'hack', plan: validPlan() }));
  await assertFails(b.doc('paperOrders/o1').delete());
});
// --------------------------------------------------------------------------- orders: mistake tags

test('order: owner can add valid mistake tags and note after close', async () => {
  await seedSession('s1');
  const a = as('userA');
  await assertSucceeds(a.doc('paperOrders/o1').set(baseOrder()));
  await assertSucceeds(a.doc('paperOrders/o1').update({ mistakeTags: ['fomo', 'noStop'], mistakeNote: 'vào lệnh vội' }));
});

test('order: unknown tag, too many tags or long note are denied', async () => {
  await seedSession('s1');
  const a = as('userA');
  await assertSucceeds(a.doc('paperOrders/o1').set(baseOrder()));
  await assertFails(a.doc('paperOrders/o1').update({ mistakeTags: ['luck'] }));
  await assertFails(a.doc('paperOrders/o1').update({ mistakeTags: 'fomo' }));
  await assertFails(a.doc('paperOrders/o1').update({ mistakeTags: Array(10).fill('other') }));
  await assertFails(a.doc('paperOrders/o1').update({ mistakeNote: 'x'.repeat(141) }));
});

test('order: tag update cannot change pnl; other user cannot tag', async () => {
  await seedSession('s1');
  const a = as('userA');
  await assertSucceeds(a.doc('paperOrders/o1').set(baseOrder()));
  await assertFails(a.doc('paperOrders/o1').update({ mistakeTags: ['fomo'], pnlVnd: 999 }));
  await assertFails(as('userB').doc('paperOrders/o1').update({ mistakeTags: ['fomo'] }));
});
