import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CURRICULUM } from './curriculum';
import { GLOSSARY } from './glossary';
import { SLANG } from './glossarySlang';
import type { LearnProgress } from './progress';
import {
  buildFlashcardDeck,
  computeAcademyStats,
  estimateLessonReadMinutes,
  extractHighlightedSnippet,
  filterCurriculum,
  highlightTextSegments,
  SANDBOX_EXERCISES,
  shuffleFlashcards,
} from './academyUtils';

test('computeAcademyStats summarizes progress, quiz averages, passed exams, notes, and recommended lesson', () => {
  const progress: LearnProgress = {
    lessons: {
      'l1-commodity': { done: true, best: 100 },
      'l1-spot-futures': { done: true, best: 80 },
      'l1-contract': { done: false, best: 40 },
    },
    checklist: {},
    notes: {
      'l1-commodity': 'Ghi chú quan trọng',
      'l1-spot-futures': '   ', // blank whitespace does not count
    },
  };
  const exams = {
    l1: { attempts: 1, best: 85, bestCorrect: 13, bestTotal: 15, bestDate: '2026-11-24', passed: true },
    final: { attempts: 1, best: 90, bestCorrect: 36, bestTotal: 40, bestDate: '2026-11-24', passed: true },
  };

  const stats = computeAcademyStats(CURRICULUM, progress, exams, 'hedge');
  const totalLessons = CURRICULUM.reduce((s, lv) => s + lv.lessons.length, 0);

  assert.equal(stats.totalLessons, totalLessons);
  assert.equal(stats.doneLessons, 2);
  assert.equal(stats.todoLessons, totalLessons - 2);
  assert.equal(stats.averageBestQuizPct, 73); // round((100+80+40)/3)
  assert.equal(stats.passedExamsCount, 2);
  assert.equal(stats.totalExamsCount, CURRICULUM.length + 1);
  assert.equal(stats.notedLessonsCount, 1);
  assert.equal(stats.recommendedLessonId, 'l1-hedger-spec'); // 3rd item in LEARN_PATHS.hedge after first 2 done
});

test('filterCurriculum matches Vietnamese accent-folded text, instrument symbols, status, notes, and goal path', () => {
  const progress: LearnProgress = {
    lessons: {
      'l1-commodity': { done: true, best: 100 },
    },
    checklist: {},
    notes: {
      'l1-spot-futures': 'Ghi chú cá nhân riêng: mucnho-kyquy-2026 cần kiểm tra chéo',
    },
  };

  // Search without diacritics
  const ngo = filterCurriculum(CURRICULUM, progress, { query: 'ngo' });
  assert.ok(ngo.length > 0);
  const allMatchedIds = new Set(ngo.flatMap((g) => g.lessons.map((l) => l.id)));
  assert.ok(allMatchedIds.has('l3-grains') || allMatchedIds.has('l10-corn'));

  // Search inside personal lesson notes
  const noteMatched = filterCurriculum(CURRICULUM, progress, { query: 'mucnho-kyquy-2026' });
  assert.deepEqual(
    noteMatched.flatMap((g) => g.lessons.map((l) => l.id)),
    ['l1-spot-futures']
  );

  // Status filter DONE vs TODO
  const doneOnly = filterCurriculum(CURRICULUM, progress, { status: 'DONE' });
  assert.equal(doneOnly.length, 1);
  assert.deepEqual(doneOnly[0].lessons.map((l) => l.id), ['l1-commodity']);

  // Goal path filter
  const swingOnly = filterCurriculum(CURRICULUM, progress, { goal: 'swing', goalOnly: true });
  const swingIds = swingOnly.flatMap((g) => g.lessons.map((l) => l.id));
  assert.ok(swingIds.includes('l8-dow'));
  assert.ok(!swingIds.includes('l3-coffee'));

  // Bookmarks filter
  const withBookmarks: LearnProgress = {
    ...progress,
    bookmarked: ['l1-spot-futures', 'l3-coffee'],
  };
  const bookmarkedOnly = filterCurriculum(CURRICULUM, withBookmarks, { bookmarkedOnly: true });
  assert.deepEqual(
    bookmarkedOnly.flatMap((g) => g.lessons.map((l) => l.id)),
    ['l1-spot-futures', 'l3-coffee']
  );
  const bookmarkedSearch = filterCurriculum(CURRICULUM, withBookmarks, { bookmarkedOnly: true, query: 'mucnho-kyquy-2026' });
  assert.deepEqual(
    bookmarkedSearch.flatMap((g) => g.lessons.map((l) => l.id)),
    ['l1-spot-futures']
  );
});

test('SANDBOX_EXERCISES references valid lesson IDs and estimateLessonReadMinutes returns >= 2', () => {
  const lessonIds = new Set(CURRICULUM.flatMap((l) => l.lessons.map((x) => x.id)));
  for (const ex of SANDBOX_EXERCISES) {
    assert.ok(lessonIds.has(ex.lessonId), `Unknown sandbox lessonId ${ex.lessonId}`);
  }
  const firstLesson = CURRICULUM[0].lessons[0];
  const mins = estimateLessonReadMinutes(firstLesson);
  assert.ok(Number.isInteger(mins) && mins >= 2);
});

test('buildFlashcardDeck combines glossary and slang cleanly and shuffleFlashcards is deterministic', () => {
  const all = buildFlashcardDeck(GLOSSARY, SLANG, 'ALL');
  assert.equal(all.length, GLOSSARY.length + SLANG.length);

  const formalOnly = buildFlashcardDeck(GLOSSARY, SLANG, 'FORMAL');
  assert.equal(formalOnly.length, GLOSSARY.length);
  assert.ok(formalOnly.every((c) => c.source === 'FORMAL'));

  const filtered = buildFlashcardDeck(GLOSSARY, SLANG, 'ALL', 'contango');
  assert.ok(filtered.some((c) => c.term.toLowerCase().includes('contango')));

  const s1 = shuffleFlashcards(all, 42);
  const s2 = shuffleFlashcards(all, 42);
  assert.deepEqual(s1.map((c) => c.id), s2.map((c) => c.id));
  assert.notDeepEqual(s1.map((c) => c.id), all.map((c) => c.id));
});

test('highlightTextSegments highlights Vietnamese matches accent-insensitively and preserves original text', () => {
  const segs = highlightTextSegments('Đặt ký quỹ ban đầu và ký quỹ duy trì', 'ky quy');
  const matched = segs.filter((s) => s.match).map((s) => s.text);
  assert.deepEqual(matched, ['ký quỹ', 'ký quỹ']);
  assert.equal(segs.map((s) => s.text).join(''), 'Đặt ký quỹ ban đầu và ký quỹ duy trì');

  const noMatch = highlightTextSegments('Hợp đồng ngô CBOT', 'cà phê');
  assert.deepEqual(noMatch, [{ text: 'Hợp đồng ngô CBOT', match: false }]);
});

test('extractHighlightedSnippet windows around match inside long lesson notes', () => {
  const longNote = `${'A'.repeat(90)} điểm dừng lỗ quan trọng cần giữ ${'B'.repeat(90)}`;
  const snippet = extractHighlightedSnippet(longNote, 'dung lo', 80);
  assert.equal(snippet.hasMatch, true);
  assert.equal(snippet.segments.some((s) => s.match && s.text === 'dừng lỗ'), true);
  assert.ok(snippet.segments.map((s) => s.text).join('').includes('…'));

  const miss = extractHighlightedSnippet(longNote, 'xyz');
  assert.equal(miss.hasMatch, false);
  assert.deepEqual(miss.segments, []);
});
