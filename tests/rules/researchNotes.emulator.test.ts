/**
 * Firestore security-rules tests for the Research Notebook (`researchNotes`, T18), against the real
 * Firestore emulator. Same pattern as firestore.rules.emulator.test.ts (T19): every denial is paired
 * with the matching legitimate operation so a deny-everything rule set cannot pass.
 *
 * Run with `npm run test:rules` (starts the emulator via firebase emulators:exec). Requires Java.
 * Uses its own demo project id so it can run in parallel with the other rules test file without
 * clearFirestore() races.
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

const PROJECT_ID = 'demo-commodity-aipro-notes';
const serverTimestamp = () => firebase.firestore.FieldValue.serverTimestamp();

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

function as(uid: string, verified = true) {
  return env.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: verified }).firestore();
}

function note(userId = 'userA', over: Record<string, unknown> = {}) {
  return {
    userId,
    instrumentId: 'CBOT:ZC',
    title: 'Corn seasonality',
    body: 'Planting progress lagging; watch WASDE.',
    tags: ['wasde', 'weather'],
    chartContext: { timeframe: 'D1', contractCode: 'ZCZ24', rangeStart: '2024-01-02', rangeEnd: '2024-06-28' },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...over,
  };
}

async function seed(id: string, data: Record<string, unknown>): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(`researchNotes/${id}`).set(data);
  });
}

// --------------------------------------------------------------------------- allow

test('owner can create (with and without chart context), get, list, update and delete', async () => {
  const db = as('userA');
  await assertSucceeds(db.doc('researchNotes/n1').set(note()));
  await assertSucceeds(db.doc('researchNotes/n2').set(note('userA', { chartContext: null, tags: [], body: '' })));
  await assertSucceeds(db.doc('researchNotes/n1').get());
  await assertSucceeds(db.collection('researchNotes').where('userId', '==', 'userA').get());
  await assertSucceeds(
    db.doc('researchNotes/n1').update({
      title: 'Corn seasonality (rev)',
      tags: ['wasde'],
      chartContext: null,
      updatedAt: serverTimestamp(),
    })
  );
  await assertSucceeds(db.doc('researchNotes/n1').delete());
});

test('boundary sizes are accepted (title 120, body 10000, 8 tags of 32)', async () => {
  await assertSucceeds(
    as('userA')
      .doc('researchNotes/n1')
      .set(note('userA', { title: 't'.repeat(120), body: 'b'.repeat(10000), tags: Array.from({ length: 8 }, (_, i) => `${i}`.repeat(32)) }))
  );
});

// --------------------------------------------------------------------------- deny: identity / isolation

test('unauthenticated and unverified users are denied', async () => {
  await seed('n1', note());
  await assertFails(env.unauthenticatedContext().firestore().doc('researchNotes/n1').get());
  await assertFails(env.unauthenticatedContext().firestore().doc('researchNotes/n2').set(note()));
  await assertFails(as('userA', false).doc('researchNotes/n2').set(note()));
  await assertFails(as('userA', false).doc('researchNotes/n1').get());
});

test('other users cannot read, list, update or delete the owner note', async () => {
  await seed('n1', note());
  const b = as('userB');
  await assertFails(b.doc('researchNotes/n1').get());
  await assertFails(b.collection('researchNotes').where('userId', '==', 'userA').get());
  await assertFails(b.collection('researchNotes').get());
  await assertFails(b.doc('researchNotes/n1').update({ title: 'hijack', updatedAt: serverTimestamp() }));
  await assertFails(b.doc('researchNotes/n1').delete());
});

test('identity spoofing on create is denied', async () => {
  await assertFails(as('userA').doc('researchNotes/n1').set(note('userB')));
});

test('unfiltered list (not scoped to own userId) is denied', async () => {
  await seed('n1', note());
  await assertFails(as('userA').collection('researchNotes').get());
});

// --------------------------------------------------------------------------- deny: schema

test('shadow fields and missing fields are denied', async () => {
  const db = as('userA');
  await assertFails(db.doc('researchNotes/n1').set({ ...note(), isPublic: true }));
  const { tags: _omit, ...missing } = note();
  await assertFails(db.doc('researchNotes/n1').set(missing));
  await assertFails(
    db.doc('researchNotes/n1').set(note('userA', { chartContext: { timeframe: 'D1', contractCode: '', rangeStart: '', rangeEnd: '', extra: 1 } }))
  );
});

test('size limits and type poisoning are denied', async () => {
  const db = as('userA');
  await assertFails(db.doc('researchNotes/n1').set(note('userA', { title: '' })));
  await assertFails(db.doc('researchNotes/n1').set(note('userA', { title: 't'.repeat(121) })));
  await assertFails(db.doc('researchNotes/n1').set(note('userA', { body: 'b'.repeat(10001) })));
  await assertFails(db.doc('researchNotes/n1').set(note('userA', { instrumentId: 'x'.repeat(33) })));
  await assertFails(db.doc('researchNotes/n1').set(note('userA', { instrumentId: '' })));
  await assertFails(db.doc('researchNotes/n1').set(note('userA', { tags: Array.from({ length: 9 }, (_, i) => `t${i}`) })));
  await assertFails(db.doc('researchNotes/n1').set(note('userA', { tags: ['x'.repeat(33)] })));
  await assertFails(db.doc('researchNotes/n1').set(note('userA', { tags: ['ok', 42] })));
  await assertFails(db.doc('researchNotes/n1').set(note('userA', { tags: 'wasde' })));
  await assertFails(db.doc('researchNotes/n1').set(note('userA', { body: 123 })));
  await assertFails(
    db.doc('researchNotes/n1').set(note('userA', { chartContext: { timeframe: 'MN', contractCode: '', rangeStart: '', rangeEnd: '' } }))
  );
  await assertFails(
    db.doc('researchNotes/n1').set(note('userA', { chartContext: { timeframe: '', contractCode: 'x'.repeat(25), rangeStart: '', rangeEnd: '' } }))
  );
  await assertFails(db.doc('researchNotes/n1').set(note('userA', { chartContext: 'D1' })));
});

test('path variable poisoning is denied', async () => {
  await assertFails(as('userA').doc(`researchNotes/${'a'.repeat(300)}`).set(note()));
  await assertFails(as('userA').doc('researchNotes/bad$id').set(note()));
});

// --------------------------------------------------------------------------- deny: immutability / timestamps

test('client timestamp forgery is denied on create and update', async () => {
  const forged = firebase.firestore.Timestamp.fromDate(new Date('2020-01-01T00:00:00Z'));
  await assertFails(as('userA').doc('researchNotes/n1').set(note('userA', { createdAt: forged })));
  await assertFails(as('userA').doc('researchNotes/n1').set(note('userA', { updatedAt: forged })));
  await seed('n2', note());
  await assertFails(as('userA').doc('researchNotes/n2').update({ title: 'x', updatedAt: forged }));
  await assertFails(as('userA').doc('researchNotes/n2').update({ title: 'x' }));
});

test('owner cannot change userId or createdAt', async () => {
  await seed('n1', note());
  const ref = as('userA').doc('researchNotes/n1');
  await assertFails(ref.update({ userId: 'userB', updatedAt: serverTimestamp() }));
  await assertFails(ref.update({ createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  await assertFails(ref.update({ extra: true, updatedAt: serverTimestamp() }));
  await assertSucceeds(ref.update({ body: 'still mine', updatedAt: serverTimestamp() }));
});
