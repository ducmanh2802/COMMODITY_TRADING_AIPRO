import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS,
  accountSnapshot,
  balanceAfterClose,
  balanceAfterOpen,
  checkOrder,
  checkQuoteTradable,
  checkStops,
  computeClose,
  computeStats,
  contractValueUsd,
  fillPrice,
  marginPerContractUsd,
  pnlUsd,
  runAutoClose,
  validateSpec,
  type PaperSettings,
  type PositionLike,
  type PricedPosition,
  type ValidSpec,
} from './paperMath';

// Corn-like: tick 0.25 cents, tick value 12.5 USD => 50 USD per 1 cent; 450 c = 22,500 USD.
const spec: ValidSpec = { tick: 0.25, tickValueUsd: 12.5, pointValueUsd: 50 };
const S: PaperSettings = { marginPct: 10, feePerContractUsd: 2, slippageTicks: 0, marginCallPct: 100, stopOutPct: 50 };
const FX = 25_000;

function pos(over: Partial<PositionLike> = {}): PositionLike {
  return { id: 'p1', instrumentId: 'ZC', side: 'LONG', contracts: 1, entryPrice: 450, stopLoss: null, takeProfit: null, marginPerContractUsd: 2250, entryFeeVnd: 2 * FX, ...over };
}

test('checkQuoteTradable: only CURRENT/DELAYED futures with price', () => {
  assert.deepEqual(checkQuoteTradable({ price: 5, status: 'CURRENT' }), { ok: true, delayed: false, price: 5, delayMinutes: 0 });
  assert.deepEqual(checkQuoteTradable({ price: 5, status: 'DELAYED' }), { ok: true, delayed: true, price: 5, delayMinutes: 15 });
  assert.equal((checkQuoteTradable({ price: 5, status: 'DELAYED', delayMinutes: 20 }) as { delayMinutes: number }).delayMinutes, 20);
  for (const status of ['STALE', 'HISTORICAL', 'UNAVAILABLE', 'INVALID']) {
    const r = checkQuoteTradable({ price: 5, status });
    assert.equal(r.ok, false);
    assert.equal((r as { reason: string }).reason, status);
  }
  assert.deepEqual(checkQuoteTradable({ price: 5, status: 'CURRENT', kind: 'BENCHMARK' }), { ok: false, reason: 'BENCHMARK' });
  assert.deepEqual(checkQuoteTradable({ price: null, status: 'CURRENT' }), { ok: false, reason: 'NO_PRICE' });
  assert.deepEqual(checkQuoteTradable({ price: 0, status: 'CURRENT' }), { ok: false, reason: 'NO_PRICE' });
  assert.deepEqual(checkQuoteTradable(undefined), { ok: false, reason: 'NO_QUOTE' });
});

test('validateSpec: fail-closed', () => {
  const base = { minimumTickSize: 0.25, tickValue: 12.5, contractSize: 5000, tradingCurrency: 'USD', verificationStatus: 'VERIFIED' };
  const ok = validateSpec(base);
  assert.equal(ok.ok, true);
  assert.equal((ok as { spec: ValidSpec }).spec.pointValueUsd, 50);
  assert.deepEqual(validateSpec(null), { ok: false, reason: 'NO_SPEC' });
  assert.deepEqual(validateSpec({ ...base, tickValue: null }), { ok: false, reason: 'NO_SPEC' });
  assert.deepEqual(validateSpec({ ...base, verificationStatus: 'UNVERIFIED' }), { ok: false, reason: 'UNVERIFIED' });
  assert.deepEqual(validateSpec({ ...base, tradingCurrency: 'EUR' }), { ok: false, reason: 'NOT_USD' });
});

test('contract value, margin, fill price', () => {
  assert.equal(contractValueUsd(spec, 450), 22_500);
  assert.equal(marginPerContractUsd(spec, 450, 10), 2250);
  assert.equal(marginPerContractUsd(spec, 450, 10, 1000), 1000);
  assert.equal(marginPerContractUsd(spec, 450, 10, 0), 2250);
  assert.equal(fillPrice(spec, 'LONG', 450, 2, true), 450.5);
  assert.equal(fillPrice(spec, 'SHORT', 450, 2, true), 449.5);
  assert.equal(fillPrice(spec, 'LONG', 450, 2, false), 449.5);
  assert.equal(fillPrice(spec, 'SHORT', 450, 2, false), 450.5);
});

test('pnlUsd long/short', () => {
  assert.equal(pnlUsd(spec, 'LONG', 450, 452, 2), 200);
  assert.equal(pnlUsd(spec, 'SHORT', 450, 452, 2), -200);
  assert.equal(pnlUsd(spec, 'SHORT', 450, 448, 1), 100);
});

test('computeClose: fees, VND, R multiple', () => {
  const p = pos({ stopLoss: 445 });
  const c = computeClose(spec, p, 455, FX, S);
  assert.equal(c.grossPnlUsd, 250);
  assert.equal(c.feesVnd, 4 * FX);
  assert.equal(c.pnlVnd, 250 * FX - 4 * FX);
  assert.equal(c.pnlUsd, 246);
  assert.equal(c.rMultiple, 1);
  assert.equal(computeClose(spec, pos(), 455, FX, S).rMultiple, null);
  assert.equal(computeClose(spec, pos({ side: 'SHORT', stopLoss: 455 }), 440, FX, S).rMultiple, 2);
});

test('balance accounting round trip equals net pnl', () => {
  const p = pos();
  const b0 = 200_000_000;
  const b1 = balanceAfterOpen(b0, p.entryFeeVnd);
  const c = computeClose(spec, p, 451, FX, S);
  const b2 = balanceAfterClose(b1, p, c);
  assert.equal(b2 - b0, c.pnlVnd);
});

test('accountSnapshot: margin used, free margin, levels', () => {
  const items: PricedPosition[] = [{ pos: pos(), spec, price: 450 }];
  const s = accountSnapshot(10_000_000, items, FX, S);
  assert.equal(s.usedMarginVnd, 2250 * FX);
  assert.equal(s.equityVnd, 10_000_000);
  assert.equal(s.freeMarginVnd, 10_000_000 - 2250 * FX);
  assert.ok(Math.abs((s.marginLevelPct ?? 0) - (10_000_000 / (2250 * FX)) * 100) < 1e-9);
  assert.equal(accountSnapshot(5, [], FX, S).marginLevelPct, null);
  assert.equal(accountSnapshot(5, [], FX, S).status, 'OK');
});

test('accountSnapshot: margin call and stop out thresholds', () => {
  const used = 2250 * FX; // 56.25m
  const mk = (balance: number, price: number) => accountSnapshot(balance, [{ pos: pos(), spec, price }], FX, S);
  assert.equal(mk(used * 1.5, 450).status, 'OK');
  assert.equal(mk(used * 1.0, 450).status, 'MARGIN_CALL');
  assert.equal(mk(used * 0.5, 450).status, 'STOP_OUT');
  // Loss of 1 cent = 50 USD = 1.25m VND
  assert.equal(mk(used * 1.0 + 1.25e6, 449).status, 'MARGIN_CALL');
});

test('checkOrder: free margin, stop validity, risk', () => {
  const snap = accountSnapshot(200_000_000, [], FX, S);
  const ok = checkOrder(spec, { side: 'LONG', contracts: 2, fill: 450, stopLoss: 445, takeProfit: 460 }, snap, FX, S);
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.marginUsd, 4500);
    assert.equal(ok.feeVnd, 2 * 2 * FX);
    assert.equal(ok.riskVnd, 5 * 50 * 2 * FX + 2 * ok.feeVnd);
    assert.equal(ok.contractValueUsd, 45_000);
    assert.equal(ok.contractValueVnd, 45_000 * FX);
  }
  const noStop = checkOrder(spec, { side: 'LONG', contracts: 1, fill: 450, stopLoss: null, takeProfit: null }, snap, FX, S);
  assert.equal(noStop.ok && noStop.riskVnd, null);
  const reason = (o: Parameters<typeof checkOrder>[1]) => (checkOrder(spec, o, snap, FX, S) as { reason: string }).reason;
  assert.equal(reason({ side: 'LONG', contracts: 0, fill: 450, stopLoss: null, takeProfit: null }), 'BAD_QTY');
  assert.equal(reason({ side: 'LONG', contracts: 1.5, fill: 450, stopLoss: null, takeProfit: null }), 'BAD_QTY');
  assert.equal(reason({ side: 'LONG', contracts: 1, fill: 450, stopLoss: 455, takeProfit: null }), 'BAD_STOP');
  assert.equal(reason({ side: 'SHORT', contracts: 1, fill: 450, stopLoss: 445, takeProfit: null }), 'BAD_STOP');
  assert.equal(reason({ side: 'LONG', contracts: 1, fill: 450, stopLoss: null, takeProfit: 440 }), 'BAD_TP');
  assert.equal(reason({ side: 'SHORT', contracts: 1, fill: 450, stopLoss: null, takeProfit: 460 }), 'BAD_TP');
  assert.equal(reason({ side: 'LONG', contracts: 100, fill: 450, stopLoss: null, takeProfit: null }), 'NO_FREE_MARGIN');
  assert.equal((checkOrder(spec, { side: 'LONG', contracts: 1, fill: 450, stopLoss: null, takeProfit: null }, snap, 0, S) as { reason: string }).reason, 'BAD_FX');
});

test('checkStops long and short', () => {
  const l = pos({ stopLoss: 445, takeProfit: 460 });
  assert.equal(checkStops(l, 450), null);
  assert.equal(checkStops(l, 445), 'STOP_LOSS');
  assert.equal(checkStops(l, 440), 'STOP_LOSS');
  assert.equal(checkStops(l, 460), 'TAKE_PROFIT');
  const s = pos({ side: 'SHORT', stopLoss: 455, takeProfit: 440 });
  assert.equal(checkStops(s, 455), 'STOP_LOSS');
  assert.equal(checkStops(s, 440), 'TAKE_PROFIT');
  assert.equal(checkStops(s, 450), null);
});

test('runAutoClose: stop-loss, take-profit and slippage', () => {
  const slip: PaperSettings = { ...S, slippageTicks: 2 };
  const items: PricedPosition[] = [
    { pos: pos({ id: 'a', stopLoss: 445 }), spec, price: 444 },
    { pos: pos({ id: 'b', takeProfit: 455 }), spec, price: 456 },
    { pos: pos({ id: 'c', stopLoss: 400 }), spec, price: 450 },
    { pos: pos({ id: 'd', stopLoss: 400 }), spec, price: null },
  ];
  const r = runAutoClose(100_000_000, items, FX, slip);
  assert.deepEqual(r.closes.map((c) => [c.positionId, c.reason]), [['a', 'STOP_LOSS'], ['b', 'TAKE_PROFIT']]);
  assert.equal(r.closes[0].exitPrice, 443.5); // long closes as a sell: slips lower
  assert.equal(r.balanceVnd, 100_000_000 + r.closes[0].calc.pnlVnd + r.closes[1].calc.pnlVnd + 2 * 2 * FX);
});

test('runAutoClose: forced close of worst loser until margin level recovers', () => {
  const big = (id: string, price: number) => ({ pos: pos({ id, marginPerContractUsd: 2250 }), spec, price });
  // Two longs, balance only slightly above margin; one deep in loss, one flat.
  const used2 = 2 * 2250 * FX;
  const balance = used2 * 0.55;
  const items = [big('flat', 450), big('loser', 450)];
  // Make 'loser' lose 5 cents => -250 USD each.
  items[1].price = 445;
  const r = runAutoClose(balance, items, FX, S);
  assert.ok(r.closes.length >= 1);
  assert.equal(r.closes[0].positionId, 'loser');
  assert.equal(r.closes[0].reason, 'STOP_OUT');
  assert.equal(r.closes.length, 1);
});

test('runAutoClose: healthy account closes nothing; stop-out ignores unpriced positions', () => {
  const r = runAutoClose(200_000_000, [{ pos: pos(), spec, price: 450 }], FX, S);
  assert.equal(r.closes.length, 0);
  assert.equal(r.balanceVnd, 200_000_000);
  const r2 = runAutoClose(1, [{ pos: pos(), spec, price: null }], FX, S);
  assert.equal(r2.closes.length, 0);
});

test('computeStats: win rate, averages, drawdown, curve', () => {
  const trades = [
    { pnlVnd: 10, rMultiple: 1, closedAtMs: 1 },
    { pnlVnd: -4, rMultiple: -1, closedAtMs: 2 },
    { pnlVnd: -8, rMultiple: null, closedAtMs: 3 },
    { pnlVnd: 20, rMultiple: 2, closedAtMs: 4 },
  ];
  const s = computeStats(trades, 100);
  assert.equal(s.trades, 4);
  assert.equal(s.winRatePct, 50);
  assert.equal(s.avgWinVnd, 15);
  assert.equal(s.avgLossVnd, -6);
  assert.equal(s.profitFactor, 30 / 12);
  assert.equal(s.totalPnlVnd, 18);
  assert.equal(s.avgR, 0.67);
  assert.deepEqual(s.curve.map((p) => p.equityVnd), [100, 110, 106, 98, 118]);
  assert.equal(s.maxDrawdownVnd, 12);
  assert.ok(Math.abs((s.maxDrawdownPct ?? 0) - (12 / 110) * 100) < 1e-9);
});

test('computeStats: empty and all-wins', () => {
  const e = computeStats([], 100);
  assert.equal(e.trades, 0);
  assert.equal(e.winRatePct, null);
  assert.equal(e.maxDrawdownPct, null);
  assert.equal(e.curve.length, 1);
  const w = computeStats([{ pnlVnd: 5, rMultiple: null, closedAtMs: 1 }], 100);
  assert.equal(w.profitFactor, null);
  assert.equal(w.avgLossVnd, null);
  assert.equal(w.maxDrawdownVnd, 0);
});

test('defaults are sane', () => {
  assert.ok(DEFAULT_SETTINGS.stopOutPct < DEFAULT_SETTINGS.marginCallPct);
});

import { breakdownByInstrument, pnlBreakdown, summarizeSession } from './paperMath';

test('pnlBreakdown: realised + unrealised - open fees = total', () => {
  const p = pos();
  const snap = accountSnapshot(100_000_000 - p.entryFeeVnd + 5_000_000, [{ pos: p, spec, price: 451 }], FX, S);
  const trades = [{ instrumentId: 'ZC', pnlVnd: 5_000_000, rMultiple: 1, closedAtMs: 1, feesVnd: 200_000 }];
  const b = pnlBreakdown(100_000_000, snap, [p], trades);
  assert.equal(b.realisedVnd, 5_000_000);
  assert.equal(b.unrealisedVnd, 50 * FX);
  assert.equal(b.openFeesVnd, p.entryFeeVnd);
  assert.equal(b.tradeFeesVnd, 200_000);
  assert.equal(b.totalVnd, b.realisedVnd + b.unrealisedVnd - b.openFeesVnd);
  assert.ok(Math.abs((b.totalPct ?? 0) - (b.totalVnd / 100_000_000) * 100) < 1e-9);
});

test('breakdownByInstrument groups and sorts by P&L', () => {
  const t = (instrumentId: string, pnlVnd: number, rMultiple: number | null) => ({ instrumentId, pnlVnd, rMultiple, closedAtMs: 1, feesVnd: 10 });
  const r = breakdownByInstrument([t('ZC', 10, 1), t('ZS', 50, 2), t('ZC', -4, -1), t('ZC', 6, null)]);
  assert.deepEqual(r.map((x) => x.instrumentId), ['ZS', 'ZC']);
  assert.equal(r[1].trades, 3);
  assert.equal(r[1].wins, 2);
  assert.equal(r[1].pnlVnd, 12);
  assert.equal(r[1].feesVnd, 30);
  assert.equal(r[1].avgR, 0);
  assert.equal(r[0].winRatePct, 100);
  assert.deepEqual(breakdownByInstrument([]), []);
});

test('summarizeSession: pnl %, best/worst, drawdown', () => {
  const tr = [
    { instrumentId: 'ZC', pnlVnd: 10, rMultiple: 1, closedAtMs: 1, feesVnd: 0 },
    { instrumentId: 'ZC', pnlVnd: -30, rMultiple: -1, closedAtMs: 2, feesVnd: 0 },
  ];
  const s = summarizeSession(100, 80, tr);
  assert.equal(s.pnlVnd, -20);
  assert.equal(s.pnlPct, -20);
  assert.equal(s.bestTradeVnd, 10);
  assert.equal(s.worstTradeVnd, -30);
  assert.equal(s.maxDrawdownVnd, 30);
  assert.equal(s.trades, 2);
  assert.equal(s.winRatePct, 50);
  const e = summarizeSession(100, 100, []);
  assert.equal(e.bestTradeVnd, null);
  assert.equal(e.winRatePct, null);
});
