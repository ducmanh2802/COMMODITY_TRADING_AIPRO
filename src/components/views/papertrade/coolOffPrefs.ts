/**
 * Device-level paper-trading preferences (localStorage 'ctap.paperPrefs.v1', included in the T73 backup as
 * `paperPrefs`). Currently: whether the forced cool-off rule is on (default ON).
 */
import { useSyncExternalStore } from 'react';
import { coolOffTradesFromState, evaluateCoolOff, type CoolOffResult } from './coolOff';

export const PAPER_PREFS_KEY = 'ctap.paperPrefs.v1';

interface PaperPrefs {
  coolOff: boolean;
}

const DEFAULT_PREFS: PaperPrefs = { coolOff: true };
const listeners = new Set<() => void>();
let cache: PaperPrefs | null = null;

function read(): PaperPrefs {
  if (cache) return cache;
  let out = DEFAULT_PREFS;
  try {
    const j = JSON.parse(localStorage.getItem(PAPER_PREFS_KEY) ?? 'null') as Partial<PaperPrefs> | null;
    if (j && typeof j === 'object') out = { coolOff: typeof j.coolOff === 'boolean' ? j.coolOff : DEFAULT_PREFS.coolOff };
  } catch {
    /* storage blocked or corrupt: defaults */
  }
  cache = out;
  return out;
}

export function getCoolOffEnabled(): boolean {
  return read().coolOff;
}

export function setCoolOffEnabled(on: boolean): void {
  cache = { ...read(), coolOff: on };
  try {
    localStorage.setItem(PAPER_PREFS_KEY, JSON.stringify(cache));
  } catch {
    /* not persisted: still applies for this tab */
  }
  listeners.forEach((l) => l());
}

/** Exported for tests. */
export function subscribeCoolOffPrefs(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/**
 * Another tab changed the prefs (or cleared storage): drop the module cache and notify subscribers so this tab
 * re-reads localStorage. Exported for tests.
 */
export function handlePaperPrefsStorageEvent(e: { key: string | null }): void {
  if (e.key !== null && e.key !== PAPER_PREFS_KEY) return;
  cache = null;
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', handlePaperPrefsStorageEvent);
}

export function useCoolOffEnabled(): boolean {
  return useSyncExternalStore(subscribeCoolOffPrefs, getCoolOffEnabled, () => DEFAULT_PREFS.coolOff);
}

type StateLike = Parameters<typeof coolOffTradesFromState>[0];

/** The cool-off verdict right now, honouring the on/off preference (used to block new paper orders). */
export function coolOffNow(state: StateLike, nowMs: number = Date.now()): CoolOffResult | null {
  if (!getCoolOffEnabled()) return null;
  const r = evaluateCoolOff(coolOffTradesFromState(state), nowMs);
  return r.locked ? r : null;
}
