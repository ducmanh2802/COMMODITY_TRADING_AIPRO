/** GET /api/radar: "Radar thị trường sôi động" (see server/services/radar). Served stale-while-revalidate like /api/today. */
import type { Express, NextFunction, Request, Response } from 'express';
import type { RadarResponse } from '../../src/shared/types/radar.ts';
import { RADAR_TTL_MS, buildRadar, createRadarState, type RadarDeps } from '../services/radar/service.ts';
import { SwrCache } from '../services/swrCache.ts';

export function registerRadarRoutes(app: Express, deps: RadarDeps): SwrCache<RadarResponse> {
  const state = createRadarState();
  const cache = new SwrCache<RadarResponse>({
    compute: () => buildRadar(deps, state),
    ttlMs: RADAR_TTL_MS,
    now: () => (deps.now ?? (() => new Date()))().getTime(),
    timeoutMs: 120_000,
  });
  app.get('/api/radar', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const snap = await cache.get();
      res.json({ ...snap.value, asOf: snap.asOf, stale: snap.stale });
    } catch (err) {
      next(err);
    }
  });
  return cache;
}
