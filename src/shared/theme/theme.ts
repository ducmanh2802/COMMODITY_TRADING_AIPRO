import { useSyncExternalStore } from 'react';

/** App colour theme. Dark is the default; the choice is remembered per browser. */
export type Theme = 'dark' | 'light';
const THEME_KEY = 'ctap.theme';

const listeners = new Set<() => void>();

function current(): Theme {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function setTheme(t: Theme): void {
  if (t === 'light') document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
  try {
    window.localStorage.setItem(THEME_KEY, t);
  } catch {
    /* storage unavailable: keep for this session only */
  }
  listeners.forEach((l) => l());
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const theme = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    current,
    () => 'dark' as Theme
  );
  return [theme, setTheme];
}
