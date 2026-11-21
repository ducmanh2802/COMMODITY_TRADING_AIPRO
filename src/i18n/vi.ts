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
import * as brief from './dict/brief';
import * as scorecard from './dict/scorecard';
import * as fedpulse from './dict/fedpulse';
import * as nav2 from './dict/nav2';
import * as papertrade from './dict/papertrade';
import * as simple from './dict/simple';
import * as drivers from './dict/drivers';
import * as hedge from './dict/hedge';
import * as onboarding from './dict/onboarding';
import * as radar from './dict/radar';
import * as world from './dict/world';
import * as ordercalc from './dict/ordercalc';
import * as benchmark from './dict/benchmark';
import * as instrument from './dict/instrument';

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
  ...brief.vi,
  ...scorecard.vi,
  ...fedpulse.vi,
  ...nav2.vi,
  ...papertrade.vi,
  ...simple.vi,
  ...drivers.vi,
  ...hedge.vi,
  ...onboarding.vi,
  ...radar.vi,
  ...world.vi,
  ...ordercalc.vi,
  ...instrument.vi,
  ...benchmark.vi,
};

export type TKey = keyof typeof vi;
