// Risk-based position sizing for the paper order ticket (practice math, not advice).
// Reuses ValidSpec (tick, tickValueUsd) from paperMath; USD -> VND uses the same fx as paper P&L.
import type { Side, ValidSpec } from './paperMath';

export type SizingFail = 'BAD_INPUT' | 'STOP_WRONG_SIDE' | 'ZERO_DISTANCE';

export type RiskSizing =
  | {
      ok: true;
      /** |entry - stop| rounded to whole ticks. */
      stopTicks: number;
      riskPerContractUsd: number;
      riskPerContractVnd: number;
      maxRiskVnd: number;
      /** floor(maxRisk / riskPerContract); 0 = stop too wide for this account. */
      contracts: number;
    }
  | { ok: false; reason: SizingFail };

const pos = (n: number) => Number.isFinite(n) && n > 0;

export function riskSizing(p: {
  spec: ValidSpec;
  side: Side;
  entry: number;
  stop: number;
  equityVnd: number;
  riskPct: number;
  fx: number;
}): RiskSizing {
  const { spec, side, entry, stop, equityVnd, riskPct, fx } = p;
  if (!pos(entry) || !pos(stop) || !pos(equityVnd) || !pos(fx) || !pos(riskPct) || riskPct > 100) return { ok: false, reason: 'BAD_INPUT' };
  if (!pos(spec.tick) || !pos(spec.tickValueUsd)) return { ok: false, reason: 'BAD_INPUT' };
  if (side === 'LONG' ? stop > entry : stop < entry) return { ok: false, reason: 'STOP_WRONG_SIDE' };
  const stopTicks = Math.round(Math.abs(entry - stop) / spec.tick);
  if (stopTicks < 1) return { ok: false, reason: 'ZERO_DISTANCE' };
  const riskPerContractUsd = stopTicks * spec.tickValueUsd;
  const riskPerContractVnd = riskPerContractUsd * fx;
  const maxRiskVnd = (equityVnd * riskPct) / 100;
  return { ok: true, stopTicks, riskPerContractUsd, riskPerContractVnd, maxRiskVnd, contracts: Math.floor(maxRiskVnd / riskPerContractVnd + 1e-9) };
}
