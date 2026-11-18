/**
 * T21 — Fundamental/Macro routes (read-only; server-side cache, no client-triggered refresh).
 *
 *   GET /api/macro/overview → { eia, wasde, fx }
 *   GET /api/macro/eia      → EIA weekly petroleum stocks (OFFICIAL, needs EIA_API_KEY)
 *   GET /api/macro/wasde    → USDA WASDE release calendar + key U.S. ending stocks (OFFICIAL)
 *   GET /api/macro/fx       → DXY (UNOFFICIAL, Yahoo opt-in), SBV central rate (UNAVAILABLE), VCB USD/VND (UNOFFICIAL)
 *
 * Must be registered before the app's `/api` 404 handler.
 */
import type { Express, NextFunction, Request, Response } from 'express';
import { MacroService } from '../macro/service.ts';

export type MacroServiceLike = Pick<MacroService, 'getEia' | 'getWasde' | 'getFx' | 'getOverview'>;

export interface MacroRouteDeps {
  service?: MacroServiceLike;
}

export function registerMacroRoutes(app: Express, deps: MacroRouteDeps = {}): void {
  let instance: MacroServiceLike | null = deps.service ?? null;
  const svc = (): MacroServiceLike => (instance ??= new MacroService());

  const handle =
    (fn: (s: MacroServiceLike) => Promise<unknown>) =>
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        res.json(await fn(svc()));
      } catch (err) {
        next(err);
      }
    };

  app.get('/api/macro/overview', handle((s) => s.getOverview()));
  app.get('/api/macro/eia', handle((s) => s.getEia()));
  app.get('/api/macro/wasde', handle((s) => s.getWasde()));
  app.get('/api/macro/fx', handle((s) => s.getFx()));
}
