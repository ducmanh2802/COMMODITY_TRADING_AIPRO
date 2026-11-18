import * as core from './dict/core';
import * as dashboard from './dict/dashboard';
import * as charting from './dict/charting';
import * as data from './dict/data';
import * as contracts from './dict/contracts';
import * as trading from './dict/trading';

/** Vietnamese dictionary (default language). Source of truth for translation keys. */
export const vi = {
  ...core.vi,
  ...dashboard.vi,
  ...charting.vi,
  ...data.vi,
  ...contracts.vi,
  ...trading.vi,
};

export type TKey = keyof typeof vi;
