/**
 * T79 "Luyện tập trên dữ liệu quá khứ" — pure bar-replay engine (no React). EDUCATION ONLY.
 *
 * Rules (all stated in the UI):
 *  - Orders are filled at the OPEN of the next bar.
 *  - After a fill, and on every later bar, stop / target are checked intrabar against high/low.
 *    If one bar touches BOTH, the stop is assumed to hit first (conservative).
 *  - Gaps: a stop that the open already gapped through fills at the open (worse than the stop);
 *    a target the open gapped through fills at the open (better than the target).
 *  - "Đóng lệnh" closes immediately at the close of the last visible bar.
 *  - No fees / slippage. P&L in USD = price move x pointValueUsd x contracts. R = P&L / initial risk.
 */

export type Side = 'LONG' | 'SHORT';
export type ExitReason = 'STOP' | 'TARGET' | 'MANUAL' | 'END';

export interface Bar {
  t: string; // ISO date/time
  o: number;
  h: number;
  l: number;
  c: number;
}

export const START_EQUITY_USD = 10_000;
export const MAX_RISK_PCT = 2;
export const HISTORY_BARS = 100;
export const MIN_FUTURE_BARS = 120;

export interface OrderRequest {
  side: Side;
  stop: number;
  target: number;
  contracts: number;
}

export interface Position {
  side: Side;
  entry: number;
  stop: number;
  target: number;
  contracts: number;
  entryIdx: number;
  riskUsd: number;
}

export interface ClosedTrade {
  side: Side;
  entry: number;
  exit: number;
  stop: number;
  target: number;
  contracts: number;
  entryIdx: number;
  exitIdx: number;
  reason: ExitReason;
  riskUsd: number;
  pnlUsd: number;
  r: number;
  stopSetBeforeEntry: boolean;
  disciplined: boolean;
}

export type ReplayEvent =
  | { type: 'FILLED'; idx: number; side: Side; price: number }
  | { type: 'CANCELLED'; idx: number; reason: 'GAP_INVALID' | 'NO_NEXT_BAR' }
  | { type: 'CLOSED'; idx: number; trade: ClosedTrade };

export interface ReplayState {
  bars: Bar[];
  /** Index of the last visible bar. */
  cursor: number;
  startCursor: number;
  pointValueUsd: number;
  startEquityUsd: number;
  pending: OrderRequest | null;
  position: Position | null;
  closed: ClosedTrade[];
  finished: boolean;
  /** Events produced by the most recent action (for UI toasts). */
  events: ReplayEvent[];
}

export interface Stats {
  trades: number;
  wins: number;
  winRate: number | null;
  totalR: number;
  pnlUsd: number;
  disciplinePct: number | null;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Valid start cursors: HISTORY_BARS of history and at least MIN_FUTURE_BARS bars still hidden. */
export function cursorRange(nBars: number): { min: number; max: number } | null {
  const min = HISTORY_BARS - 1;
  const max = nBars - 1 - MIN_FUTURE_BARS;
  return max >= min ? { min, max } : null;
}

export function randomCursor(nBars: number, rng: () => number = Math.random): number | null {
  const r = cursorRange(nBars);
  if (!r) return null;
  return r.min + Math.floor(rng() * (r.max - r.min + 1));
}

/** Cursor whose bar is closest to (not after) the given date; clamped into the valid range. */
export function cursorForDate(bars: Bar[], isoDate: string): number | null {
  const r = cursorRange(bars.length);
  if (!r) return null;
  let idx = 0;
  for (let i = 0; i < bars.length; i++) {
    if (bars[i].t.slice(0, 10) <= isoDate) idx = i;
    else break;
  }
  return Math.min(r.max, Math.max(r.min, idx));
}

export function createReplay(bars: Bar[], cursor: number, pointValueUsd: number, startEquityUsd = START_EQUITY_USD): ReplayState {
  if (!(pointValueUsd > 0)) throw new Error('pointValueUsd must be > 0');
  if (!Number.isInteger(cursor) || cursor < 0 || cursor >= bars.length) throw new Error('cursor out of range');
  return { bars, cursor, startCursor: cursor, pointValueUsd, startEquityUsd, pending: null, position: null, closed: [], finished: false, events: [] };
}

export function validateOrder(o: OrderRequest, ref: number): string | null {
  if (!isNum(o.stop) || !isNum(o.target) || !(o.stop > 0) || !(o.target > 0)) return 'STOP_TARGET_REQUIRED';
  if (!Number.isInteger(o.contracts) || o.contracts < 1) return 'BAD_CONTRACTS';
  if (o.side === 'LONG' ? !(o.stop < ref && ref < o.target) : !(o.target < ref && ref < o.stop)) return 'BAD_LEVELS';
  return null;
}

/** Place an order to be filled at the next bar open. Returns an error code or the new state. */
export function placeOrder(s: ReplayState, o: OrderRequest): { state: ReplayState; error?: string } {
  if (s.finished) return { state: s, error: 'FINISHED' };
  if (s.position) return { state: s, error: 'HAS_POSITION' };
  if (s.cursor >= s.bars.length - 1) return { state: s, error: 'NO_NEXT_BAR' };
  const err = validateOrder(o, s.bars[s.cursor].c);
  if (err) return { state: s, error: err };
  return { state: { ...s, pending: { ...o } } };
}

export function cancelOrder(s: ReplayState): ReplayState {
  return s.pending ? { ...s, pending: null } : s;
}

export function pnlOf(side: Side, entry: number, exit: number, contracts: number, pointValueUsd: number): number {
  return (side === 'LONG' ? exit - entry : entry - exit) * pointValueUsd * contracts;
}

function makeTrade(s: ReplayState, p: Position, exit: number, exitIdx: number, reason: ExitReason): ClosedTrade {
  const pnlUsd = pnlOf(p.side, p.entry, exit, p.contracts, s.pointValueUsd);
  return {
    side: p.side,
    entry: p.entry,
    exit,
    stop: p.stop,
    target: p.target,
    contracts: p.contracts,
    entryIdx: p.entryIdx,
    exitIdx,
    reason,
    riskUsd: p.riskUsd,
    pnlUsd,
    r: p.riskUsd > 0 ? pnlUsd / p.riskUsd : 0,
    stopSetBeforeEntry: true, // an order cannot be placed without a stop
    disciplined: p.riskUsd <= (s.startEquityUsd * MAX_RISK_PCT) / 100 + 1e-9,
  };
}

/** Check stop/target of an open position against one bar. Stop wins when both are inside the bar. */
export function checkExit(p: Position, bar: Bar): { price: number; reason: ExitReason } | null {
  if (p.side === 'LONG') {
    if (bar.l <= p.stop) return { price: Math.min(p.stop, bar.o), reason: 'STOP' };
    if (bar.h >= p.target) return { price: Math.max(p.target, bar.o), reason: 'TARGET' };
  } else {
    if (bar.h >= p.stop) return { price: Math.max(p.stop, bar.o), reason: 'STOP' };
    if (bar.l <= p.target) return { price: Math.min(p.target, bar.o), reason: 'TARGET' };
  }
  return null;
}

/** Reveal the next bar: fill pending order at its open, then check stop/target intrabar. */
export function advance(s: ReplayState): ReplayState {
  if (s.finished) return s;
  if (s.cursor >= s.bars.length - 1) return finish(s);
  const idx = s.cursor + 1;
  const bar = s.bars[idx];
  let st: ReplayState = { ...s, cursor: idx, events: [] };

  if (st.pending && !st.position) {
    const o = st.pending;
    const fill = bar.o;
    if (validateOrder(o, fill)) {
      st = { ...st, pending: null, events: [...st.events, { type: 'CANCELLED', idx, reason: 'GAP_INVALID' }] };
    } else {
      const position: Position = {
        side: o.side,
        entry: fill,
        stop: o.stop,
        target: o.target,
        contracts: o.contracts,
        entryIdx: idx,
        riskUsd: Math.abs(fill - o.stop) * st.pointValueUsd * o.contracts,
      };
      st = { ...st, pending: null, position, events: [...st.events, { type: 'FILLED', idx, side: o.side, price: fill }] };
    }
  }

  if (st.position) {
    const hit = checkExit(st.position, bar);
    if (hit) {
      const trade = makeTrade(st, st.position, hit.price, idx, hit.reason);
      st = { ...st, position: null, closed: [...st.closed, trade], events: [...st.events, { type: 'CLOSED', idx, trade }] };
    }
  }

  if (idx >= st.bars.length - 1) return finish(st);
  return st;
}

/** Close the open position now at the last visible close. */
export function closeNow(s: ReplayState, reason: ExitReason = 'MANUAL'): ReplayState {
  if (!s.position) return s;
  const trade = makeTrade(s, s.position, s.bars[s.cursor].c, s.cursor, reason);
  return { ...s, position: null, closed: [...s.closed, trade], events: [...s.events, { type: 'CLOSED', idx: s.cursor, trade }] };
}

/** End the session: flatten any position at the last visible close, drop pending orders. */
export function finish(s: ReplayState): ReplayState {
  if (s.finished) return s;
  let st = closeNow(s, 'END');
  if (st.pending) st = { ...st, pending: null, events: [...st.events, { type: 'CANCELLED', idx: st.cursor, reason: 'NO_NEXT_BAR' }] };
  return { ...st, finished: true };
}

export function unrealisedUsd(s: ReplayState): number {
  const p = s.position;
  return p ? pnlOf(p.side, p.entry, s.bars[s.cursor].c, p.contracts, s.pointValueUsd) : 0;
}

export function realisedUsd(s: ReplayState): number {
  return s.closed.reduce((a, t) => a + t.pnlUsd, 0);
}

export function equityUsd(s: ReplayState): number {
  return s.startEquityUsd + realisedUsd(s) + unrealisedUsd(s);
}

export function openR(s: ReplayState): number | null {
  const p = s.position;
  return p && p.riskUsd > 0 ? unrealisedUsd(s) / p.riskUsd : null;
}

export function computeStats(trades: ClosedTrade[]): Stats {
  const n = trades.length;
  const wins = trades.filter((t) => t.pnlUsd > 0).length;
  const good = trades.filter((t) => t.stopSetBeforeEntry && t.disciplined).length;
  return {
    trades: n,
    wins,
    winRate: n ? (wins / n) * 100 : null,
    totalR: trades.reduce((a, t) => a + t.r, 0),
    pnlUsd: trades.reduce((a, t) => a + t.pnlUsd, 0),
    disciplinePct: n ? (good / n) * 100 : null,
  };
}

/** Max whole contracts so that risk <= MAX_RISK_PCT of start equity. */
export function maxContractsFor(entry: number, stop: number, pointValueUsd: number, startEquityUsd = START_EQUITY_USD): number {
  const perContract = Math.abs(entry - stop) * pointValueUsd;
  if (!(perContract > 0)) return 0;
  return Math.floor((startEquityUsd * MAX_RISK_PCT) / 100 / perContract);
}
