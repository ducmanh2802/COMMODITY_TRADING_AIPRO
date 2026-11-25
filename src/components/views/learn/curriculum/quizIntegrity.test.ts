import test from 'node:test';
import assert from 'node:assert/strict';
import { CURRICULUM } from './index';

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
const lessons = CURRICULUM.flatMap((level) => level.lessons.map((lesson) => ({ level: level.number, lesson })));

test('every lesson has a quiz', () => {
  for (const { lesson } of lessons) assert.ok(lesson.quiz.length > 0, `${lesson.id}: empty quiz`);
});

test('quiz questions: non-empty text, 2+ options, answer in range', () => {
  for (const { lesson } of lessons) {
    lesson.quiz.forEach((item, i) => {
      const at = `${lesson.id} #${i + 1}`;
      assert.ok(item.q.trim().length > 0, `${at}: empty question`);
      assert.ok(item.options.length >= 2, `${at}: fewer than 2 options`);
      assert.ok(Number.isInteger(item.answer) && item.answer >= 0 && item.answer < item.options.length, `${at}: answer index out of range`);
      assert.ok(item.why.trim().length > 0, `${at}: empty explanation`);
    });
  }
});

test('quiz options are non-empty and unique within a question', () => {
  for (const { lesson } of lessons) {
    lesson.quiz.forEach((item, i) => {
      const at = `${lesson.id} #${i + 1}`;
      for (const o of item.options) assert.ok(o.trim().length > 0, `${at}: empty option`);
      assert.equal(new Set(item.options.map(norm)).size, item.options.length, `${at}: duplicate options`);
    });
  }
});

test('no duplicate questions within a lesson', () => {
  for (const { lesson } of lessons) {
    const texts = lesson.quiz.map((item) => norm(item.q));
    assert.equal(new Set(texts).size, texts.length, `${lesson.id}: duplicate question`);
  }
});
