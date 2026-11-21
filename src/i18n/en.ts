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
import * as watchlist from './dict/watchlist';
import * as world from './dict/world';
import * as ordercalc from './dict/ordercalc';
import * as benchmark from './dict/benchmark';
import * as domestic from './dict/domestic';
import * as chain from './dict/chain';
import * as instrument from './dict/instrument';
import * as checklist from './dict/checklist';
import * as paperstats from './dict/paperstats';
import * as compare from './dict/compare';
import * as drawing from './dict/drawing';
import * as weather from './dict/weather';
import * as news2 from './dict/news2';
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
  ...watchlist.en,
  ...world.en,
  ...ordercalc.en,
  ...instrument.en,
  ...checklist.en,
  ...paperstats.en,
  ...compare.en,
  ...drawing.en,
  ...benchmark.en,
  ...domestic.en,
  ...chain.en,
  ...weather.en,
  ...news2.en,
};
