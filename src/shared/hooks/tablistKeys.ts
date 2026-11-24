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
