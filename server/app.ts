import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { DEVELOPMENT_ROADMAP, PLATFORM_MODULES } from '../src/shared/architecture.ts';
import type { Timeframe } from '../src/shared/types/instrument.ts';
import { getVietnamClockLabel, VIETNAM_TIMEZONE } from '../src/shared/utils/time.ts';
import { runHistoricalBacktest } from './engines/backtestEngine.ts';
import { analyzePortfolioExposure, analyzeTradeJournal } from './engines/portfolioEngine.ts';
import { calculateDeterministicRisk } from './engines/riskEngine.ts';
import { runTradeScanner } from './engines/scannerEngine.ts';
import { evaluateAllStrategies, STRATEGY_CATALOG } from './engines/strategyEngine.ts';
import { analyzeTechnicalSnapshot, calculateEMA } from './engines/technicalEngine.ts';
import { providerRegistry } from './providers/registry.ts';
import { generateCommodityAiAnalysis } from './services/aiAnalyst.ts';
import { historicalCandleStore } from './services/candleStore.ts';
import { parseAndValidateCsvCandles } from './services/csvImporter.ts';
import { fundamentalStore } from './services/fundamentalService.ts';
import { instrumentRepository } from './services/instrumentRegistry.ts';

const TimeframeEnum = z.enum(['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1']);
const CategoryEnum = z.enum(['AGRICULTURE', 'SOFT_COMMODITIES', 'METALS', 'ENERGY']);
const ExchangeEnum = z.enum(['MXV', 'CBOT', 'CME', 'COMEX', 'NYMEX', 'ICE']);
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

const CsvImportSchema = z.object({
  symbol: z.string().min(1).max(24),
  timeframe: TimeframeEnum,
  csvContent: z.string().min(10).max(2_000_000),
  sourceName: z.string().min(1).max(80).optional(),
});

const SyncRequestSchema = z.object({
  symbol: z.string().min(1).max(24).optional(),
  timeframe: TimeframeEnum.optional(),
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

const AiAnalyzeRequestSchema = z.object({
  symbol: z.string().min(1).max(24),
  timeframe: TimeframeEnum,
  riskSettings: z
    .object({
      accountEquity: z.number().nonnegative().default(10000),
      accountCurrency: z.enum(['USD', 'VND']).default('USD'),
      riskPercentagePerTrade: z.number().min(0.05).max(10).default(1),
      dailyLossLimitPct: z.number().min(0.5).max(25).default(3),
      maxOpenPositions: z.number().int().min(1).max(50).default(4),
      maxPortfolioRiskPct: z.number().min(0.5).max(50).default(5),
      maxContractsPerInstrument: z.number().int().min(1).max(100).default(5),
      defaultTradingStyle: z.enum(['SCALPING', 'INTRADAY', 'SWING', 'POSITION']).default('SWING'),
      defaultTimeframe: TimeframeEnum.default('H4'),
      displayTimezone: z
        .enum(['Asia/Ho_Chi_Minh', 'UTC', 'America/Chicago', 'Europe/London'])
        .default('Asia/Ho_Chi_Minh'),
    })
    .optional(),
});

const FundamentalRecordSchema = z.object({
  kind: z.enum(['MACRO', 'NEWS']).default('MACRO'),
  dataset: z.string().min(1).max(80),
  source: z.string().min(1).max(120),
  publicationTimestamp: z.string().min(1).max(64),
  dataPeriod: z.string().min(1).max(40).default('CURRENT'),
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

// Simple per-IP sliding window rate limiter for expensive AI endpoint
function createRateLimiter(maxRequests: number, windowMs: number) {
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

export function createApiApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
  });

  const aiRateLimiter = createRateLimiter(12, 60_000);

  app.get('/api/health', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const providers = await providerRegistry.getAllHealth();
      const connectedProviders = providers.filter((p) => p.connectionState === 'CONNECTED').length;
      const hasLiveConnected = providers.some(
        (p) => p.connectionState === 'CONNECTED' && p.supportsRealtime
      );
      const hasHistorical = historicalCandleStore.listSummaries().length > 0;
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
          marketDataProvidersConnected: connectedProviders,
          marketDataOverallStatus: hasLiveConnected
            ? 'CURRENT'
            : hasHistorical
              ? 'HISTORICAL'
              : 'UNAVAILABLE',
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
      const hasConnected = providers.some((p) => p.connectionState === 'CONNECTED');
      const hasLiveConnected = providers.some(
        (p) => p.connectionState === 'CONNECTED' && p.supportsRealtime
      );
      const hasHistorical = historicalCandleStore.listSummaries().length > 0;
      res.json({
        retrievedAt: new Date().toISOString(),
        overallStatus: hasLiveConnected
          ? 'CURRENT'
          : hasConnected
            ? hasHistorical
              ? 'HISTORICAL'
              : 'CURRENT'
            : 'UNAVAILABLE',
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

      res.json({
        retrievedAt: new Date().toISOString(),
        overallStatus: hasCurrent ? 'CURRENT' : hasHistorical ? 'HISTORICAL' : 'UNAVAILABLE',
        notice: hasCurrent
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

  // Phase 2: Historical CSV Datasets & OHLCV Candles
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

      const candleRes = historicalCandleStore.getCandles(instrument.exchangeSymbol, tfParsed.data);
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

      const candleRes = historicalCandleStore.getCandles(instrument.exchangeSymbol, tfParsed.data);
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

      const candleRes = historicalCandleStore.getCandles(instrument.exchangeSymbol, tfParsed.data);
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
      const candleRes = historicalCandleStore.getCandles(instrument.exchangeSymbol, tf);
      const snapshot = analyzeTechnicalSnapshot(
        candleRes.candles,
        instrument.exchangeSymbol,
        instrument.exchange,
        tf
      );
      const signals = evaluateAllStrategies(snapshot, candleRes.candles, tf);
      const macroRecords = fundamentalStore.listRecords();

      const analysis = await generateCommodityAiAnalysis({
        instrument,
        timeframe: tf,
        snapshot,
        signals,
        macroRecords,
        riskSettings: parsed.data.riskSettings ?? {
          accountEquity: 10000,
          accountCurrency: 'USD',
          riskPercentagePerTrade: 1,
          dailyLossLimitPct: 3,
          maxOpenPositions: 4,
          maxPortfolioRiskPct: 5,
          maxContractsPerInstrument: 5,
          defaultTradingStyle: 'SWING',
          defaultTimeframe: tf,
          displayTimezone: 'Asia/Ho_Chi_Minh',
        },
      });

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
      const result = runTradeScanner(instruments, parsed.data);
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

      const candleRes = historicalCandleStore.getCandles(
        instrument.exchangeSymbol,
        parsed.data.timeframe
      );
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
  app.get('/api/fundamental/records', (_req: Request, res: Response) => {
    const records = fundamentalStore.listRecords();
    const news = fundamentalStore.listNews();
    res.json({
      status: records.length > 0 || news.length > 0 ? 'HISTORICAL' : 'UNAVAILABLE',
      records,
      news,
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
        dataPeriod: parsed.data.dataPeriod,
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

  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({
      error: 'NOT_FOUND',
      message: 'Requested API endpoint does not exist.',
    });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : 'Unexpected server error.';
    res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message,
    });
  });

  return app;
}
