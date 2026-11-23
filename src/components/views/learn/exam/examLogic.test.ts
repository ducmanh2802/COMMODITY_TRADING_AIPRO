import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CURRICULUM } from '../curriculum';
import {
  applyAttempt,
  drawExam,
  drawFinalExam,
  examUnlocked,
  FINAL_EXAM_SIZE,
  finalUnlocked,
  LEVEL_EXAM_SIZE,
  levelExamUnlocked,
  parseExams,
  scoreExam,
  verificationCode,
  type ExamQuestion,
} from './examLogic';

const keys = (qs: ExamQuestion[]) => qs.map((x) => `${x.lessonId}:${x.question.q}`);

test('drawExam is deterministic per attempt and varies across attempts', () => {
  const lvl = CURRICULUM[0];
  assert.deepEqual(keys(drawExam(lvl, 0)), keys(drawExam(lvl, 0)));
  assert.notDeepEqual(keys(drawExam(lvl, 0)), keys(drawExam(lvl, 1)));
});

test('drawExam draws 15 unique questions from that level only', () => {
  for (const lvl of CURRICULUM) {
    const pool = new Set(lvl.lessons.flatMap((l) => l.quiz.map((x) => `${l.id}:${x.q}`)));
    const drawn = keys(drawExam(lvl, 3));
    assert.equal(drawn.length, Math.min(LEVEL_EXAM_SIZE, pool.size));
    assert.equal(new Set(drawn).size, drawn.length);
    for (const k of drawn) assert.ok(pool.has(k));
  }
});

test('drawExam returns all questions when the level has fewer than 15', () => {
  const small = { ...CURRICULUM[0], lessons: CURRICULUM[0].lessons.slice(0, 1) };
  const total = small.lessons[0].quiz.length;
  assert.equal(drawExam(small, 0).length, Math.min(total, LEVEL_EXAM_SIZE));
});

test('final exam: 40 unique questions covering every level, deterministic', () => {
  const a = drawFinalExam(CURRICULUM, 0);
  assert.equal(a.length, FINAL_EXAM_SIZE);
  assert.equal(new Set(keys(a)).size, a.length);
  assert.deepEqual(keys(a), keys(drawFinalExam(CURRICULUM, 0)));
  const lessonToLevel = new Map(CURRICULUM.flatMap((l) => l.lessons.map((x) => [x.id, l.id] as const)));
  const covered = new Set(a.map((x) => lessonToLevel.get(x.lessonId)));
  assert.equal(covered.size, CURRICULUM.length);
});

test('scoring and pass mark at 80%', () => {
  const qs = drawExam(CURRICULUM[0], 0);
  const perfect = qs.map((x) => x.question.answer);
  assert.deepEqual(scoreExam(qs, perfect), { correct: 15, total: 15, pct: 100, passed: true });
  const wrong = (x: ExamQuestion) => (x.question.answer + 1) % x.question.options.length;
  const threeWrong = perfect.map((a, i) => (i < 3 ? wrong(qs[i]) : a));
  const s12 = scoreExam(qs, threeWrong);
  assert.equal(s12.pct, 80);
  assert.equal(s12.passed, true);
  const fourWrong = perfect.map((a, i) => (i < 4 ? wrong(qs[i]) : a));
  assert.equal(scoreExam(qs, fourWrong).passed, false);
  assert.equal(scoreExam(qs, []).correct, 0);
  assert.equal(scoreExam([], []).passed, false);
});

test('unlock rule: >= 80% of lessons done', () => {
  assert.equal(examUnlocked(4, 5), true);
  assert.equal(examUnlocked(3, 5), false);
  assert.equal(examUnlocked(0, 0), false);
  const lvl = CURRICULUM[0];
  const need = Math.ceil(lvl.lessons.length * 0.8);
  const mk = (n: number) => Object.fromEntries(lvl.lessons.slice(0, n).map((l) => [l.id, { done: true }]));
  assert.equal(levelExamUnlocked(lvl, mk(need)), true);
  assert.equal(levelExamUnlocked(lvl, mk(need - 1)), false);
  assert.equal(finalUnlocked(CURRICULUM, {}), false);
  const all = Object.fromEntries(CURRICULUM.flatMap((l) => l.lessons).map((l) => [l.id, { done: true }]));
  assert.equal(finalUnlocked(CURRICULUM, all), true);
});

test('verification code is stable, formatted and input-sensitive', () => {
  const c = verificationCode('Nguyễn Văn A', 'l3', 87, '2026-11-23');
  assert.equal(c, verificationCode('  nguyễn văn a ', 'l3', 87, '2026-11-23'));
  assert.match(c, /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
  assert.notEqual(c, verificationCode('Nguyễn Văn A', 'l4', 87, '2026-11-23'));
  assert.notEqual(c, verificationCode('Nguyễn Văn A', 'l3', 88, '2026-11-23'));
  assert.notEqual(c, verificationCode('Nguyễn Văn A', 'l3', 87, '2026-11-24'));
});

test('applyAttempt keeps best score and counts attempts', () => {
  let s = applyAttempt({}, 'l1', { correct: 9, total: 15, pct: 60, passed: false }, '2026-01-01');
  s = applyAttempt(s, 'l1', { correct: 13, total: 15, pct: 87, passed: true }, '2026-01-02');
  s = applyAttempt(s, 'l1', { correct: 10, total: 15, pct: 67, passed: false }, '2026-01-03');
  assert.deepEqual(s.l1, { attempts: 3, best: 87, bestCorrect: 13, bestTotal: 15, bestDate: '2026-01-02', passed: true });
});

test('parseExams migrates bare maps, versioned stores and drops junk', () => {
  assert.deepEqual(parseExams(null), {});
  assert.deepEqual(parseExams('not json'), {});
  const bare = parseExams(JSON.stringify({ l1: { best: 90 }, bad: { best: 'x' }, n: null }));
  assert.deepEqual(Object.keys(bare), ['l1']);
  assert.equal(bare.l1.passed, true);
  assert.equal(bare.l1.attempts, 1);
  const v1 = parseExams(JSON.stringify({ version: 1, exams: { l2: { attempts: 2, best: 150, bestCorrect: 1, bestTotal: 2, bestDate: '2026-01-01', passed: false } } }));
  assert.equal(v1.l2.best, 100);
  assert.equal(v1.l2.attempts, 2);
});
