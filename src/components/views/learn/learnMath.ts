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

export type ContractValueResult = { ok: true; notional: number; currency: string } | Refusal;

/** Notional value of one contract at a price (quotation units): (price / tick) x tickValue. */
export function contractValue(spec: ContractSpecification | null | undefined, price: number): ContractValueResult {
  const s = requireVerifiedSpec(spec);
  if (!s.ok) return s;
  if (!(price > 0)) return { ok: false, reason: 'Nhập giá lớn hơn 0 (theo đơn vị yết giá).' };
  return { ok: true, notional: (price / s.spec.tick) * s.spec.tickValue, currency: s.spec.currency };
}

export type RollCostResult =
  | { ok: true; spreadPrice: number; spreadTicks: number; costPerContract: number; cost: number; currency: string; state: 'CONTANGO' | 'BACKWARDATION' | 'FLAT' }
  | Refusal;

/**
 * Cost of rolling a LONG position: sell near month, buy far month. Spread = far - near.
 * Positive cost = you pay (contango); negative = you receive (backwardation). Excludes fees/slippage.
 */
export function rollCost(spec: ContractSpecification | null | undefined, nearPrice: number, farPrice: number, contracts: number): RollCostResult {
  const s = requireVerifiedSpec(spec);
  if (!s.ok) return s;
  if (!(nearPrice > 0) || !(farPrice > 0)) return { ok: false, reason: 'Nhập giá tháng gần và tháng xa lớn hơn 0.' };
  if (!Number.isInteger(contracts) || contracts < 1) return { ok: false, reason: 'Số hợp đồng phải là số nguyên dương.' };
  const spreadPrice = farPrice - nearPrice;
  const spreadTicks = spreadPrice / s.spec.tick;
  const costPerContract = spreadTicks * s.spec.tickValue;
  const state = spreadPrice > 0 ? 'CONTANGO' : spreadPrice < 0 ? 'BACKWARDATION' : 'FLAT';
  return { ok: true, spreadPrice, spreadTicks, costPerContract, cost: costPerContract * contracts, currency: s.spec.currency, state };
}

export type MarginCallResult =
  | { ok: true; bufferPerContract: number; bufferTotal: number; ticksToCall: number; priceMoveToCall: number; currency: string }
  | Refusal;

/**
 * Loss a long/short position can absorb before equity per contract falls to the maintenance margin
 * (initial - maintenance, both user-provided, in the trading currency).
 */
export function marginCallDistance(
  spec: ContractSpecification | null | undefined,
  initialMargin: number,
  maintenanceMargin: number,
  contracts: number,
): MarginCallResult {
  const s = requireVerifiedSpec(spec);
  if (!s.ok) return s;
  if (!(initialMargin > 0) || !(maintenanceMargin > 0)) return { ok: false, reason: 'Nhập ký quỹ ban đầu và duy trì lớn hơn 0 (tự lấy từ bảng ký quỹ).' };
  if (maintenanceMargin > initialMargin) return { ok: false, reason: 'Ký quỹ duy trì không được lớn hơn ký quỹ ban đầu.' };
  if (!Number.isInteger(contracts) || contracts < 1) return { ok: false, reason: 'Số hợp đồng phải là số nguyên dương.' };
  const bufferPerContract = initialMargin - maintenanceMargin;
  const ticksToCall = bufferPerContract / s.spec.tickValue;
  return {
    ok: true,
    bufferPerContract,
    bufferTotal: bufferPerContract * contracts,
    ticksToCall,
    priceMoveToCall: ticksToCall * s.spec.tick,
    currency: s.spec.currency,
  };
}

/** Converts an amount in trading currency (USD) to VND at a user-provided rate. */
export function convertCurrency(amount: number, rate: number): { ok: true; value: number } | Refusal {
  if (!Number.isFinite(amount)) return { ok: false, reason: 'Nhập số tiền là một số.' };
  if (!(rate > 0)) return { ok: false, reason: 'Nhập tỷ giá lớn hơn 0.' };
  return { ok: true, value: amount * rate };
}

export type SwingPlanResult =
  | ({ ok: true; stopDistance: number; stopPrice: number; takeProfit2R: number; pnlAt1R: number } & Omit<Extract<SizingResult, { ok: true }>, 'ok'>)
  | Refusal;

/**
 * Swing-trade planning (LONG illustration): stopDistance = atr x atrMultiple, stopPrice = entry - stopDistance,
 * contracts from positionSize(); the 2R reference level = entry + 2 x stopDistance. Education only.
 */
export function swingPlan(
  spec: ContractSpecification | null | undefined,
  entry: number,
  atr: number,
  atrMultiple: number,
  equity: number,
  riskPct: number,
  costsPerContract: number,
): SwingPlanResult {
  if (!(entry > 0) || !(atr > 0) || !(atrMultiple > 0)) return { ok: false, reason: 'Nhập giá vào, ATR và hệ số ATR lớn hơn 0.' };
  const stopDistance = atr * atrMultiple;
  if (stopDistance >= entry) return { ok: false, reason: 'Khoảng cách stop phải nhỏ hơn giá vào.' };
  const sized = positionSize(spec, equity, riskPct, stopDistance, costsPerContract);
  if (!sized.ok) return sized;
  const { ok: _ok, ...rest } = sized;
  void _ok;
  return { ok: true, ...rest, stopDistance, stopPrice: entry - stopDistance, takeProfit2R: entry + 2 * stopDistance, pnlAt1R: rest.riskPerContract * rest.contracts };
}

export type RMultipleResult = { ok: true; r: number; pnl: number; riskDollars: number; currency: string } | Refusal;

/** R multiple of a closed LONG trade: P&L / initial risk, where initial risk = (entry - stop) / tick x tickValue x contracts. */
export function rMultiple(
  spec: ContractSpecification | null | undefined,
  entry: number,
  stop: number,
  exit: number,
  contracts: number,
): RMultipleResult {
  const s = requireVerifiedSpec(spec);
  if (!s.ok) return s;
  if (!(entry > 0) || !(stop > 0) || !(exit > 0)) return { ok: false, reason: 'Nhập giá vào, stop và giá thoát lớn hơn 0.' };
  if (!(stop < entry)) return { ok: false, reason: 'Với vị thế mua minh hoạ, stop phải thấp hơn giá vào.' };
  if (!Number.isInteger(contracts) || contracts < 1) return { ok: false, reason: 'Số hợp đồng phải là số nguyên dương.' };
  const riskDollars = ((entry - stop) / s.spec.tick) * s.spec.tickValue * contracts;
  const pnl = ((exit - entry) / s.spec.tick) * s.spec.tickValue * contracts;
  return { ok: true, r: pnl / riskDollars, pnl, riskDollars, currency: s.spec.currency };
}
