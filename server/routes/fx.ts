/**
 * T49 — FX routes for commodity-relevant currency pairs.
 *
 *   GET /api/fx/rates → { retrievedAt, rates: FxRateResult[] }
 *
 * Must be registered before the app's `/api` 404 handler.
 */
import type { Express, NextFunction, Request, Response } from 'express';
import { FxService } from '../services/fx/service.ts';

type FxServiceLike = Pick<FxService, 'getAllRates'>;

export interface FxRouteDeps {
  service?: FxServiceLike;
}

export function registerFxRoutes(app: Express, deps: FxRouteDeps = {}): void {
  let instance: FxServiceLike | null = deps.service ?? null;
  const svc = (): FxServiceLike => (instance ??= new FxService());

  const handle =
    (fn: (s: FxServiceLike) => Promise<unknown>) =>
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        res.json(await fn(svc()));
      } catch (err) {
        next(err);
      }
    };

  app.get('/api/fx/rates', handle(async (s) => ({ retrievedAt: new Date().toISOString(), rates: await s.getAllRates() })));
}