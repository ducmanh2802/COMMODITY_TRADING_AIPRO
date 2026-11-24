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

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useCoolOffEnabled(): boolean {
  return useSyncExternalStore(subscribe, getCoolOffEnabled, () => DEFAULT_PREFS.coolOff);
}

type StateLike = Parameters<typeof coolOffTradesFromState>[0];

/** The cool-off verdict right now, honouring the on/off preference (used to block new paper orders). */
export function coolOffNow(state: StateLike, nowMs: number = Date.now()): CoolOffResult | null {
  if (!getCoolOffEnabled()) return null;
  const r = evaluateCoolOff(coolOffTradesFromState(state), nowMs);
  return r.locked ? r : null;
}
