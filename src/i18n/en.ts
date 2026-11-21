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
  ...friendly.en,
  ...brief.en,
  ...scorecard.en,
  ...fedpulse.en,
  ...nav2.en,
  ...papertrade.en,
  ...simple.en,
  ...drivers.en,
  ...hedge.en,
  ...onboarding.en,
  ...radar.en,
  ...world.en,
  ...ordercalc.en,
  ...instrument.en,
  ...benchmark.en,
};
