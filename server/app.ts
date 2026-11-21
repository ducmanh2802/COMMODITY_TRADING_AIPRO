import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { DEVELOPMENT_ROADMAP, PLATFORM_MODULES } from '../src/shared/architecture.ts';
import type { Timeframe } from '../src/shared/types/instrument.ts';
import { getVietnamClockLabel, VIETNAM_TIMEZONE } from '../src/shared/utils/time.ts';
import { instrumentRepository as defaultInstrumentRepository } from './services/instrumentRegistry.ts';
import { ProviderRegistry } from './providers/registry.ts';
import { registerDataRoutes } from './routes/dataRoutes.ts';
import { registerContractRoutes } from './routes/contracts.ts';
import { registerCotRoutes } from './routes/cot.ts';
import { registerCycleRoutes } from './routes/cycleRoutes.ts';
import { registerBriefRoutes } from './routes/brief.ts';
import { registerScorecardRoutes } from './routes/scorecard.ts';
import { registerMarketPulseRoutes } from './routes/marketPulse.ts';
import { registerTodayRoutes } from './routes/today.ts';
import { registerDriversRoutes } from './routes/drivers.ts';
import { registerRadarRoutes } from './routes/radar.ts';
import { MacroService } from './macro/service.ts';
import type { SupplyMacroLike } from './services/supplyDemandOverlay.ts';
import { ScorecardService } from './services/scorecard/scorecardService.ts';
import { YahooFinanceAdapter, isYahooEnabled } from './providers/yahooAdapter.ts';
import { registerMxvEstimateRoutes } from './routes/mxvEstimate.ts';
import { registerMacroRoutes, type MacroServiceLike } from './routes/macro.ts';
import { registerFxRoutes } from './routes/fx.ts';
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
import { runHistoricalBacktest } from './engines/backtestEngine.ts';
import { analyzePortfolioExposure, analyzeTradeJournal } from './engines/portfolioEngine.ts';
import { calculateDeterministicRisk } from './engines/riskEngine.ts';
import { runTradeScanner } from './engines/scannerEngine.ts';
import { evaluateAllStrategies, STRATEGY_CATALOG } from './engines/strategyEngine.ts';
import { analyzeTechnicalSnapshot, calculateEMA } from './engines/technicalEngine.ts';
import {
  generateResearchSummary,
  loadCotForAi,
  type AiAnalystDeps,
  type AiCotQueryLike,
} from './services/aiAnalyst.ts';
import { CotService } from './cot/service.ts';
import { historicalCandleStore } from './services/candleStore.ts';
import { parseAndValidateCsvCandles } from './services/csvImporter.ts';
import {
  buildFundamentalDomainsStatus,
  fundamentalStore,
} from './services/fundamentalService.ts';
import { loadEngineCandles, type EngineCandleResult } from './services/engineCandles.ts';
import { buildFullDataHealthReport } from './services/dataHealthService.ts';

const TimeframeEnum = z.enum(['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1']);
const CategoryEnum = z.enum(['AGRICULTURE', 'SOFT_COMMODITIES', 'METALS', 'ENERGY']);
const ExchangeEnum = z.enum(['MXV', 'CBOT', 'CME', 'COMEX', 'NYMEX', 'ICE', 'SGX']);
const StrategyIdEnum = z.enum([
  'TREND_FOLLOWING',
  'EMA_PULLBACK',
  'BREAKOUT',
  'RANGE_TRADING',
  'SR_REVERSAL',
  'RSI_REVERSAL',
  'MACD_MOMENTUM',
  'ATR_VOLATILITY_BREAKOUT',
]);

const InstrumentsQuerySchema = z.object({
  category: CategoryEnum.optional(),
  exchange: ExchangeEnum.optional(),
  marketScope: z.enum(['ALL', 'MXV', 'INTERNATIONAL']).optional(),
  search: z.string().max(80).optional(),
});

const SymbolParamSchema = z.object({
  symbol: z.string().min(1).max(24).regex(/^[a-zA-Z0-9:_-]+$/),
});

export type InstrumentRepositoryLike = Pick<typeof defaultInstrumentRepository, 'list' | 'findBySymbol'>;
export type ProviderRegistryLike = Pick<
  ProviderRegistry,
  'getAllHealth' | 'getQuoteForInstrument' | 'syncAll' | 'getUsdVndRate'
>;

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
  /** Run the Yahoo daily-history warm-up at startup (default: env YAHOO_HISTORY_WARMUP=true). Never blocks start. */
  yahooHistoryWarmup?: boolean;
  /** Startup warning logger; defaults to console.warn, printed at most once per process. */
  logWarn?: (message: string) => void;
  /** T21 macro service override (tests inject one backed by recorded fixtures; no network). */
  macro?: MacroServiceLike;
  /** T60 supply/demand source reader for the cycle dossier (tests inject fixtures/null; default: real MacroService). */
  supplyMacro?: SupplyMacroLike | null;
  /** T36 scheduler status provider (real server only; absent → GET /api/scheduler/status reports disabled). */
  schedulerStatus?: () => unknown;
  /**
   * AI Analyst (T20) overrides: API key / model client / timeout (tests), and the COT reader
   * (undefined → lazily created CotService on MARKET_DB_PATH; null → COT not looked up).
   */
  aiAnalyst?: AiAnalystDeps & { cot?: AiCotQueryLike | null };
}

const CsvImportSchema = z.object({
  symbol: z.string().min(1).max(24),
  timeframe: TimeframeEnum,
  csvContent: z.string().min(10).max(2_000_000),
  sourceName: z.string().min(1).max(80).optional(),
});

const SyncRequestSchema = z.object({
  symbol: z.string().min(1).max(24).optional(),
  timeframe: TimeframeEnum.optional(),
  historicalRange: z.enum(['1y', '2y', '5y', '10y', 'max']).optional(),
  includePublicMacro: z.boolean().optional(),
});

const ScannerRequestSchema = z.object({
  category: CategoryEnum.optional(),
  exchange: ExchangeEnum.optional(),
  tradingStyle: z.enum(['SCALPING', 'INTRADAY', 'SWING', 'POSITION']),
  timeframe: TimeframeEnum,
  minRiskReward: z.number().min(0).max(20).default(1.2),
  minSetupScore: z.number().min(0).max(100).default(50),
  maxVolatilityAtrPct: z.number().positive().max(50).optional(),
});

const RiskCalculationSchema = z.object({
  symbol: z.string().min(1).max(24),
  accountEquity: z.number().positive().max(1_000_000_000_000),
  accountCurrency: z.enum(['USD', 'VND']),
  riskPercentagePerTrade: z.number().min(0.01).max(10),
  dailyLossLimitPct: z.number().min(0.1).max(25),
  maxOpenPositions: z.number().int().min(1).max(50),
  currentOpenPositions: z.number().int().min(0).max(50),
  maxPortfolioRiskPct: z.number().min(0.1).max(50),
  currentOpenRiskPct: z.number().min(0).max(100),
  maxContractsPerInstrument: z.number().int().min(1).max(100),
  entryPrice: z.number().positive(),
  stopLossPrice: z.number().positive(),
  takeProfitPrice: z.number().positive().optional(),
  commissionPerContract: z.number().min(0).default(0),
  exchangeFeePerContract: z.number().min(0).default(0),
  brokerageFeePerContract: z.number().min(0).default(0),
  slippageTicks: z.number().min(0).default(0),
  fxRateContractToAccount: z.number().positive().optional(),
});

const BacktestRequestSchema = z.object({
  symbol: z.string().min(1).max(24),
  strategyId: StrategyIdEnum,
  timeframe: TimeframeEnum,
  initialEquity: z.number().positive().max(1_000_000_000),
  contractsPerTrade: z.number().int().min(1).max(100),
  commissionPerContract: z.number().min(0).max(500).default(2.5),
  slippageTicks: z.number().min(0).max(20).default(1),
  rolloverIntervalBars: z.number().int().min(5).max(500).optional(),
  rolloverCostPerContract: z.number().min(0).max(500).optional(),
});

// Research-summary mode (T20/D3): no risk settings — the AI never sizes or recommends trades.
const AiAnalyzeRequestSchema = z.object({
  symbol: z.string().min(1).max(24),
  timeframe: TimeframeEnum,
  language: z.enum(['vi', 'en']).default('vi'),
});

const FundamentalCategoryEnum = z.enum([
  'USDA_WASDE',
  'USDA_CROP',
  'EIA_INVENTORIES',
  'CFTC_COT',
  'ICE_STOCKS',
  'GLOBAL_SD',
  'SEASONAL',
  'WEATHER_RISK',
  'MACRO',
]);

const FundamentalRecordSchema = z.object({
  kind: z.enum(['MACRO', 'NEWS']).default('MACRO'),
  dataset: z.string().min(1).max(80),
  source: z.string().min(1).max(120),
  publicationTimestamp: z.string().min(1).max(64),
  observationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dataPeriod: z.string().min(1).max(40).default('CURRENT'),
  category: FundamentalCategoryEnum.optional(),
  actualValue: z.union([z.number(), z.string()]).nullable().default(null),
  previousValue: z.union([z.number(), z.string()]).nullable().default(null),
  forecastValue: z.union([z.number(), z.string()]).nullable().default(null),
  unit: z.string().min(1).max(32).default('INDEX'),
  revisionStatus: z.enum(['PRELIMINARY', 'FINAL', 'REVISED']).default('FINAL'),
  impactAssessment: z.enum(['BULLISH', 'BEARISH', 'SIDEWAYS', 'UNCERTAIN']),
  headline: z.string().max(200).optional(),
  summary: z.string().max(600).optional(),
  relatedSymbols: z.array(z.string().max(16)).max(10).optional(),
});

const PortfolioAnalyzeSchema = z.object({
  positions: z.array(
    z.object({
      id: z.string(),
      instrumentId: z.string(),
      productName: z.string(),
      category: CategoryEnum,
      exchange: ExchangeEnum,
      direction: z.enum(['LONG', 'SHORT']),
      contracts: z.number().int().positive(),
      entryPrice: z.number().positive(),
      stopLoss: z.number().positive(),
      takeProfit: z.number().positive(),
      estimatedMargin: z.number().nonnegative(),
      marginVerified: z.boolean(),
      status: z.enum(['OPEN', 'CLOSED']),
    })
  ),
});

const JournalAnalyticsSchema = z.object({
  entries: z.array(
    z.object({
      instrument: z.string(),
      strategy: z.string(),
      timeframe: TimeframeEnum,
      realizedPnl: z.number(),
      tradingCosts: z.number().nonnegative(),
      resultInR: z.number(),
      status: z.enum(['OPEN', 'CLOSED']),
    })
  ),
});

// Simple per-IP sliding window rate limiter for the expensive AI endpoint (owner); the global
// /api limiter (middleware/rateLimit.ts) still applies first.
function createAiRateLimiter(maxRequests: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || 'local';
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= maxRequests) {
      res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many AI analysis requests. Please wait before retrying.',
      });
      return;
    }
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}

let adminAuthWarningLogged = false;

/** Live = realtime-capable data actually flowing; HISTORICAL alone must never be reported as CURRENT. */
function summarizeProviders(providers: ProviderHealth[]) {
  const connected = providers.filter((p) => p.connectionState === 'CONNECTED');
  const live = connected.filter((p) => p.dataStatus === 'CURRENT' || p.dataStatus === 'DELAYED');
  const historical = connected.filter((p) => p.dataStatus === 'HISTORICAL');
  // Delayed-only sources (e.g. Yahoo UNOFFICIAL) report DELAYED, never CURRENT.
  const anyCurrent = live.some((p) => p.dataStatus === 'CURRENT');
  const overallStatus =
    live.length > 0 ? (anyCurrent ? 'CURRENT' : 'DELAYED') : historical.length > 0 ? 'HISTORICAL' : 'UNAVAILABLE';
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
  // Owner's mutating endpoints (legacy in-memory CSV import/clear, external API sync, manual macro
  // records) get the same guard: loopback-only without ADMIN_API_TOKEN, Bearer token otherwise.
  app.post('/api/market/candles/import', requireAdmin);
  app.delete('/api/market/candles', requireAdmin);
  app.post('/api/providers/sync', requireAdmin);
  app.post('/api/providers/yahoo/history', requireAdmin);
  app.post('/api/fundamental/records', requireAdmin);

  // The CSV import route accepts larger bodies; registered first so the 256kb parser below skips it
  // (body-parser does not re-parse an already parsed body).
  app.use('/api/data/import', express.json({ limit: options.importBodyLimit ?? '10mb' }));
  // Legacy owner CSV import: csvContent up to 2,000,000 chars (CsvImportSchema).
  app.use('/api/market/candles/import', express.json({ limit: '3mb' }));
  // Portfolio / journal analytics carry user arrays; allow 2mb as in the owner's original parser.
  app.use(['/api/portfolio/analyze', '/api/journal/analytics'], express.json({ limit: '2mb' }));
  app.use('/api', express.json({ limit: '256kb' }));

  const aiRateLimiter = createAiRateLimiter(12, 60_000);
  const { cot: aiCotOption, ...aiOptions } = options.aiAnalyst ?? {};
  let aiCot: AiCotQueryLike | null | undefined = aiCotOption;
  const getAiCot = (): AiCotQueryLike | null => {
    if (aiCot === undefined) {
      try {
        aiCot = new CotService();
      } catch (err) {
        logError('[ai] COT store unavailable', err);
        aiCot = null;
      }
    }
    return aiCot;
  };

  app.get('/api/health', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const providers = await providerRegistry.getAllHealth();
      const summary = summarizeProviders(providers);
      const now = new Date();

      res.json({
        status: 'OK',
        service: 'COMMODITY TRADING AI PRO API',
        phase: 10,
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
      currentPhase: 10,
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

  app.post('/api/providers/sync', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = SyncRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid provider sync request.',
          details: parsed.error.issues,
        });
        return;
      }

      const result = await providerRegistry.syncAll(parsed.data);
      res.json({
        ...result,
        datasetsCount: historicalCandleStore.listSummaries().length,
        macroRecordsCount: fundamentalStore.listRecords().length,
      });
    } catch (err) {
      next(err);
    }
  });

  // T33: persist Yahoo UNOFFICIAL daily history (10y backfill, then incremental). Admin/loopback only.
  const runYahooHistory = async (symbol?: string) => {
    const reg = providerRegistry as Partial<ProviderRegistry>;
    if (typeof reg.syncYahooHistory !== 'function') {
      return { enabled: false, results: [], note: 'Yahoo history sync not available.' };
    }
    const all = await instrumentRepository.list({});
    const targets = symbol ? all.filter((i) => i.exchangeSymbol.toUpperCase() === symbol.toUpperCase()) : all;
    return reg.syncYahooHistory(targets);
  };
  app.locals.runYahooHistory = runYahooHistory;
  app.post('/api/providers/yahoo/history', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = z.object({ symbol: z.string().min(1).max(24).optional() }).safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid request.', details: parsed.error.issues });
        return;
      }
      res.json(await runYahooHistory(parsed.data.symbol));
    } catch (err) {
      next(err);
    }
  });
  // Optional startup warm-up (YAHOO_HISTORY_WARMUP=true); fire-and-forget, never blocks server start.
  if (
    (options.yahooHistoryWarmup ?? (process.env.YAHOO_HISTORY_WARMUP ?? '').trim().toLowerCase() === 'true') &&
    isYahooEnabled()
  ) {
    void runYahooHistory().catch((err: unknown) => logError('Yahoo history warm-up failed', err));
  }

  app.get('/api/market/fx/usdvnd', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const fx = await providerRegistry.getUsdVndRate();
      res.json(fx);
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

      const hasHistorical = quotes.some((q) => q.status === 'HISTORICAL');
      const hasCurrent = quotes.some((q) => q.status === 'CURRENT' || q.status === 'DELAYED');
      const hasLive = quotes.some((q) => q.status === 'CURRENT');
      const hasUnofficial = quotes.some((q) => q.sourceQuality === 'UNOFFICIAL' && q.price !== null);
      const hasStale = quotes.some((q) => q.status === 'STALE' && q.price !== null);

      res.json({
        retrievedAt: new Date().toISOString(),
        overallStatus: hasLive
          ? 'CURRENT'
          : hasCurrent
            ? 'DELAYED'
            : hasHistorical
              ? 'HISTORICAL'
              : hasStale
                ? 'STALE'
                : 'UNAVAILABLE',
        notice: hasUnofficial
          ? 'Includes UNOFFICIAL delayed Yahoo Finance quotes (continuous front month; CBOT ~10 min, ICE US/COMEX/NYMEX ~30 min; personal use only).'
          : hasCurrent
          ? 'Authorized feed active.'
          : hasHistorical
            ? 'Showing last close from imported historical CSV datasets (not live quotes).'
            : 'DATA_UNAVAILABLE — No verified market data available.',
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
  let lazyCotService: CotService | null | undefined;
  const cotBridge = options.candles
    ? null
    : {
        query: (instrumentId: string, q: Parameters<CotService['query']>[1]) => {
          const svc = (lazyCotService ??= new CotService());
          return svc.query(instrumentId, q);
        },
        health: () => {
          const svc = (lazyCotService ??= new CotService());
          return svc.health();
        },
      };

  let lazySupplyMacro: MacroService | null = null;
  registerCycleRoutes(app, {
    macro:
      options.supplyMacro === undefined
        ? {
            getWasde: () => (lazySupplyMacro ??= new MacroService()).getWasde(),
            getEia: () => (lazySupplyMacro ??= new MacroService()).getEia(),
            getEthanol: () => (lazySupplyMacro ??= new MacroService()).getEthanol(),
            getExportSales: (c) => (lazySupplyMacro ??= new MacroService()).getExportSales(c),
            getErsCosts: (c) => (lazySupplyMacro ??= new MacroService()).getErsCosts(c),
          }
        : options.supplyMacro,
    instruments: instrumentRepository,
    providers: providerRegistry,
    candles: candleRepository,
    cotService: cotBridge,
    aiRateLimiter,
  });

  app.get('/api/data/health-report', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const report = await buildFullDataHealthReport({
        instruments: instrumentRepository,
        providers: providerRegistry,
        candles: candleRepository,
        cotService: cotBridge,
      });
      res.json(report);
    } catch (err) {
      next(err);
    }
  });
  registerMxvEstimateRoutes(app, { instruments: instrumentRepository, providers: providerRegistry });
  registerMacroRoutes(app, { service: options.macro });
  registerFxRoutes(app);
  app.locals.providerRegistry = providerRegistry;
  app.get('/api/scheduler/status', (_req: Request, res: Response) => {
    res.json(options.schedulerStatus ? options.schedulerStatus() : { enabled: false, jobs: [] });
  });
  // "Phân tích chi tiết" brief: composes quote, D1 history (stored first, Yahoo UNOFFICIAL 2y fallback),
  // technical/analytics engines, COT and contract chain into neutral template sentences.
  const yahooProvider =
    typeof (providerRegistry as Partial<ProviderRegistry>).getProviderById === 'function'
      ? (providerRegistry as ProviderRegistry).getProviderById('YAHOO_UNOFFICIAL')
      : null;
  registerBriefRoutes(app, {
    findInstrument: (idOrSymbol) => instrumentRepository.findBySymbol(idOrSymbol),
    getQuote: (inst) => providerRegistry.getQuoteForInstrument(inst),
    candles: candleRepository,
    fetchHistory:
      yahooProvider instanceof YahooFinanceAdapter
        ? async (inst) =>
            isYahooEnabled() && yahooProvider.supports(inst) ? yahooProvider.getCandles(inst.exchangeSymbol, 'D1') : null
        : null,
    getCot: getAiCot,
  });

  // "Đánh giá các mã" scorecard (T44): deterministic per-instrument labels + optional AI narrative.
  const scorecardService = new ScorecardService({
    findInstrument: (idOrSymbol) => instrumentRepository.findBySymbol(idOrSymbol),
    listInstruments: () => instrumentRepository.list({}),
    getQuote: (inst) => providerRegistry.getQuoteForInstrument(inst),
    candles: candleRepository,
    fetchHistory:
      yahooProvider instanceof YahooFinanceAdapter
        ? async (inst) =>
            isYahooEnabled() && yahooProvider.supports(inst) ? yahooProvider.getCandles(inst.exchangeSymbol, 'D1') : null
        : null,
    getCot: getAiCot,
  });
  // "Tình hình tài chính thế giới": FRED macro (OFFICIAL) + commodity breadth/volatility from stored/Yahoo daily history.
  const pulseCache = registerMarketPulseRoutes(app, {
    listInstruments: () => instrumentRepository.list({}),
    getHistory: (inst) => scorecardService.history(inst),
  });
  const cycleCache = (app.locals.cycleOverviewCache as import('./services/swrCache.ts').SwrCache<import('../src/shared/types/cycle.ts').CycleMarketOverview> | undefined) ?? null;
  registerTodayRoutes(app, { scorecards: scorecardService.listCache, cycle: cycleCache });
  // Background pre-computation (server.ts runs these after startup and on a timer unless SCHEDULER_ENABLED=false).
  app.locals.warmers = [
    { name: 'scorecard', refresh: () => scorecardService.listCache.refresh() },
    { name: 'market-pulse', refresh: () => pulseCache.refresh() },
    ...(cycleCache ? [{ name: 'cycle-overview', refresh: () => cycleCache.refresh() }] : []),
  ];
  // "Vì sao & sắp tới" (T56): return attribution, range cones, upcoming events, seasonality.
  let driversMacro: MacroServiceLike | null = options.macro ?? null;
  registerDriversRoutes(app, {
    findInstrument: (idOrSymbol) => instrumentRepository.findBySymbol(idOrSymbol),
    listInstruments: () => instrumentRepository.list({}),
    getHistory: (inst) => scorecardService.history(inst),
    getWasde: () => (driversMacro ??= new MacroService()).getWasde(),
  });
  // "Radar thị trường sôi động" (T64): activity score + descriptive setups, precomputed like /api/today.
  const radarCache = registerRadarRoutes(app, {
    listInstruments: () => instrumentRepository.list({}),
    getHistory: (inst) => scorecardService.history(inst),
    getCycle: cycleCache ? () => cycleCache.get().then((s) => s.value) : null,
    getWasde: () => (driversMacro ??= new MacroService()).getWasde(),
  });
  (app.locals.warmers as { name: string; refresh: () => Promise<void> }[]).push({ name: 'radar', refresh: () => radarCache.refresh() });
  registerScorecardRoutes(app, {
    service: scorecardService,
    rateLimiter: aiRateLimiter,
    summarize: async (inst, language) => {
      const history = await scorecardService.history(inst);
      const snapshot = analyzeTechnicalSnapshot(history.candles, inst.exchangeSymbol, inst.exchange, 'D1');
      const quote = await providerRegistry.getQuoteForInstrument(inst).catch(() => null);
      return generateResearchSummary(
        {
          instrument: inst,
          timeframe: 'D1',
          language,
          quote,
          snapshot,
          candleSource: history.source ? `${history.origin} ${history.source}` : history.origin,
          cot: loadCotForAi(getAiCot(), inst.id),
        },
        { ...aiOptions, logError: aiOptions.logError ?? logError }
      );
    },
  });


  // Phase 2 (owner, legacy): in-memory CSV datasets & OHLCV candles.
  // SUPERSEDED for persistent data by the SQLite data layer (POST /api/data/import, GET /api/data/datasets,
  // GET /api/market/candles — server/routes/dataRoutes.ts), which keeps provenance and survives restarts.
  // Kept reachable because the owner's CsvImportPanel and provider API sync write here; the engines read
  // SQLite first and fall back to this store (server/services/engineCandles.ts).
  app.get('/api/market/datasets', (_req: Request, res: Response) => {
    res.json({
      datasets: historicalCandleStore.listSummaries(),
    });
  });

  app.post('/api/market/candles/import', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = CsvImportSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid CSV import payload.',
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

      const csvRes = parseAndValidateCsvCandles({
        csvContent: parsed.data.csvContent,
        symbol: instrument.exchangeSymbol,
        exchange: instrument.exchange,
        timeframe: parsed.data.timeframe,
        sourceName: parsed.data.sourceName ?? 'CSV_HISTORICAL',
      });

      if (!csvRes.valid) {
        res.status(400).json({
          error: 'INVALID_OHLCV_CSV',
          message: 'CSV validation failed.',
          details: csvRes.errors,
        });
        return;
      }

      const meta = historicalCandleStore.save(
        instrument.exchangeSymbol,
        parsed.data.timeframe,
        csvRes.candles,
        csvRes.warnings
      );

      res.status(201).json({
        dataset: meta,
      });
    } catch (err) {
      next(err);
    }
  });

  app.delete('/api/market/candles', (_req: Request, res: Response) => {
    historicalCandleStore.clearAll();
    res.json({ cleared: true });
  });

  app.get('/api/market/candles/:symbol', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sym = SymbolParamSchema.safeParse(req.params);
      const tfParsed = TimeframeEnum.safeParse(req.query.timeframe ?? 'H4');
      if (!sym.success || !tfParsed.success) {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid symbol or timeframe parameter.',
        });
        return;
      }

      const instrument = await instrumentRepository.findBySymbol(sym.data.symbol);
      if (!instrument) {
        res.status(404).json({
          error: 'INSTRUMENT_NOT_FOUND',
          message: `Instrument ${sym.data.symbol} not found.`,
        });
        return;
      }

      const candleRes = await loadEngineCandles(candleRepository, instrument, tfParsed.data);
      const closes = candleRes.candles.map((c) => c.close);
      const ema20 = calculateEMA(closes, 20);
      const ema50 = calculateEMA(closes, 50);
      const ema200 = calculateEMA(closes, 200);

      res.json({
        instrument,
        timeframe: tfParsed.data,
        status: candleRes.status,
        reason: candleRes.reason,
        meta: candleRes.meta,
        origin: candleRes.origin,
        candles: candleRes.candles,
        overlays: {
          ema20,
          ema50,
          ema200,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // Phase 3: Technical Analysis Engine
  app.get('/api/technical/:symbol', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sym = SymbolParamSchema.safeParse(req.params);
      const tfParsed = TimeframeEnum.safeParse(req.query.timeframe ?? 'H4');
      if (!sym.success || !tfParsed.success) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid symbol or timeframe.' });
        return;
      }

      const instrument = await instrumentRepository.findBySymbol(sym.data.symbol);
      if (!instrument) {
        res.status(404).json({ error: 'INSTRUMENT_NOT_FOUND', message: 'Instrument not found.' });
        return;
      }

      const candleRes = await loadEngineCandles(candleRepository, instrument, tfParsed.data);
      const snapshot = analyzeTechnicalSnapshot(
        candleRes.candles,
        instrument.exchangeSymbol,
        instrument.exchange,
        tfParsed.data
      );
      res.json({ instrument, snapshot });
    } catch (err) {
      next(err);
    }
  });

  // Phase 4: Deterministic Strategy Engine
  app.get('/api/strategies', (_req: Request, res: Response) => {
    res.json({ strategies: STRATEGY_CATALOG });
  });

  app.get('/api/signals/:symbol', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sym = SymbolParamSchema.safeParse(req.params);
      const tfParsed = TimeframeEnum.safeParse(req.query.timeframe ?? 'H4');
      if (!sym.success || !tfParsed.success) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid symbol or timeframe.' });
        return;
      }

      const instrument = await instrumentRepository.findBySymbol(sym.data.symbol);
      if (!instrument) {
        res.status(404).json({ error: 'INSTRUMENT_NOT_FOUND', message: 'Instrument not found.' });
        return;
      }

      const candleRes = await loadEngineCandles(candleRepository, instrument, tfParsed.data);
      const snapshot = analyzeTechnicalSnapshot(
        candleRes.candles,
        instrument.exchangeSymbol,
        instrument.exchange,
        tfParsed.data
      );
      const signals = evaluateAllStrategies(snapshot, candleRes.candles, tfParsed.data);

      res.json({
        instrument,
        timeframe: tfParsed.data,
        dataStatus: snapshot.status,
        signals,
      });
    } catch (err) {
      next(err);
    }
  });

  // Phase 5: Server-side Gemini AI Commodity Analyst
  app.post('/api/ai/analyze', aiRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = AiAnalyzeRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid AI analysis request.',
          details: parsed.error.issues,
        });
        return;
      }

      const instrument = await instrumentRepository.findBySymbol(parsed.data.symbol);
      if (!instrument) {
        res.status(404).json({ error: 'INSTRUMENT_NOT_FOUND', message: 'Instrument not found.' });
        return;
      }

      const tf = parsed.data.timeframe as Timeframe;
      const candleRes = await loadEngineCandles(candleRepository, instrument, tf);
      const snapshot = analyzeTechnicalSnapshot(
        candleRes.candles,
        instrument.exchangeSymbol,
        instrument.exchange,
        tf
      );
      const quote = await providerRegistry.getQuoteForInstrument(instrument).catch((err: unknown) => {
        logError('[ai] quote lookup failed', err);
        return null;
      });

      const analysis = await generateResearchSummary(
        {
          instrument,
          timeframe: tf,
          language: parsed.data.language,
          quote,
          snapshot,
          candleSource: candleRes.meta ? `${candleRes.origin} ${candleRes.meta.source}` : candleRes.origin,
          cot: loadCotForAi(getAiCot(), instrument.id),
        },
        { ...aiOptions, logError: aiOptions.logError ?? logError }
      );

      res.json({ analysis });
    } catch (err) {
      next(err);
    }
  });

  // Phase 6: AI Trade Scanner
  app.post('/api/scanner/scan', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = ScannerRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid scanner configuration.',
          details: parsed.error.issues,
        });
        return;
      }

      const instruments = await instrumentRepository.list({
        category: parsed.data.category,
        exchange: parsed.data.exchange,
      });
      // Prefetch SQLite-first candles (the scanner engine itself is synchronous).
      const prefetched = new Map<string, EngineCandleResult>();
      for (const inst of instruments) {
        prefetched.set(inst.id, await loadEngineCandles(candleRepository, inst, parsed.data.timeframe));
      }
      const result = runTradeScanner(instruments, parsed.data, (inst) => prefetched.get(inst.id)!);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // Phase 7: Deterministic Risk Management Engine
  app.post('/api/risk/calculate', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = RiskCalculationSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid risk calculation parameters.',
          details: parsed.error.issues,
        });
        return;
      }

      const instrument = await instrumentRepository.findBySymbol(parsed.data.symbol);
      if (!instrument) {
        res.status(404).json({ error: 'INSTRUMENT_NOT_FOUND', message: 'Instrument not found.' });
        return;
      }

      const result = calculateDeterministicRisk({
        ...parsed.data,
        instrument,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // Phase 8: Historical Backtesting Engine
  app.post('/api/backtest/run', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = BacktestRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid backtest configuration.',
          details: parsed.error.issues,
        });
        return;
      }

      const instrument = await instrumentRepository.findBySymbol(parsed.data.symbol);
      if (!instrument) {
        res.status(404).json({ error: 'INSTRUMENT_NOT_FOUND', message: 'Instrument not found.' });
        return;
      }

      const candleRes = await loadEngineCandles(candleRepository, instrument, parsed.data.timeframe);
      const result = runHistoricalBacktest(candleRes.candles, {
        instrument,
        strategyId: parsed.data.strategyId,
        timeframe: parsed.data.timeframe,
        initialEquity: parsed.data.initialEquity,
        contractsPerTrade: parsed.data.contractsPerTrade,
        commissionPerContract: parsed.data.commissionPerContract,
        slippageTicks: parsed.data.slippageTicks,
        rolloverIntervalBars: parsed.data.rolloverIntervalBars,
        rolloverCostPerContract: parsed.data.rolloverCostPerContract,
        dataProvenance: {
          origin: candleRes.origin,
          source: candleRes.meta?.source ?? null,
          warnings: [...(candleRes.meta?.warnings ?? []), ...(candleRes.reason ? [candleRes.reason] : [])],
        },
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // Phase 9: Portfolio Exposure & Trade Journal Analytics
  app.post('/api/portfolio/analyze', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = PortfolioAnalyzeSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid portfolio payload.',
          details: parsed.error.issues,
        });
        return;
      }

      const instruments = await instrumentRepository.list();
      const map = new Map(instruments.map((i) => [i.id, i]));
      res.json(analyzePortfolioExposure(parsed.data.positions, map));
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/journal/analytics', (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = JournalAnalyticsSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid journal analytics payload.',
          details: parsed.error.issues,
        });
        return;
      }
      res.json(analyzeTradeJournal(parsed.data.entries));
    } catch (err) {
      next(err);
    }
  });

  // Phase 10: Sourced Fundamental, Macro & Economic Calendar
  app.get('/api/fundamental/records', (req: Request, res: Response) => {
    const asOfRaw = typeof req.query.asOf === 'string' && req.query.asOf.trim() ? req.query.asOf.trim() : undefined;
    if (asOfRaw && !Number.isFinite(Date.parse(asOfRaw))) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid asOf timestamp parameter.' });
      return;
    }
    const catParsed = req.query.category
      ? FundamentalCategoryEnum.safeParse(req.query.category)
      : null;
    if (catParsed && !catParsed.success) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid category parameter.' });
      return;
    }
    const symbolRaw = typeof req.query.symbol === 'string' && req.query.symbol.trim() ? req.query.symbol.trim() : undefined;

    const records = fundamentalStore.listRecords({
      asOf: asOfRaw,
      category: catParsed?.success ? catParsed.data : undefined,
      symbol: symbolRaw,
    });
    const news = fundamentalStore.listNews({ asOf: asOfRaw });
    const domains = buildFundamentalDomainsStatus({ records });
    res.json({
      status: records.length > 0 || news.length > 0 ? 'HISTORICAL' : 'UNAVAILABLE',
      asOf: asOfRaw ?? null,
      records,
      news,
      domains,
    });
  });

  app.post('/api/fundamental/records', (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = FundamentalRecordSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Sourced macro/news records require valid source and publicationTimestamp.',
          details: parsed.error.issues,
        });
        return;
      }

      if (parsed.data.kind === 'NEWS') {
        const createdNews = fundamentalStore.addNews({
          headline: parsed.data.headline || parsed.data.dataset,
          source: parsed.data.source,
          publicationTimestamp: parsed.data.publicationTimestamp,
          category: 'GEOPOLITICAL',
          relatedSymbols: parsed.data.relatedSymbols ?? [],
          classification: parsed.data.impactAssessment,
          summary: parsed.data.summary ?? `${parsed.data.dataset}: ${parsed.data.actualValue ?? ''}`,
        });
        res.status(201).json({ news: createdNews });
        return;
      }

      const createdRecord = fundamentalStore.addRecord({
        dataset: parsed.data.dataset,
        source: parsed.data.source,
        publicationTimestamp: parsed.data.publicationTimestamp,
        observationDate: parsed.data.observationDate,
        dataPeriod: parsed.data.dataPeriod,
        category: parsed.data.category,
        relatedSymbols: parsed.data.relatedSymbols,
        actualValue: parsed.data.actualValue,
        previousValue: parsed.data.previousValue,
        forecastValue: parsed.data.forecastValue,
        unit: parsed.data.unit,
        revisionStatus: parsed.data.revisionStatus,
        impactAssessment: parsed.data.impactAssessment,
      });
      res.status(201).json({ record: createdRecord });
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
