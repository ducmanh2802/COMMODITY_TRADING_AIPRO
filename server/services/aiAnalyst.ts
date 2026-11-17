import { GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';
import type { AiAnalystOutput, FundamentalMacroRecord } from '../../src/shared/types/analysis.ts';
import type { InstrumentDefinition, Timeframe } from '../../src/shared/types/instrument.ts';
import type { UserRiskSettings } from '../../src/shared/types/risk.ts';
import type { DeterministicSignal } from '../engines/strategyEngine.ts';
import type { TechnicalSnapshot } from '../engines/technicalEngine.ts';
import { sanitizeExternalText } from './fundamentalService.ts';

const AiAnalystResponseSchema = z.object({
  instrument: z.string(),
  marketStatus: z.enum(['BULLISH', 'BEARISH', 'SIDEWAYS', 'UNCERTAIN']),
  action: z.enum(['STRONG_BUY', 'BUY', 'SELL', 'NO_TRADE']),
  timeframe: z.enum(['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1']),
  confidence: z.number().min(0).max(100),
  trendAnalysis: z.object({
    mainTrend: z.string(),
    shortTermTrend: z.string(),
    regime: z.string(),
    summary: z.string(),
  }),
  technicalEvidence: z.array(z.string()),
  fundamentalEvidence: z.array(z.string()),
  bullishScenario: z.object({
    trigger: z.string(),
    targetContext: z.string(),
    invalidation: z.string(),
  }),
  bearishScenario: z.object({
    trigger: z.string(),
    targetContext: z.string(),
    invalidation: z.string(),
  }),
  entryZone: z.object({
    low: z.number().nullable(),
    high: z.number().nullable(),
    basis: z.string(),
  }),
  stopLoss: z.object({
    price: z.number().nullable(),
    basis: z.string(),
  }),
  takeProfits: z.array(
    z.object({
      level: z.string(),
      price: z.number(),
    })
  ),
  riskReward: z.number().nullable(),
  invalidationConditions: z.array(z.string()),
  riskWarnings: z.array(z.string()),
  dataQuality: z.object({
    status: z.enum(['CURRENT', 'DELAYED', 'HISTORICAL', 'STALE', 'UNAVAILABLE', 'INVALID']),
    source: z.string(),
    timestamp: z.string().nullable(),
  }),
});

export interface AiAnalysisRequestContext {
  instrument: InstrumentDefinition;
  timeframe: Timeframe;
  snapshot: TechnicalSnapshot;
  signals: DeterministicSignal[];
  macroRecords: FundamentalMacroRecord[];
  riskSettings: Omit<UserRiskSettings, 'userId'>;
}

/**
 * Server-side Google Gemini Commodity Analyst.
 * Never invents prices; returns deterministic NO_TRADE when market data is unavailable/invalid,
 * and locks numerical entry/SL/TP/R:R levels to deterministic engine outputs.
 */
export async function generateCommodityAiAnalysis(
  ctx: AiAnalysisRequestContext
): Promise<AiAnalystOutput> {
  // 1. Fail closed immediately when required market data is missing or invalid
  if (
    ctx.snapshot.status === 'UNAVAILABLE' ||
    ctx.snapshot.status === 'INVALID' ||
    ctx.snapshot.lastClose === null
  ) {
    return {
      instrument: ctx.instrument.exchangeSymbol,
      marketStatus: 'UNCERTAIN',
      action: 'NO_TRADE',
      timeframe: ctx.timeframe,
      confidence: 0,
      trendAnalysis: {
        mainTrend: 'UNCERTAIN',
        shortTermTrend: 'UNCERTAIN',
        regime: 'INSUFFICIENT_DATA',
        summary: 'DATA_UNAVAILABLE — No verified market data available for analysis.',
      },
      technicalEvidence: [],
      fundamentalEvidence: [],
      bullishScenario: {
        trigger: 'Pending verified OHLCV data import or authorized market feed.',
        targetContext: 'UNAVAILABLE',
        invalidation: 'N/A',
      },
      bearishScenario: {
        trigger: 'Pending verified OHLCV data import or authorized market feed.',
        targetContext: 'UNAVAILABLE',
        invalidation: 'N/A',
      },
      entryZone: { low: null, high: null, basis: 'DATA_UNAVAILABLE' },
      stopLoss: { price: null, basis: 'DATA_UNAVAILABLE' },
      takeProfits: [],
      riskReward: null,
      invalidationConditions: ['No validated market candles available.'],
      riskWarnings: [
        'DATA_UNAVAILABLE — Signal generation suppressed to prevent ungrounded trading outputs.',
      ],
      dataQuality: {
        status: ctx.snapshot.status,
        source: 'FAIL_CLOSED_GUARD',
        timestamp: ctx.snapshot.lastTimestamp,
      },
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error(
      'GEMINI_API_KEY is not configured in server environment Secrets. AI Commodity Analyst requires a server-side Gemini API key.'
    );
  }

  // Deterministic reference levels from highest-scoring confirmed strategy (or null if flat)
  const confirmedSignals = ctx.signals
    .filter((s) => s.confirmationStatus === 'CONFIRMED' && s.direction !== 'NONE')
    .sort((a, b) => (b.setupQualityScore ?? 0) - (a.setupQualityScore ?? 0));
  const topSignal = confirmedSignals[0] ?? null;

  const deterministicLevels = {
    hasConfirmedSetup: Boolean(topSignal),
    topStrategy: topSignal?.strategyName ?? 'NONE',
    direction: topSignal?.direction ?? 'NONE',
    entryZoneLow: topSignal?.entryZone ? topSignal.entryZone[0] : null,
    entryZoneHigh: topSignal?.entryZone ? topSignal.entryZone[1] : null,
    stopLossPrice: topSignal?.stopLoss ?? null,
    takeProfits: topSignal?.takeProfits ?? [],
    riskReward: topSignal?.riskReward ?? null,
    invalidation: topSignal?.invalidationCondition ?? 'No active trade setup.',
  };

  const sanitizedMacro = ctx.macroRecords.slice(0, 8).map((m) => ({
    dataset: sanitizeExternalText(m.dataset),
    source: sanitizeExternalText(m.source),
    period: sanitizeExternalText(m.dataPeriod),
    actual: m.actualValue,
    previous: m.previousValue,
    forecast: m.forecastValue,
    unit: sanitizeExternalText(m.unit),
    impact: m.impactAssessment,
    publishedAt: m.publicationTimestamp,
  }));

  const payloadForModel = {
    instrument: {
      id: ctx.instrument.id,
      productName: ctx.instrument.productName,
      exchange: ctx.instrument.exchange,
      symbol: ctx.instrument.exchangeSymbol,
      specStatus: ctx.instrument.specification.verificationStatus,
      currency: ctx.instrument.specification.tradingCurrency,
      unit: ctx.instrument.specification.quotationUnit,
      mxvSymbol: ctx.instrument.mxvMapping?.mxvSymbol ?? null,
      mxvMappingStatus: ctx.instrument.mxvMapping?.mappingStatus ?? 'UNAVAILABLE',
      vietnameseName: ctx.instrument.commodityProfile?.vietnameseName ?? null,
      deliveryGrade: ctx.instrument.commodityProfile?.deliveryGrade ?? null,
      vietnamTradingSessionsIct:
        ctx.instrument.commodityProfile?.vietnamTradingSessionsIct ?? null,
      vietnamMarketRelevance:
        ctx.instrument.commodityProfile?.vietnamMarketRelevance ?? null,
      fundamentalDrivers: ctx.instrument.commodityProfile?.fundamentalDrivers ?? [],
      seasonalPattern: ctx.instrument.commodityProfile?.seasonalPattern ?? null,
      fxSensitivity: ctx.instrument.commodityProfile?.fxSensitivity ?? null,
    },
    dataQuality: {
      status: ctx.snapshot.status,
      candleCount: ctx.snapshot.completeCandleCount,
      lastTimestamp: ctx.snapshot.lastTimestamp,
      lastClose: ctx.snapshot.lastClose,
    },
    technicalSnapshot: {
      ema: ctx.snapshot.ema,
      sma: ctx.snapshot.sma,
      rsi14: ctx.snapshot.rsi14,
      macd: ctx.snapshot.macd,
      bollinger: ctx.snapshot.bollinger,
      atr14: ctx.snapshot.atr14,
      atrPct: ctx.snapshot.atrPct,
      adx14: ctx.snapshot.adx14,
      vwap: ctx.snapshot.vwap,
      pivots: ctx.snapshot.pivots,
      marketStructure: {
        mainTrend: ctx.snapshot.marketStructure.mainTrend,
        shortTermTrend: ctx.snapshot.marketStructure.shortTermTrend,
        momentum: ctx.snapshot.marketStructure.momentum,
        volatility: ctx.snapshot.marketStructure.volatility,
        marketRegime: ctx.snapshot.marketStructure.marketRegime,
        structurePattern: ctx.snapshot.marketStructure.structurePattern,
        supportZones: ctx.snapshot.marketStructure.supportZones,
        resistanceZones: ctx.snapshot.marketStructure.resistanceZones,
        bullishInvalidationLevel: ctx.snapshot.marketStructure.bullishInvalidationLevel,
        bearishInvalidationLevel: ctx.snapshot.marketStructure.bearishInvalidationLevel,
      },
    },
    deterministicStrategyOutputs: deterministicLevels,
    sourcedFundamentalRecords: sanitizedMacro,
    riskConstraints: {
      accountCurrency: ctx.riskSettings.accountCurrency,
      riskPercentagePerTrade: ctx.riskSettings.riskPercentagePerTrade,
      maxPortfolioRiskPct: ctx.riskSettings.maxPortfolioRiskPct,
      defaultTradingStyle: ctx.riskSettings.defaultTradingStyle,
    },
  };

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const systemInstruction = [
    'You are an institutional Commodity Futures Analyst specializing in Vietnam MXV-linked markets and international benchmarks (ICE, CBOT, CME, COMEX, NYMEX).',
    'Analyze ONLY the provided validated JSON context.',
    'NEVER invent, extrapolate, or modify numerical price levels, stop losses, or take profits.',
    'All numerical entryZone, stopLoss, takeProfits, and riskReward values MUST come strictly from deterministicStrategyOutputs or remain null/empty if hasConfirmedSetup is false.',
    'If hasConfirmedSetup is false, action MUST be NO_TRADE.',
    'Incorporate the supplied fundamentalDrivers, seasonalPattern, fxSensitivity, and vietnamMarketRelevance when contextualizing scenarios and ICT trading sessions.',
    'Confidence (0-100) is an analytical alignment score, never a guaranteed probability of winning.',
    'Highlight data quality limitations (for example, HISTORICAL CSV data vs live feed, benchmark proxy notes, or empty fundamental records).',
  ].join(' ');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Evaluate this validated commodity market snapshot and return structured JSON:\n${JSON.stringify(payloadForModel)}`,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          instrument: { type: Type.STRING },
          marketStatus: { type: Type.STRING, enum: ['BULLISH', 'BEARISH', 'SIDEWAYS', 'UNCERTAIN'] },
          action: { type: Type.STRING, enum: ['STRONG_BUY', 'BUY', 'SELL', 'NO_TRADE'] },
          timeframe: { type: Type.STRING, enum: ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'] },
          confidence: { type: Type.NUMBER },
          trendAnalysis: {
            type: Type.OBJECT,
            properties: {
              mainTrend: { type: Type.STRING },
              shortTermTrend: { type: Type.STRING },
              regime: { type: Type.STRING },
              summary: { type: Type.STRING },
            },
            required: ['mainTrend', 'shortTermTrend', 'regime', 'summary'],
          },
          technicalEvidence: { type: Type.ARRAY, items: { type: Type.STRING } },
          fundamentalEvidence: { type: Type.ARRAY, items: { type: Type.STRING } },
          bullishScenario: {
            type: Type.OBJECT,
            properties: {
              trigger: { type: Type.STRING },
              targetContext: { type: Type.STRING },
              invalidation: { type: Type.STRING },
            },
            required: ['trigger', 'targetContext', 'invalidation'],
          },
          bearishScenario: {
            type: Type.OBJECT,
            properties: {
              trigger: { type: Type.STRING },
              targetContext: { type: Type.STRING },
              invalidation: { type: Type.STRING },
            },
            required: ['trigger', 'targetContext', 'invalidation'],
          },
          entryZone: {
            type: Type.OBJECT,
            properties: {
              low: { type: Type.NUMBER, nullable: true },
              high: { type: Type.NUMBER, nullable: true },
              basis: { type: Type.STRING },
            },
            required: ['basis'],
          },
          stopLoss: {
            type: Type.OBJECT,
            properties: {
              price: { type: Type.NUMBER, nullable: true },
              basis: { type: Type.STRING },
            },
            required: ['basis'],
          },
          takeProfits: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                level: { type: Type.STRING },
                price: { type: Type.NUMBER },
              },
              required: ['level', 'price'],
            },
          },
          riskReward: { type: Type.NUMBER, nullable: true },
          invalidationConditions: { type: Type.ARRAY, items: { type: Type.STRING } },
          riskWarnings: { type: Type.ARRAY, items: { type: Type.STRING } },
          dataQuality: {
            type: Type.OBJECT,
            properties: {
              status: { type: Type.STRING },
              source: { type: Type.STRING },
              timestamp: { type: Type.STRING, nullable: true },
            },
            required: ['status', 'source'],
          },
        },
        required: [
          'instrument',
          'marketStatus',
          'action',
          'timeframe',
          'confidence',
          'trendAnalysis',
          'technicalEvidence',
          'fundamentalEvidence',
          'bullishScenario',
          'bearishScenario',
          'entryZone',
          'stopLoss',
          'takeProfits',
          'invalidationConditions',
          'riskWarnings',
          'dataQuality',
        ],
      },
    },
  });

  const rawText = (response.text ?? '{}').trim();
  const parsedJson = JSON.parse(rawText);
  const validated = AiAnalystResponseSchema.parse(parsedJson);

  // Enforce deterministic authority over all numerical trade levels & action guard
  const lockedAction = !topSignal
    ? 'NO_TRADE'
    : validated.action === 'NO_TRADE'
      ? 'NO_TRADE'
      : topSignal.direction === 'LONG'
        ? validated.action === 'STRONG_BUY'
          ? 'STRONG_BUY'
          : 'BUY'
        : 'SELL';

  return {
    instrument: ctx.instrument.exchangeSymbol,
    marketStatus: validated.marketStatus,
    action: lockedAction,
    timeframe: ctx.timeframe,
    confidence: Math.round(validated.confidence),
    trendAnalysis: validated.trendAnalysis,
    technicalEvidence: validated.technicalEvidence,
    fundamentalEvidence:
      sanitizedMacro.length === 0
        ? ['No sourced fundamental or macro datasets currently loaded (Phase 10 store empty).']
        : validated.fundamentalEvidence,
    bullishScenario: validated.bullishScenario,
    bearishScenario: validated.bearishScenario,
    entryZone: {
      low: deterministicLevels.entryZoneLow,
      high: deterministicLevels.entryZoneHigh,
      basis: topSignal ? `Deterministic ${topSignal.strategyName}` : 'No confirmed setup',
    },
    stopLoss: {
      price: deterministicLevels.stopLossPrice,
      basis: topSignal ? topSignal.invalidationCondition : 'No confirmed setup',
    },
    takeProfits: deterministicLevels.takeProfits.map((p, idx) => ({
      level: `TP${idx + 1}`,
      price: p,
    })),
    riskReward: deterministicLevels.riskReward,
    invalidationConditions: validated.invalidationConditions,
    riskWarnings: [
      ...validated.riskWarnings,
      'Analytical confidence score is not a statistically validated probability of winning.',
    ],
    dataQuality: {
      status: ctx.snapshot.status,
      source: 'GEMINI_4_HYDROGEN_WITH_DETERMINISTIC_GUARD',
      timestamp: ctx.snapshot.lastTimestamp,
    },
  };
}
