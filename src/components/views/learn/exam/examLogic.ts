/** End-of-level exam logic: deterministic drawing, scoring, unlock rule, storage, verification code. Pure + guarded localStorage. */
import type { Level, QuizQuestion } from '../curriculum/types';

export const EXAMS_KEY = 'ctap.exams.v1';
export const EXAM_PASS_PCT = 80;
export const EXAM_UNLOCK_RATIO = 0.8;
export const LEVEL_EXAM_SIZE = 15;
export const FINAL_EXAM_SIZE = 40;
export const EXAM_MINUTES = 20;
export const FINAL_EXAM_MINUTES = 45;
export const FINAL_ID = 'final';

export interface ExamQuestion {
  lessonId: string;
  question: QuizQuestion;
}

/** Small seeded PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFrom(text: string, attempt: number): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return (h ^ Math.imul(attempt + 1, 0x9e3779b1)) >>> 0;
}

export function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = items.slice();
  const r = rng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const poolOf = (level: Level): ExamQuestion[] => level.lessons.flatMap((ls) => ls.quiz.map((question) => ({ lessonId: ls.id, question })));

/** Draws `size` questions (all if fewer) from one level's lesson quizzes, shuffled by seed(examId, attempt). */
export function drawExam(level: Level, attempt: number, size = LEVEL_EXAM_SIZE): ExamQuestion[] {
  const mixed = shuffled(poolOf(level), seedFrom(level.id, attempt));
  return mixed.slice(0, Math.min(size, mixed.length));
}

/** Final exam: round-robin across levels so every level is covered (size >= number of levels), then shuffled. */
export function drawFinalExam(levels: Level[], attempt: number, size = FINAL_EXAM_SIZE): ExamQuestion[] {
  const seed = seedFrom(FINAL_ID, attempt);
  const pools = levels.map((l, i) => shuffled(poolOf(l), seed + i));
  const picked: ExamQuestion[] = [];
  for (let round = 0; picked.length < size; round++) {
    let added = false;
    for (const p of pools) {
      if (picked.length >= size) break;
      if (round < p.length) {
        picked.push(p[round]);
        added = true;
      }
    }
    if (!added) break;
  }
  return shuffled(picked, seed);
}

export interface ExamScore {
  correct: number;
  total: number;
  pct: number;
  passed: boolean;
}

export function scoreExam(questions: ExamQuestion[], answers: (number | null | undefined)[]): ExamScore {
  const total = questions.length;
  const correct = questions.reduce((n, q, i) => n + (answers[i] === q.question.answer ? 1 : 0), 0);
  const pct = total ? Math.round((correct / total) * 100) : 0;
  return { correct, total, pct, passed: total > 0 && pct >= EXAM_PASS_PCT };
}

/** Unlocked when >= 80% of the lessons are done. */
export function examUnlocked(done: number, total: number): boolean {
  return total > 0 && done / total >= EXAM_UNLOCK_RATIO - 1e-9;
}

type LessonMap = Record<string, { done?: boolean } | undefined>;

export function levelExamUnlocked(level: Level, lessons: LessonMap): boolean {
  return examUnlocked(level.lessons.filter((l) => lessons[l.id]?.done).length, level.lessons.length);
}

/** Final exam unlocks when >= 80% of all lessons are done. */
export function finalUnlocked(levels: Level[], lessons: LessonMap): boolean {
  const all = levels.flatMap((l) => l.lessons);
  return examUnlocked(all.filter((l) => lessons[l.id]?.done).length, all.length);
}

export interface ExamRecord {
  attempts: number;
  /** Best percent. */
  best: number;
  bestCorrect: number;
  bestTotal: number;
  /** ISO date (YYYY-MM-DD) of the best attempt. */
  bestDate: string;
  passed: boolean;
}
export type ExamStore = Record<string, ExamRecord>;

export function applyAttempt(store: ExamStore, examId: string, score: ExamScore, date: string): ExamStore {
  const cur = store[examId];
  const better = !cur || score.pct > cur.best;
  const rec: ExamRecord = {
    attempts: (cur?.attempts ?? 0) + 1,
    best: better ? score.pct : cur.best,
    bestCorrect: better ? score.correct : cur.bestCorrect,
    bestTotal: better ? score.total : cur.bestTotal,
    bestDate: better ? date : cur.bestDate,
    passed: (cur?.passed ?? false) || score.passed,
  };
  return { ...store, [examId]: rec };
}

/** Accepts `{version:1, exams}` or a bare map; drops invalid entries, clamps numbers. */
export function parseExams(raw: string | null): ExamStore {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const o = parsed as Record<string, unknown>;
    const map = (o.exams && typeof o.exams === 'object' ? o.exams : o) as Record<string, unknown>;
    const num = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.round(x)) : d);
    const out: ExamStore = {};
    for (const [id, v] of Object.entries(map)) {
      if (!v || typeof v !== 'object') continue;
      const r = v as Partial<ExamRecord>;
      if (typeof r.best !== 'number' || !Number.isFinite(r.best)) continue;
      const best = Math.min(100, Math.max(0, Math.round(r.best)));
      out[id] = {
        attempts: Math.max(1, num(r.attempts, 1)),
        best,
        bestCorrect: num(r.bestCorrect, 0),
        bestTotal: num(r.bestTotal, 0),
        bestDate: typeof r.bestDate === 'string' ? r.bestDate : '',
        passed: typeof r.passed === 'boolean' ? r.passed : best >= EXAM_PASS_PCT,
      };
    }
    return out;
  } catch {
    return {};
  }
}

export function loadExams(): ExamStore {
  try {
    return parseExams(window.localStorage.getItem(EXAMS_KEY));
  } catch {
    return {};
  }
}

export function saveExams(store: ExamStore): void {
  try {
    window.localStorage.setItem(EXAMS_KEY, JSON.stringify({ version: 1, exams: store }));
  } catch {
    // Storage unavailable: skip.
  }
}

const NAME_KEY = 'ctap.exams.name.v1';
export function loadLearnerName(): string {
  try {
    return window.localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}
export function saveLearnerName(name: string): void {
  try {
    window.localStorage.setItem(NAME_KEY, name);
  } catch {
    // Storage unavailable: skip.
  }
}

/** Short stable verification code from name|level|score|date, e.g. "1A2B-3C4D-5E6F". */
export function verificationCode(name: string, levelKey: string, score: number, date: string): string {
  const s = `${name.trim().toLowerCase()}|${levelKey}|${score}|${date}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
    h2 = (h2 ^ (h2 >>> 13)) >>> 0;
  }
  const hex = (h: number) => h.toString(16).padStart(8, '0');
  const raw = (hex(h1) + hex(h2)).toUpperCase();
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}
