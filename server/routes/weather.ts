/**
 * T90 - GET /api/weather/regions -> { retrievedAt, regions: WeatherRegionResult[] }
 * Must be registered before the app's `/api` 404 handler.
 */
import type { Express, NextFunction, Request, Response } from 'express';
import { WeatherService } from '../services/weather/service.ts';

export interface WeatherRouteDeps {
  service?: Pick<WeatherService, 'getRegions'>;
}

export function registerWeatherRoutes(app: Express, deps: WeatherRouteDeps = {}): { warm: () => Promise<void> } {
  let instance = deps.service ?? null;
  app.get('/api/weather/regions', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      instance ??= new WeatherService();
      res.json(await instance.getRegions());
    } catch (err) {
      next(err);
    }
  });
  // Background warmer (server.ts runs app.locals.warmers): fills the slow climate baselines before a user opens the tab.
  return {
    warm: async () => {
      try {
        instance ??= new WeatherService();
        await instance.getRegions();
      } catch {
        /* best effort */
      }
    },
  };
}
