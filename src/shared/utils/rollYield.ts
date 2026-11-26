/**
 * Carry / roll-yield helpers for two consecutive futures contracts.
 * Education only. Formula: annualizedRollYield = (F1 / F2 - 1) * 365 / (d2 - d1)
 * F1 = near price, F2 = next price, d1 < d2 = calendar days to expiry.
 */
export const SIMPLE_ROLL_YIELD_FORMULA = 'annualizedRollYield = (F1 / F2 - 1) * 365 / (d2 - d1)';

export type CarrySlope = 'CONTANGO' | 'BACKWARDATION' | 'FLAT';

/** Relative difference below which F1 and F2 are treated as equal. */
export const FLAT_EPSILON = 1e-6;

const isPos = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0;

export function classifySlope(f1: number, f2: number): CarrySlope | null {
  if (!isPos(f1) || !isPos(f2)) return null;
  const rel = (f2 - f1) / f1;
  if (Math.abs(rel) <= FLAT_EPSILON) return 'FLAT';
  return rel > 0 ? 'CONTANGO' : 'BACKWARDATION';
}

/** Yield of one roll over the gap between contracts (not annualized). Null on invalid input. */
export function rollYieldPerRoll(f1: number, f2: number): number | null {
  if (!isPos(f1) || !isPos(f2)) return null;
  return f1 / f2 - 1;
}

/** Annualized roll yield; null when a price is missing/<=0/NaN or d2 <= d1. */
export function annualizedRollYield(f1: number, f2: number, d1: number, d2: number): number | null {
  const per = rollYieldPerRoll(f1, f2);
  if (per === null || !Number.isFinite(d1) || !Number.isFinite(d2) || d2 <= d1) return null;
  return (per * 365) / (d2 - d1);
}

export interface RollCostSim {
  rolls: number;
  gapDays: number;
  perRoll: number;
  /** Compounded effect of rolling only: (1 + perRoll)^N - 1. Positive = gain for a long. */
  total: number;
  /** Calendar days covered by N rolls. */
  daysCovered: number;
}

/** Illustration only: slope assumed unchanged for every roll; ignores spot moves, fees, margin. */
export function simulateLongRolls(f1: number, f2: number, d1: number, d2: number, rolls: number): RollCostSim | null {
  const perRoll = rollYieldPerRoll(f1, f2);
  if (perRoll === null || !Number.isFinite(d1) || !Number.isFinite(d2) || d2 <= d1) return null;
  if (!Number.isInteger(rolls) || rolls < 1 || rolls > 120) return null;
  const gapDays = d2 - d1;
  return { rolls, gapDays, perRoll, total: Math.pow(1 + perRoll, rolls) - 1, daysCovered: rolls * gapDays };
}
