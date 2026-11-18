export type Lang = 'vi' | 'en';

export const LANGS: Lang[] = ['vi', 'en'];
export const DEFAULT_LANG: Lang = 'vi';
const STORAGE_KEY = 'ui.lang';

let current: Lang = readStoredLang();

function readStoredLang(): Lang {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    return v === 'en' || v === 'vi' ? v : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

/** Current UI language (module-level mirror of the provider state, for non-hook helpers). */
export function getLang(): Lang {
  return current;
}

export function setStoredLang(lang: Lang): void {
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* storage unavailable (private mode etc.): keep in memory only */
  }
  try {
    document.documentElement.lang = lang;
  } catch {
    /* non-DOM environment */
  }
}
