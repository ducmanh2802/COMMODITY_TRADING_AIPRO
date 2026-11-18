import { en } from './en';
import { getLang, type Lang } from './lang';
import { vi, type TKey } from './vi';

export type TParams = Record<string, string | number | null | undefined>;

const DICTS: Record<Lang, Record<TKey, string>> = { vi, en };

/** Translate a key in a given language; `{name}` placeholders are replaced from params. */
export function translate(lang: Lang, key: TKey, params?: TParams): string {
  const template = DICTS[lang][key] ?? vi[key] ?? key;
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
