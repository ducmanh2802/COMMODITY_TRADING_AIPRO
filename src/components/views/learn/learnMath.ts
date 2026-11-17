import type { ContractSpecification } from '../../../shared/types/instrument';

/**
 * Pure calculations for the "Học" (Learn) exercises. Every function refuses (ok: false with a Vietnamese
 * explanation) unless the contract specification is VERIFIED and has a positive tick size and tick value.
 * Margins are never taken from the spec (it holds none): the learner enters them, labelled user-provided.
 */

export type Refusal = { ok: false; reason: string };

interface UsableSpec {
  tick: number;
  tickValue: number;
  currency: string;
  quotationUnit: string;
}

/** Returns the usable tick fields, or a Vietnamese refusal explaining why the exercise cannot run. */
export function requireVerifiedSpec(spec: ContractSpecification | null | undefined): { ok: true; spec: UsableSpec } | Refusal {
  if (!spec) return { ok: false, reason: 'Chưa chọn hợp đồng hoặc không tải được đặc tả từ /api/instruments.' };
  if (spec.verificationStatus !== 'VERIFIED') {
    return {
      ok: false,
      reason: `Từ chối: đặc tả hợp đồng đang ở trạng thái ${spec.verificationStatus} (chưa đối chiếu với tài liệu chính thức của sàn), nên không thể dùng bước giá/giá trị bước giá để tính.`,
    };
  }
  const missing: string[] = [];
  if (spec.contractSize === null) missing.push('khối lượng hợp đồng');
  if (spec.minimumTickSize === null) missing.push('bước giá');
  if (spec.tickValue === null) missing.push('giá trị bước giá');
  if (missing.length) return { ok: false, reason: `Từ chối: thiếu ${missing.join(', ')} trong Instrument Master.` };
  const tick = spec.minimumTickSize as number;
  const tickValue = spec.tickValue as number;
  if (!(tick > 0) || !(tickValue > 0)) return { ok: false, reason: 'Từ chối: bước giá và giá trị bước giá phải dương.' };
  return { ok: true, spec: { tick, tickValue, currency: spec.tradingCurrency, quotationUnit: spec.quotationUnit } };
}

export type PnlResult =
  | { ok: true; ticks: number; fractionalTicks: boolean; pnlPerContract: number; pnl: number; currency: string }
  | Refusal;

/** P&L of a price move (in quotation units): ticks = move / tick; P&L = ticks x tickValue x contracts. */
export function tickPnl(spec: ContractSpecification | null | undefined, priceMove: number, contracts: number): PnlResult {
  const s = requireVerifiedSpec(spec);
  if (!s.ok) return s;
  if (!Number.isFinite(priceMove)) return { ok: false, reason: 'Nhập biến động giá là một số.' };
  if (!Number.isInteger(contracts) || contracts < 1) return { ok: false, reason: 'Số hợp đồng phải là số nguyên dương.' };
  const ticks = priceMove / s.spec.tick;
  const fractionalTicks = Math.abs(ticks - Math.round(ticks)) > 1e-9 * Math.max(1, Math.abs(ticks));
  const pnlPerContract = ticks * s.spec.tickValue;
  return { ok: true, ticks, fractionalTicks, pnlPerContract, pnl: pnlPerContract * contracts, currency: s.spec.currency };
}

export type LeverageResult =
  | {
      ok: true;
      /** Contract notional in the trading currency: (price / tick) x tickValue. */
      notional: number;
      /** User-provided margin converted to the trading currency. */
      marginInTradingCurrency: number;
      leverage: number;
      /** Adverse price move (%) that consumes the whole initial margin. */
      wipeoutMovePct: number;
      /** P&L (trading currency) and % of margin for the chosen price move. */
      movePnl: number;
      movePctOfMargin: number;
      currency: string;
    }
  | Refusal;

/**
 * Notional uses only verified tick fields: price / tick = number of ticks from zero, x tickValue.
 * This avoids parsing quotation units (cents vs USD) separately.
 * marginFx: units of margin currency per 1 unit of trading currency (e.g. VND per USD); 1 when the same.
 */
export function marginLeverage(
  spec: ContractSpecification | null | undefined,
  price: number,
  userMargin: number,
  marginFx: number,
  priceMovePct: number,
): LeverageResult {
  const s = requireVerifiedSpec(spec);
  if (!s.ok) return s;
  if (!(price > 0)) return { ok: false, reason: 'Nhập giá hợp đồng (theo đơn vị yết giá) lớn hơn 0.' };
  if (!(userMargin > 0)) return { ok: false, reason: 'Nhập mức ký quỹ ban đầu (do bạn tự nhập, lấy từ bảng ký quỹ của MXV/thành viên) lớn hơn 0.' };
  if (!(marginFx > 0)) return { ok: false, reason: 'Nhập tỷ giá quy đổi lớn hơn 0.' };
  if (!Number.isFinite(priceMovePct)) return { ok: false, reason: 'Nhập % biến động giá là một số.' };
  const notional = (price / s.spec.tick) * s.spec.tickValue;
  const marginInTradingCurrency = userMargin / marginFx;
  const leverage = notional / marginInTradingCurrency;
  const movePnl = notional * (priceMovePct / 100);
  return {
    ok: true,
    notional,
    marginInTradingCurrency,
    leverage,
    wipeoutMovePct: 100 / leverage,
    movePnl,
    movePctOfMargin: (movePnl / marginInTradingCurrency) * 100,
    currency: s.spec.currency,
  };
}

export type SizingResult =
  | {
      ok: true;
      riskBudget: number;
      stopTicks: number;
      riskPerContract: number;
      contracts: number;
      actualRisk: number;
      currency: string;
    }
  | Refusal;

/**
 * Position size from stop distance: riskPerContract = (stopDistance / tick) x tickValue + costs;
 * contracts = floor(equity x risk% / riskPerContract). Equity is assumed in the trading currency.
 */
export function positionSize(
  spec: ContractSpecification | null | undefined,
  equity: number,
  riskPct: number,
  stopDistance: number,
  costsPerContract: number,
): SizingResult {
  const s = requireVerifiedSpec(spec);
  if (!s.ok) return s;
  if (!(equity > 0)) return { ok: false, reason: 'Nhập vốn tài khoản lớn hơn 0.' };
  if (!(riskPct > 0) || riskPct > 100) return { ok: false, reason: '% rủi ro mỗi lệnh phải trong khoảng (0, 100].' };
  if (!(stopDistance > 0)) return { ok: false, reason: 'Khoảng cách stop phải lớn hơn 0 (theo đơn vị yết giá).' };
  if (!(costsPerContract >= 0)) return { ok: false, reason: 'Chi phí mỗi hợp đồng không được âm.' };
  const riskBudget = equity * (riskPct / 100);
  const stopTicks = stopDistance / s.spec.tick;
  const riskPerContract = stopTicks * s.spec.tickValue + costsPerContract;
  const contracts = Math.floor(riskBudget / riskPerContract + 1e-9);
  return {
    ok: true,
    riskBudget,
    stopTicks,
    riskPerContract,
    contracts,
    actualRisk: contracts * riskPerContract,
    currency: s.spec.currency,
  };
}

export type CurveShape = 'CONTANGO' | 'BACKWARDATION' | 'MIXED';

/** Classifies a curve ordered from nearest to farthest expiry. */
export function classifyCurve(prices: number[]): CurveShape {
  if (prices.length < 2) return 'MIXED';
  let up = true;
  let down = true;
  for (let i = 1; i < prices.length; i += 1) {
    if (!(prices[i] > prices[i - 1])) up = false;
    if (!(prices[i] < prices[i - 1])) down = false;
  }
  return up ? 'CONTANGO' : down ? 'BACKWARDATION' : 'MIXED';
}

export interface IllustrativeCurve {
  id: string;
  label: string;
  points: { month: string; price: number }[];
}

/** ILLUSTRATIVE ONLY — invented numbers for the quiz, not market prices. */
export const ILLUSTRATIVE_CURVES: IllustrativeCurve[] = [
  {
    id: 'a',
    label: 'Đường cong A',
    points: [
      { month: 'T1', price: 450 },
      { month: 'T2', price: 458 },
      { month: 'T3', price: 465 },
      { month: 'T4', price: 471 },
    ],
  },
  {
    id: 'b',
    label: 'Đường cong B',
    points: [
      { month: 'T1', price: 82 },
      { month: 'T2', price: 80.5 },
      { month: 'T3', price: 79.2 },
      { month: 'T4', price: 78.4 },
    ],
  },
  {
    id: 'c',
    label: 'Đường cong C',
    points: [
      { month: 'T1', price: 1210 },
      { month: 'T2', price: 1225 },
      { month: 'T3', price: 1205 },
      { month: 'T4', price: 1198 },
    ],
  },
];
