import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeContinue } from './continueMath';
import type { LevelMeta } from '../learn/curriculum/types';

const mk = (id: string, ids: string[], number: number): LevelMeta =>
  ({ id, number, title: id, goal: '', lessons: ids.map((i) => ({ id: i, title: i, objective: '', quizCount: 1, minutes: 1 })) }) as LevelMeta;
const idx = [mk('a', ['a1', 'a2'], 1), mk('b', ['b1'], 2)];

test('no progress starts at lesson 1', () => {
  const r = computeContinue(idx, {});
  assert.equal(r?.kind, 'start');
  assert.equal(r && 'lessonId' in r ? r.lessonId : '', 'a1');
});
test('next unfinished + level progress', () => {
  const r = computeContinue(idx, { a1: { done: true } });
  assert.deepEqual(r && r.kind === 'next' ? [r.lessonId, r.done, r.total] : null, ['a2', 1, 2]);
});
test('all done', () => {
  assert.equal(computeContinue(idx, { a1: { done: true }, a2: { done: true }, b1: { done: true } })?.kind, 'complete');
});
test('empty index', () => assert.equal(computeContinue([], {}), null));
