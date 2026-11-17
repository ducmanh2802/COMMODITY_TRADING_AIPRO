import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { DEVELOPMENT_ROADMAP, PLATFORM_MODULES } from '../src/shared/architecture.ts';
import { getVietnamClockLabel, VIETNAM_TIMEZONE } from '../src/shared/utils/time.ts';
import { instrumentRepository } from './services/instrumentRegistry.ts';
import { providerRegistry } from './providers/registry.ts';

const InstrumentsQuerySchema = z.object({
  category: z.enum(['AGRICULTURE', 'SOFT_COMMODITIES', 'METALS', 'ENERGY']).optional(),
  exchange: z.enum(['MXV', 'CBOT', 'CME', 'COMEX', 'NYMEX', 'ICE']).optional(),
  marketScope: z.enum(['ALL', 'MXV', 'INTERNATIONAL']).optional(),
  search: z.string().max(80).optional(),
});

const SymbolParamSchema = z.object({
  symbol: z.string().min(1).max(24).regex(/^[a-zA-Z0-9:_-]+$/),
});

export function createApiApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  // Basic security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
  });

  app.get('/api/health', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const providers = await providerRegistry.getAllHealth();
      const connectedProviders = providers.filter((p) => p.connectionState === 'CONNECTED').length;
      const now = new Date();

      res.json({
        status: 'OK',
        service: 'COMMODITY TRADING AI PRO API',
        phase: 1,
        timestampUtc: now.toISOString(),
        timezone: VIETNAM_TIMEZONE,
        localTimeLabel: getVietnamClockLabel(now),
        runtime: {
          nodeVersion: process.version,
          environment: process.env.NODE_ENV ?? 'development',
        },
        capabilities: {
          geminiServerKeyConfigured: Boolean(
            process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0
          ),
          firebaseConfigured: true,
          marketDataProvidersTotal: providers.length,
          marketDataProvidersConnected: connectedProviders,
          marketDataOverallStatus: connectedProviders > 0 ? 'CURRENT' : 'UNAVAILABLE',
        },
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/architecture', (_req: Request, res: Response) => {
    res.json({
      platform: 'COMMODITY TRADING AI PRO',
      currentPhase: 1,
      modules: PLATFORM_MODULES,
      roadmap: DEVELOPMENT_ROADMAP,
    });
  });

  app.get('/api/providers/health', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const providers = await providerRegistry.getAllHealth();
      res.json({
        retrievedAt: new Date().toISOString(),
        overallStatus: providers.some((p) => p.connectionState === 'CONNECTED')
          ? 'CURRENT'
          : 'UNAVAILABLE',
        providers,
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/instruments', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = InstrumentsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid instrument query parameters.',
          details: parsed.error.issues,
        });
        return;
      }

      const instruments = await instrumentRepository.list(parsed.data);
      res.json({
        retrievedAt: new Date().toISOString(),
        count: instruments.length,
        instruments,
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/market/quotes', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = InstrumentsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid market quotes query parameters.',
          details: parsed.error.issues,
        });
        return;
      }

      const instruments = await instrumentRepository.list(parsed.data);
      const quotes = await Promise.all(
        instruments.map((inst) => providerRegistry.getQuoteForInstrument(inst))
      );

      res.json({
        retrievedAt: new Date().toISOString(),
        overallStatus: quotes.some((q) => q.status === 'CURRENT' || q.status === 'DELAYED')
          ? 'CURRENT'
          : 'UNAVAILABLE',
        notice: 'DATA_UNAVAILABLE — No verified market data available.',
        count: quotes.length,
        quotes,
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/market/quotes/:symbol', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = SymbolParamSchema.safeParse(req.params);
      if (!parsed.success) {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid symbol parameter.',
          details: parsed.error.issues,
        });
        return;
      }

      const instrument = await instrumentRepository.findBySymbol(parsed.data.symbol);
      if (!instrument) {
        res.status(404).json({
          error: 'INSTRUMENT_NOT_FOUND',
          message: `Instrument ${parsed.data.symbol} is not registered in the Instrument Master.`,
        });
        return;
      }

      const quote = await providerRegistry.getQuoteForInstrument(instrument);
      res.json({ instrument, quote });
    } catch (err) {
      next(err);
    }
  });

  // 404 for unknown /api/* routes
  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({
      error: 'NOT_FOUND',
      message: 'Requested API endpoint does not exist.',
    });
  });

  // Centralized error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : 'Unexpected server error.';
    res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message,
    });
  });

  return app;
}
