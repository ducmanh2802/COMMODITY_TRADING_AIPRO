import type { Express, NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import {
  createCycleResearchService,
  type CotQueryLike,
  type CycleProviderRegistryLike,
} from '../services/cycleResearchService.ts';
import type { SupplyMacroLike } from '../services/supplyDemandOverlay.ts';
import {
  enrichDailyReportWithAi,
  generateEightQuestionVerdict,
} from '../services/cycleAiService.ts';
import type { ICandleRepository } from '../storage/candleRepository.ts';
import type { IInstrumentRepository } from '../services/repository.ts';
import { SwrCache } from '../services/swrCache.ts';
import type { CycleMarketOverview } from '../../src/shared/types/cycle.ts';
import { compareCommoditiesByPotential } from '../../src/shared/utils/commoditySort.ts';

export interface CycleRoutesDeps {
  instruments: Pick<IInstrumentRepository, 'list' | 'findBySymbol'>;
  providers: CycleProviderRegistryLike;
  candles: ICandleRepository;
  cotService?: CotQueryLike | null;
  /** T60: official-source reader for the supply/demand matrix (omitted → friendly "no data" rows). */
  macro?: SupplyMacroLike | null;
  aiRateLimiter?: (req: Request, res: Response, next: NextFunction) => void;
}

const SymbolParamSchema = z.object({
  symbol: z.string().min(1).max(24).regex(/^[a-zA-Z0-9:_-]+$/),
});

const VerdictBodySchema = z.object({
  symbol: z.string().min(1).max(24).regex(/^[a-zA-Z0-9:_-]+$/),
});

const ScannerQuerySchema = z.object({
  category: z.enum(['AGRICULTURE', 'SOFT_COMMODITIES', 'METALS', 'ENERGY']).optional(),
  phase: z
    .enum([
      'PHASE_1_ACCUMULATION',
      'PHASE_2_EARLY_RECOVERY',
      'PHASE_3_MARKUP',
      'PHASE_4_DISTRIBUTION',
      'DATA_UNAVAILABLE',
    ])
    .optional(),
  minBottomScore: z.coerce.number().min(0).max(100).optional(),
  mxvOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export function registerCycleRoutes(app: Express, deps: CycleRoutesDeps): void {
  const cycleService = createCycleResearchService({
    instruments: deps.instruments,
    providers: deps.providers,
    candles: deps.candles,
    cotService: deps.cotService,
    macro: deps.macro,
  });

  const passthrough = (_req: Request, _res: Response, next: NextFunction) => next();
  const limitAi = deps.aiRateLimiter ?? passthrough;

  // Stale-while-revalidate: overview is served from memory; recomputation runs in the background.
  const overviewCache = new SwrCache<CycleMarketOverview>({
    compute: () => cycleService.buildMarketOverview(),
    ttlMs: 5 * 60_000,
  });
  app.locals.cycleOverviewCache = overviewCache;

  app.get('/api/cycle/overview', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const snap = await overviewCache.get();
      res.json({ ...snap.value, asOf: snap.asOf, stale: snap.stale });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/cycle/scanner', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = ScannerQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid cycle scanner filter parameters.',
          details: parsed.error.issues,
        });
        return;
      }

      const overview = await cycleService.buildMarketOverview();
      const filtered = overview.commodities
        .filter((item) => {
          if (parsed.data.category && item.instrument.category !== parsed.data.category) return false;
          if (parsed.data.phase && item.cyclePhase !== parsed.data.phase) return false;
          if (parsed.data.mxvOnly && !item.instrument.isMvxListed) return false;
          if (
            parsed.data.minBottomScore !== undefined &&
            (item.bottomScore === null || item.bottomScore < parsed.data.minBottomScore)
          ) {
            return false;
          }
          return true;
        })
        .sort(compareCommoditiesByPotential);

      res.json({
        generatedAt: overview.generatedAt,
        count: filtered.length,
        commodities: filtered,
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/cycle/profile/:symbol', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = SymbolParamSchema.safeParse(req.params);
      if (!parsed.success) {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid commodity symbol.',
          details: parsed.error.issues,
        });
        return;
      }

      const instrument = await deps.instruments.findBySymbol(parsed.data.symbol);
      if (!instrument) {
        res.status(404).json({
          error: 'INSTRUMENT_NOT_FOUND',
          message: `Instrument ${parsed.data.symbol} not found in registry.`,
        });
        return;
      }

      const dossier = await cycleService.buildCommodityProfile(instrument);
      res.json(dossier);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/cycle/verdict', limitAi, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = VerdictBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid AI verdict payload.',
          details: parsed.error.issues,
        });
        return;
      }

      const instrument = await deps.instruments.findBySymbol(parsed.data.symbol);
      if (!instrument) {
        res.status(404).json({
          error: 'INSTRUMENT_NOT_FOUND',
          message: `Instrument ${parsed.data.symbol} not found.`,
        });
        return;
      }

      const dossier = await cycleService.buildCommodityProfile(instrument);
      const verdict = await generateEightQuestionVerdict(dossier);
      res.json(verdict);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/cycle/report', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const report = await cycleService.buildDailyReportBase();
      res.json(report);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/cycle/report/generate', limitAi, async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const base = await cycleService.buildDailyReportBase();
      const enriched = await enrichDailyReportWithAi(base);
      res.json(enriched);
    } catch (err) {
      next(err);
    }
  });
}
