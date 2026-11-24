import { calendarDaysBetween, isIsoDate, utcDateOfTimestamp, type IsoDate } from './dates.ts';

/**
 * Futures curve (term structure) for one instrument on one date.
 *
 * Formulas (documented):
 * - daysToExpiry = calendar days from the valuation date (common UTC date of all prices) to the
 *   contract's last trading day.
 * - calendar spread between adjacent contracts = nearPrice - farPrice
 *   (negative in contango, positive in backwardation).
 * - annualized roll yield = ln(nearPrice / farPrice) * 365 / (daysFar - daysNear)
 *   (calendar-day, 365-day convention; positive in backwardation, negative in contango; null if a
 *   price is <= 0 since the log is undefined).
 * - shape label over adjacent pairs: every far > near -> CONTANGO; every far < near ->
 *   BACKWARDATION; every far == near -> FLAT; any other combination -> MIXED.
 *   `flatTolerance` (absolute price units, default 0) treats |far - near| <= tolerance as equal.
 */

export interface CurvePointInput {
  contract: string;
  price: number;
  /** ISO-8601 timestamp of the price (e.g. settlement/candle timestamp). */
  timestamp: string;
  /** YYYY-MM-DD last trading day of the contract. */
  lastTradingDay: IsoDate;
}

export interface CurvePoint {
  contract: string;
  price: number;
  lastTradingDay: IsoDate;
  daysToExpiry: number;
}

interface CurveSpread {
  near: string;
  far: string;
  /** nearPrice - farPrice */
  spread: number;
  daysNear: number;
  daysFar: number;
  annualizedRollYield: number | null;
  direction: 'CONTANGO' | 'BACKWARDATION' | 'FLAT';
}

export type CurveShape = 'CONTANGO' | 'BACKWARDATION' | 'MIXED' | 'FLAT';

export type TermStructureResult =
  | {
      status: 'OK';
      valuationDate: IsoDate;
      points: CurvePoint[];
      spreads: CurveSpread[];
      shape: CurveShape;
      formula: string;
      warnings: string[];
    }
  | { status: 'INVALID_INPUT'; errors: string[] };

export const ROLL_YIELD_FORMULA = 'annualizedRollYield = ln(near / far) * 365 / (daysFar - daysNear)';

export function annualizedRollYield(near: number, far: number, daysNear: number, daysFar: number): number | null {
  if (!(near > 0) || !(far > 0) || !(daysFar > daysNear)) return null;
  return (Math.log(near / far) * 365) / (daysFar - daysNear);
}

export function buildTermStructure(
  inputs: CurvePointInput[],
  options: { flatTolerance?: number } = {}
): TermStructureResult {
  const errors: string[] = [];
  const tol = options.flatTolerance ?? 0;
  if (!Number.isFinite(tol) || tol < 0) errors.push('flatTolerance must be a non-negative number.');
  if (!Array.isArray(inputs) || inputs.length < 2) {
    return { status: 'INVALID_INPUT', errors: ['At least two contracts are required.'] };
  }

  const dates = new Set<string>();
  const timestamps = new Set<number>();
  const seen = new Set<string>();
  for (const p of inputs) {
    if (seen.has(p.contract)) errors.push(`Duplicate contract ${p.contract}.`);
    seen.add(p.contract);
    if (!Number.isFinite(p.price)) errors.push(`${p.contract}: price is not a finite number.`);
    if (!isIsoDate(p.lastTradingDay)) errors.push(`${p.contract}: lastTradingDay must be YYYY-MM-DD.`);
    const d = utcDateOfTimestamp(p.timestamp);
    if (!d) errors.push(`${p.contract}: invalid timestamp.`);
    else {
      dates.add(d);
      timestamps.add(Date.parse(p.timestamp));
    }
  }
  if (errors.length) return { status: 'INVALID_INPUT', errors };
  if (dates.size !== 1) {
    return {
      status: 'INVALID_INPUT',
      errors: [`All prices must share the same date; got ${[...dates].sort().join(', ')}.`],
    };
  }
  const valuationDate = [...dates][0];
  const warnings: string[] = [];
  if (timestamps.size > 1) {
    warnings.push('Prices share the same UTC date but not the same timestamp; intraday timing differences may distort spreads.');
  }

  const points: CurvePoint[] = inputs
    .map((p) => ({
      contract: p.contract,
      price: p.price,
      lastTradingDay: p.lastTradingDay,
      daysToExpiry: calendarDaysBetween(valuationDate, p.lastTradingDay),
    }))
    .sort((a, b) => a.daysToExpiry - b.daysToExpiry);

  for (const p of points) {
    if (p.daysToExpiry < 0) errors.push(`${p.contract}: last trading day ${p.lastTradingDay} is before the valuation date ${valuationDate}.`);
  }
  for (let i = 1; i < points.length; i++) {
    if (points[i].daysToExpiry === points[i - 1].daysToExpiry) {
      errors.push(`${points[i - 1].contract} and ${points[i].contract} have the same last trading day.`);
    }
  }
  if (errors.length) return { status: 'INVALID_INPUT', errors };

  const spreads: CurveSpread[] = [];
  for (let i = 1; i < points.length; i++) {
    const near = points[i - 1];
    const far = points[i];
    const diff = far.price - near.price;
    const direction = Math.abs(diff) <= tol ? 'FLAT' : diff > 0 ? 'CONTANGO' : 'BACKWARDATION';
    const ry = annualizedRollYield(near.price, far.price, near.daysToExpiry, far.daysToExpiry);
    if (ry === null) warnings.push(`Roll yield ${near.contract}/${far.contract} undefined (non-positive price).`);
    spreads.push({
      near: near.contract,
      far: far.contract,
      spread: near.price - far.price,
      daysNear: near.daysToExpiry,
      daysFar: far.daysToExpiry,
      annualizedRollYield: ry,
      direction,
    });
  }

  const dirs = new Set(spreads.map((s) => s.direction));
  const shape: CurveShape = dirs.size === 1 ? [...dirs][0] : 'MIXED';

  return { status: 'OK', valuationDate, points, spreads, shape, formula: ROLL_YIELD_FORMULA, warnings };
}
