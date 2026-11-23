/** Readability settings for older users: text size + high contrast. Pure helpers (no DOM/React). */
export type TextSize = 'normal' | 'lg' | 'xl';
export type Contrast = 'normal' | 'high';
export interface Readability {
  textSize: TextSize;
  contrast: Contrast;
}

export const TEXT_SIZE_KEY = 'ctap.textSize';
export const CONTRAST_KEY = 'ctap.contrast';
export const TEXT_SIZES: readonly TextSize[] = ['normal', 'lg', 'xl'];
export const DEFAULT_READABILITY: Readability = { textSize: 'normal', contrast: 'normal' };

export function parseTextSize(raw: unknown): TextSize {
  return raw === 'lg' || raw === 'xl' ? raw : 'normal';
}

export function parseContrast(raw: unknown): Contrast {
  return raw === 'high' ? 'high' : 'normal';
}

interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

/** Read both settings; never throws (storage may be blocked). */
export function loadReadability(storage?: StorageLike): Readability {
  try {
    const s = storage ?? (globalThis as { localStorage?: StorageLike }).localStorage;
    if (!s) return { ...DEFAULT_READABILITY };
    return { textSize: parseTextSize(s.getItem(TEXT_SIZE_KEY)), contrast: parseContrast(s.getItem(CONTRAST_KEY)) };
  } catch {
    return { ...DEFAULT_READABILITY };
  }
}

/** Persist both settings; returns false when storage is unavailable. */
export function saveReadability(r: Readability, storage?: StorageLike): boolean {
  try {
    const s = storage ?? (globalThis as { localStorage?: StorageLike }).localStorage;
    if (!s) return false;
    s.setItem(TEXT_SIZE_KEY, r.textSize);
    s.setItem(CONTRAST_KEY, r.contrast);
    return true;
  } catch {
    return false;
  }
}

/** Data attributes to put on <html>; null means "remove the attribute". */
export function readabilityAttrs(r: Readability): { 'data-text-size': string | null; 'data-contrast': string | null } {
  return {
    'data-text-size': r.textSize === 'normal' ? null : r.textSize,
    'data-contrast': r.contrast === 'high' ? 'high' : null,
  };
}
