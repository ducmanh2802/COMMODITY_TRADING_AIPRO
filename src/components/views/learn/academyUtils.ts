import type { CalculatorId, Lesson } from './curriculum/types';
import type { ExamStore } from './exam/examLogic';
import { FINAL_ID } from './exam/examLogic';
import type { GlossaryTerm } from './glossary';
import type { SlangTerm as SlangEntry } from './glossarySlang';
import { LEARN_PATHS, type LearnGoal } from './learnPaths';
import type { LearnProgress } from './progress';

export type AcademyTab = 'lessons' | 'bookmarks' | 'sandbox' | 'glossary' | 'exams';
export type LessonStatusFilter = 'ALL' | 'TODO' | 'DONE';
export type FlashcardSourceFilter = 'ALL' | 'FORMAL' | 'SLANG';

export interface SandboxExerciseMeta {
  id: CalculatorId;
  lessonId: string;
}

export const SANDBOX_EXERCISES: readonly SandboxExerciseMeta[] = [
  { id: 'order', lessonId: 'l10-corn' },
  { id: 'tick-pnl', lessonId: 'l1-pnl' },
  { id: 'margin-leverage', lessonId: 'l1-margin' },
  { id: 'position-sizing', lessonId: 'l5-sizing' },
  { id: 'margin-call', lessonId: 'l2-fx-fees' },
  { id: 'roll-cost', lessonId: 'l1-expiry-roll' },
  { id: 'fx-convert', lessonId: 'l2-fx-fees' },
  { id: 'curve-quiz', lessonId: 'l4-curve' },
];

export interface AcademyStats {
  totalLessons: number;
  doneLessons: number;
  todoLessons: number;
  completionPct: number;
  averageBestQuizPct: number | null;
  passedExamsCount: number;
  totalExamsCount: number;
  notedLessonsCount: number;
  recommendedLessonId: string | null;
}

/**
 * Minimal lesson/level shapes the Academy helpers need. Both the light index (LessonMeta / LevelMeta) and the
 * full curriculum (Lesson / Level) satisfy them; the optional body fields only widen search when present.
 */
export interface LessonLike {
  id: string;
  title: string;
  objective: string;
  instrumentIds?: string[];
  remember?: string[];
  body?: string[];
  textExample?: string;
  examples?: { title: string; text: string }[];
  uncertain?: string[];
}

export interface LevelLike<L extends LessonLike = LessonLike> {
  id: string;
  number: number;
  title: string;
  goal: string;
  lessons: L[];
}

export interface FilteredLevel<V extends LevelLike = LevelLike> {
  level: V;
  lessons: V['lessons'];
  doneCount: number;
}

export interface FlashcardItem {
  id: string;
  source: 'FORMAL' | 'SLANG';
  term: string;
  definition: string;
  example?: string;
  warning?: string;
  related?: string;
}

export interface HighlightSegment {
  text: string;
  match: boolean;
}

function foldChar(ch: string): string {
  return ch
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/**
 * Splits `text` into non-overlapping matched/unmatched segments using
 * accent-insensitive, case-insensitive matching while preserving original text.
 */
export function highlightTextSegments(text: string, query: string): HighlightSegment[] {
  if (!text) return [];
  const q = normalizeText(query);
  if (!q) return [{ text, match: false }];

  const chars = Array.from(text);
  const normChars: string[] = [];
  const normToOrigIdx: number[] = [];

  for (let i = 0; i < chars.length; i++) {
    const folded = foldChar(chars[i]);
    for (let k = 0; k < folded.length; k++) {
      normChars.push(folded[k]);
      normToOrigIdx.push(i);
    }
  }

  const normStr = normChars.join('');
  const segments: HighlightSegment[] = [];
  let normCursor = 0;
  let lastOrigIdx = 0;

  while (normCursor <= normStr.length - q.length) {
    const pos = normStr.indexOf(q, normCursor);
    if (pos === -1) break;

    const startOrig = normToOrigIdx[pos];
    let endOrig = normToOrigIdx[pos + q.length - 1] + 1;
    while (endOrig < chars.length && foldChar(chars[endOrig]) === '') {
      endOrig++;
    }

    if (startOrig > lastOrigIdx) {
      segments.push({ text: chars.slice(lastOrigIdx, startOrig).join(''), match: false });
    }
    segments.push({ text: chars.slice(startOrig, endOrig).join(''), match: true });

    lastOrigIdx = endOrig;
    normCursor = pos + q.length;
  }

  if (segments.length === 0) {
    return [{ text, match: false }];
  }
  if (lastOrigIdx < chars.length) {
    segments.push({ text: chars.slice(lastOrigIdx).join(''), match: false });
  }
  return segments;
}

/**
 * Extracts a compact snippet centered around the first match in `text`
 * (used for lesson note previews in search results).
 */
export function extractHighlightedSnippet(
  text: string,
  query: string,
  maxLength = 140
): { hasMatch: boolean; segments: HighlightSegment[] } {
  const all = highlightTextSegments(text, query);
  const firstMatchIdx = all.findIndex((s) => s.match);
  if (firstMatchIdx === -1) {
    return { hasMatch: false, segments: [] };
  }
  if (text.length <= maxLength) {
    return { hasMatch: true, segments: all };
  }

  let charStart = 0;
  for (let i = 0; i < firstMatchIdx; i++) {
    charStart += all[i].text.length;
  }
  const matchLen = all[firstMatchIdx].text.length;
  const contextPad = Math.max(20, Math.floor((maxLength - matchLen) / 2));
  const sliceStart = Math.max(0, charStart - contextPad);
  const sliceEnd = Math.min(text.length, sliceStart + maxLength);

  const prefix = sliceStart > 0 ? '…' : '';
  const suffix = sliceEnd < text.length ? '…' : '';
  const windowText = `${prefix}${text.slice(sliceStart, sliceEnd).trim()}${suffix}`;
  return {
    hasMatch: true,
    segments: highlightTextSegments(windowText, query),
  };
}

export function estimateLessonReadMinutes(lesson: Lesson): number {
  const chunks: string[] = [
    lesson.title,
    lesson.objective,
    ...lesson.body,
    lesson.textExample ?? '',
    ...(lesson.examples ?? []).flatMap((e) => [e.title, e.text]),
    ...lesson.remember,
    ...lesson.quiz.flatMap((q) => [q.q, q.why, ...q.options]),
  ];
  const words = chunks.join(' ').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(2, Math.round(words / 180));
}

export function computeAcademyStats(
  curriculum: readonly LevelLike[],
  progress: LearnProgress,
  exams: ExamStore,
  activeGoal: LearnGoal | null = null
): AcademyStats {
  const allLessons = curriculum.flatMap((l) => l.lessons);
  const totalLessons = allLessons.length;
  let doneLessons = 0;
  let quizSum = 0;
  let quizCount = 0;

  for (const l of allLessons) {
    const p = progress.lessons[l.id];
    if (p?.done) doneLessons++;
    if (typeof p?.best === 'number' && Number.isFinite(p.best)) {
      quizSum += p.best;
      quizCount++;
    }
  }

  const totalExamsCount = curriculum.length + 1;
  let passedExamsCount = exams[FINAL_ID]?.passed ? 1 : 0;
  for (const level of curriculum) {
    if (exams[level.id]?.passed) passedExamsCount++;
  }

  const notes = progress.notes ?? {};
  const notedLessonsCount = allLessons.filter((l) => typeof notes[l.id] === 'string' && notes[l.id].trim().length > 0).length;

  let recommendedLessonId: string | null = null;
  if (activeGoal) {
    const path = LEARN_PATHS[activeGoal];
    recommendedLessonId = path.find((id) => !progress.lessons[id]?.done) ?? null;
  }
  if (!recommendedLessonId) {
    recommendedLessonId = allLessons.find((l) => !progress.lessons[l.id]?.done)?.id ?? null;
  }

  return {
    totalLessons,
    doneLessons,
    todoLessons: totalLessons - doneLessons,
    completionPct: totalLessons > 0 ? Math.round((doneLessons / totalLessons) * 100) : 0,
    averageBestQuizPct: quizCount > 0 ? Math.round(quizSum / quizCount) : null,
    passedExamsCount,
    totalExamsCount,
    notedLessonsCount,
    recommendedLessonId,
  };
}

export function filterCurriculum<V extends LevelLike>(
  curriculum: readonly V[],
  progress: LearnProgress,
  options: {
    query?: string;
    status?: LessonStatusFilter;
    goal?: LearnGoal | null;
    goalOnly?: boolean;
    bookmarkedOnly?: boolean;
  }
): FilteredLevel<V>[] {
  const q = normalizeText(options.query ?? '');
  const status = options.status ?? 'ALL';
  const goalSet = options.goalOnly && options.goal ? new Set(LEARN_PATHS[options.goal]) : null;
  const bookmarkedSet = options.bookmarkedOnly ? new Set(progress.bookmarked ?? []) : null;

  const result: FilteredLevel<V>[] = [];

  for (const level of curriculum) {
    const doneCount = level.lessons.filter((l) => progress.lessons[l.id]?.done).length;
    const levelMatch = q ? normalizeText(`${level.title} ${level.goal}`).includes(q) : false;

    const matchingLessons = level.lessons.filter((lesson) => {
      if (bookmarkedSet && !bookmarkedSet.has(lesson.id)) return false;
      if (goalSet && !goalSet.has(lesson.id)) return false;

      const isDone = !!progress.lessons[lesson.id]?.done;
      if (status === 'DONE' && !isDone) return false;
      if (status === 'TODO' && isDone) return false;

      if (!q || levelMatch) return true;
      const noteText = progress.notes?.[lesson.id] ?? '';
      const haystack = normalizeText(
        [
          lesson.title,
          lesson.objective,
          ...(lesson.instrumentIds ?? []),
          ...(lesson.remember ?? []),
          ...(lesson.body ?? []),
          lesson.textExample ?? '',
          ...(lesson.examples ?? []).flatMap((e) => [e.title, e.text]),
          ...(lesson.uncertain ?? []),
          noteText,
        ].join(' ')
      );
      return haystack.includes(q);
    });

    if (matchingLessons.length > 0) {
      result.push({ level, lessons: matchingLessons, doneCount });
    }
  }

  return result;
}

export function buildFlashcardDeck(
  glossary: readonly GlossaryTerm[],
  slang: readonly SlangEntry[],
  source: FlashcardSourceFilter = 'ALL',
  query = ''
): FlashcardItem[] {
  const q = normalizeText(query);
  const deck: FlashcardItem[] = [];

  if (source === 'ALL' || source === 'FORMAL') {
    for (let i = 0; i < glossary.length; i++) {
      const g = glossary[i];
      if (q && !normalizeText(`${g.term} ${g.def}`).includes(q)) continue;
      deck.push({
        id: `formal:${g.term}`,
        source: 'FORMAL',
        term: g.term,
        definition: g.def,
      });
    }
  }

  if (source === 'ALL' || source === 'SLANG') {
    for (const s of slang) {
      if (q && !normalizeText(`${s.term} ${s.meaning} ${s.example} ${s.related}`).includes(q)) continue;
      deck.push({
        id: `slang:${s.id}`,
        source: 'SLANG',
        term: s.term,
        definition: s.meaning,
        example: s.example,
        warning: s.warning,
        related: s.related,
      });
    }
  }

  return deck;
}

export function shuffleFlashcards(cards: readonly FlashcardItem[], seed: number): FlashcardItem[] {
  const out = cards.slice();
  let a = (seed >>> 0) || 1;
  for (let i = out.length - 1; i > 0; i--) {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    const j = Math.floor(r * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const FLASHCARD_KEY = 'ctap.flashcards.v1';

export function loadMasteredFlashcards(): Set<string> {
  try {
    const raw = window.localStorage.getItem(FLASHCARD_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((x): x is string => typeof x === 'string'));
    }
  } catch {
    // Storage unavailable: keep session-only mastery.
  }
  return new Set();
}

export function saveMasteredFlashcards(ids: Set<string>): void {
  try {
    window.localStorage.setItem(FLASHCARD_KEY, JSON.stringify([...ids]));
  } catch {
    // Storage unavailable: skip.
  }
}
