import type { DataQualityStatus } from '../types/market';

export const VIETNAM_TIMEZONE = 'Asia/Ho_Chi_Minh';

export function formatTimestampInZone(
  isoUtc: string | null | undefined,
  timeZone: string = VIETNAM_TIMEZONE
): string {
  if (!isoUtc) {
    return 'NO_TIMESTAMP';
  }
  const date = new Date(isoUtc);
  if (Number.isNaN(date.getTime())) {
    return 'INVALID_TIMESTAMP';
  }
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

export function getVietnamClockLabel(now: Date = new Date()): string {
  return `${new Intl.DateTimeFormat('en-GB', {
    timeZone: VIETNAM_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now)} ICT`;
}

export interface FreshnessThresholds {
  currentMaxAgeMs: number;
  delayedMaxAgeMs: number;
}

const DEFAULT_FRESHNESS_THRESHOLDS: FreshnessThresholds = {
  currentMaxAgeMs: 60_000, // 1 minute
  delayedMaxAgeMs: 15 * 60_000, // 15 minutes
};

/**
 * Evaluates market data freshness strictly from the original market timestamp,
 * never treating retrievedAt as the market timestamp.
 */
export function evaluateDataFreshness(
  marketTimestampIso: string | null | undefined,
  nowMs: number = Date.now(),
  thresholds: FreshnessThresholds = DEFAULT_FRESHNESS_THRESHOLDS
): DataQualityStatus {
  if (!marketTimestampIso) {
    return 'UNAVAILABLE';
  }
  const marketMs = Date.parse(marketTimestampIso);
  if (Number.isNaN(marketMs)) {
    return 'INVALID';
  }
  const ageMs = nowMs - marketMs;
  if (ageMs < -5_000) {
    // Future market timestamp beyond small clock skew is invalid
    return 'INVALID';
  }
  if (ageMs <= thresholds.currentMaxAgeMs) {
    return 'CURRENT';
  }
  if (ageMs <= thresholds.delayedMaxAgeMs) {
    return 'DELAYED';
  }
  return 'STALE';
}
