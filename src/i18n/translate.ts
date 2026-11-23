import { getLang, type Lang } from './lang';
import { vi, type TKey } from './vi';

export type TParams = Record<string, string | number | null | undefined>;

/** English dictionary is loaded on demand (see `loadEnglish`); until then English falls back to Vietnamese. */
let enDict: Record<TKey, string> | null = null;
let enLoading: Promise<void> | null = null;

/** Load the English dictionary (idempotent). Resolves once `translate('en', …)` can use it. */
export function loadEnglish(): Promise<void> {
  if (enDict) return Promise.resolve();
  enLoading ??= import('./en')
    .then((m) => {
      enDict = m.en;
    })
    .catch((err) => {
      enLoading = null; // allow retry
      throw err;
    });
  return enLoading;
}

export function isEnglishLoaded(): boolean {
  return enDict !== null;
}

/** Translate a key in a given language; `{name}` placeholders are replaced from params. */
export function translate(lang: Lang, key: TKey, params?: TParams): string {
  const template = (lang === 'en' ? enDict?.[key] : vi[key]) ?? vi[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) => {
    const v = params[name];
    return v === null || v === undefined ? m : String(v);
  });
}

/** Non-hook translate using the current language. Prefer `useT()` inside components. */
export function tr(key: TKey, params?: TParams): string {
  return translate(getLang(), key, params);
}

/** True when a string is a known translation key (for mapping dynamic codes to labels). */
export function hasKey(key: string): key is TKey {
  return Object.prototype.hasOwnProperty.call(vi, key);
}
