/** Pure helpers for focus trapping and tablist arrow keys (unit-testable without a DOM). */

export const FOCUSABLE_SELECTOR =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Index to focus after Tab / Shift+Tab inside a trap of `count` items; -1 when the browser default is fine. */
export function trapTabTarget(count: number, current: number, shift: boolean): number {
  if (count <= 0) return -1;
  if (current < 0) return shift ? count - 1 : 0;
  if (shift && current === 0) return count - 1;
  if (!shift && current === count - 1) return 0;
  return -1;
}

/** Target tab index for a tablist key press; null when the key is not a navigation key. */
export function tabKeyTarget(key: string, count: number, current: number): number | null {
  if (count <= 0) return null;
  const cur = current < 0 ? 0 : current;
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return (cur + 1) % count;
    case 'ArrowLeft':
    case 'ArrowUp':
      return (cur - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}
