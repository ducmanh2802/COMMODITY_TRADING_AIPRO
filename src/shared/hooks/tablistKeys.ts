import type { KeyboardEvent } from 'react';
import { tabKeyTarget } from './focusTrapLogic';

/** onKeyDown for a role="tablist" container: arrows/Home/End move focus and activate the tab (click). */
export function onTablistKeyDown(e: KeyboardEvent<HTMLElement>): void {
  const tabs = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]:not([disabled])'));
  const cur = tabs.indexOf(document.activeElement as HTMLElement);
  if (cur < 0) return;
  const next = tabKeyTarget(e.key, tabs.length, cur);
  if (next === null) return;
  e.preventDefault();
  tabs[next].focus();
  tabs[next].click();
}

const observers = new WeakMap<HTMLElement, MutationObserver>();

function syncRoving(list: HTMLElement): void {
  const tabs = Array.from(list.querySelectorAll<HTMLElement>('[role="tab"]'));
  if (!tabs.length) return;
  const sel = tabs.find(t => t.getAttribute('aria-selected') === 'true') ?? tabs[0];
  for (const t of tabs) {
    const want = t === sel ? '0' : '-1';
    if (t.getAttribute('tabindex') !== want) t.setAttribute('tabindex', want);
  }
}

/** Stable ref callback for role="tablist": roving tabindex (selected tab 0, others -1), kept in sync via MutationObserver. */
export function tablistRef(el: HTMLElement | null): void {
  if (!el) return;
  if (observers.has(el)) { syncRoving(el); return; }
  syncRoving(el);
  const mo = new MutationObserver(() => syncRoving(el));
  mo.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-selected'] });
  observers.set(el, mo);
}
