/**
 * Client-side radar feed (T64): polls /api/radar every 5 minutes (paused while the tab is hidden), diffs against the
 * previous poll and exposes notifications to the TopBar bell and the radar view. Settings live in localStorage.
 */
import { useSyncExternalStore } from 'react';
import { fetchJsonWithRetry } from '../../shared/utils/http';
import { diffRadar, type RadarNote, type RadarSnapshot } from '../../shared/radar/notify';
import type { RadarResponse } from '../../shared/types/radar';

export const RADAR_POLL_MS = 5 * 60_000;
const SETTINGS_KEY = 'radar.settings.v1';
const MAX_NOTES = 30;

export interface RadarSettings {
  muted: string[];
  browserNotify: boolean;
}
export interface RadarState {
  data: RadarResponse | null;
  loading: boolean;
  error: string | null;
  notes: RadarNote[];
  unread: number;
  /** Notes to show as toasts right now. */
  toasts: RadarNote[];
  settings: RadarSettings;
}

function loadSettings(): RadarSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<RadarSettings>;
      return { muted: Array.isArray(p.muted) ? p.muted.filter((x) => typeof x === 'string') : [], browserNotify: p.browserNotify === true };
    }
  } catch {
    /* storage blocked */
  }
  return { muted: [], browserNotify: false };
}
function saveSettings(s: RadarSettings): void {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* storage blocked */
  }
}

let state: RadarState = { data: null, loading: false, error: null, notes: [], unread: 0, toasts: [], settings: { muted: [], browserNotify: false } };
let settingsLoaded = false;
let snapshot: RadarSnapshot | null = null;
let timer: number | null = null;
let lastFetch = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(patch: Partial<RadarState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
function ensureSettings(): void {
  if (settingsLoaded || typeof window === 'undefined') return;
  settingsLoaded = true;
  state = { ...state, settings: loadSettings() };
}

function browserNotify(notes: RadarNote[]): void {
  try {
    if (!state.settings.browserNotify || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    for (const n of notes.slice(0, 3)) new Notification('Radar thị trường', { body: n.text, tag: n.id });
  } catch {
    /* unsupported */
  }
}

export function refreshRadar(): Promise<void> {
  ensureSettings();
  if (inflight) return inflight;
  set({ loading: true });
  inflight = fetchJsonWithRetry<RadarResponse>('/api/radar')
    .then((data) => {
      lastFetch = Date.now();
      const { notes, next } = diffRadar(snapshot, data.items, state.settings.muted);
      snapshot = next;
      set({
        data,
        error: null,
        loading: false,
        notes: [...notes, ...state.notes].slice(0, MAX_NOTES),
        unread: state.unread + notes.length,
        toasts: [...state.toasts, ...notes].slice(-3),
      });
      browserNotify(notes);
    })
    .catch((err: unknown) => set({ loading: false, error: err instanceof Error ? err.message : 'Không tải được radar' }))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Starts polling (idempotent). Returns a stop function. */
export function startRadarPolling(): () => void {
  ensureSettings();
  if (timer !== null) return () => undefined;
  void refreshRadar();
  const tick = () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    void refreshRadar();
  };
  timer = window.setInterval(tick, RADAR_POLL_MS);
  const onVis = () => {
    if (!document.hidden && Date.now() - lastFetch >= RADAR_POLL_MS) void refreshRadar();
  };
  document.addEventListener('visibilitychange', onVis);
  return () => {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
    document.removeEventListener('visibilitychange', onVis);
  };
}

export const markRadarRead = (): void => set({ unread: 0 });
export const dismissToast = (id: string): void => set({ toasts: state.toasts.filter((t) => t.id !== id) });
export const clearRadarNotes = (): void => set({ notes: [], unread: 0, toasts: [] });

export function toggleMute(instrumentId: string): void {
  ensureSettings();
  const muted = state.settings.muted.includes(instrumentId) ? state.settings.muted.filter((m) => m !== instrumentId) : [...state.settings.muted, instrumentId];
  const settings = { ...state.settings, muted };
  saveSettings(settings);
  set({ settings });
}

/** Explicit user action: asks the browser for permission, only then turns browser notifications on. */
export async function enableBrowserNotify(): Promise<'granted' | 'denied' | 'unsupported'> {
  ensureSettings();
  if (typeof Notification === 'undefined') return 'unsupported';
  let perm: NotificationPermission = Notification.permission;
  try {
    if (perm === 'default') perm = await Notification.requestPermission();
  } catch {
    return 'denied';
  }
  const on = perm === 'granted';
  const settings = { ...state.settings, browserNotify: on };
  saveSettings(settings);
  set({ settings });
  return on ? 'granted' : 'denied';
}
export function disableBrowserNotify(): void {
  ensureSettings();
  const settings = { ...state.settings, browserNotify: false };
  saveSettings(settings);
  set({ settings });
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function useRadar(): RadarState {
  ensureSettings();
  return useSyncExternalStore(subscribe, () => state, () => state);
}
