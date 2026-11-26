import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateLessonReadMinutes } from '../academyUtils';
import { CURRICULUM } from './index';
import { buildIndex } from './genIndex';
import { LEVEL_IDS } from './loader';
import { ALL_LESSON_META, CURRICULUM_INDEX, LESSONS_TOTAL } from './meta';

const HINT = 'indexData.ts is stale: run `npx tsx src/components/views/learn/curriculum/genIndex.ts`';

test('light index has the same levels, lesson ids and titles as the full curriculum, in order', () => {
  assert.deepEqual(
    CURRICULUM_INDEX.map((l) => [l.id, l.number, l.title, l.goal, l.lessons.map((x) => [x.id, x.title, x.objective])]),
    CURRICULUM.map((l) => [l.id, l.number, l.title, l.goal, l.lessons.map((x) => [x.id, x.title, x.objective])]),
    HINT
  );
});

test('light index quiz counts, read minutes and instrument ids match the full lessons', () => {
  for (const lvl of CURRICULUM) {
    const meta = CURRICULUM_INDEX.find((l) => l.id === lvl.id)!;
    for (const lesson of lvl.lessons) {
      const m = meta.lessons.find((x) => x.id === lesson.id)!;
      assert.equal(m.quizCount, lesson.quiz.length, `${lesson.id} quizCount. ${HINT}`);
      assert.equal(m.minutes, estimateLessonReadMinutes(lesson), `${lesson.id} minutes. ${HINT}`);
      assert.deepEqual(m.instrumentIds ?? [], lesson.instrumentIds ?? [], `${lesson.id} instrumentIds. ${HINT}`);
    }
  }
});

test('generated file equals a fresh build and the lazy loader knows every level', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(CURRICULUM_INDEX)), JSON.parse(JSON.stringify(buildIndex())), HINT);
  assert.deepEqual([...LEVEL_IDS].sort(), CURRICULUM.map((l) => l.id).sort());
  assert.equal(LESSONS_TOTAL, ALL_LESSON_META.length);
});
