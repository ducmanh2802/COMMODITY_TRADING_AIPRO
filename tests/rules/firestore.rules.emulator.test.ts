/**
 * Firestore security-rules tests against the real Firestore emulator (T19).
 *
 * Covers every "Dirty Dozen" payload in security_spec.md (each must be PERMISSION_DENIED) plus the
 * matching legitimate operation (each must succeed), so a denial can never pass just because the
 * rules deny everything.
 *
 * Run with `npm run test:rules` (starts the emulator via firebase emulators:exec). Requires Java.
 * Running this file without FIRESTORE_EMULATOR_HOST fails loudly instead of silently skipping.
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

const PROJECT_ID = 'demo-commodity-aipro'; // "demo-" prefix: emulator only, never touches a real project
const serverTimestamp = () => firebase.firestore.FieldValue.serverTimestamp();
const VERIFIED = { email: 'a@example.com', email_verified: true };

let env: RulesTestEnvironment;

before(async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  assert.ok(host, 'FIRESTORE_EMULATOR_HOST is not set - run these tests with `npm run test:rules`.');
  const [hostname, port] = host.split(':');
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: hostname,
      port: Number(port),
      rules: readFileSync(path.resolve('firestore.rules'), 'utf8'),
    },
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

function userA() {
  return env.authenticatedContext('userA', VERIFIED).firestore();
}

function profile(uid = 'userA') {
  return {
    uid,
    email: `${uid}@example.com`,
    displayName: 'Trader',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function settings(userId = 'userA') {
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

function auditLog(userId = 'userA') {
  return { userId, action: 'SETTINGS_UPDATED', resource: 'userSettings/userA', createdAt: serverTimestamp() };
}

/** Seed documents bypassing rules (timestamps are real server timestamps). */
async function seed(docs: Record<string, Record<string, unknown>>): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [p, data] of Object.entries(docs)) await db.doc(p).set(data);
  });
}

// --------------------------------------------------------------------------- baseline (must succeed)

test('baseline: verified owner can create/read own profile, settings and audit log', async () => {
  const db = userA();
  await assertSucceeds(db.doc('users/userA').set(profile()));
  await assertSucceeds(db.doc('users/userA').get());
  await assertSucceeds(db.doc('userSettings/userA').set(settings()));
  await assertSucceeds(db.doc('userSettings/userA').update({ displayTimezone: 'UTC', updatedAt: serverTimestamp() }));
  await assertSucceeds(db.doc('auditLogs/log1').set(auditLog()));
  await assertSucceeds(db.collection('auditLogs').where('userId', '==', 'userA').get());
});

// --------------------------------------------------------------------------- Dirty Dozen

test('DD1 unauthenticated read of /users/{uid} is denied', async () => {
  await seed({ 'users/userA': profile() });
  await assertFails(env.unauthenticatedContext().firestore().doc('users/userA').get());
});

test('DD2 cross-user PII read is denied', async () => {
  await seed({ 'users/userA': profile() });
  const userB = env.authenticatedContext('userB', { email: 'b@example.com', email_verified: true }).firestore();
  await assertFails(userB.doc('users/userA').get());
});

test('DD3 user collection enumeration (list) is denied', async () => {
  await seed({ 'users/userA': profile() });
  await assertFails(userA().collection('users').get());
  await assertFails(userA().collection('users').where('uid', '==', 'userA').get());
});

test('DD4 write with unverified email is denied', async () => {
  const unverified = env.authenticatedContext('userA', { email: 'a@example.com', email_verified: false }).firestore();
  await assertFails(unverified.doc('users/userA').set(profile()));
});

test('DD5 identity spoofing on create (userId of someone else) is denied', async () => {
  await assertFails(userA().doc('userSettings/userA').set(settings('userB')));
  await assertFails(userA().doc('userSettings/userB').set(settings('userB')));
});

test('DD6 shadow field injection on create is denied', async () => {
  await assertFails(userA().doc('userSettings/userA').set({ ...settings(), isAdmin: true }));
});

test('DD7 shadow field injection on update is denied', async () => {
  await seed({ 'userSettings/userA': settings() });
  await assertFails(
    userA().doc('userSettings/userA').update({ displayTimezone: 'UTC', role: 'superadmin', updatedAt: serverTimestamp() })
  );
});

test('DD8 immutable field mutation (owner userId) is denied', async () => {
  await seed({ 'userSettings/userA': settings() });
  await assertFails(userA().doc('userSettings/userA').update({ userId: 'userB', updatedAt: serverTimestamp() }));
});

test('DD9 client timestamp forgery is denied', async () => {
  await assertFails(userA().doc('users/userA').set({ ...profile(), createdAt: '2020-01-01T00:00:00Z' }));
  await assertFails(
    userA()
      .doc('users/userA')
      .set({ ...profile(), createdAt: firebase.firestore.Timestamp.fromDate(new Date('2020-01-01T00:00:00Z')) })
  );
});

test('DD10 path variable poisoning (id > 128 chars / bad charset) is denied', async () => {
  await assertFails(userA().doc(`auditLogs/${'a'.repeat(300)}`).set(auditLog()));
  await assertFails(userA().doc('auditLogs/bad$id').set(auditLog()));
});

test('DD11 risk limit out of bounds / type poisoning is denied', async () => {
  await seed({ 'userSettings/userA': settings() });
  const ref = userA().doc('userSettings/userA');
  await assertFails(ref.update({ riskPercentagePerTrade: 500, updatedAt: serverTimestamp() }));
  await assertFails(ref.update({ riskPercentagePerTrade: '1', updatedAt: serverTimestamp() }));
  await assertFails(ref.update({ maxOpenPositions: 2.5, updatedAt: serverTimestamp() }));
  await assertSucceeds(ref.update({ riskPercentagePerTrade: 2, updatedAt: serverTimestamp() }));
});

test('DD12 audit log tampering and deletion by the owner are denied', async () => {
  await seed({ 'auditLogs/log1': auditLog() });
  const ref = userA().doc('auditLogs/log1');
  await assertSucceeds(ref.get());
  await assertFails(ref.update({ action: 'NOTHING_HAPPENED' }));
  await assertFails(ref.delete());
});

// --------------------------------------------------------------------------- additional invariants

test('default deny: unknown collections are not readable or writable', async () => {
  await assertFails(userA().doc('anything/x').get());
  await assertFails(userA().doc('anything/x').set({ a: 1 }));
});

test('positions: CLOSED is a terminal state and other users cannot read', async () => {
  const position = {
    userId: 'userA',
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
  };
  const ref = userA().doc('positions/p1');
  await assertSucceeds(ref.set(position));
  const userB = env.authenticatedContext('userB', { email: 'b@example.com', email_verified: true }).firestore();
  await assertFails(userB.doc('positions/p1').get());
  await assertSucceeds(ref.update({ status: 'CLOSED', updatedAt: serverTimestamp() }));
  await assertFails(ref.update({ notes: 'reopen?', updatedAt: serverTimestamp() }));
});
