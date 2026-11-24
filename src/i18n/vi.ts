import * as core from './dict/core';
import * as fsstatus from './dict/fsstatus';
import * as freshness from './dict/freshness';
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
import * as telegram from './dict/telegram';
import * as push from './dict/push';
import * as world from './dict/world';
import * as ordercalc from './dict/ordercalc';
import * as benchmark from './dict/benchmark';
import * as domestic from './dict/domestic';
import * as chain from './dict/chain';
import * as instrument from './dict/instrument';
import * as checklist from './dict/checklist';
import * as paperstats from './dict/paperstats';
import * as contest from './dict/contest';
import * as compare from './dict/compare';
import * as drawing from './dict/drawing';
import * as weather from './dict/weather';
import * as news2 from './dict/news2';
import * as pwa from './dict/pwa';
import * as replay from './dict/replay';
import * as uipolish from './dict/uipolish';
import * as sweep from './dict/sweep';
import * as learngoal from './dict/learngoal';
import * as review from './dict/review';
import * as exam from './dict/exam';
import * as backup from './dict/backup';
import * as sessions from './dict/sessions';
import * as lab from './dict/lab';
import * as readability from './dict/readability';
import * as program from './dict/program';

/** Vietnamese dictionary (default language). Source of truth for translation keys. */
export const vi = {
  ...core.vi,
  ...fsstatus.vi,
  ...freshness.vi,
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
  ...watchlist.vi,
  ...telegram.vi,
  ...push.vi,
  ...world.vi,
  ...ordercalc.vi,
  ...instrument.vi,
  ...checklist.vi,
  ...paperstats.vi,
  ...contest.vi,
  ...compare.vi,
  ...drawing.vi,
  ...benchmark.vi,
  ...domestic.vi,
  ...chain.vi,
  ...weather.vi,
  ...news2.vi,
  ...pwa.vi,
  ...replay.vi,
  ...uipolish.vi,
  ...sweep.vi,
  ...learngoal.vi,
  ...review.vi,
  ...exam.vi,
  ...backup.vi,
  ...sessions.vi,
  ...lab.vi,
  ...readability.vi,
  ...program.vi,
};

export type TKey = keyof typeof vi;
