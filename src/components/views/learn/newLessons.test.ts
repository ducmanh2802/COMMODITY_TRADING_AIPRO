import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CURRICULUM } from './curriculum';
import { CURRICULUM_INDEX } from './curriculum/meta';
import { examUnlocked, EXAM_PASS_PCT, LEVEL_EXAM_SIZE, drawExam } from './exam/examLogic';
import { computeContinue } from '../today/continueMath';
import { gateCounts, isPendingNew, NEW_LESSON_IDS } from './newLessons';

const ids = new Set(CURRICULUM.flatMap((l) => l.lessons.map((x) => x.id)));
const L2 = CURRICULUM_INDEX.find((l) => l.number === 2)!;
const L3 = CURRICULUM_INDEX.find((l) => l.number === 3)!;

/** Old snapshot: every level-2 lesson that existed before the additions is done; new ones absent. */
const oldDone = Object.fromEntries(L2.lessons.filter((l) => !NEW_LESSON_IDS.has(l.id)).map((l) => [l.id, { done: true }]));

test('every NEW_LESSON_ID exists in the curriculum', () => {
  for (const id of NEW_LESSON_IDS) assert.ok(ids.has(id), id);
});

test('old level-2 completion: exam stays unlocked, new lessons flagged pending', () => {
  const g = gateCounts(L2.lessons, oldDone);
  assert.equal(g.done, g.total);
  assert.equal(examUnlocked(g.done, g.total), true);
  // Without the fix the raw ratio could fall below the 80% bar.
  assert.ok(isPendingNew('l2-margin-call', oldDone));
  assert.equal(isPendingNew('l2-margin-call', { 'l2-margin-call': { done: true } }), false);
});

test('finishing a new lesson counts toward the gate', () => {
  const g = gateCounts(L2.lessons, { ...oldDone, 'l2-margin-call': { done: true } });
  assert.equal(g.total, L2.lessons.filter((l) => !NEW_LESSON_IDS.has(l.id)).length + 1);
  assert.equal(g.done, g.total);
});

test('Continue card does not jump back to a new level-2 lesson', () => {
  const upToL2 = Object.fromEntries(
    CURRICULUM_INDEX.filter((l) => l.number <= 2).flatMap((l) => l.lessons.filter((x) => !NEW_LESSON_IDS.has(x.id)).map((x) => [x.id, { done: true }]))
  );
  const r = computeContinue(CURRICULUM_INDEX, upToL2);
  assert.equal(r?.kind, 'next');
  assert.equal(r && 'lessonId' in r ? r.lessonId : '', L3.lessons.find((l) => !NEW_LESSON_IDS.has(l.id))!.id);
});

test('Continue card offers new lessons when nothing else is left', () => {
  const all = Object.fromEntries(CURRICULUM_INDEX.flatMap((l) => l.lessons.filter((x) => !NEW_LESSON_IDS.has(x.id)).map((x) => [x.id, { done: true }])));
  const r = computeContinue(CURRICULUM_INDEX, all);
  assert.equal(r && 'lessonId' in r ? NEW_LESSON_IDS.has(r.lessonId) : false, true);
});

test('level exam format unchanged and pool includes new lessons', () => {
  assert.equal(LEVEL_EXAM_SIZE, 15);
  assert.equal(EXAM_PASS_PCT, 80);
  const lvl = CURRICULUM.find((l) => l.number === 2)!;
  assert.equal(drawExam(lvl, 0).length, 15);
  assert.ok(lvl.lessons.some((l) => l.id === 'l2-margin-call' && l.quiz.length > 0));
});
