import { useEffect, useRef, type RefObject } from 'react';
import { FOCUSABLE_SELECTOR, trapTabTarget } from './focusTrapLogic';

interface Options {
  /** Called on Escape. */
  onEscape?: () => void;
  /** Keep Tab inside the container (modal dialogs). Default true. */
  trap?: boolean;
  /** Move focus into the container on open. Default true. */
  autoFocus?: boolean;
}

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

/** While `active`: focus moves into `ref`, Tab is trapped, Escape calls onEscape, focus returns to the trigger on close. */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean, opts: Options = {}) {
  const escRef = useRef(opts.onEscape);
  escRef.current = opts.onEscape;
  const trap = opts.trap ?? true;
  const autoFocus = opts.autoFocus ?? true;

  useEffect(() => {
    if (!active) return undefined;
    const root = ref.current;
    if (!root) return undefined;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (autoFocus && !root.contains(document.activeElement)) {
      const first = focusables(root)[0];
      if (first) first.focus();
      else {
        if (!root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1');
        root.focus();
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (e.defaultPrevented) return;
        escRef.current?.();
        return;
      }
      if (e.key !== 'Tab' || !trap) return;
      const items = focusables(root);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const idx = items.indexOf(document.activeElement as HTMLElement);
      const target = trapTabTarget(items.length, idx, e.shiftKey);
      if (target >= 0) {
        e.preventDefault();
        items[target].focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (trigger && trigger.isConnected) trigger.focus();
    };
  }, [active, ref, trap, autoFocus]);
}
