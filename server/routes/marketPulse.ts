/** GET /api/market-pulse: "Tình hình tài chính thế giới" (see server/services/marketPulse). */
import type { Express, NextFunction, Request, Response } from 'express';
import { buildMarketPulse, type MarketPulseDeps } from '../services/marketPulse/service.ts';

export function registerMarketPulseRoutes(app: Express, deps: MarketPulseDeps): void {
  app.get('/api/market-pulse', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await buildMarketPulse(deps));
    } catch (err) {
      next(err);
    }
  });
}
