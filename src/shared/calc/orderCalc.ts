import type { ContractSpecification } from '../types/instrument';
import { requireVerifiedSpec } from '../../components/views/learn/learnMath';

/**
 * "Máy tính lệnh": pure order-sizing maths from a VERIFIED contract spec (tick size and tick value).
 * USD per 1 price unit = tickValue / tick (ZC: 12.5 / 0.25 = 50 USD per 1 cent). Education only.
 */

export type Direction = 'LONG' | 'SHORT';

export interface OrderCalcInput {
  spec: ContractSpecification | null | undefined;
  direction: Direction;
  capitalVnd: number;
  usdVnd: number;
  riskPct: number;
  entry: number;
  stop: number;
  target: number;
  /** Round-trip cost per contract, USD. */
  costUsd: number;
  /** User-entered initial margin per contract, USD (optional). */
  marginUsd?: number | null;
}

export type OrderField = 'capital' | 'fx' | 'risk' | 'entry' | 'stop' | 'target' | 'cost' | 'margin' | 'spec';

interface OrderCalcOk {
  ok: true;
  /** USD value of a 1.0 move in the quotation unit, per contract. */
  usdPerUnit: number;
  capitalUsd: number;
  riskBudgetUsd: number;
  riskBudgetVnd: number;
  stopDistance: number;
  stopTicks: number;
  targetDistance: number;
  lossPerContractUsd: number;
  profitPerContractUsd: number;
  /** Loss at the stop incl. costs, per contract. */
  riskPerContractUsd: number;
  /** floor(budget / riskPerContract); 0 means capital too small. */
  maxContracts: number;
  totalRiskUsd: number;
  pnlAtStopUsd: number;
  pnlAtTargetUsd: number;
  pnlAtStopVnd: number;
  pnlAtTargetVnd: number;
  /** reward : risk per contract, after costs on both sides. */
  rRatio: number;
  notionalUsd: number;
  notionalVnd: number;
  leverage: number;
  marginUsedUsd: number | null;
  marginUsedPct: number | null;
  tooSmall: boolean;
  currency: string;
}

export type OrderCalcResult = OrderCalcOk | { ok: false; errors: Partial<Record<OrderField, string>> };

/** Validates and computes the order plan. Never invents data: invalid input returns per-field errors. */
export function calcOrder(i: OrderCalcInput): OrderCalcResult {
  const errors: Partial<Record<OrderField, string>> = {};
  const s = requireVerifiedSpec(i.spec);
  if (!s.ok) errors.spec = s.reason;
  else if (s.spec.currency !== 'USD') errors.spec = 'Máy tính lệnh hiện chỉ hỗ trợ hợp đồng tính bằng USD.';
  if (!(i.capitalVnd > 0)) errors.capital = 'Nhập vốn lớn hơn 0.';
  if (!(i.usdVnd > 0)) errors.fx = 'Tỷ giá USD/VND phải lớn hơn 0.';
  if (!(i.riskPct > 0) || i.riskPct > 100) errors.risk = '% rủi ro phải trong khoảng (0, 100].';
  if (!Number.isFinite(i.entry) || i.entry <= 0) errors.entry = 'Nhập giá vào lệnh lớn hơn 0.';
  if (!Number.isFinite(i.stop) || i.stop <= 0) errors.stop = 'Nhập giá cắt lỗ lớn hơn 0.';
  if (!Number.isFinite(i.target) || i.target <= 0) errors.target = 'Nhập giá mục tiêu lớn hơn 0.';
  if (!(i.costUsd >= 0) || !Number.isFinite(i.costUsd)) errors.cost = 'Chi phí không được âm.';
  if (i.marginUsd != null && (!Number.isFinite(i.marginUsd) || i.marginUsd < 0)) errors.margin = 'Ký quỹ không được âm.';

  const long = i.direction === 'LONG';
  if (!errors.entry && !errors.stop && (long ? !(i.stop < i.entry) : !(i.stop > i.entry))) {
    errors.stop = long ? 'Lệnh MUA: giá cắt lỗ phải thấp hơn giá vào.' : 'Lệnh BÁN: giá cắt lỗ phải cao hơn giá vào.';
  }
  if (!errors.entry && !errors.target && (long ? !(i.target > i.entry) : !(i.target < i.entry))) {
    errors.target = long ? 'Lệnh MUA: giá mục tiêu phải cao hơn giá vào.' : 'Lệnh BÁN: giá mục tiêu phải thấp hơn giá vào.';
  }
  if (Object.keys(errors).length || !s.ok) return { ok: false, errors };

  const { tick, tickValue, currency } = s.spec;
  const usdPerUnit = tickValue / tick;
  const capitalUsd = i.capitalVnd / i.usdVnd;
  const riskBudgetUsd = capitalUsd * (i.riskPct / 100);
  const stopDistance = Math.abs(i.entry - i.stop);
  const targetDistance = Math.abs(i.target - i.entry);
  const lossPerContractUsd = stopDistance * usdPerUnit;
  const profitPerContractUsd = targetDistance * usdPerUnit;
  const riskPerContractUsd = lossPerContractUsd + i.costUsd;
  const maxContracts = Math.floor(riskBudgetUsd / riskPerContractUsd + 1e-9);
  const pnlAtStopUsd = -riskPerContractUsd * maxContracts;
  const pnlAtTargetUsd = (profitPerContractUsd - i.costUsd) * maxContracts;
  const rRatio = (profitPerContractUsd - i.costUsd) / riskPerContractUsd;
  const notionalUsd = (i.entry / tick) * tickValue * maxContracts;
  const hasMargin = i.marginUsd != null && i.marginUsd > 0;
  const marginUsedUsd = hasMargin ? (i.marginUsd as number) * maxContracts : null;
  return {
    ok: true,
    usdPerUnit,
    capitalUsd,
    riskBudgetUsd,
    riskBudgetVnd: i.capitalVnd * (i.riskPct / 100),
    stopDistance,
    stopTicks: stopDistance / tick,
    targetDistance,
    lossPerContractUsd,
    profitPerContractUsd,
    riskPerContractUsd,
    maxContracts,
    totalRiskUsd: riskPerContractUsd * maxContracts,
    pnlAtStopUsd,
    pnlAtTargetUsd,
    pnlAtStopVnd: pnlAtStopUsd * i.usdVnd,
    pnlAtTargetVnd: pnlAtTargetUsd * i.usdVnd,
    rRatio,
    notionalUsd,
    notionalVnd: notionalUsd * i.usdVnd,
    leverage: notionalUsd / capitalUsd,
    marginUsedUsd,
    marginUsedPct: marginUsedUsd === null ? null : (marginUsedUsd / capitalUsd) * 100,
    tooSmall: maxContracts < 1,
    currency,
  };
}

/** Colour band for the reward:risk ratio. */
export function rRatioBand(r: number): 'bad' | 'warn' | 'good' {
  if (!(r > 0)) return 'bad';
  return r < 1.5 ? 'warn' : 'good';
}
