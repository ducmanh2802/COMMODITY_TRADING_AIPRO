/**
 * COT (CFTC Commitments of Traders) API routes.
 *
 *   GET  /api/cot/markets                → instrument ↔ CFTC market code mapping with verification evidence
 *   GET  /api/cot/health                 → sync status per instrument/report type (for Data Health)
 *   POST /api/cot/sync {instrumentId, from?}
 *   GET  /api/cot/:instrumentId?type=disaggregated|legacy&from=&to=&lookbackWeeks=&maxMissingWeeks=
 *
 * Must be registered before the app's `/api` 404 handler.
 */
import type { Express, NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import {
  DEFAULT_COT_LOOKBACK_WEEKS,
  MAX_COT_LOOKBACK_WEEKS,
  MIN_COT_LOOKBACK_WEEKS,
  parseIsoDate,
} from '../../src/shared/cot/analytics.ts';
import { COT_MARKET_MAPPINGS } from '../cot/mapping.ts';
import { CotService, CotServiceError } from '../cot/service.ts';

export type CotServiceLike = Pick<CotService, 'sync' | 'query' | 'health'>;

export interface CotRouteDeps {
  /** Service instance or factory. Default: lazily created on first request (opens MARKET_DB_PATH). */
  service?: CotServiceLike | (() => CotServiceLike);
}

const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
  .refine((s) => parseIsoDate(s) !== null, 'Invalid calendar date');

const InstrumentId = z.string().min(3).max(24).regex(/^[A-Z]+:[A-Z0-9]+$/, 'Expected e.g. CBOT:ZC');

const SyncBodySchema = z
  .object({
    instrumentId: InstrumentId,
    from: IsoDate.optional(),
  })
  .strict();

const QuerySchema = z
  .object({
    type: z.enum(['disaggregated', 'legacy']).default('disaggregated'),
    from: IsoDate.optional(),
    to: IsoDate.optional(),
    lookbackWeeks: z.coerce
      .number()
      .int()
      .min(MIN_COT_LOOKBACK_WEEKS)
      .max(MAX_COT_LOOKBACK_WEEKS)
      .default(DEFAULT_COT_LOOKBACK_WEEKS),
    maxMissingWeeks: z.coerce.number().int().min(0).max(52).default(0),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: 'from must be <= to', path: ['from'] })
  .refine((q) => q.maxMissingWeeks < q.lookbackWeeks, {
    message: 'maxMissingWeeks must be < lookbackWeeks',
    path: ['maxMissingWeeks'],
  });

function sendValidation(res: Response, message: string, issues: unknown): void {
  res.status(400).json({ error: 'VALIDATION_ERROR', message, details: issues });
}

function handleServiceError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof CotServiceError) {
    res.status(err.httpStatus).json({ error: err.code, message: err.message });
    return;
  }
  next(err);
}

export function registerCotRoutes(app: Express, deps: CotRouteDeps = {}): void {
  let instance: CotServiceLike | null = null;
  const getService = (): CotServiceLike => {
    if (instance) return instance;
    const s = deps.service;
    instance = typeof s === 'function' ? s() : (s ?? new CotService());
    return instance;
  };

  app.get('/api/cot/markets', (_req: Request, res: Response) => {
    // Static, verified mapping: no DB access needed.
    res.json({ retrievedAt: new Date().toISOString(), markets: COT_MARKET_MAPPINGS });
  });

  app.get('/api/cot/health', (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(getService().health());
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/cot/sync', async (req: Request, res: Response, next: NextFunction) => {
    const parsed = SyncBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendValidation(res, 'Invalid COT sync request body.', parsed.error.issues);
      return;
    }
    try {
      const result = await getService().sync(parsed.data.instrumentId, parsed.data.from);
      const status = result.status === 'FAILED' ? 502 : 200;
      if (status === 502) {
        res.status(502).json({
          error: 'UPSTREAM_ERROR',
          message: 'CFTC data could not be fetched; nothing was stored.',
          sync: result,
        });
        return;
      }
      res.json({ sync: result });
    } catch (err) {
      handleServiceError(err, res, next);
    }
  });

  app.get('/api/cot/:instrumentId', (req: Request, res: Response, next: NextFunction) => {
    const id = InstrumentId.safeParse(req.params.instrumentId);
    if (!id.success) {
      sendValidation(res, 'Invalid instrumentId parameter.', id.error.issues);
      return;
    }
    const q = QuerySchema.safeParse(req.query);
    if (!q.success) {
      sendValidation(res, 'Invalid COT query parameters.', q.error.issues);
      return;
    }
    try {
      const result = getService().query(id.data, {
        reportType: q.data.type === 'legacy' ? 'LEGACY' : 'DISAGGREGATED',
        from: q.data.from,
        to: q.data.to,
        lookbackWeeks: q.data.lookbackWeeks,
        maxMissingWeeks: q.data.maxMissingWeeks,
      });
      res.json({ retrievedAt: new Date().toISOString(), count: result.rows.length, ...result });
    } catch (err) {
      handleServiceError(err, res, next);
    }
  });
}
