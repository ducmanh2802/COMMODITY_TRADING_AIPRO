import { z } from 'zod';
import type { DataQualityStatus, MarketCandle, MarketQuote } from '../types/market';

export const DataQualityStatusSchema = z.enum([
  'CURRENT',
  'DELAYED',
  'HISTORICAL',
  'STALE',
  'UNAVAILABLE',
  'INVALID',
]);

export const MarketQuoteSchema = z.object({
  symbol: z.string().min(1),
  exchange: z.string().min(1),
  contractMonth: z.string().nullable(),
  price: z.number().positive().nullable(),
  bid: z.number().positive().nullable(),
  ask: z.number().positive().nullable(),
  volume: z.number().nonnegative().nullable(),
  openInterest: z.number().nonnegative().nullable(),
  currency: z.string().min(1),
  unit: z.string().min(1),
  source: z.string().min(1),
  timestamp: z.string().nullable(),
  retrievedAt: z.string().min(1),
  status: DataQualityStatusSchema,
  statusReason: z.string().optional(),
});

export const MarketCandleSchema = z.object({
  symbol: z.string().min(1),
  exchange: z.string().min(1),
  timeframe: z.string().min(1),
  timestamp: z.string().min(1),
  retrievedAt: z.string().min(1),
  open: z.number().positive(),
  high: z.number().positive(),
  low: z.number().positive(),
  close: z.number().positive(),
  volume: z.number().nonnegative().nullable(),
  openInterest: z.number().nonnegative().nullable(),
  isComplete: z.boolean(),
  source: z.string().min(1),
  status: DataQualityStatusSchema,
});

export function createUnavailableQuote(params: {
  symbol: string;
  exchange: string;
  contractMonth: string | null;
  currency: string;
  unit: string;
  source: string;
  reason: string;
  retrievedAt?: string;
}): MarketQuote {
  return {
    symbol: params.symbol,
    exchange: params.exchange,
    contractMonth: params.contractMonth,
    price: null,
    bid: null,
    ask: null,
    volume: null,
    openInterest: null,
    currency: params.currency,
    unit: params.unit,
    source: params.source,
    timestamp: null,
    retrievedAt: params.retrievedAt ?? new Date().toISOString(),
    status: 'UNAVAILABLE',
    statusReason: params.reason,
  };
}

export interface QuoteValidationResult {
  valid: boolean;
  status: DataQualityStatus;
  errors: string[];
}

export function validateMarketQuote(quote: MarketQuote): QuoteValidationResult {
  const errors: string[] = [];

  if (quote.status === 'UNAVAILABLE') {
    return { valid: false, status: 'UNAVAILABLE', errors: [quote.statusReason ?? 'DATA_UNAVAILABLE'] };
  }

  const parsed = MarketQuoteSchema.safeParse(quote);
  if (!parsed.success) {
    return {
      valid: false,
      status: 'INVALID',
      errors: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    };
  }

  if (quote.price === null || quote.timestamp === null) {
    errors.push('Missing price or original market timestamp.');
  }

  if (quote.bid !== null && quote.ask !== null && quote.bid > quote.ask) {
    errors.push(`Invalid quote spread: bid (${quote.bid}) exceeds ask (${quote.ask}).`);
  }

  if (quote.timestamp !== null && Number.isNaN(Date.parse(quote.timestamp))) {
    errors.push('Invalid ISO-8601 market timestamp.');
  }

  if (errors.length > 0) {
    return { valid: false, status: 'INVALID', errors };
  }

  return { valid: true, status: quote.status, errors: [] };
}

export interface CandleSeriesValidationResult {
  valid: boolean;
  status: DataQualityStatus;
  errors: string[];
  validCandles: MarketCandle[];
}

export function validateCandleSeries(candles: MarketCandle[]): CandleSeriesValidationResult {
  if (candles.length === 0) {
    return {
      valid: false,
      status: 'UNAVAILABLE',
      errors: ['No candles provided.'],
      validCandles: [],
    };
  }

  const errors: string[] = [];
  const seenTimestamps = new Set<number>();
  let previousTs = -Infinity;
  const validCandles: MarketCandle[] = [];

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const schemaRes = MarketCandleSchema.safeParse(candle);
    if (!schemaRes.success) {
      errors.push(`Candle[${i}] failed schema validation.`);
      continue;
    }

    const ts = Date.parse(candle.timestamp);
    if (Number.isNaN(ts)) {
      errors.push(`Candle[${i}] invalid timestamp ${candle.timestamp}.`);
      continue;
    }

    if (seenTimestamps.has(ts)) {
      errors.push(`Candle[${i}] duplicate timestamp ${candle.timestamp}.`);
      continue;
    }
    seenTimestamps.add(ts);

    if (ts < previousTs) {
      errors.push(`Candle[${i}] out-of-order timestamp ${candle.timestamp}.`);
      continue;
    }
    previousTs = ts;

    if (
      candle.high < candle.low ||
      candle.high < candle.open ||
      candle.high < candle.close ||
      candle.low > candle.open ||
      candle.low > candle.close
    ) {
      errors.push(`Candle[${i}] invalid OHLC relationship.`);
      continue;
    }

    validCandles.push(candle);
  }

  if (errors.length > 0 || validCandles.length === 0) {
    return {
      valid: false,
      status: 'INVALID',
      errors,
      validCandles: [],
    };
  }

  return {
    valid: true,
    status: validCandles[validCandles.length - 1].status,
    errors: [],
    validCandles,
  };
}
