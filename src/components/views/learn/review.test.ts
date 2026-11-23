import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dueItems, hashQuestion, parseReview, questionId, recordAnswer, type ReviewState } from './review';

const D = 86_400_000;
const T0 = 1_000_000_000_000;

test('hash stable and distinct', () => {
  assert.equal(hashQuestion('abc'), hashQuestion('abc'));
  assert.notEqual(hashQuestion('abc'), hashQuestion('abd'));
});

test('wrong schedules box 1 due +1d; not due before', () => {
  const s = recordAnswer({}, 'L1', 'q?', false, T0);
  const id = questionId('L1', 'q?');
  assert.equal(s[id].box, 1);
  assert.equal(s[id].due, T0 + D);
  assert.equal(dueItems(s, T0 + D - 1).length, 0);
  assert.equal(dueItems(s, T0 + D).length, 1);
});

test('correct progression 1 -> 2 (+3d) -> 3 (+7d) -> retired', () => {
  const id = questionId('L1', 'q?');
  let s: ReviewState = recordAnswer({}, 'L1', 'q?', false, T0);
  s = recordAnswer(s, 'L1', 'q?', true, T0 + D);
  assert.equal(s[id].box, 2);
  assert.equal(s[id].due, T0 + D + 3 * D);
  s = recordAnswer(s, 'L1', 'q?', true, T0 + 4 * D);
  assert.equal(s[id].box, 3);
  assert.equal(s[id].due, T0 + 4 * D + 7 * D);
  s = recordAnswer(s, 'L1', 'q?', true, T0 + 11 * D);
  assert.equal(s[id], undefined);
});

test('wrong in review resets to box 1', () => {
  const id = questionId('L1', 'q?');
  let s = recordAnswer({}, 'L1', 'q?', false, T0);
  s = recordAnswer(s, 'L1', 'q?', true, T0 + D);
  s = recordAnswer(s, 'L1', 'q?', false, T0 + 4 * D);
  assert.equal(s[id].box, 1);
  assert.equal(s[id].due, T0 + 5 * D);
});

test('correct on unseen question is no-op', () => {
  assert.deepEqual(recordAnswer({}, 'L1', 'q?', true, T0), {});
});

test('parse: garbage, bare map, versioned, invalid entries', () => {
  assert.deepEqual(parseReview(null), {});
  assert.deepEqual(parseReview('{oops'), {});
  assert.deepEqual(parseReview('42'), {});
  const item = { lessonId: 'L', qHash: 'h', box: 9, due: 5 };
  assert.equal(parseReview(JSON.stringify({ version: 1, items: { a: item, b: { x: 1 } } })).a.box, 3);
  assert.equal(Object.keys(parseReview(JSON.stringify({ a: item, b: null }))).length, 1);
});
