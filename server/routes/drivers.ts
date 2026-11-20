/** GET /api/drivers/:instrumentId — "Vì sao & sắp tới" (T56). See server/services/drivers. */
import type { Express, NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { buildDrivers, type DriversDeps } from '../services/drivers/service.ts';

const Param = z.string().min(1).max(24).regex(/^[a-zA-Z0-9:_-]+$/);

export function registerDriversRoutes(app: Express, deps: DriversDeps): void {
  app.get('/api/drivers/:instrumentId', async (req: Request, res: Response, next: NextFunction) => {
    const id = Param.safeParse(req.params.instrumentId);
    if (!id.success) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid instrumentId parameter.' });
      return;
    }
    try {
      const body = await buildDrivers(deps, id.data);
      if (!body) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Unknown instrument.' });
        return;
      }
      res.json(body);
    } catch (err) {
      next(err);
    }
  });
}
