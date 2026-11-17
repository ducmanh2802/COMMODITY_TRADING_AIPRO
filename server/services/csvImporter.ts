import type { Timeframe } from '../../src/shared/types/instrument.ts';
import type { MarketCandle } from '../../src/shared/types/market.ts';
import { validateCandleSeries } from '../../src/shared/utils/validation.ts';

export interface CsvParseResult {
  valid: boolean;
  candles: MarketCandle[];
  errors: string[];
  warnings: string[];
}

const TIMEFRAME_MS: Record<Timeframe, number> = {
  M1: 60_000,
  M5: 5 * 60_000,
  M15: 15 * 60_000,
  M30: 30 * 60_000,
  H1: 60 * 60_000,
  H4: 4 * 60 * 60_000,
  D1: 24 * 60 * 60_000,
  W1: 7 * 24 * 60 * 60_000,
};

function normalizeTimestampToIso(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Accept epoch seconds or milliseconds if purely numeric
  if (/^\d+$/.test(trimmed)) {
    const num = Number(trimmed);
    const ms = trimmed.length <= 10 ? num * 1000 : num;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Parses and strictly validates CSV OHLCV historical data.
 * Required columns (case-insensitive header): timestamp (or date/time), open, high, low, close
 * Optional columns: volume, openInterest (or open_interest/oi)
 */
export function parseAndValidateCsvCandles(params: {
  csvContent: string;
  symbol: string;
  exchange: string;
  timeframe: Timeframe;
  sourceName?: string;
}): CsvParseResult {
  const lines = params.csvContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return {
      valid: false,
      candles: [],
      errors: ['CSV must include a header row and at least one OHLCV data row.'],
      warnings: [],
    };
  }

  const headerCols = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const tsIdx = headerCols.findIndex((h) => ['timestamp', 'date', 'datetime', 'time'].includes(h));
  const openIdx = headerCols.indexOf('open');
  const highIdx = headerCols.indexOf('high');
  const lowIdx = headerCols.indexOf('low');
  const closeIdx = headerCols.indexOf('close');
  const volIdx = headerCols.findIndex((h) => ['volume', 'vol'].includes(h));
  const oiIdx = headerCols.findIndex((h) => ['openinterest', 'open_interest', 'oi'].includes(h));

  if (tsIdx === -1 || openIdx === -1 || highIdx === -1 || lowIdx === -1 || closeIdx === -1) {
    return {
      valid: false,
      candles: [],
      errors: [
        'Missing required CSV headers. Expected: timestamp (or date), open, high, low, close.',
      ],
      warnings: [],
    };
  }

  const retrievedAt = new Date().toISOString();
  const parsedCandles: MarketCandle[] = [];
  const rowErrors: string[] = [];
  const warnings: string[] = [];

  for (let rowNum = 1; rowNum < lines.length; rowNum++) {
    const cols = lines[rowNum].split(',').map((c) => c.trim());
    const isoTs = normalizeTimestampToIso(cols[tsIdx] ?? '');
    if (!isoTs) {
      rowErrors.push(`Row ${rowNum + 1}: Invalid or missing timestamp "${cols[tsIdx] ?? ''}".`);
      continue;
    }

    const open = Number(cols[openIdx]);
    const high = Number(cols[highIdx]);
    const low = Number(cols[lowIdx]);
    const close = Number(cols[closeIdx]);

    if (
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close) ||
      open <= 0 ||
      high <= 0 ||
      low <= 0 ||
      close <= 0
    ) {
      rowErrors.push(`Row ${rowNum + 1}: OHLC values must be positive finite numbers.`);
      continue;
    }

    let volume: number | null = null;
    if (volIdx !== -1 && cols[volIdx] !== undefined && cols[volIdx] !== '') {
      const parsedVol = Number(cols[volIdx]);
      if (!Number.isFinite(parsedVol) || parsedVol < 0) {
        rowErrors.push(`Row ${rowNum + 1}: Negative or invalid volume "${cols[volIdx]}".`);
        continue;
      }
      volume = parsedVol;
    }

    let openInterest: number | null = null;
    if (oiIdx !== -1 && cols[oiIdx] !== undefined && cols[oiIdx] !== '') {
      const parsedOi = Number(cols[oiIdx]);
      if (!Number.isFinite(parsedOi) || parsedOi < 0) {
        rowErrors.push(`Row ${rowNum + 1}: Negative or invalid open interest "${cols[oiIdx]}".`);
        continue;
      }
      openInterest = parsedOi;
    }

    parsedCandles.push({
      symbol: params.symbol,
      exchange: params.exchange,
      timeframe: params.timeframe,
      timestamp: isoTs,
      retrievedAt,
      open,
      high,
      low,
      close,
      volume,
      openInterest,
      isComplete: true,
      source: params.sourceName ?? 'CSV_HISTORICAL',
      status: 'HISTORICAL',
    });
  }

  if (rowErrors.length > 0) {
    return {
      valid: false,
      candles: [],
      errors: rowErrors.slice(0, 15),
      warnings,
    };
  }

  const seriesValidation = validateCandleSeries(parsedCandles);
  if (!seriesValidation.valid) {
    return {
      valid: false,
      candles: [],
      errors: seriesValidation.errors.slice(0, 15),
      warnings,
    };
  }

  // Detect significant data gaps (> 3x expected timeframe interval) as warnings
  const intervalMs = TIMEFRAME_MS[params.timeframe];
  for (let i = 1; i < seriesValidation.validCandles.length; i++) {
    const prev = Date.parse(seriesValidation.validCandles[i - 1].timestamp);
    const curr = Date.parse(seriesValidation.validCandles[i].timestamp);
    if (curr - prev > intervalMs * 4) {
      warnings.push(
        `Data gap detected between ${seriesValidation.validCandles[i - 1].timestamp} and ${seriesValidation.validCandles[i].timestamp}.`
      );
      if (warnings.length >= 5) break;
    }
  }

  return {
    valid: true,
    candles: seriesValidation.validCandles,
    errors: [],
    warnings,
  };
}

/**
 * Deterministically aggregates lower-timeframe complete candles into a higher timeframe
 * without look-ahead bias (each aggregated bucket includes only bars within [bucketStart, bucketStart + targetMs)).
 */
export function resampleCandles(
  candles: MarketCandle[],
  sourceTf: Timeframe,
  targetTf: Timeframe
): MarketCandle[] {
  const sourceMs = TIMEFRAME_MS[sourceTf];
  const targetMs = TIMEFRAME_MS[targetTf];
  if (targetMs < sourceMs || candles.length === 0) {
    return [];
  }
  if (targetMs === sourceMs) {
    return candles;
  }

  const buckets = new Map<number, MarketCandle[]>();
  for (const c of candles) {
    if (!c.isComplete) continue;
    const ts = Date.parse(c.timestamp);
    const bucketKey = Math.floor(ts / targetMs) * targetMs;
    const existing = buckets.get(bucketKey);
    if (existing) {
      existing.push(c);
    } else {
      buckets.set(bucketKey, [c]);
    }
  }

  const sortedKeys = Array.from(buckets.keys()).sort((a, b) => a - b);
  return sortedKeys.map((bucketStart) => {
    const group = buckets.get(bucketStart)!;
    const open = group[0].open;
    const close = group[group.length - 1].close;
    let high = -Infinity;
    let low = Infinity;
    let volumeSum = 0;
    let hasVolume = false;
    let lastOi: number | null = null;

    for (const bar of group) {
      if (bar.high > high) high = bar.high;
      if (bar.low < low) low = bar.low;
      if (bar.volume !== null) {
        volumeSum += bar.volume;
        hasVolume = true;
      }
      if (bar.openInterest !== null) {
        lastOi = bar.openInterest;
      }
    }

    return {
      symbol: group[0].symbol,
      exchange: group[0].exchange,
      timeframe: targetTf,
      timestamp: new Date(bucketStart).toISOString(),
      retrievedAt: group[group.length - 1].retrievedAt,
      open,
      high,
      low,
      close,
      volume: hasVolume ? volumeSum : null,
      openInterest: lastOi,
      isComplete: true,
      source: group[0].source,
      status: group[0].status,
    };
  });
}
