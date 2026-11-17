import type { ContractSpecification } from '../../../shared/types/instrument';
import { computeTickPnl } from '../explorer/tickMath';

export interface JournalExitInput {
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  stopLoss: number;
  exitPrice: number;
  contracts: number;
  /** Round-trip trading costs (fees + commissions) in the trading currency; subtracted from gross P&L. */
  tradingCosts: number;
}

export type JournalExitResult =
  | {
      ok: true;
      /** Gross P&L from the price move: ticks x tickValue x contracts (trading currency). */
      grossPnl: number;
      /** Net realized P&L = gross - tradingCosts. This is what the journal stores as `realizedPnl`. */
      realizedPnl: number;
      /** Signed price move in R units: (exit - entry) * dir / |entry - stop|. Excludes costs. */
      resultInR: number;
      currency: string;
      formula: string;
      warnings: string[];
    }
  | { ok: false; reason: string };

/**
 * Realized P&L and R-multiple of a closed futures trade from the contract specification.
 * Fail-closed: refuses when the spec is missing/unverified (via computeTickPnl), when the trading
 * currency is not USD (journal analytics aggregate in USD), or when inputs are invalid.
 */
export function computeJournalExit(spec: ContractSpecification | null | undefined, input: JournalExitInput): JournalExitResult {
  if (!spec) return { ok: false, reason: 'Refused: instrument not found in the Instrument Master.' };
  const { direction, entryPrice, stopLoss, exitPrice, contracts, tradingCosts } = input;
  if (!(entryPrice > 0) || !(stopLoss > 0)) return { ok: false, reason: 'Entry and stop must be positive.' };
  if (!(Number.isFinite(exitPrice) && exitPrice > 0)) return { ok: false, reason: 'Enter a positive exit price.' };
  if (!(Number.isFinite(tradingCosts) && tradingCosts >= 0)) return { ok: false, reason: 'Trading costs must be 0 or more.' };
  const risk = Math.abs(entryPrice - stopLoss);
  if (!(risk > 0)) return { ok: false, reason: 'Stop loss must differ from entry price (R is undefined).' };

  const dir = direction === 'LONG' ? 1 : -1;
  const move = (exitPrice - entryPrice) * dir;
  const tick = computeTickPnl(spec, move, contracts);
  if (!tick.ok) return { ok: false, reason: tick.reason };
  if (tick.currency !== 'USD') {
    return { ok: false, reason: `Refused: trading currency is ${tick.currency || 'unknown'}; journal analytics are in USD.` };
  }
  const warnings: string[] = [];
  if (tick.fractionalTicks) warnings.push('Exit/entry difference is not a whole number of ticks — check the prices.');
  const round = (x: number) => Math.round(x * 100) / 100;
  return {
    ok: true,
    grossPnl: round(tick.pnl),
    realizedPnl: round(tick.pnl - tradingCosts),
    resultInR: Math.round((move / risk) * 100) / 100,
    currency: tick.currency,
    formula: `${tick.formula}; net = gross - costs ${tradingCosts}; R = move / |entry - stop| (${risk})`,
    warnings,
  };
}

/** `datetime-local` value (local wall clock) -> ISO-8601 UTC, or null when empty/invalid. */
export function localDateTimeToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
