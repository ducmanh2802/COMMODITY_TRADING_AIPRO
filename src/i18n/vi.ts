import * as core from './dict/core';
import * as dashboard from './dict/dashboard';
import * as charting from './dict/charting';
import * as data from './dict/data';
import * as contracts from './dict/contracts';
import * as trading from './dict/trading';
import * as notebook from './dict/notebook';
import * as ai from './dict/ai';
import * as macro from './dict/macro';
import * as friendly from './dict/friendly';

/** Vietnamese dictionary (default language). Source of truth for translation keys. */
export const vi = {
  ...core.vi,
  ...dashboard.vi,
  ...charting.vi,
  ...data.vi,
  ...contracts.vi,
  ...trading.vi,
  ...notebook.vi,
  ...ai.vi,
  ...macro.vi,
  ...friendly.vi,
};

export type TKey = keyof typeof vi;
