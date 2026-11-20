/**
 * T58 Paper trading ("Giao dịch thử") — pure logic: quote gating, pricing, margin, P&L, forced close, stats.
 * LEARNING ONLY: nothing here talks to a broker. No React / Firebase imports so it is unit-testable.
 *
 * Money model: capital/balance are in VND; contract maths are in USD (instrument trading currency) and
 * converted with a USD/VND rate (Vietcombank posted rate, UNOFFICIAL).
 */

export type Side = 'LONG' | 'SHORT';
export type CloseReason = 'MANUAL' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'STOP_OUT';

export const DEFAULT_CAPITAL_VND = 200_000_000;

export interface PaperSettings {
  /** Assumed initial margin as % of contract value (used when no explicit per-contract margin is entered). */
  marginPct: number;
  /** Fee per contract per side, USD. */
  feePerContractUsd: number;
  /** Adverse slippage per fill, in ticks. */
  slippageTicks: number;
  /** Margin-call warning when equity / used margin (%) falls to this level. */
  marginCallPct: number;
  /** Simulated forced close when equity / used margin (%) falls to this level. */
  stopOutPct: number;
}

export const DEFAULT_SETTINGS: PaperSettings = {
  marginPct: 10,
  feePerContractUsd: 2.5,
  slippageTicks: 1,
  marginCallPct: 100,
  stopOutPct: 50,
};

/** Minimal contract spec needed for the maths (mirrors the verified fields of ContractSpecification). */
export interface PaperSpec {
  minimumTickSize: number | null;
  tickValue: number | null;
  contractSize: number | null;
  tradingCurrency: string;
  verificationStatus: string;
}

export interface QuoteLike {
  price: number | null;
  status: string;
  kind?: string;
  delayMinutes?: number | null;
}

export type QuoteGate =
  | { ok: true; delayed: boolean; price: number; delayMinutes: number }
  | { ok: false; reason: 'NO_QUOTE' | 'STALE' | 'HISTORICAL' | 'UNAVAILABLE' | 'BENCHMARK' | 'INVALID' | 'NO_PRICE' };

/** Orders are accepted only on CURRENT / DELAYED futures quotes with a positive price. */
export function checkQuoteTradable(q: QuoteLike | null | undefined): QuoteGate {
  if (!q) return { ok: false, reason: 'NO_QUOTE' };
  if (q.kind === 'BENCHMARK') return { ok: false, reason: 'BENCHMARK' };
  if (q.status === 'STALE') return { ok: false, reason: 'STALE' };
  if (q.status === 'HISTORICAL') return { ok: false, reason: 'HISTORICAL' };
  if (q.status === 'UNAVAILABLE') return { ok: false, reason: 'UNAVAILABLE' };
  if (q.status !== 'CURRENT' && q.status !== 'DELAYED') return { ok: false, reason: 'INVALID' };
  if (q.price === null || !Number.isFinite(q.price) || q.price <= 0) return { ok: false, reason: 'NO_PRICE' };
  const delayed = q.status === 'DELAYED';
  return { ok: true, delayed, price: q.price, delayMinutes: delayed ? (q.delayMinutes ?? 15) : 0 };
}

export interface ValidSpec {
  tick: number;
  tickValueUsd: number;
  /** USD per 1.0 of quoted price per contract (tickValue / tick). Embeds cents->USD conversion. */
  pointValueUsd: number;
}

export type SpecResult = { ok: true; spec: ValidSpec } | { ok: false; reason: 'NO_SPEC' | 'UNVERIFIED' | 'NOT_USD' };

export function validateSpec(spec: PaperSpec | null | undefined): SpecResult {
  if (!spec || spec.minimumTickSize === null || spec.tickValue === null || spec.contractSize === null) {
    return { ok: false, reason: 'NO_SPEC' };
  }
  if (!(spec.minimumTickSize > 0) || !(spec.tickValue > 0)) return { ok: false, reason: 'NO_SPEC' };
  if (spec.verificationStatus !== 'VERIFIED') return { ok: false, reason: 'UNVERIFIED' };
  if (spec.tradingCurrency !== 'USD') return { ok: false, reason: 'NOT_USD' };
  return {
    ok: true,
    spec: { tick: spec.minimumTickSize, tickValueUsd: spec.tickValue, pointValueUsd: spec.tickValue / spec.minimumTickSize },
  };
}

/** Contract notional in USD at a price (e.g. corn 450 c/bu: 450 x 50 = 22,500 USD). */
export function contractValueUsd(spec: ValidSpec, price: number): number {
  return price * spec.pointValueUsd;
}

/** Fill price including adverse slippage: buys fill higher, sells fill lower. `opening` flips for closes. */
export function fillPrice(spec: ValidSpec, side: Side, quotePrice: number, slippageTicks: number, opening: boolean): number {
  const buying = opening ? side === 'LONG' : side === 'SHORT';
  const slip = Math.max(0, slippageTicks) * spec.tick;
  const p = buying ? quotePrice + slip : quotePrice - slip;
  return Math.max(spec.tick, p);
}

/** Initial margin per contract in USD: explicit user value if > 0, else marginPct of contract value. */
export function marginPerContractUsd(spec: ValidSpec, price: number, marginPct: number, explicitUsd?: number | null): number {
  if (explicitUsd !== null && explicitUsd !== undefined && explicitUsd > 0) return explicitUsd;
  return (contractValueUsd(spec, price) * Math.max(0, marginPct)) / 100;
}

/** Gross unrealised/realised P&L in USD for a price move (no fees). */
export function pnlUsd(spec: ValidSpec, side: Side, entry: number, current: number, contracts: number): number {
  const dir = side === 'LONG' ? 1 : -1;
  return (current - entry) * dir * spec.pointValueUsd * contracts;
}

export interface PositionLike {
  id: string;
  instrumentId: string;
  side: Side;
  contracts: number;
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  marginPerContractUsd: number;
  entryFeeVnd: number;
}

export interface ClosedTradeCalc {
  grossPnlUsd: number;
  feesVnd: number;
  /** Net of fees, USD at the closing rate. */
  pnlUsd: number;
  pnlVnd: number;
  /** (exit-entry)*dir / |entry-stop| ; null when no stop-loss was set. Excludes fees. */
  rMultiple: number | null;
}

/** Realised result of closing `pos` at `exitPrice`. Exit fee is charged now, entry fee was paid at open. */
export function computeClose(spec: ValidSpec, pos: PositionLike, exitPrice: number, fx: number, settings: PaperSettings): ClosedTradeCalc {
  const grossUsd = pnlUsd(spec, pos.side, pos.entryPrice, exitPrice, pos.contracts);
  const exitFeeVnd = settings.feePerContractUsd * pos.contracts * fx;
  const feesVnd = pos.entryFeeVnd + exitFeeVnd;
  const pnlVnd = grossUsd * fx - feesVnd;
  const dir = pos.side === 'LONG' ? 1 : -1;
  const risk = pos.stopLoss === null ? 0 : Math.abs(pos.entryPrice - pos.stopLoss);
  const rMultiple = risk > 0 ? round2(((exitPrice - pos.entryPrice) * dir) / risk) : null;
  return { grossPnlUsd: grossUsd, feesVnd, pnlUsd: fx > 0 ? pnlVnd / fx : grossUsd, pnlVnd, rMultiple };
}

export interface AccountSnapshot {
  balanceVnd: number;
  unrealisedVnd: number;
  equityVnd: number;
  usedMarginVnd: number;
  freeMarginVnd: number;
  /** equity / used margin x 100; null when nothing is open. */
  marginLevelPct: number | null;
  status: 'OK' | 'MARGIN_CALL' | 'STOP_OUT';
}

export interface PricedPosition {
  pos: PositionLike;
  spec: ValidSpec;
  /** Latest tradable price, or null when unknown (position valued at entry = 0 P&L). */
  price: number | null;
}

export function unrealisedUsd(pp: PricedPosition): number {
  return pp.price === null ? 0 : pnlUsd(pp.spec, pp.pos.side, pp.pos.entryPrice, pp.price, pp.pos.contracts);
}

export function accountSnapshot(balanceVnd: number, items: PricedPosition[], fx: number, settings: PaperSettings): AccountSnapshot {
  let unreal = 0;
  let used = 0;
  for (const it of items) {
    unreal += unrealisedUsd(it) * fx;
    used += it.pos.marginPerContractUsd * it.pos.contracts * fx;
  }
  const equity = balanceVnd + unreal;
  const level = used > 0 ? (equity / used) * 100 : null;
  let status: AccountSnapshot['status'] = 'OK';
  if (level !== null) {
    if (level <= settings.stopOutPct) status = 'STOP_OUT';
    else if (level <= settings.marginCallPct) status = 'MARGIN_CALL';
  }
  return { balanceVnd, unrealisedVnd: unreal, equityVnd: equity, usedMarginVnd: used, freeMarginVnd: equity - used, marginLevelPct: level, status };
}

export type OrderCheck =
  | { ok: true; marginUsd: number; marginVnd: number; feeVnd: number; riskVnd: number | null; contractValueUsd: number; contractValueVnd: number }
  | { ok: false; reason: 'BAD_QTY' | 'BAD_FX' | 'NO_FREE_MARGIN' | 'BAD_STOP' | 'BAD_TP' };

export interface OrderInput {
  side: Side;
  contracts: number;
  /** Price actually filled (already includes slippage). */
  fill: number;
  stopLoss: number | null;
  takeProfit: number | null;
  explicitMarginUsd?: number | null;
}

/** Validates an order against free margin; also returns money at risk (to the stop) for the confirm dialog. */
export function checkOrder(spec: ValidSpec, input: OrderInput, snap: AccountSnapshot, fx: number, settings: PaperSettings): OrderCheck {
  if (!Number.isInteger(input.contracts) || input.contracts < 1 || input.contracts > 1000) return { ok: false, reason: 'BAD_QTY' };
  if (!(fx > 0) || !Number.isFinite(fx)) return { ok: false, reason: 'BAD_FX' };
  const long = input.side === 'LONG';
  if (input.stopLoss !== null && (!(input.stopLoss > 0) || (long ? input.stopLoss >= input.fill : input.stopLoss <= input.fill))) {
    return { ok: false, reason: 'BAD_STOP' };
  }
  if (input.takeProfit !== null && (!(input.takeProfit > 0) || (long ? input.takeProfit <= input.fill : input.takeProfit >= input.fill))) {
    return { ok: false, reason: 'BAD_TP' };
  }
  const perContract = marginPerContractUsd(spec, input.fill, settings.marginPct, input.explicitMarginUsd);
  const marginUsd = perContract * input.contracts;
  const marginVnd = marginUsd * fx;
  const feeVnd = settings.feePerContractUsd * input.contracts * fx;
  if (marginVnd + feeVnd > snap.freeMarginVnd) return { ok: false, reason: 'NO_FREE_MARGIN' };
  const riskVnd =
    input.stopLoss === null ? null : Math.abs(input.fill - input.stopLoss) * spec.pointValueUsd * input.contracts * fx + feeVnd * 2;
  const cv = contractValueUsd(spec, input.fill) * input.contracts;
  return { ok: true, marginUsd, marginVnd, feeVnd, riskVnd, contractValueUsd: cv, contractValueVnd: cv * fx };
}

/** Stop-loss / take-profit hit test on the latest price (gap-through counts as a hit). */
export function checkStops(pos: PositionLike, price: number): 'STOP_LOSS' | 'TAKE_PROFIT' | null {
  const long = pos.side === 'LONG';
  if (pos.stopLoss !== null && (long ? price <= pos.stopLoss : price >= pos.stopLoss)) return 'STOP_LOSS';
  if (pos.takeProfit !== null && (long ? price >= pos.takeProfit : price <= pos.takeProfit)) return 'TAKE_PROFIT';
  return null;
}

/** Balance change when opening: only the entry fee leaves the balance (margin is "reserved", not spent). */
export function balanceAfterOpen(balanceVnd: number, entryFeeVnd: number): number {
  return balanceVnd - entryFeeVnd;
}

/** Balance after closing: add net P&L back, plus the entry fee that was already deducted at open. */
export function balanceAfterClose(balanceVnd: number, pos: PositionLike, calc: ClosedTradeCalc): number {
  return balanceVnd + calc.pnlVnd + pos.entryFeeVnd;
}

export interface AutoClose {
  positionId: string;
  reason: CloseReason;
  exitPrice: number;
  calc: ClosedTradeCalc;
}

/**
 * Evaluate automatic closes on a quote refresh. Positions whose price is null are skipped.
 * 1) SL/TP hits close first. 2) While margin level <= stopOutPct, force-close the worst loser.
 * `price` in each item must come from a tradable quote (CURRENT/DELAYED) or be null.
 */
export function runAutoClose(
  balanceVnd: number,
  items: PricedPosition[],
  fx: number,
  settings: PaperSettings
): { closes: AutoClose[]; balanceVnd: number } {
  const closes: AutoClose[] = [];
  let balance = balanceVnd;
  let open = [...items];

  const closeOne = (pp: PricedPosition, reason: CloseReason) => {
    const exit = fillPrice(pp.spec, pp.pos.side, pp.price as number, settings.slippageTicks, false);
    const calc = computeClose(pp.spec, pp.pos, exit, fx, settings);
    balance = balanceAfterClose(balance, pp.pos, calc);
    closes.push({ positionId: pp.pos.id, reason, exitPrice: exit, calc });
    open = open.filter((o) => o.pos.id !== pp.pos.id);
  };

  for (const pp of items) {
    if (pp.price === null) continue;
    const hit = checkStops(pp.pos, pp.price);
    if (hit) closeOne(pp, hit);
  }
  for (let guard = 0; guard < 1000 && open.length > 0; guard++) {
    const snap = accountSnapshot(balance, open, fx, settings);
    if (snap.status !== 'STOP_OUT') break;
    const priced = open.filter((o) => o.price !== null);
    if (priced.length === 0) break;
    const worst = priced.reduce((a, b) => (unrealisedUsd(a) <= unrealisedUsd(b) ? a : b));
    closeOne(worst, 'STOP_OUT');
  }
  return { closes, balanceVnd: balance };
}

// --------------------------------------------------------------------------- stats

export interface TradeLike {
  pnlVnd: number;
  rMultiple: number | null;
  closedAtMs: number;
}

export interface PaperStats {
  trades: number;
  wins: number;
  losses: number;
  winRatePct: number | null;
  avgWinVnd: number | null;
  avgLossVnd: number | null;
  profitFactor: number | null;
  totalPnlVnd: number;
  avgR: number | null;
  maxDrawdownVnd: number;
  maxDrawdownPct: number | null;
  /** Equity after each closed trade, oldest first, starting with the initial capital. */
  curve: { t: number; equityVnd: number }[];
}

export function computeStats(trades: TradeLike[], startingCapitalVnd: number): PaperStats {
  const sorted = [...trades].sort((a, b) => a.closedAtMs - b.closedAtMs);
  const wins = sorted.filter((t) => t.pnlVnd > 0);
  const losses = sorted.filter((t) => t.pnlVnd < 0);
  const sum = (xs: TradeLike[]) => xs.reduce((s, t) => s + t.pnlVnd, 0);
  const grossWin = sum(wins);
  const grossLoss = -sum(losses);
  const curve: PaperStats['curve'] = [{ t: sorted[0]?.closedAtMs ?? 0, equityVnd: startingCapitalVnd }];
  let eq = startingCapitalVnd;
  let peak = eq;
  let maxDd = 0;
  let maxDdPct = 0;
  for (const tr of sorted) {
    eq += tr.pnlVnd;
    curve.push({ t: tr.closedAtMs, equityVnd: eq });
    peak = Math.max(peak, eq);
    const dd = peak - eq;
    if (dd > maxDd) maxDd = dd;
    if (peak > 0) maxDdPct = Math.max(maxDdPct, (dd / peak) * 100);
  }
  const rs = sorted.map((t) => t.rMultiple).filter((r): r is number => r !== null);
  return {
    trades: sorted.length,
    wins: wins.length,
    losses: losses.length,
    winRatePct: sorted.length ? (wins.length / sorted.length) * 100 : null,
    avgWinVnd: wins.length ? grossWin / wins.length : null,
    avgLossVnd: losses.length ? -grossLoss / losses.length : null,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    totalPnlVnd: sum(sorted),
    avgR: rs.length ? round2(rs.reduce((s, r) => s + r, 0) / rs.length) : null,
    maxDrawdownVnd: maxDd,
    maxDrawdownPct: sorted.length ? maxDdPct : null,
    curve,
  };
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

// --------------------------------------------------------------------------- P&L summary, per-commodity, per-session

export interface PnlTradeLike extends TradeLike {
  instrumentId: string;
  feesVnd: number;
}

export interface PnlBreakdown {
  realisedVnd: number;
  unrealisedVnd: number;
  /** Entry fees already paid on positions that are still open. */
  openFeesVnd: number;
  /** Fees (entry + exit) already included in realised trades. */
  tradeFeesVnd: number;
  /** equity - starting capital = realised + unrealised - open entry fees. */
  totalVnd: number;
  totalPct: number | null;
}

/** Realised + unrealised view of a session; fees/slippage are already inside each trade's P&L. */
export function pnlBreakdown(startingCapitalVnd: number, snap: AccountSnapshot, openPositions: PositionLike[], trades: PnlTradeLike[]): PnlBreakdown {
  const realisedVnd = trades.reduce((s, t) => s + t.pnlVnd, 0);
  const tradeFeesVnd = trades.reduce((s, t) => s + t.feesVnd, 0);
  const openFeesVnd = openPositions.reduce((s, p) => s + p.entryFeeVnd, 0);
  const totalVnd = snap.equityVnd - startingCapitalVnd;
  return {
    realisedVnd,
    unrealisedVnd: snap.unrealisedVnd,
    openFeesVnd,
    tradeFeesVnd,
    totalVnd,
    totalPct: startingCapitalVnd > 0 ? (totalVnd / startingCapitalVnd) * 100 : null,
  };
}

export interface InstrumentBreakdown {
  instrumentId: string;
  trades: number;
  wins: number;
  winRatePct: number;
  pnlVnd: number;
  feesVnd: number;
  avgR: number | null;
}

/** Per-commodity results of closed trades, best P&L first. */
export function breakdownByInstrument(trades: PnlTradeLike[]): InstrumentBreakdown[] {
  const map = new Map<string, PnlTradeLike[]>();
  for (const t of trades) map.set(t.instrumentId, [...(map.get(t.instrumentId) ?? []), t]);
  const out: InstrumentBreakdown[] = [];
  for (const [instrumentId, ts] of map) {
    const wins = ts.filter((t) => t.pnlVnd > 0).length;
    const rs = ts.map((t) => t.rMultiple).filter((r): r is number => r !== null);
    out.push({
      instrumentId,
      trades: ts.length,
      wins,
      winRatePct: (wins / ts.length) * 100,
      pnlVnd: ts.reduce((s, t) => s + t.pnlVnd, 0),
      feesVnd: ts.reduce((s, t) => s + t.feesVnd, 0),
      avgR: rs.length ? round2(rs.reduce((s, r) => s + r, 0) / rs.length) : null,
    });
  }
  return out.sort((a, b) => b.pnlVnd - a.pnlVnd || a.instrumentId.localeCompare(b.instrumentId));
}

export interface SessionSummary {
  startingCapitalVnd: number;
  finalEquityVnd: number;
  pnlVnd: number;
  pnlPct: number | null;
  trades: number;
  winRatePct: number | null;
  maxDrawdownVnd: number;
  maxDrawdownPct: number | null;
  bestTradeVnd: number | null;
  worstTradeVnd: number | null;
  curve: PaperStats['curve'];
}

/** One row of the session-history table. `finalEquityVnd` = stored final equity (closed) or live equity (active). */
export function summarizeSession(startingCapitalVnd: number, finalEquityVnd: number, trades: PnlTradeLike[]): SessionSummary {
  const st = computeStats(trades, startingCapitalVnd);
  const pnls = trades.map((t) => t.pnlVnd);
  const pnlVnd = finalEquityVnd - startingCapitalVnd;
  return {
    startingCapitalVnd,
    finalEquityVnd,
    pnlVnd,
    pnlPct: startingCapitalVnd > 0 ? (pnlVnd / startingCapitalVnd) * 100 : null,
    trades: st.trades,
    winRatePct: st.winRatePct,
    maxDrawdownVnd: st.maxDrawdownVnd,
    maxDrawdownPct: st.maxDrawdownPct,
    bestTradeVnd: pnls.length ? Math.max(...pnls) : null,
    worstTradeVnd: pnls.length ? Math.min(...pnls) : null,
    curve: st.curve,
  };
}
