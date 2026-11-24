import type { InstrumentDefinition } from '../../src/shared/types/instrument.ts';
import type { DataQualityStatus, MarketCandle } from '../../src/shared/types/market.ts';
import {
  CONTINUOUS_CONTRACT_CODE,
  type ContinuousAdjustment,
  type DatasetRecord,
} from '../storage/candleRepository.ts';
import { VENDOR_CONTRACT_PREFIX } from '../providers/syncPersistence.ts';

type HistoricalTimeframeAggregate = 'D1' | 'W1' | 'MN';

export interface MonthlyOrWeeklyCandle {
  symbol: string;
  exchange: string;
  timeframe: HistoricalTimeframeAggregate;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  openInterest: number | null;
  barCount: number;
  source: string;
}

export interface GapSample {
  fromDate: string;
  toDate: string;
  calendarDaysGap: number;
}

export interface NormalizedHistoricalResult {
  valid: boolean;
  status: DataQualityStatus;
  candles: MarketCandle[];
  duplicatesRemoved: number;
  invalidOhlcCount: number;
  missingGapCount: number;
  missingGapSamples: GapSample[];
  unitConverted: boolean;
  unitFactor: number;
  timezoneValidated: boolean;
  errors: string[];
  warnings: string[];
}

export interface HistoricalCoverageAudit {
  instrumentId: string;
  symbol: string;
  exchange: string;
  dailyBars: number;
  weeklyBars: number;
  monthlyBars: number;
  earliestDate: string | null;
  latestDate: string | null;
  spanYears: number;
  coverage1Y: number;
  coverage3Y: number;
  coverage5Y: number;
  coverage10Y: number;
  missingGapCount: number;
  missingGapSamples: GapSample[];
  duplicateCount: number;
  invalidOhlcCount: number;
  staleStatus: DataQualityStatus;
  seriesSeparation: {
    individualContracts: string[];
    continuousSeries: Array<{ adjustment: ContinuousAdjustment; rows: number; firstDate: string; lastDate: string }>;
    vendorProxySeries: Array<{ contractCode: string; sourceLabel: string; rows: number; lastDate: string }>;
    mixedSeriesViolation: boolean;
    rollNotice: string | null;
  };
}

const TRADING_DAYS_1Y = 252;
const TRADING_DAYS_3Y = 756;
const TRADING_DAYS_5Y = 1260;
const TRADING_DAYS_10Y = 2520;

const SUPPORTED_UNIT_CONVERSIONS: Readonly<Record<string, number>> = {
  'usx->usd': 0.01,
  'cents/bushel->usd/bushel': 0.01,
  'cents/lb->usd/lb': 0.01,
  'usd->usx': 100,
  'usd/bushel->cents/bushel': 100,
  'usd/lb->cents/lb': 100,
};

export function isValidIanaTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export function resolveUnitConversionFactor(
  sourceUnit: string | undefined,
  expectedUnit: string | undefined
): { ok: true; factor: number; converted: boolean } | { ok: false; reason: string } {
  if (!sourceUnit || !expectedUnit) {
    return { ok: true, factor: 1, converted: false };
  }
  const src = sourceUnit.trim().toLowerCase();
  const exp = expectedUnit.trim().toLowerCase();
  if (src === exp) {
    return { ok: true, factor: 1, converted: false };
  }
  const factor = SUPPORTED_UNIT_CONVERSIONS[`${src}->${exp}`];
  if (typeof factor === 'number') {
    return { ok: true, factor, converted: true };
  }
  return {
    ok: false,
    reason: `Incompatible price unit "${sourceUnit}" for target unit "${expectedUnit}"; refused.`,
  };
}

/**
 * Formats a UTC millisecond timestamp into YYYY-MM-DD in the given exchange timezone.
 */
export function toExchangeLocalDateIso(timestampMs: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestampMs));
  const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

/**
 * Computes Monday UTC date YYYY-MM-DD for the ISO week containing a UTC date string YYYY-MM-DD.
 */
function weekMondayIso(utcDateIso: string): string {
  const ms = Date.parse(`${utcDateIso}T00:00:00.000Z`);
  const d = new Date(ms);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  return new Date(ms + diffToMonday * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Deterministically resamples sorted or unsorted daily candles into W1 and Monthly (MN) OHLCV bars.
 */
export function resampleDailyToWeeklyAndMonthly(dailyCandles: MarketCandle[]): {
  weekly: MonthlyOrWeeklyCandle[];
  monthly: MonthlyOrWeeklyCandle[];
} {
  if (dailyCandles.length === 0) {
    return { weekly: [], monthly: [] };
  }

  const sorted = [...dailyCandles].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const aggregateByBucket = (
    timeframe: 'W1' | 'MN',
    bucketKeyFn: (dateIso: string) => string
  ): MonthlyOrWeeklyCandle[] => {
    const groups = new Map<string, MarketCandle[]>();
    for (const bar of sorted) {
      const dateIso = bar.timestamp.slice(0, 10);
      const key = bucketKeyFn(dateIso);
      const list = groups.get(key) ?? [];
      list.push(bar);
      groups.set(key, list);
    }

    const out: MonthlyOrWeeklyCandle[] = [];
    for (const [bucketKey, bars] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const first = bars[0];
      const last = bars[bars.length - 1];
      let high = first.high;
      let low = first.low;
      let volSum = 0;
      let hasVol = false;
      for (const b of bars) {
        if (b.high > high) high = b.high;
        if (b.low < low) low = b.low;
        if (typeof b.volume === 'number' && Number.isFinite(b.volume)) {
          volSum += b.volume;
          hasVol = true;
        }
      }
      out.push({
        symbol: first.symbol,
        exchange: first.exchange,
        timeframe,
        timestamp: `${bucketKey}T00:00:00.000Z`,
        open: first.open,
        high,
        low,
        close: last.close,
        volume: hasVol ? volSum : null,
        openInterest: last.openInterest,
        barCount: bars.length,
        source: last.source,
      });
    }
    return out;
  };

  return {
    weekly: aggregateByBucket('W1', (d) => weekMondayIso(d)),
    monthly: aggregateByBucket('MN', (d) => `${d.slice(0, 7)}-01`),
  };
}

/**
 * Checks calendar-day gaps between sequential D1 bars. Normal weekends are 3 calendar days (Fri->Mon);
 * 3-day holiday weekends are 4 days. Gaps > 4 calendar days are flagged as potential missing sessions.
 */
export function detectDailySessionGaps(
  candles: Pick<MarketCandle, 'timestamp'>[],
  maxNormalGapDays: number = 4
): GapSample[] {
  if (candles.length < 2) return [];
  const sorted = [...candles].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const gaps: GapSample[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prevMs = Date.parse(sorted[i - 1].timestamp);
    const currMs = Date.parse(sorted[i].timestamp);
    if (!Number.isFinite(prevMs) || !Number.isFinite(currMs)) continue;
    const days = Math.round((currMs - prevMs) / 86_400_000);
    if (days > maxNormalGapDays) {
      gaps.push({
        fromDate: sorted[i - 1].timestamp.slice(0, 10),
        toDate: sorted[i].timestamp.slice(0, 10),
        calendarDaysGap: days,
      });
    }
  }
  return gaps;
}

/**
 * Normalizes and validates raw historical candles: verifies exchange timezone, enforces or safely
 * converts price units, rejects invalid OHLC bars, deduplicates repeated timestamps (when deduplicate=true),
 * and identifies missing trading session gaps.
 */
export function normalizeHistoricalCandles(
  candles: MarketCandle[],
  options: {
    exchangeTimezone?: string;
    sourceUnit?: string;
    expectedUnit?: string;
    allowNonPositivePrices?: boolean;
    deduplicate?: boolean;
    maxNormalGapDays?: number;
  } = {}
): NormalizedHistoricalResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const tz = options.exchangeTimezone ?? 'UTC';
  if (!isValidIanaTimezone(tz)) {
    return {
      valid: false,
      status: 'INVALID',
      candles: [],
      duplicatesRemoved: 0,
      invalidOhlcCount: 0,
      missingGapCount: 0,
      missingGapSamples: [],
      unitConverted: false,
      unitFactor: 1,
      timezoneValidated: false,
      errors: [`Invalid IANA exchange timezone "${tz}".`],
      warnings: [],
    };
  }

  const unitCheck = resolveUnitConversionFactor(options.sourceUnit, options.expectedUnit);
  if (!unitCheck.ok) {
    return {
      valid: false,
      status: 'INVALID',
      candles: [],
      duplicatesRemoved: 0,
      invalidOhlcCount: 0,
      missingGapCount: 0,
      missingGapSamples: [],
      unitConverted: false,
      unitFactor: 1,
      timezoneValidated: true,
      errors: [unitCheck.reason],
      warnings: [],
    };
  }

  if (candles.length === 0) {
    return {
      valid: false,
      status: 'UNAVAILABLE',
      candles: [],
      duplicatesRemoved: 0,
      invalidOhlcCount: 0,
      missingGapCount: 0,
      missingGapSamples: [],
      unitConverted: unitCheck.converted,
      unitFactor: unitCheck.factor,
      timezoneValidated: true,
      errors: ['No historical candles supplied.'],
      warnings: [],
    };
  }

  const allowNonPos = options.allowNonPositivePrices === true;
  const dedupe = options.deduplicate !== false;
  let invalidOhlcCount = 0;
  let duplicatesRemoved = 0;
  const byTimestamp = new Map<number, MarketCandle>();
  const rawList: MarketCandle[] = [];

  const scale = (v: number) =>
    unitCheck.factor === 1 ? v : Number((v * unitCheck.factor).toPrecision(12));

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const tsMs = Date.parse(c.timestamp);
    if (!Number.isFinite(tsMs)) {
      invalidOhlcCount += 1;
      errors.push(`Row ${i}: malformed timestamp "${c.timestamp}".`);
      continue;
    }

    const o = scale(c.open);
    const h = scale(c.high);
    const l = scale(c.low);
    const cl = scale(c.close);

    if (![o, h, l, cl].every(Number.isFinite)) {
      invalidOhlcCount += 1;
      errors.push(`Row ${i}: non-finite OHLC value.`);
      continue;
    }

    if (!allowNonPos && (o <= 0 || h <= 0 || l <= 0 || cl <= 0)) {
      invalidOhlcCount += 1;
      errors.push(`Row ${i} (${c.timestamp}): non-positive price rejected without adjustment flag.`);
      continue;
    }

    if (h < l || h < o || h < cl || l > o || l > cl) {
      invalidOhlcCount += 1;
      errors.push(`Row ${i} (${c.timestamp}): invalid OHLC bounds (High < max or Low > min).`);
      continue;
    }

    const normalizedIso =
      c.timeframe === 'D1' || c.timeframe === 'W1'
        ? `${new Date(tsMs).toISOString().slice(0, 10)}T00:00:00.000Z`
        : new Date(tsMs).toISOString();
    const normMs = Date.parse(normalizedIso);

    const normalizedCandle: MarketCandle = {
      ...c,
      timestamp: normalizedIso,
      open: o,
      high: h,
      low: l,
      close: cl,
    };

    if (byTimestamp.has(normMs)) {
      if (dedupe) {
        duplicatesRemoved += 1;
        byTimestamp.set(normMs, normalizedCandle);
      } else {
        duplicatesRemoved += 1;
        errors.push(`Row ${i}: duplicate candle timestamp ${normalizedIso}.`);
      }
      continue;
    }

    byTimestamp.set(normMs, normalizedCandle);
    rawList.push(normalizedCandle);
  }

  const out = (dedupe ? [...byTimestamp.entries()].sort(([a], [b]) => a - b).map(([, c]) => c) : rawList)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  if (duplicatesRemoved > 0 && dedupe) {
    warnings.push(`${duplicatesRemoved} duplicate candle timestamp(s) deduplicated (latest retained).`);
  }
  if (unitCheck.converted) {
    warnings.push(`Prices normalized using unit conversion factor ${unitCheck.factor}.`);
  }

  const gaps = detectDailySessionGaps(out, options.maxNormalGapDays ?? 4);
  if (gaps.length > 0) {
    warnings.push(`Detected ${gaps.length} potential missing trading session gap(s) (> 4 calendar days).`);
  }

  const hasFatal = (!dedupe && duplicatesRemoved > 0) || invalidOhlcCount > 0 || out.length === 0;
  return {
    valid: !hasFatal,
    status: hasFatal ? 'INVALID' : out[out.length - 1].status,
    candles: hasFatal ? [] : out,
    duplicatesRemoved,
    invalidOhlcCount,
    missingGapCount: gaps.length,
    missingGapSamples: gaps.slice(0, 5),
    unitConverted: unitCheck.converted,
    unitFactor: unitCheck.factor,
    timezoneValidated: true,
    errors,
    warnings,
  };
}

/**
 * Classifies freshness of historical daily dataset relative to `nowMs`.
 * D1 bars older than 7 calendar days are STALE; within 7 days are HISTORICAL (or DELAYED/CURRENT for live).
 */
export function classifyHistoricalSeriesFreshness(
  latestTimestampIso: string | null,
  nowMs: number = Date.now()
): DataQualityStatus {
  if (!latestTimestampIso) return 'UNAVAILABLE';
  const latestMs = Date.parse(latestTimestampIso);
  if (!Number.isFinite(latestMs)) return 'INVALID';
  if (latestMs - nowMs > 24 * 3600_000) return 'INVALID';
  const ageDays = (nowMs - latestMs) / 86_400_000;
  if (ageDays > 7) return 'STALE';
  return 'HISTORICAL';
}

/**
 * Audits historical coverage, rollover separation, missing sessions, and 1Y–10Y depth for an instrument.
 */
export function auditHistoricalCoverage(params: {
  instrument: InstrumentDefinition;
  dailyCandles: MarketCandle[];
  weeklyCandles?: MarketCandle[];
  datasets?: DatasetRecord[];
  nowMs?: number;
}): HistoricalCoverageAudit {
  const { instrument, dailyCandles, weeklyCandles = [], datasets = [] } = params;
  const nowMs = params.nowMs ?? Date.now();

  const sortedD1 = [...dailyCandles].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const normCheck =
    sortedD1.length > 0
      ? normalizeHistoricalCandles(sortedD1, {
          exchangeTimezone: instrument.specification.tradingHoursTimezone,
          deduplicate: true,
          allowNonPositivePrices: true,
        })
      : null;

  const cleanD1 = normCheck?.candles ?? sortedD1;
  const resampled = resampleDailyToWeeklyAndMonthly(cleanD1);
  const w1Count = weeklyCandles.length > 0 ? weeklyCandles.length : resampled.weekly.length;
  const mnCount = resampled.monthly.length;

  const earliestDate = cleanD1[0]?.timestamp.slice(0, 10) ?? null;
  const latestDate = cleanD1[cleanD1.length - 1]?.timestamp.slice(0, 10) ?? null;

  let spanYears = 0;
  if (earliestDate && latestDate) {
    spanYears = Number(
      ((Date.parse(`${latestDate}T00:00:00Z`) - Date.parse(`${earliestDate}T00:00:00Z`)) / (365.25 * 86_400_000)).toFixed(2)
    );
  }

  const pct = (target: number) =>
    cleanD1.length === 0 ? 0 : Math.min(100, Math.round((cleanD1.length / target) * 100));

  const individualContracts = Array.from(
    new Set(
      datasets
        .filter((d) => d.contractCode !== CONTINUOUS_CONTRACT_CODE && !d.contractCode.startsWith(VENDOR_CONTRACT_PREFIX))
        .map((d) => d.contractCode)
    )
  ).sort();

  const continuousDatasets = datasets.filter((d) => d.contractCode === CONTINUOUS_CONTRACT_CODE && d.timeframe === 'D1');
  const continuousSeries = continuousDatasets.map((d) => ({
    adjustment: d.continuousAdjustment,
    rows: d.rowCount,
    firstDate: d.firstTimestamp.slice(0, 10),
    lastDate: d.lastTimestamp.slice(0, 10),
  }));

  const vendorProxySeries = datasets
    .filter((d) => d.contractCode.startsWith(VENDOR_CONTRACT_PREFIX))
    .map((d) => ({
      contractCode: d.contractCode,
      sourceLabel: d.sourceLabel,
      rows: d.rowCount,
      lastDate: d.lastTimestamp.slice(0, 10),
    }));

  const distinctAdjustments = new Set(continuousDatasets.map((d) => d.continuousAdjustment));
  const mixedSeriesViolation = distinctAdjustments.size > 1;
  let rollNotice: string | null = null;
  if (mixedSeriesViolation) {
    rollNotice = `Phát hiện trộn lẫn nhiều kiểu điều chỉnh CONTINUOUS (${[...distinctAdjustments].join(', ')}).`;
  } else if (continuousSeries.some((s) => s.adjustment === 'UNADJUSTED')) {
    rollNotice = 'Chuỗi CONTINUOUS UNADJUSTED giữ nguyên giá khớp thật nhưng chứa bước nhảy (roll gap) ngày đáo hạn.';
  } else if (individualContracts.length > 0 && continuousSeries.length === 0) {
    rollNotice = `Chỉ lưu hợp đồng riêng lẻ (${individualContracts.join(', ')}); chưa ghép nối thành chuỗi liên tục.`;
  } else if (vendorProxySeries.length > 0 && continuousSeries.length === 0) {
    rollNotice = `Đang có chuỗi proxy vendor (${vendorProxySeries.map((v) => v.contractCode).join(', ')}), tách biệt khỏi CONTINUOUS chính thức.`;
  }

  return {
    instrumentId: instrument.id,
    symbol: instrument.exchangeSymbol,
    exchange: instrument.exchange,
    dailyBars: cleanD1.length,
    weeklyBars: w1Count,
    monthlyBars: mnCount,
    earliestDate,
    latestDate,
    spanYears,
    coverage1Y: pct(TRADING_DAYS_1Y),
    coverage3Y: pct(TRADING_DAYS_3Y),
    coverage5Y: pct(TRADING_DAYS_5Y),
    coverage10Y: pct(TRADING_DAYS_10Y),
    missingGapCount: normCheck?.missingGapCount ?? 0,
    missingGapSamples: normCheck?.missingGapSamples ?? [],
    duplicateCount: normCheck?.duplicatesRemoved ?? 0,
    invalidOhlcCount: normCheck?.invalidOhlcCount ?? 0,
    staleStatus: classifyHistoricalSeriesFreshness(cleanD1[cleanD1.length - 1]?.timestamp ?? null, nowMs),
    seriesSeparation: {
      individualContracts,
      continuousSeries,
      vendorProxySeries,
      mixedSeriesViolation,
      rollNotice,
    },
  };
}
