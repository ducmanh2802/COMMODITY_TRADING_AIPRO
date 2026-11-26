import { CURRICULUM_INDEX } from './indexData';
import type { LessonMeta, LevelMeta } from './types';

export { CURRICULUM_INDEX };
export type { LessonMeta, LevelMeta };

/** Light lookups over the Academy index (no lesson bodies / quizzes). */
export const ALL_LESSON_META: readonly { level: LevelMeta; lesson: LessonMeta }[] = CURRICULUM_INDEX.flatMap((level) =>
  level.lessons.map((lesson) => ({ level, lesson }))
);
export const LESSON_META_BY_ID: ReadonlyMap<string, { level: LevelMeta; lesson: LessonMeta }> = new Map(ALL_LESSON_META.map((e) => [e.lesson.id, e]));
export const LESSON_TITLES: ReadonlyMap<string, string> = new Map(ALL_LESSON_META.map((e) => [e.lesson.id, e.lesson.title]));
export const LESSONS_TOTAL = ALL_LESSON_META.length;
