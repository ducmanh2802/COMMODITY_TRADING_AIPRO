/**
 * Margin-call simulator math (education only). All inputs are user-typed illustrative numbers.
 * Position is modelled as losing `tickValue * contracts` per adverse tick (long: price falls, short: price rises).
 */
export interface MarginSimInput {
  equity: number;
  contracts: number;
  initialPerContract: number;
  maintPerContract: number;
  /** Money per tick per contract (same currency as equity). */
  tickValue: number;
  /** Adverse move simulated, in ticks (>= 0). */
  adverseTicks: number;
  /** Forced-liquidation level as a share (0..1) of total maintenance margin. Illustrative, set by the user. */
  liquidationShare: number;
}

export type MarginStatus = 'ok' | 'call' | 'liquidate';

export interface MarginPoint {
  tick: number;
  equity: number;
  status: MarginStatus;
}

export type MarginSimResult =
  | {
      ok: true;
      initialReq: number;
      maintReq: number;
      liquidationLevel: number;
      lossPerTick: number;
      /** First adverse tick at which equity < maintenance requirement; null if never within the simulated move. */
      callTick: number | null;
      /** First adverse tick at which equity <= liquidation level (or <= 0); null if never. */
      liquidationTick: number | null;
      /** Equity at the simulated move. */
      finalEquity: number;
      finalStatus: MarginStatus;
      /** Cash to deposit at the margin call to return equity to the initial requirement (0 if no call). */
      topUp: number;
      path: MarginPoint[];
    }
  | { ok: false; reason: string };

export const MAX_PATH_TICKS = 400;

export function statusAt(equity: number, maintReq: number, liquidationLevel: number): MarginStatus {
  if (equity <= 0 || equity <= liquidationLevel) return 'liquidate';
  if (equity < maintReq) return 'call';
  return 'ok';
}

/** Smallest integer tick t >= 0 with equity - t*L < level (strict) or <= level (non-strict). */
function firstTickBelow(equity: number, level: number, lossPerTick: number, strict: boolean): number {
  const gap = equity - level;
  if (strict ? gap < 0 : gap <= 0) return 0;
  return strict ? Math.floor(gap / lossPerTick) + 1 : Math.ceil(gap / lossPerTick);
}

export function simulateMarginCall(i: MarginSimInput): MarginSimResult {
  const fin = (n: number) => Number.isFinite(n);
  if (![i.equity, i.contracts, i.initialPerContract, i.maintPerContract, i.tickValue, i.adverseTicks, i.liquidationShare].every(fin)) {
    return { ok: false, reason: 'Thiếu hoặc sai số liệu đầu vào.' };
  }
  if (i.contracts < 1 || !Number.isInteger(i.contracts)) return { ok: false, reason: 'Số hợp đồng phải là số nguyên từ 1.' };
  if (i.tickValue <= 0) return { ok: false, reason: 'Giá trị một tick phải lớn hơn 0.' };
  if (i.initialPerContract <= 0 || i.maintPerContract <= 0) return { ok: false, reason: 'Ký quỹ phải lớn hơn 0.' };
  if (i.maintPerContract > i.initialPerContract) return { ok: false, reason: 'Ký quỹ duy trì không được lớn hơn ký quỹ ban đầu.' };
  if (i.equity < 0) return { ok: false, reason: 'Vốn không được âm.' };
  if (i.adverseTicks < 0) return { ok: false, reason: 'Số tick đi ngược phải từ 0.' };
  if (i.liquidationShare < 0 || i.liquidationShare > 1) return { ok: false, reason: 'Ngưỡng thanh lý phải trong khoảng 0–100%.' };

  const initialReq = i.initialPerContract * i.contracts;
  const maintReq = i.maintPerContract * i.contracts;
  const liquidationLevel = maintReq * i.liquidationShare;
  const lossPerTick = i.tickValue * i.contracts;
  const move = Math.min(Math.floor(i.adverseTicks), MAX_PATH_TICKS);

  const path: MarginPoint[] = [];
  for (let t = 0; t <= move; t++) {
    const equity = i.equity - t * lossPerTick;
    path.push({ tick: t, equity, status: statusAt(equity, maintReq, liquidationLevel) });
  }
  const whole = Math.floor(i.adverseTicks);
  const callAt = firstTickBelow(i.equity, maintReq, lossPerTick, true);
  const liqAt = firstTickBelow(i.equity, Math.max(liquidationLevel, 0), lossPerTick, false);
  const last = path[path.length - 1];
  return {
    ok: true,
    initialReq,
    maintReq,
    liquidationLevel,
    lossPerTick,
    callTick: callAt <= whole ? callAt : null,
    liquidationTick: liqAt <= whole ? liqAt : null,
    finalEquity: last.equity,
    finalStatus: last.status,
    topUp: last.status === 'call' ? Math.max(0, initialReq - last.equity) : 0,
    path,
  };
}
