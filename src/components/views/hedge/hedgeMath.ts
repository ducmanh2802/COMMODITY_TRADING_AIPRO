/**
 * T59 hedge wizard: pure math (no I/O). Education only, not advice.
 * Everything is computed in VND per kg so the farmer sees one familiar unit.
 */
export type HedgeRole = 'seller' | 'buyer'; // seller = short hedge, buyer = long hedge

const KG_PER_LB = 0.45359237;
export const KG_PER_BUSHEL_CORN = 25.4012;
const KG_PER_BUSHEL_SOY = 27.2155;

export type QuoteUnit = 'usd_per_mt' | 'cents_per_lb' | 'cents_per_bushel';

export interface CropSpec {
  /** Exchange symbol in the Instrument Master. */
  symbol: string;
  vi: string;
  quoteUnit: QuoteUnit;
  kgPerBushel?: number;
  /** Contract size in kg (from Instrument Master contractSize and unit). */
  contractKg: number;
}

export const CROPS: CropSpec[] = [
  { symbol: 'RC', vi: 'Cà phê robusta', quoteUnit: 'usd_per_mt', contractKg: 10_000 },
  { symbol: 'KC', vi: 'Cà phê arabica', quoteUnit: 'cents_per_lb', contractKg: 37_500 * KG_PER_LB },
  { symbol: 'ZC', vi: 'Ngô', quoteUnit: 'cents_per_bushel', kgPerBushel: KG_PER_BUSHEL_CORN, contractKg: 5000 * KG_PER_BUSHEL_CORN },
  { symbol: 'ZS', vi: 'Đậu tương', quoteUnit: 'cents_per_bushel', kgPerBushel: KG_PER_BUSHEL_SOY, contractKg: 5000 * KG_PER_BUSHEL_SOY },
  { symbol: 'SB', vi: 'Đường', quoteUnit: 'cents_per_lb', contractKg: 112_000 * KG_PER_LB },
];

/** Futures price in its quoted unit -> USD per kg. */
export function quoteToUsdPerKg(price: number, unit: QuoteUnit, kgPerBushel = 1): number {
  switch (unit) {
    case 'usd_per_mt':
      return price / 1000;
    case 'cents_per_lb':
      return price / 100 / KG_PER_LB;
    case 'cents_per_bushel':
      return price / 100 / kgPerBushel;
  }
}

const usdPerKgToVndPerKg = (usdPerKg: number, vndPerUsd: number) => usdPerKg * vndPerUsd;

export function quoteToVndPerKg(price: number, crop: CropSpec, vndPerUsd: number): number {
  return usdPerKgToVndPerKg(quoteToUsdPerKg(price, crop.quoteUnit, crop.kgPerBushel), vndPerUsd);
}

export interface ContractPlan {
  contracts: number;
  hedgedKg: number;
  /** Positive: quantity left unhedged; negative: hedge exceeds physical quantity. */
  leftoverKg: number;
}

/** Round to the nearest whole contract (0 when quantity is far below one contract). */
export function planContracts(quantityKg: number, contractKg: number): ContractPlan {
  if (!(quantityKg > 0) || !(contractKg > 0)) return { contracts: 0, hedgedKg: 0, leftoverKg: Math.max(0, quantityKg || 0) };
  const contracts = Math.round(quantityKg / contractKg);
  const hedgedKg = contracts * contractKg;
  return { contracts, hedgedKg, leftoverKg: quantityKg - hedgedKg };
}

/** Futures P&L in VND. Seller (short) gains when price falls; buyer (long) when it rises. */
export function futuresPnlVnd(role: HedgeRole, entryVndKg: number, exitVndKg: number, hedgedKg: number): number {
  const diff = role === 'seller' ? entryVndKg - exitVndKg : exitVndKg - entryVndKg;
  return diff * hedgedKg;
}

/** Local basis = local price - international price converted (VND/kg). */
export const localBasis = (localVndKg: number, intlVndKg: number) => localVndKg - intlVndKg;

export function initialMargin(hedgedKg: number, entryVndKg: number, marginPct: number): number {
  return Math.max(0, hedgedKg * entryVndKg * (marginPct / 100));
}

export interface Scenario {
  changePct: number;
  futuresExitVndKg: number;
  /** Physical price at the time of sale/purchase = futures + basis (+ basis change). */
  physicalVndKg: number;
  physicalTotal: number;
  futuresPnl: number;
  /** Seller: revenue. Buyer: cost. */
  withoutHedge: number;
  withHedge: number;
  /** Extra cash needed for margin calls (only when futures loses money). */
  extraCashNeeded: number;
}

export interface ScenarioInput {
  role: HedgeRole;
  quantityKg: number;
  hedgedKg: number;
  entryVndKg: number;
  basisVndKg: number;
  basisChangeVndKg?: number;
}

const SCENARIO_PCTS = [-20, -10, 0, 10, 20] as const;

export function buildScenarios(inp: ScenarioInput, pcts: readonly number[] = SCENARIO_PCTS): Scenario[] {
  const bc = inp.basisChangeVndKg ?? 0;
  return pcts.map((changePct) => {
    const futuresExit = inp.entryVndKg * (1 + changePct / 100);
    const physicalVndKg = futuresExit + inp.basisVndKg + bc;
    const physicalTotal = physicalVndKg * inp.quantityKg;
    const futuresPnl = futuresPnlVnd(inp.role, inp.entryVndKg, futuresExit, inp.hedgedKg);
    // Seller: revenue + pnl. Buyer: cost - pnl (a gain lowers the cost).
    const withHedge = inp.role === 'seller' ? physicalTotal + futuresPnl : physicalTotal - futuresPnl;
    return {
      changePct,
      futuresExitVndKg: futuresExit,
      physicalVndKg,
      physicalTotal,
      futuresPnl,
      withoutHedge: physicalTotal,
      withHedge,
      extraCashNeeded: Math.max(0, -futuresPnl),
    };
  });
}

/** First listed contract month (YYYY-MM) at or after the target month (YYYY-MM); null if none. */
export function pickContractMonth(listed: string[], target: string): string | null {
  const sorted = [...listed].sort();
  return sorted.find((m) => m >= target) ?? null;
}

export const parseNum = (s: string): number => {
  const n = Number(String(s).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};
