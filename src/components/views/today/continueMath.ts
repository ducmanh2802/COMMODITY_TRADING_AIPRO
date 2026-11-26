/** Pure logic for the Today "Học tiếp" card: next unfinished lesson + level progress. Uses only the light index. */
import type { LevelMeta } from '../learn/curriculum/types';

export type ContinueState =
  | { kind: 'start'; lessonId: string; title: string; levelNumber: number; done: number; total: number }
  | { kind: 'next'; lessonId: string; title: string; levelNumber: number; done: number; total: number }
  | { kind: 'complete'; levelNumber: number; done: number; total: number };

export function computeContinue(
  index: readonly LevelMeta[],
  lessons: Record<string, { done?: boolean } | undefined>
): ContinueState | null {
  const flat = index.flatMap((level) => level.lessons.map((lesson) => ({ level, lesson })));
  if (flat.length === 0) return null;
  const isDone = (id: string) => lessons[id]?.done === true;
  const anyDone = flat.some((e) => isDone(e.lesson.id));
  const nxt = flat.find((e) => !isDone(e.lesson.id));
  if (!nxt) {
    const last = index[index.length - 1];
    return { kind: 'complete', levelNumber: last.number, done: last.lessons.length, total: last.lessons.length };
  }
  const total = nxt.level.lessons.length;
  const done = nxt.level.lessons.filter((l) => isDone(l.id)).length;
  return {
    kind: anyDone ? 'next' : 'start',
    lessonId: nxt.lesson.id,
    title: nxt.lesson.title,
    levelNumber: nxt.level.number,
    done,
    total,
  };
}
