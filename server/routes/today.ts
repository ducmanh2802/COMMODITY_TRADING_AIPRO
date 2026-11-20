/** GET /api/today: scorecard + cycle overview for the Today panel, both served stale-while-revalidate (one round-trip). */
import type { Express, NextFunction, Request, Response } from 'express';
import type { CycleMarketOverview } from '../../src/shared/types/cycle.ts';
import type { ScorecardListResponse } from '../../src/shared/types/scorecard.ts';
import type { TodayResponse } from '../../src/shared/types/today.ts';
import { SCORECARD_DISCLAIMER } from '../services/scorecard/scoring.ts';
import { SCORECARD_TTL_MS } from '../services/scorecard/scorecardService.ts';
import type { Scorecard } from '../../src/shared/types/scorecard.ts';
import type { SwrCache } from '../services/swrCache.ts';

export interface TodayRouteDeps {
  scorecards: SwrCache<Scorecard[]>;
  cycle: SwrCache<CycleMarketOverview> | null;
}

export async function buildToday(deps: TodayRouteDeps): Promise<TodayResponse> {
  const [s, c] = await Promise.allSettled([deps.scorecards.get(), deps.cycle ? deps.cycle.get() : Promise.reject(new Error('no cycle'))]);
  const scorecard: ScorecardListResponse | null =
    s.status === 'fulfilled'
      ? {
          generatedAt: s.value.asOf,
          asOf: s.value.asOf,
          stale: s.value.stale,
          cacheTtlSeconds: SCORECARD_TTL_MS / 1000,
          count: s.value.value.length,
          scorecards: s.value.value,
          disclaimer: SCORECARD_DISCLAIMER,
        }
      : null;
  const cycle = c.status === 'fulfilled' ? c.value.value : null;
  const asOfs = [s.status === 'fulfilled' ? s.value.asOf : null, c.status === 'fulfilled' ? c.value.asOf : null].filter((x): x is string => x !== null);
  return {
    asOf: asOfs.length ? asOfs.sort()[0] : null,
    stale: (s.status === 'fulfilled' && s.value.stale) || (c.status === 'fulfilled' && c.value.stale),
    scorecard,
    cycle,
  };
}

export function registerTodayRoutes(app: Express, deps: TodayRouteDeps): void {
  app.get('/api/today', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await buildToday(deps));
    } catch (err) {
      next(err);
    }
  });
}
