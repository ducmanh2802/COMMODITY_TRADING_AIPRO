import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { CONTRACT_CALENDAR_RULES, instrumentRepository as defaultInstrumentRepository } from '../services/instrumentRegistry.ts';
import type { IInstrumentRepository } from '../services/repository.ts';
import { isYahooEnabled } from '../providers/yahooAdapter.ts';
import { getFuturesChain } from '../services/futuresChain.ts';
import type { YahooCurveDeps } from '../services/yahooCurve.ts';

export interface FuturesChainRoutesOptions {
  instruments?: Pick<IInstrumentRepository, 'findBySymbol'>;
  yahoo?: YahooCurveDeps & { enabled?: () => boolean };
}

/** GET /api/futures-chain/:instrumentId?count=8 — per-month price/change/volume (Yahoo, UNOFFICIAL). */
export function registerFuturesChainRoutes(app: express.Express, options: FuturesChainRoutesOptions = {}): void {
  const instruments = options.instruments ?? defaultInstrumentRepository;
  app.get('/api/futures-chain/:instrumentId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = z.string().min(1).max(24).regex(/^[a-zA-Z0-9:_-]+$/).safeParse(req.params.instrumentId);
      const q = z.object({ count: z.coerce.number().int().min(2).max(12).optional() }).safeParse(req.query);
      if (!id.success || !q.success) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid futures-chain parameters.' });
        return;
      }
      const instrument = await instruments.findBySymbol(id.data);
      if (!instrument) {
        res.status(404).json({ error: 'INSTRUMENT_NOT_FOUND', message: `Instrument ${id.data} is not registered.` });
        return;
      }
      if (!(options.yahoo?.enabled ?? isYahooEnabled)()) {
        res.json({
          status: 'UNAVAILABLE',
          instrumentId: instrument.id,
          source: 'Yahoo Finance (UNOFFICIAL)',
          reason: 'Yahoo is disabled (set YAHOO_ENABLED=true).',
          fetchedAt: new Date().toISOString(),
        });
        return;
      }
      const cal = CONTRACT_CALENDAR_RULES[instrument.id]?.verificationStatus ?? 'UNVERIFIED';
      res.json(await getFuturesChain(instrument, q.data.count ?? 8, cal, options.yahoo));
    } catch (err) {
      next(err);
    }
  });
}
