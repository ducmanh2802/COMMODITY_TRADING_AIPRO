/** GET /api/market-pulse: "Tình hình tài chính thế giới" (see server/services/marketPulse). Served stale-while-revalidate. */
import type { Express, NextFunction, Request, Response } from 'express';
import type { MarketPulse } from '../../src/shared/types/marketPulse.ts';
import { PULSE_TTL_MS, buildMarketPulse, type MarketPulseDeps } from '../services/marketPulse/service.ts';
import { SwrCache } from '../services/swrCache.ts';

export function registerMarketPulseRoutes(app: Express, deps: MarketPulseDeps): SwrCache<MarketPulse> {
  const cache = new SwrCache<MarketPulse>({
    compute: () => buildMarketPulse(deps),
    ttlMs: PULSE_TTL_MS,
    now: () => (deps.now ?? (() => new Date()))().getTime(),
  });
  app.get('/api/market-pulse', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const snap = await cache.get();
      res.json({ ...snap.value, asOf: snap.asOf, stale: snap.stale });
    } catch (err) {
      next(err);
    }
  });
  return cache;
}
