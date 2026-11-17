import type { MarketCandle } from '../types/market.ts';
import { BusinessCalendar, isIsoDate, utcDateOfTimestamp, type IsoDate } from './dates.ts';
import { parseContractCode } from './monthCodes.ts';

/**
 * Continuous-series construction from individual contract series.
 *
 * Conventions (documented, deterministic):
 * - Contracts are ordered by the supplied expiry dates when present, otherwise by (year, month)
 *   parsed from the contract code.
 * - Bars are aligned by the UTC calendar date of `timestamp`. A contract may have at most one bar
 *   per date (intended for daily bars).
 * - A roll on date R from A to B: the continuous series uses A's bars strictly before R and B's bars
 *   from R on (inclusive). The roll gap is measured on R's close: gap = close_B(R) - close_A(R),
 *   ratio = close_B(R) / close_A(R). Both contracts MUST have a bar on R, otherwise INVALID_INPUT.
 * - Roll date selection:
 *     DAYS_BEFORE_EXPIRY {days}: R = `days` business days (Mon-Fri, holidays not applied) before
 *       A's last trading day (days = 0 -> the last trading day itself).
 *     DAYS_BEFORE_FND {days}: same, counted back from A's first notice day.
 *     VOLUME_CROSSOVER / OPEN_INTEREST_CROSSOVER: R = first common date after the previous roll
 *       on which B's volume (resp. open interest) is strictly greater than A's. Every common bar
 *       examined must have non-null values; no crossover -> INVALID_INPUT.
 * - Adjustment (older history is adjusted; the latest contract's prices are left unchanged):
 *     NONE: raw prices (gaps visible at rolls).
 *     BACK_ADJUSTED: add the sum of all later roll gaps to O/H/L/C (difference adjustment).
 *     RATIO_ADJUSTED: multiply O/H/L/C by the product of all later roll ratios (requires every
 *       roll close > 0).
 *   Volume and open interest are never adjusted.
 */

export type RollRule =
  | { type: 'DAYS_BEFORE_EXPIRY'; days: number }
  | { type: 'DAYS_BEFORE_FND'; days: number }
  | { type: 'VOLUME_CROSSOVER' }
  | { type: 'OPEN_INTEREST_CROSSOVER' };

export type AdjustmentMethod = 'NONE' | 'BACK_ADJUSTED' | 'RATIO_ADJUSTED';

export interface ContractDates {
  lastTradingDay?: IsoDate | null;
  firstNoticeDay?: IsoDate | null;
}

export interface ContinuousSeriesInput {
  /** Candle series keyed by contract code (e.g. 'ZCH25'). */
  series: Record<string, MarketCandle[]>;
  rollRule: RollRule;
  adjustment: AdjustmentMethod;
  /** Required for DAYS_BEFORE_* rules; also used for ordering. */
  contractDates?: Record<string, ContractDates>;
  /** For resolving 1/2-digit years when ordering by code. */
  referenceYear?: number;
  /** Label used as `symbol` of output bars. */
  label?: string;
}

export interface RollEvent {
  date: IsoDate;
  from: string;
  to: string;
  fromClose: number;
  toClose: number;
  /** toClose - fromClose */
  priceGap: number;
  /** toClose / fromClose (null when fromClose <= 0) */
  priceRatio: number | null;
}

export interface ContinuousBar {
  date: IsoDate;
  timestamp: string;
  contract: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  openInterest: number | null;
  /** Additive offset applied (BACK_ADJUSTED) or 0. */
  additiveAdjustment: number;
  /** Multiplicative factor applied (RATIO_ADJUSTED) or 1. */
  ratioAdjustment: number;
  /** Raw (unadjusted) close of the underlying contract. */
  rawClose: number;
}

export type ContinuousSeriesResult =
  | {
      status: 'OK';
      label: string;
      adjustment: AdjustmentMethod;
      rollRule: RollRule;
      contractsUsed: string[];
      rolls: RollEvent[];
      bars: ContinuousBar[];
      warnings: string[];
    }
  | { status: 'INVALID_INPUT'; errors: string[] };

interface IndexedContract {
  code: string;
  byDate: Map<IsoDate, MarketCandle>;
  dates: IsoDate[]; // sorted
  sortKey: string;
}

function invalid(...errors: string[]): ContinuousSeriesResult {
  return { status: 'INVALID_INPUT', errors };
}

export function buildContinuousSeries(input: ContinuousSeriesInput): ContinuousSeriesResult {
  const { rollRule, adjustment } = input;
  const codes = Object.keys(input.series ?? {});
  if (codes.length === 0) return invalid('No contract series supplied.');
  if (!['NONE', 'BACK_ADJUSTED', 'RATIO_ADJUSTED'].includes(adjustment)) {
    return invalid(`Unknown adjustment: ${String(adjustment)}`);
  }
  if (
    (rollRule.type === 'DAYS_BEFORE_EXPIRY' || rollRule.type === 'DAYS_BEFORE_FND') &&
    (!Number.isInteger(rollRule.days) || rollRule.days < 0)
  ) {
    return invalid('Roll rule days must be a non-negative integer.');
  }

  // Index and validate each contract.
  const errors: string[] = [];
  const contracts: IndexedContract[] = [];
  for (const code of codes) {
    const candles = input.series[code];
    if (!Array.isArray(candles) || candles.length === 0) {
      errors.push(`${code}: no bars.`);
      continue;
    }
    const byDate = new Map<IsoDate, MarketCandle>();
    for (const c of candles) {
      const d = utcDateOfTimestamp(c.timestamp);
      if (!d) {
        errors.push(`${code}: invalid timestamp ${String(c.timestamp)}.`);
        continue;
      }
      if (byDate.has(d)) {
        errors.push(`${code}: more than one bar on ${d} (daily bars expected).`);
        continue;
      }
      for (const k of ['open', 'high', 'low', 'close'] as const) {
        if (!Number.isFinite(c[k])) errors.push(`${code} ${d}: ${k} is not a finite number.`);
      }
      byDate.set(d, c);
    }
    const dates = [...byDate.keys()].sort();
    contracts.push({ code, byDate, dates, sortKey: '' });
  }
  if (errors.length) return invalid(...errors);

  // Order by last trading day when every contract has one, otherwise by contract month from the code.
  const allHaveLtd = contracts.every((c) => isIsoDate(input.contractDates?.[c.code]?.lastTradingDay));
  for (const c of contracts) {
    if (allHaveLtd) {
      c.sortKey = input.contractDates![c.code].lastTradingDay as string;
      continue;
    }
    const parsed = parseContractCode(c.code, { referenceYear: input.referenceYear });
    if (!parsed) {
      errors.push(`${c.code}: cannot order - not a parseable contract code and lastTradingDay not supplied for all contracts.`);
      continue;
    }
    c.sortKey = `${parsed.year}-${String(parsed.month).padStart(2, '0')}`;
  }
  if (errors.length) return invalid(...errors);

  contracts.sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));
  for (let i = 1; i < contracts.length; i++) {
    if (contracts[i].sortKey === contracts[i - 1].sortKey) {
      return invalid(`${contracts[i - 1].code} and ${contracts[i].code} have the same expiry/order key.`);
    }
  }

  // Determine roll dates.
  const cal = new BusinessCalendar();
  const rolls: RollEvent[] = [];
  let prevRoll: IsoDate | null = null;
  for (let i = 0; i < contracts.length - 1; i++) {
    const a = contracts[i];
    const b = contracts[i + 1];
    let rollDate: IsoDate | null = null;

    if (rollRule.type === 'DAYS_BEFORE_EXPIRY' || rollRule.type === 'DAYS_BEFORE_FND') {
      const key = rollRule.type === 'DAYS_BEFORE_EXPIRY' ? 'lastTradingDay' : 'firstNoticeDay';
      const ref = input.contractDates?.[a.code]?.[key];
      if (!ref || !isIsoDate(ref)) {
        return invalid(`${a.code}: ${key} is required (YYYY-MM-DD) for roll rule ${rollRule.type}.`);
      }
      rollDate = cal.businessDaysBefore(ref, rollRule.days);
    } else {
      const field = rollRule.type === 'VOLUME_CROSSOVER' ? 'volume' : 'openInterest';
      for (const d of a.dates) {
        if (prevRoll !== null && d <= prevRoll) continue;
        const barB = b.byDate.get(d);
        if (!barB) continue;
        const va = a.byDate.get(d)![field];
        const vb = barB[field];
        if (va === null || va === undefined || vb === null || vb === undefined) {
          return invalid(`${rollRule.type} requires non-null ${field}: missing on ${d} for ${va == null ? a.code : b.code}.`);
        }
        if (vb > va) {
          rollDate = d;
          break;
        }
      }
      if (!rollDate) return invalid(`No ${field} crossover from ${a.code} to ${b.code} on any common date.`);
    }

    if (prevRoll !== null && rollDate <= prevRoll) {
      return invalid(`Roll ${a.code}->${b.code} on ${rollDate} is not after the previous roll on ${prevRoll}.`);
    }
    const barA = a.byDate.get(rollDate);
    const barB = b.byDate.get(rollDate);
    if (!barA || !barB) {
      const missing = [!barA ? a.code : null, !barB ? b.code : null].filter(Boolean).join(' and ');
      return invalid(`Roll ${a.code}->${b.code} on ${rollDate}: no bar for ${missing} on that date (overlapping bar required in both contracts).`);
    }
    rolls.push({
      date: rollDate,
      from: a.code,
      to: b.code,
      fromClose: barA.close,
      toClose: barB.close,
      priceGap: barB.close - barA.close,
      priceRatio: barA.close > 0 ? barB.close / barA.close : null,
    });
    prevRoll = rollDate;
  }

  if (adjustment === 'RATIO_ADJUSTED') {
    const bad = rolls.filter((r) => r.fromClose <= 0 || r.toClose <= 0);
    if (bad.length) {
      return invalid(`RATIO_ADJUSTED requires positive closes at every roll; non-positive at ${bad.map((r) => r.date).join(', ')}.`);
    }
  }

  // Assemble segments and adjustments (cumulative from the latest contract backwards).
  const bars: ContinuousBar[] = [];
  const warnings: string[] = [];
  for (let i = 0; i < contracts.length; i++) {
    const c = contracts[i];
    const start = i === 0 ? null : rolls[i - 1].date;
    const end = i < rolls.length ? rolls[i].date : null; // exclusive
    let add = 0;
    let mult = 1;
    for (let k = i; k < rolls.length; k++) {
      add += rolls[k].priceGap;
      mult *= rolls[k].priceRatio ?? 1;
    }
    const additive = adjustment === 'BACK_ADJUSTED' ? add : 0;
    const ratio = adjustment === 'RATIO_ADJUSTED' ? mult : 1;
    for (const d of c.dates) {
      if (start !== null && d < start) continue;
      if (end !== null && d >= end) continue;
      const bar = c.byDate.get(d)!;
      const adj = (p: number) => p * ratio + additive;
      bars.push({
        date: d,
        timestamp: bar.timestamp,
        contract: c.code,
        open: adj(bar.open),
        high: adj(bar.high),
        low: adj(bar.low),
        close: adj(bar.close),
        volume: bar.volume,
        openInterest: bar.openInterest,
        additiveAdjustment: additive,
        ratioAdjustment: ratio,
        rawClose: bar.close,
      });
    }
  }

  if (adjustment === 'BACK_ADJUSTED' && bars.some((b) => b.low <= 0)) {
    warnings.push('Back-adjusted series contains non-positive prices; do not compute log returns or ratios on it.');
  }
  if (adjustment === 'NONE' && rolls.length) {
    warnings.push('Unadjusted series: returns across roll dates include the roll gap, not a market move.');
  }
  if (rollRule.type === 'DAYS_BEFORE_EXPIRY' || rollRule.type === 'DAYS_BEFORE_FND') {
    warnings.push('Roll dates counted in Mon-Fri business days; exchange holidays not applied.');
  }

  return {
    status: 'OK',
    label: input.label ?? 'CONTINUOUS',
    adjustment,
    rollRule,
    contractsUsed: contracts.map((c) => c.code),
    rolls,
    bars,
    warnings,
  };
}
