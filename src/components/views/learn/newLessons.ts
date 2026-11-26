/**
 * Lessons inserted into existing levels after some learners had already finished them (2026-11-26).
 * They are optional catch-up items: they never re-lock an exam, pull "Học tiếp" backwards, or make a completed
 * level look unfinished. Progress storage is unchanged (a lesson is "new" while it has no `done` flag).
 */
export const NEW_LESSON_IDS: ReadonlySet<string> = new Set([
  'l2-limits-slippage',
  'l2-margin-call',
  'l4-usda-reports',
  'l4-eia-weekly',
  'l4-dxy-fed',
  'l4-fx-vnd-pnl',
  'l4-calendar-spread',
  'l4-inter-spreads',
  'l4-cot-positioning',
  'l5-basis-hedge',
  'l5-hedge-vn-firms',
  'l5-case-wti-negative',
  'l5-case-lme-nickel',
  'l5-case-cocoa-rally',
]);

type LessonMap = Record<string, { done?: boolean } | undefined>;

/** True while the lesson is a not-yet-finished late addition ("Mới"). */
export function isPendingNew(lessonId: string, lessons: LessonMap): boolean {
  return NEW_LESSON_IDS.has(lessonId) && lessons[lessonId]?.done !== true;
}

/**
 * Done/total used for exam unlock gating: pending new lessons are left out of the total, so a learner who met the
 * 80% rule before the additions still meets it. Finishing a new lesson counts normally.
 */
export function gateCounts(items: readonly { id: string }[], lessons: LessonMap): { done: number; total: number } {
  const base = items.filter((l) => !isPendingNew(l.id, lessons));
  return { done: base.filter((l) => lessons[l.id]?.done === true).length, total: base.length };
}
