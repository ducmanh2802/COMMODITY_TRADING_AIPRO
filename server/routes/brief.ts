/**
 * GET /api/analysis/brief/:instrumentId — deterministic "Phân tích chi tiết" brief (see
 * server/services/brief). Accepts an instrument id (CBOT:ZC) or exchange symbol (ZC).
 */
import type { Express, NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { buildAnalysisBrief, type BriefDeps } from '../services/brief/briefService.ts';

const Param = z.string().min(1).max(24).regex(/^[a-zA-Z0-9:_-]+$/);

export function registerBriefRoutes(app: Express, deps: BriefDeps): void {
  app.get('/api/analysis/brief/:instrumentId', async (req: Request, res: Response, next: NextFunction) => {
    const id = Param.safeParse(req.params.instrumentId);
    if (!id.success) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid instrumentId parameter.' });
      return;
    }
    try {
      const brief = await buildAnalysisBrief(deps, id.data);
      if (!brief) {
        res.status(404).json({ error: 'INSTRUMENT_NOT_FOUND', message: `Instrument ${id.data} is not registered.` });
        return;
      }
      res.json(brief);
    } catch (err) {
      next(err);
    }
  });
}
