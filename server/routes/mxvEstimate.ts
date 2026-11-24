import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import type { InstrumentDefinition } from '../../src/shared/types/instrument.ts';
import type { MarketQuote } from '../../src/shared/types/market.ts';
import { instrumentRepository as defaultInstrumentRepository } from '../services/instrumentRegistry.ts';
import type { IInstrumentRepository } from '../services/repository.ts';
import {
  computeMxvEstimate,
  MXV_ESTIMATE_DISCLAIMER,
  MXV_ESTIMATE_LABEL,
  mxvEstimateIneligibility,
  type FxRateInput,
} from '../services/mxvEstimator.ts';

/**
 * T32 routes:
 *   GET /api/mxv/estimate              → every MXV-listed instrument: eligibility + estimate
 *   GET /api/mxv/estimate/:mxvSymbol   → one estimate (404 unknown symbol, 422 mapping/spec not verified)
 * Query: usdVnd=<rate> (optional manual USD/VND, labelled USER_PROVIDED), usdVndAsOf=<ISO date/time>.
 */

const ParamsSchema = z.object({ mxvSymbol: z.string().min(2).max(8).regex(/^[A-Za-z0-9]+$/) });

const QuerySchema = z.object({
  // Sanity bounds only (VND per USD); anything outside is a typo, not a rate.
  usdVnd: z.coerce.number().min(10_000).max(100_000).optional(),
  usdVndAsOf: z
    .string()
    .max(40)
    .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'usdVndAsOf must be an ISO-8601 date/time' })
    .optional(),
});

export interface MxvEstimateRoutesOptions {
  instruments?: Pick<IInstrumentRepository, 'list'>;
  providers: {
    getQuoteForInstrument(instrument: InstrumentDefinition): Promise<MarketQuote>;
    getUsdVndRate(): Promise<{
      status: 'CURRENT' | 'UNAVAILABLE';
      rate: number | null;
      timestamp: string | null;
      source: string;
      reason?: string;
    }>;
  };
  now?: () => Date;
}

function createMxvEstimateRouter(options: MxvEstimateRoutesOptions): express.Router {
  const router = express.Router();
  const instruments = options.instruments ?? defaultInstrumentRepository;
  const now = options.now ?? (() => new Date());

  async function resolveFx(query: z.infer<typeof QuerySchema>): Promise<FxRateInput> {
    if (query.usdVnd !== undefined) {
      return {
        rate: query.usdVnd,
        status: 'USER_PROVIDED',
        timestamp: query.usdVndAsOf ? new Date(Date.parse(query.usdVndAsOf)).toISOString() : null,
        source: 'USER_PROVIDED (manual rate passed in the request; not verified by the server)',
      };
    }
    const fx = await options.providers.getUsdVndRate();
    return {
      rate: fx.rate,
      status: fx.status,
      timestamp: fx.timestamp,
      source: fx.source,
      ...(fx.reason ? { reason: fx.reason } : {}),
    };
  }

  async function listMxvInstruments(): Promise<InstrumentDefinition[]> {
    const all = await instruments.list({});
    return all.filter((i) => i.isMvxListed && i.mxvMapping?.mxvSymbol);
  }

  function parseQuery(req: Request, res: Response): z.infer<typeof QuerySchema> | null {
    const q = QuerySchema.safeParse(req.query);
    if (!q.success) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid estimate query parameters.', details: q.error.issues });
      return null;
    }
    return q.data;
  }

  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = parseQuery(req, res);
      if (!query) return;
      const list = await listMxvInstruments();
      const eligible = list.filter((i) => mxvEstimateIneligibility(i) === null);
      const fx = eligible.length > 0 ? await resolveFx(query) : null;
      const at = now();
      const items = await Promise.all(
        list.map(async (inst) => {
          const reason = mxvEstimateIneligibility(inst);
          if (reason) {
            return {
              mxvSymbol: inst.mxvMapping!.mxvSymbol,
              internationalInstrumentId: inst.id,
              eligible: false,
              reason,
              estimate: null,
            };
          }
          const quote = await options.providers.getQuoteForInstrument(inst);
          return {
            mxvSymbol: inst.mxvMapping!.mxvSymbol,
            internationalInstrumentId: inst.id,
            eligible: true,
            reason: null,
            estimate: computeMxvEstimate({ instrument: inst, quote, usdVnd: fx, now: at }),
          };
        })
      );
      res.json({
        label: MXV_ESTIMATE_LABEL,
        disclaimer: MXV_ESTIMATE_DISCLAIMER,
        computedAt: at.toISOString(),
        usdVnd: fx,
        count: items.length,
        items,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:mxvSymbol', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const params = ParamsSchema.safeParse(req.params);
      if (!params.success) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid MXV symbol.', details: params.error.issues });
        return;
      }
      const query = parseQuery(req, res);
      if (!query) return;
      const symbol = params.data.mxvSymbol.toUpperCase();
      const inst = (await listMxvInstruments()).find((i) => i.mxvMapping!.mxvSymbol!.toUpperCase() === symbol);
      if (!inst) {
        res.status(404).json({ error: 'MXV_SYMBOL_NOT_FOUND', message: `No MXV-listed instrument with MXV code ${symbol}.` });
        return;
      }
      const reason = mxvEstimateIneligibility(inst);
      if (reason) {
        res.status(422).json({
          error: 'ESTIMATE_REFUSED',
          label: MXV_ESTIMATE_LABEL,
          mxvSymbol: symbol,
          internationalInstrumentId: inst.id,
          message: reason,
        });
        return;
      }
      const [quote, fx] = await Promise.all([options.providers.getQuoteForInstrument(inst), resolveFx(query)]);
      res.json(computeMxvEstimate({ instrument: inst, quote, usdVnd: fx, now: now() }));
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export function registerMxvEstimateRoutes(app: express.Express, options: MxvEstimateRoutesOptions): void {
  app.use('/api/mxv/estimate', createMxvEstimateRouter(options));
}
