export interface LessonProgress {
  done?: boolean;
  /** Best quiz score, percent. */
  best?: number;
}

export interface LearnProgress {
  lessons: Record<string, LessonProgress>;
  checklist: Record<string, boolean>;
}

const KEY = 'learn.progress.v2';
const EMPTY: LearnProgress = { lessons: {}, checklist: {} };

export function loadProgress(): LearnProgress {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') {
      const p = parsed as Partial<LearnProgress>;
      return { lessons: p.lessons && typeof p.lessons === 'object' ? p.lessons : {}, checklist: p.checklist && typeof p.checklist === 'object' ? p.checklist : {} };
    }
  } catch {
    // Storage unavailable or corrupt: start empty.
  }
  return { ...EMPTY, lessons: {}, checklist: {} };
}

export function saveProgress(p: LearnProgress) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Storage unavailable (private mode / blocked): progress lives only for this session.
  }
}
