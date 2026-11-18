import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { getLang, setStoredLang, type Lang } from './lang';
import { translate, type TParams } from './translate';
import type { TKey } from './vi';

export type TFunction = (key: TKey, params?: TParams) => string;

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: TFunction;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const initial = getLang();
    setStoredLang(initial); // sync <html lang>
    return initial;
  });

  const setLang = useCallback((next: Lang) => {
    setStoredLang(next); // update module mirror before re-render so fmt helpers see it
    setLangState(next);
  }, []);

  const t = useCallback<TFunction>((key, params) => translate(lang, key, params), [lang]);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

const fallback: I18nContextValue = {
  lang: 'vi',
  setLang: () => {},
  t: (key, params) => translate(getLang(), key, params),
};

/** Language state + setter. Works without a provider (falls back to stored language). */
export function useI18n(): I18nContextValue {
  return useContext(I18nContext) ?? fallback;
}

/** Translation function for the active language: `const t = useT(); t('nav.overview')`. */
export function useT(): TFunction {
  return useI18n().t;
}
