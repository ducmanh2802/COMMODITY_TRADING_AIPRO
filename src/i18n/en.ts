import * as core from './dict/core';
import * as dashboard from './dict/dashboard';
import * as charting from './dict/charting';
import * as data from './dict/data';
import * as contracts from './dict/contracts';
import * as trading from './dict/trading';
import * as notebook from './dict/notebook';
import * as ai from './dict/ai';
import * as macro from './dict/macro';
import type { TKey } from './vi';

/** English dictionary. Typed against the Vietnamese keys so nothing can be missing. */
export const en: Record<TKey, string> = {
  ...core.en,
  ...dashboard.en,
  ...charting.en,
  ...data.en,
  ...contracts.en,
  ...trading.en,
  ...notebook.en,
  ...ai.en,
  ...macro.en,
};
