import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/** 'simple' = "Dễ dùng" (default, big text, traffic lights); 'pro' = "Chuyên sâu" (the full terminal UI). */
export type UiMode = 'simple' | 'pro';

export const UI_MODE_KEY = 'ctap.uiMode';

export function readUiMode(): UiMode {
  try {
    const v = window.localStorage.getItem(UI_MODE_KEY);
    void v;
    return 'pro'; // single UI mode: the toggle was removed (2026-11-21)
  } catch {
    return 'pro';
  }
}

interface UiModeValue {
  mode: UiMode;
  setMode: (m: UiMode) => void;
}

const UiModeContext = createContext<UiModeValue | null>(null);

export function UiModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<UiMode>(readUiMode);
  const setMode = useCallback((m: UiMode) => {
    setModeState(m);
    try {
      window.localStorage.setItem(UI_MODE_KEY, m);
    } catch {
      /* storage unavailable: keep in-memory state only */
    }
  }, []);
  const value = useMemo(() => ({ mode, setMode }), [mode, setMode]);
  return <UiModeContext.Provider value={value}>{children}</UiModeContext.Provider>;
}

export function useUiMode(): UiModeValue {
  return useContext(UiModeContext) ?? { mode: 'pro', setMode: () => {} };
}
