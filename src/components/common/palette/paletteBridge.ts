/** Hand-off from the palette to the Academy view (which may not be mounted yet). */
export interface AcademyIntent {
  lessonId?: string;
  tab?: 'glossary';
}

export const ACADEMY_INTENT_EVENT = 'ctap:academy-intent';

let pending: AcademyIntent | null = null;

export function sendAcademyIntent(intent: AcademyIntent): void {
  pending = intent;
  window.dispatchEvent(new CustomEvent(ACADEMY_INTENT_EVENT));
}

/** Returns and clears the pending intent. */
export function takeAcademyIntent(): AcademyIntent | null {
  const p = pending;
  pending = null;
  return p;
}
