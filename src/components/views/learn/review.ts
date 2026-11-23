/** Spaced repetition (Leitner boxes) for quiz questions. Pure logic + guarded localStorage. */

export const REVIEW_KEY = 'ctap.review.v1';
const DAY_MS = 86_400_000;
/** Days until next review for box 1, 2, 3. Passing box 3 retires the item. */
export const BOX_DAYS = [1, 3, 7] as const;

export interface ReviewItem {
  id: string;
  lessonId: string;
  qHash: string;
  /** 1..3 */
  box: number;
  due: number;
}
export type ReviewState = Record<string, ReviewItem>;

/** FNV-1a 32-bit hash of the question text, base36. */
export function hashQuestion(q: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < q.length; i++) {
    h ^= q.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export function questionId(lessonId: string, q: string): string {
  return `${lessonId}:${hashQuestion(q)}`;
}

/** Pure: returns next state after an answer. */
export function recordAnswer(state: ReviewState, lessonId: string, q: string, correct: boolean, now: number): ReviewState {
  const id = questionId(lessonId, q);
  const cur = state[id];
  if (!correct) {
    return { ...state, [id]: { id, lessonId, qHash: hashQuestion(q), box: 1, due: now + BOX_DAYS[0] * DAY_MS } };
  }
  if (!cur) return state; // correct on a question never failed: nothing to schedule
  if (cur.box >= BOX_DAYS.length) {
    const rest = { ...state };
    delete rest[id];
    return rest;
  }
  const box = cur.box + 1;
  return { ...state, [id]: { ...cur, box, due: now + BOX_DAYS[box - 1] * DAY_MS } };
}

export function dueItems(state: ReviewState, now: number): ReviewItem[] {
  return Object.values(state)
    .filter((i) => i.due <= now)
    .sort((a, b) => a.due - b.due);
}

/** Parse/migrate stored JSON. Accepts `{version:1, items}` or a bare item map; drops invalid entries. */
export function parseReview(raw: string | null): ReviewState {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const o = parsed as Record<string, unknown>;
    const map = (o.items && typeof o.items === 'object' ? o.items : o) as Record<string, unknown>;
    const out: ReviewState = {};
    for (const [id, v] of Object.entries(map)) {
      if (!v || typeof v !== 'object') continue;
      const it = v as Partial<ReviewItem>;
      if (typeof it.lessonId !== 'string' || typeof it.qHash !== 'string' || typeof it.due !== 'number' || !Number.isFinite(it.due)) continue;
      const box = typeof it.box === 'number' ? Math.min(BOX_DAYS.length, Math.max(1, Math.round(it.box))) : 1;
      out[id] = { id, lessonId: it.lessonId, qHash: it.qHash, box, due: it.due };
    }
    return out;
  } catch {
    return {};
  }
}

export function loadReview(): ReviewState {
  try {
    return parseReview(window.localStorage.getItem(REVIEW_KEY));
  } catch {
    return {};
  }
}

export function saveReview(state: ReviewState): void {
  try {
    window.localStorage.setItem(REVIEW_KEY, JSON.stringify({ version: 1, items: state }));
  } catch {
    // Storage unavailable: skip.
  }
}

/** Load, apply answer, persist. Returns the new state. */
export function recordAnswerStored(lessonId: string, q: string, correct: boolean, now = Date.now()): ReviewState {
  const next = recordAnswer(loadReview(), lessonId, q, correct, now);
  saveReview(next);
  return next;
}
