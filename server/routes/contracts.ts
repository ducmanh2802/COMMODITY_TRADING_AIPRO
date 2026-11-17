import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { buildContractChain } from '../../src/shared/contracts/chain.ts';
import { isIsoDate } from '../../src/shared/contracts/dates.ts';
import {
  CONTRACT_CALENDAR_RULES,
  instrumentRepository as defaultInstrumentRepository,
} from '../services/instrumentRegistry.ts';
import type { IInstrumentRepository } from '../services/repository.ts';

const ParamsSchema = z.object({
  instrumentId: z.string().min(1).max(24).regex(/^[a-zA-Z0-9:_-]+$/),
});

const ChainQuerySchema = z.object({
  asOf: z
    .string()
    .refine((v) => isIsoDate(v), { message: 'asOf must be a valid YYYY-MM-DD date' })
    .optional(),
  count: z.coerce.number().int().min(1).max(36).optional(),
});

export interface ContractRoutesOptions {
  instruments?: Pick<IInstrumentRepository, 'findBySymbol'>;
  /** Clock override for tests (default asOf = today's UTC date). */
  now?: () => Date;
}

const DISCLAIMER =
  'Research use only. Dates are computed from the exchange rule text with Mon-Fri business days; exchange holidays are not applied. Confirm against the official exchange expiry calendar before relying on any date.';

export function createContractsRouter(options: ContractRoutesOptions = {}): express.Router {
  const router = express.Router();
  const instruments = options.instruments ?? defaultInstrumentRepository;
  const now = options.now ?? (() => new Date());

  router.get('/:instrumentId/chain', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const params = ParamsSchema.safeParse(req.params);
      const query = ChainQuerySchema.safeParse(req.query);
      if (!params.success || !query.success) {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid contract chain parameters.',
          details: [...(params.error?.issues ?? []), ...(query.error?.issues ?? [])],
        });
        return;
      }

      const instrument = await instruments.findBySymbol(params.data.instrumentId);
      if (!instrument) {
        res.status(404).json({
          error: 'INSTRUMENT_NOT_FOUND',
          message: `Instrument ${params.data.instrumentId} is not registered in the Instrument Master.`,
        });
        return;
      }

      const asOf = query.data.asOf ?? now().toISOString().slice(0, 10);
      const count = query.data.count ?? 6;
      const mxv = instrument.mxvMapping;
      const chain = buildContractChain({
        instrumentId: instrument.id,
        root: instrument.exchangeSymbol,
        mxvRoot: mxv && mxv.mappingStatus === 'VERIFIED' ? mxv.mxvSymbol : null,
        asOf,
        count,
        calendarStatus: CONTRACT_CALENDAR_RULES[instrument.id]?.verificationStatus ?? 'UNVERIFIED',
      });

      if (chain.status === 'INVALID_INPUT') {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: chain.reason });
        return;
      }
      if (chain.status === 'UNAVAILABLE') {
        res.status(200).json({
          instrumentId: instrument.id,
          asOf,
          status: 'UNAVAILABLE',
          reason: chain.reason,
          contracts: [],
          disclaimer: DISCLAIMER,
        });
        return;
      }

      const sources = new Set<string>();
      for (const c of chain.contracts) {
        for (const r of [c.lastTradingDay, c.firstNoticeDay]) {
          if (r.sourceUrl) sources.add(r.sourceUrl);
        }
      }

      res.json({
        instrumentId: instrument.id,
        exchange: instrument.exchange,
        root: instrument.exchangeSymbol,
        mxvRoot: mxv && mxv.mappingStatus === 'VERIFIED' ? mxv.mxvSymbol : null,
        asOf,
        count: chain.contracts.length,
        requestedCount: count,
        status: 'OK',
        calendarStatus: chain.calendarStatus,
        listedMonths: chain.listedMonthsText,
        // True only when every computed date had a holiday calendar applied.
        holidayAdjusted:
          chain.contracts.length > 0 &&
          chain.contracts.every((c) =>
            [c.lastTradingDay, c.firstNoticeDay].every((r) => r.status !== 'COMPUTED' || r.holidayAdjusted)
          ),
        contracts: chain.contracts,
        notes: chain.notes,
        warnings: chain.warnings,
        sources: [...sources],
        disclaimer: DISCLAIMER,
        computedAt: now().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  });

  /** Read-only: the published calendar rule text (listed months, LTD rule, source) for one instrument. */
  router.get('/:instrumentId/calendar-rule', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const params = ParamsSchema.safeParse(req.params);
      if (!params.success) {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid instrument id.',
          details: params.error.issues,
        });
        return;
      }
      const instrument = await instruments.findBySymbol(params.data.instrumentId);
      if (!instrument) {
        res.status(404).json({
          error: 'INSTRUMENT_NOT_FOUND',
          message: `Instrument ${params.data.instrumentId} is not registered in the Instrument Master.`,
        });
        return;
      }
      const rule = CONTRACT_CALENDAR_RULES[instrument.id];
      res.json({
        instrumentId: instrument.id,
        status: rule ? 'OK' : 'UNAVAILABLE',
        rule: rule ?? null,
        retrievedAt: now().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

/** Mounts GET /api/contracts/:instrumentId/chain. Call before the /api 404 handler. */
export function registerContractRoutes(app: express.Express, options: ContractRoutesOptions = {}): void {
  app.use('/api/contracts', createContractsRouter(options));
}
