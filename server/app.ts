import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { DEVELOPMENT_ROADMAP, PLATFORM_MODULES } from '../src/shared/architecture.ts';
import { getVietnamClockLabel, VIETNAM_TIMEZONE } from '../src/shared/utils/time.ts';
import { instrumentRepository as defaultInstrumentRepository } from './services/instrumentRegistry.ts';
import { ProviderRegistry } from './providers/registry.ts';
import { registerDataRoutes } from './routes/dataRoutes.ts';
import { registerContractRoutes } from './routes/contracts.ts';
import { registerCotRoutes } from './routes/cot.ts';
import type { ICandleRepository } from './storage/candleRepository.ts';
import { getDefaultCandleRepository } from './storage/sqliteCandleRepository.ts';
import type { ProviderHealth } from '../src/shared/types/market.ts';
import { adminAuthStartupWarning, createRequireAdminToken } from './middleware/adminAuth.ts';
import {
  createRateLimiter,
  rateLimitOptionsFromEnv,
  type RateLimitOptions,
} from './middleware/rateLimit.ts';
import {
  getRequestId,
  requestIdMiddleware,
  securityHeadersMiddleware,
} from './middleware/requestContext.ts';

const InstrumentsQuerySchema = z.object({
  category: z.enum(['AGRICULTURE', 'SOFT_COMMODITIES', 'METALS', 'ENERGY']).optional(),
  exchange: z.enum(['MXV', 'CBOT', 'CME', 'COMEX', 'NYMEX', 'ICE']).optional(),
  marketScope: z.enum(['ALL', 'MXV', 'INTERNATIONAL']).optional(),
  search: z.string().max(80).optional(),
});

const SymbolParamSchema = z.object({
  symbol: z.string().min(1).max(24).regex(/^[a-zA-Z0-9:_-]+$/),
});

export type InstrumentRepositoryLike = Pick<typeof defaultInstrumentRepository, 'list' | 'findBySymbol'>;
export type ProviderRegistryLike = Pick<ProviderRegistry, 'getAllHealth' | 'getQuoteForInstrument'>;

export interface CreateApiAppOptions {
  /**
   * Rate limit for /api/*. `false` disables it; omitted → read from env
   * (API_RATE_LIMIT_DISABLED, API_RATE_LIMIT_WINDOW_MS, API_RATE_LIMIT_MAX).
   */
  rateLimit?: RateLimitOptions | false;
  /** Dependency overrides (primarily for tests). */
  instruments?: InstrumentRepositoryLike;
  providers?: ProviderRegistryLike;
  /**
   * Historical candle store. Omitted → shared SQLite DB at MARKET_DB_PATH (default data/market.db),
   * opened lazily when the app is created. Tests should pass an in-memory repository.
   */
  candles?: ICandleRepository;
  /** JSON body limit for POST /api/data/import only (default '10mb'). Other routes keep 256kb. */
  importBodyLimit?: string | number;
  /** Server-side error logger; defaults to console.error. */
  logError?: (message: string, err: unknown) => void;
  /**
   * Admin token guarding mutating endpoints (import, dataset delete, COT sync). Omitted → env
   * ADMIN_API_TOKEN (read per request). `null`/'' → no token: loopback-only mode.
   */
  adminToken?: string | null;
  /** Override the loopback check used when no admin token is configured (tests). */
  adminIsLoopback?: (req: Request) => boolean;
  /** Startup warning logger; defaults to console.warn, printed at most once per process. */
  logWarn?: (message: string) => void;
}

let adminAuthWarningLogged = false;

/** Live = realtime-capable data actually flowing; HISTORICAL alone must never be reported as CURRENT. */
function summarizeProviders(providers: ProviderHealth[]) {
  const connected = providers.filter((p) => p.connectionState === 'CONNECTED');
  const live = connected.filter((p) => p.dataStatus === 'CURRENT' || p.dataStatus === 'DELAYED');
  const historical = connected.filter((p) => p.dataStatus === 'HISTORICAL');
  const overallStatus = live.length > 0 ? 'CURRENT' : historical.length > 0 ? 'HISTORICAL' : 'UNAVAILABLE';
  return { connected: connected.length, live: live.length, historical: historical.length, overallStatus };
}

function parseTrustProxy(value: string | undefined): boolean | number | string | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  const asNumber = Number(trimmed);
  return Number.isInteger(asNumber) && asNumber >= 0 ? asNumber : trimmed;
}

function getErrorProperty(err: unknown, key: 'type' | 'status'): unknown {
  return typeof err === 'object' && err !== null ? (err as Record<string, unknown>)[key] : undefined;
}

export function createApiApp(options: CreateApiAppOptions = {}): express.Express {
  const app = express();
  const instrumentRepository = options.instruments ?? defaultInstrumentRepository;
  const candleRepository = options.candles ?? getDefaultCandleRepository();
  const providerRegistry = options.providers ?? new ProviderRegistry({ candles: candleRepository });
  const logError =
    options.logError ?? ((message: string, err: unknown) => console.error(message, err));

  app.disable('x-powered-by');
  // Needed for a correct req.ip (rate limiting) behind a reverse proxy, e.g. TRUST_PROXY=1.
  const trustProxy = parseTrustProxy(process.env.TRUST_PROXY);
  if (trustProxy !== undefined) {
    app.set('trust proxy', trustProxy);
  }

  app.use(requestIdMiddleware);
  app.use(securityHeadersMiddleware);

  const requireAdmin = createRequireAdminToken({ token: options.adminToken, isLoopback: options.adminIsLoopback });
  const adminWarning = adminAuthStartupWarning(options.adminToken);
  if (adminWarning && (options.logWarn || !adminAuthWarningLogged)) {
    if (options.logWarn) options.logWarn(adminWarning);
    else {
      adminAuthWarningLogged = true;
      console.warn(adminWarning);
    }
  }

  const rateLimit = options.rateLimit === undefined ? rateLimitOptionsFromEnv() : options.rateLimit;
  if (rateLimit) {
    app.use('/api', createRateLimiter(rateLimit));
  }

  // Admin guard on mutating endpoints runs before body parsing (no 10 MB parse for unauthorized
  // callers). dataRoutes applies the same guard again at route level; COT routes are owned elsewhere,
  // so its sync endpoint is guarded only here.
  app.post('/api/data/import', requireAdmin);
  app.post('/api/cot/sync', requireAdmin);

  // The CSV import route accepts larger bodies; registered first so the 256kb parser below skips it
  // (body-parser does not re-parse an already parsed body).
  app.use('/api/data/import', express.json({ limit: options.importBodyLimit ?? '10mb' }));
  app.use('/api', express.json({ limit: '256kb' }));

  app.get('/api/health', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const providers = await providerRegistry.getAllHealth();
      const summary = summarizeProviders(providers);
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
          marketDataProvidersConnected: summary.connected,
          marketDataLiveProvidersConnected: summary.live,
          marketDataHistoricalProvidersConnected: summary.historical,
          marketDataOverallStatus: summary.overallStatus,
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
        overallStatus: summarizeProviders(providers).overallStatus,
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

  registerDataRoutes(app, {
    findInstrument: (idOrSymbol) => instrumentRepository.findBySymbol(idOrSymbol),
    candles: candleRepository,
    requireAdmin,
  });
  registerContractRoutes(app, { instruments: instrumentRepository });
  registerCotRoutes(app);

  // 404 for unknown /api/* routes
  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({
      error: 'NOT_FOUND',
      message: 'Requested API endpoint does not exist.',
    });
  });

  // Centralized error handler: never leak internal error details to clients.
  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    const requestId = getRequestId(res);
    const type = getErrorProperty(err, 'type');

    if (type === 'entity.parse.failed') {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Malformed JSON request body.',
        requestId,
      });
      return;
    }
    if (type === 'entity.too.large') {
      res.status(413).json({
        error: 'PAYLOAD_TOO_LARGE',
        message: 'Request body exceeds the allowed size.',
        requestId,
      });
      return;
    }
    const status = getErrorProperty(err, 'status');
    if (typeof status === 'number' && status >= 400 && status < 500) {
      res.status(status).json({
        error: 'BAD_REQUEST',
        message: 'The request could not be processed.',
        requestId,
      });
      return;
    }

    logError(`[api] Unhandled error requestId=${requestId} ${req.method} ${req.originalUrl}`, err);
    res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected server error occurred.',
      requestId,
    });
  });

  return app;
}
