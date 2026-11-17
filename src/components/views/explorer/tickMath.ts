import type { ContractSpecification } from '../../../shared/types/instrument';

export type TickCalcResult =
  | {
      ok: true;
      /** Price move divided by the minimum tick (exact, may be fractional). */
      ticks: number;
      /** true when the move is not a whole number of ticks (within floating tolerance). */
      fractionalTicks: boolean;
      /** ticks x tickValue x contracts, in the trading currency. */
      pnl: number;
      pnlPerContract: number;
      currency: string;
      /** Human-readable formula with the spec values used. */
      formula: string;
    }
  | { ok: false; reason: string };

/**
 * P&L of a price move for a futures contract:
 *   ticks = move / minimumTickSize
 *   pnlPerContract = ticks x tickValue
 * The tick value already embeds the quotation-unit conversion (e.g. cents -> USD), so the contract
 * size is only required to be present and verified, not multiplied again.
 * Refuses when any of contractSize / minimumTickSize / tickValue is missing or the spec is not VERIFIED.
 */
export function computeTickPnl(spec: ContractSpecification, priceMove: number, contracts = 1): TickCalcResult {
  const missing: string[] = [];
  if (spec.contractSize === null) missing.push('contractSize');
  if (spec.minimumTickSize === null) missing.push('minimumTickSize');
  if (spec.tickValue === null) missing.push('tickValue');
  if (missing.length) return { ok: false, reason: `Refused: ${missing.join(', ')} unavailable in the Instrument Master.` };
  if (spec.verificationStatus !== 'VERIFIED') {
    return { ok: false, reason: `Refused: contract specification is ${spec.verificationStatus}; tick value cannot be relied upon.` };
  }
  const tick = spec.minimumTickSize as number;
  const tickValue = spec.tickValue as number;
  if (!(tick > 0) || !(tickValue > 0)) return { ok: false, reason: 'Refused: tick size and tick value must be positive.' };
  if (!Number.isFinite(priceMove)) return { ok: false, reason: 'Enter a numeric price move.' };
  if (!Number.isInteger(contracts) || contracts < 1) return { ok: false, reason: 'Contracts must be a positive whole number.' };

  const ticks = priceMove / tick;
  const fractionalTicks = Math.abs(ticks - Math.round(ticks)) > 1e-9 * Math.max(1, Math.abs(ticks));
  const pnlPerContract = ticks * tickValue;
  return {
    ok: true,
    ticks,
    fractionalTicks,
    pnlPerContract,
    pnl: pnlPerContract * contracts,
    currency: spec.tradingCurrency,
    formula: `ticks = move / ${tick} ${spec.quotationUnit}; P&L = ticks x ${tickValue} ${spec.tradingCurrency} x contracts`,
  };
}
