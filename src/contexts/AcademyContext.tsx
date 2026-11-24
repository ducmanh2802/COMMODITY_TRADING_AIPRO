import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export interface LessonProgress {
  done?: boolean;
  /** Best quiz score, percent. */
  best?: number;
}

export interface LearnProgress {
  lessons: Record<string, LessonProgress>;
  checklist: Record<string, boolean>;
  notes?: Record<string, string>;
  bookmarked?: string[];
}

export const ACADEMY_PROGRESS_KEY = 'learn.progress.v2';

export function createEmptyProgress(): LearnProgress {
  return { lessons: {}, checklist: {}, notes: {}, bookmarked: [] };
}

export function normalizeBookmarked(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && item.trim().length > 0 && !seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

export function normalizeProgress(raw: unknown): LearnProgress {
  if (raw && typeof raw === 'object') {
    const p = raw as Partial<LearnProgress>;
    return {
      lessons: p.lessons && typeof p.lessons === 'object' && !Array.isArray(p.lessons) ? p.lessons : {},
      checklist: p.checklist && typeof p.checklist === 'object' && !Array.isArray(p.checklist) ? p.checklist : {},
      notes: p.notes && typeof p.notes === 'object' && !Array.isArray(p.notes) ? p.notes : {},
      bookmarked: normalizeBookmarked(p.bookmarked),
    };
  }
  return createEmptyProgress();
}

export function loadAcademyProgress(storage?: Storage): LearnProgress {
  try {
    const store = storage ?? window.localStorage;
    const raw = store.getItem(ACADEMY_PROGRESS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return normalizeProgress(parsed);
  } catch {
    // Storage unavailable or corrupt: start empty.
    return createEmptyProgress();
  }
}

export function saveAcademyProgress(p: LearnProgress, storage?: Storage): void {
  try {
    const store = storage ?? window.localStorage;
    store.setItem(ACADEMY_PROGRESS_KEY, JSON.stringify(p));
  } catch {
    // Storage unavailable (private mode / blocked): progress lives only for this session.
  }
}

export function applyLessonScore(progress: LearnProgress, lessonId: string, pct: number): LearnProgress {
  const cur = progress.lessons[lessonId] ?? {};
  return {
    ...progress,
    lessons: {
      ...progress.lessons,
      [lessonId]: {
        ...cur,
        best: Math.max(cur.best ?? 0, pct),
        done: cur.done || pct >= 60,
      },
    },
  };
}

export function toggleLessonDoneState(progress: LearnProgress, lessonId: string): LearnProgress {
  const cur = progress.lessons[lessonId];
  return {
    ...progress,
    lessons: {
      ...progress.lessons,
      [lessonId]: {
        ...cur,
        done: !cur?.done,
      },
    },
  };
}

export function toggleChecklistItem(progress: LearnProgress, key: string): LearnProgress {
  return {
    ...progress,
    checklist: {
      ...progress.checklist,
      [key]: !progress.checklist[key],
    },
  };
}

export function applyLessonNote(progress: LearnProgress, lessonId: string, text: string): LearnProgress {
  const nextNotes = { ...(progress.notes ?? {}) };
  if (text.trim().length === 0) {
    delete nextNotes[lessonId];
  } else {
    nextNotes[lessonId] = text;
  }
  return { ...progress, notes: nextNotes };
}

export function toggleBookmarkState(progress: LearnProgress, lessonId: string): LearnProgress {
  const current = normalizeBookmarked(progress.bookmarked);
  const exists = current.includes(lessonId);
  const nextBookmarked = exists
    ? current.filter((id) => id !== lessonId)
    : lessonId.trim().length > 0
      ? [...current, lessonId]
      : current;
  return { ...progress, bookmarked: nextBookmarked };
}

export interface AcademyContextValue {
  progress: LearnProgress;
  bookmarked: string[];
  updateProgress: (updater: (prev: LearnProgress) => LearnProgress) => void;
  setLessonNote: (lessonId: string, text: string) => void;
  recordLessonScore: (lessonId: string, pct: number) => void;
  toggleLessonDone: (lessonId: string) => void;
  toggleChecklist: (key: string) => void;
  toggleBookmark: (lessonId: string) => void;
  resetProgress: () => void;
}

export const AcademyContext = createContext<AcademyContextValue | null>(null);

export function AcademyProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<LearnProgress>(() => loadAcademyProgress());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === ACADEMY_PROGRESS_KEY || e.key === null) {
        setProgress(loadAcademyProgress());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const updateProgress = useCallback((updater: (prev: LearnProgress) => LearnProgress) => {
    setProgress((prev) => {
      const next = updater(prev);
      saveAcademyProgress(next);
      return next;
    });
  }, []);

  const setLessonNote = useCallback(
    (lessonId: string, text: string) => {
      updateProgress((prev) => applyLessonNote(prev, lessonId, text));
    },
    [updateProgress]
  );

  const recordLessonScore = useCallback(
    (lessonId: string, pct: number) => {
      updateProgress((prev) => applyLessonScore(prev, lessonId, pct));
    },
    [updateProgress]
  );

  const toggleLessonDone = useCallback(
    (lessonId: string) => {
      updateProgress((prev) => toggleLessonDoneState(prev, lessonId));
    },
    [updateProgress]
  );

  const toggleChecklist = useCallback(
    (key: string) => {
      updateProgress((prev) => toggleChecklistItem(prev, key));
    },
    [updateProgress]
  );

  const toggleBookmark = useCallback(
    (lessonId: string) => {
      updateProgress((prev) => toggleBookmarkState(prev, lessonId));
    },
    [updateProgress]
  );

  const resetProgress = useCallback(() => {
    const empty = createEmptyProgress();
    saveAcademyProgress(empty);
    setProgress(empty);
  }, []);

  const bookmarked = useMemo(() => normalizeBookmarked(progress.bookmarked), [progress.bookmarked]);

  const value = useMemo<AcademyContextValue>(
    () => ({
      progress,
      bookmarked,
      updateProgress,
      setLessonNote,
      recordLessonScore,
      toggleLessonDone,
      toggleChecklist,
      toggleBookmark,
      resetProgress,
    }),
    [progress, bookmarked, updateProgress, setLessonNote, recordLessonScore, toggleLessonDone, toggleChecklist, toggleBookmark, resetProgress]
  );

  return <AcademyContext.Provider value={value}>{children}</AcademyContext.Provider>;
}

export function useAcademy(): AcademyContextValue {
  const ctx = useContext(AcademyContext);
  if (!ctx) {
    throw new Error('useAcademy must be used inside AcademyProvider');
  }
  return ctx;
}
