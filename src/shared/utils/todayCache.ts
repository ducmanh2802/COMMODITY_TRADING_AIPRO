import type { TodayResponse } from '../types/today';

const KEY = 'ctap.todayCache.v1';
/** Cached snapshots older than this are ignored, so stale prices are never shown as current for long. */
const MAX_AGE_MS = 30 * 60_000;

interface Stored {
  savedAt: number;
  data: TodayResponse;
}

/** Last /api/today snapshot (<= 30 min old) so returning users see real content before the network answers. */
export function readTodayCache(now = Date.now()): TodayResponse | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Stored;
    if (!s || typeof s.savedAt !== 'number' || now - s.savedAt > MAX_AGE_MS || now < s.savedAt) return null;
    return s.data?.scorecard ? s.data : null;
  } catch {
    return null;
  }
}

/** Stores the snapshot after first paint (stringify is not free). Silent on quota/privacy errors. */
export function writeTodayCache(data: TodayResponse): void {
  const save = () => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), data } satisfies Stored));
    } catch {
      /* quota or private mode: caching is best-effort */
    }
  };
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(save, { timeout: 4000 });
  else window.setTimeout(save, 1500);
}

export function clearTodayCache(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
