import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createSign } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { ContestEngine, ContestError, type ContestQuote } from './engine.ts';
import { ContestStore } from './store.ts';
import { anonymousName, combinedRanking, computeBadges, disciplineScore, maxDrawdownPct, sanitizeDisplayName } from './scoring.ts';
import { ictDayKey, seasonIdOf, seasonRange } from './season.ts';
import { verifyFirebaseIdToken } from './auth.ts';
import { registerContestRoutes } from '../../routes/contest.ts';

const SPEC = { minimumTickSize: 0.25, tickValue: 12.5, contractSize: 5000, tradingCurrency: 'USD', verificationStatus: 'VERIFIED' };
const T0 = Date.parse('2026-11-10T03:00:00Z');

function setup(opts: { quote?: ContestQuote | null; spec?: typeof SPEC | null; fx?: number | null } = {}) {
  const state = {
    quote: opts.quote === undefined ? ({ price: 450, status: 'DELAYED', delayMinutes: 15, source: 'TEST', timestamp: 't' } as ContestQuote | null) : opts.quote,
    spec: opts.spec === undefined ? SPEC : opts.spec,
    fx: opts.fx === undefined ? 25_000 : opts.fx,
    now: T0,
  };
  const store = new ContestStore(':memory:');
  const engine = new ContestEngine({
    store,
    getQuote: async () => state.quote,
    getSpec: () => state.spec,
    getFx: async () => state.fx,
    now: () => state.now,
  });
  return { state, store, engine };
}

const order = (o: Partial<Parameters<ContestEngine['placeOrder']>[1]> = {}) => ({ instrumentId: 'CBOT:ZC', side: 'LONG' as const, contracts: 1, stop: 445, ...o });
const rejects = async (p: Promise<unknown>, code: string) =>
  assert.rejects(p, (e: unknown) => e instanceof ContestError && e.code === code, code);

test('season boundaries use Asia/Ho_Chi_Minh', () => {
  assert.equal(seasonIdOf(Date.parse('2026-10-31T16:59:59Z')), '2026-10');
  assert.equal(seasonIdOf(Date.parse('2026-10-31T17:00:00Z')), '2026-11');
  assert.equal(seasonIdOf(Date.parse('2026-12-31T17:00:00Z')), '2027-01');
  const r = seasonRange('2026-11');
  assert.equal(new Date(r.startMs).toISOString(), '2026-10-31T17:00:00.000Z');
  assert.equal(new Date(r.endMs).toISOString(), '2026-11-30T17:00:00.000Z');
  assert.equal(ictDayKey(Date.parse('2026-11-10T18:00:00Z')), '2026-11-11');
  assert.throws(() => seasonRange('2026-13'));
});

test('join is idempotent, anonymous by default, sanitises display name', () => {
  const { engine } = setup();
  const p = engine.join('u1');
  assert.equal(p.balanceVnd, 500_000_000);
  assert.equal(p.displayName, null);
  assert.match(anonymousName(p.tag), /^Nhà đầu tư #\d{4}$/);
  assert.equal(engine.join('u1', 'Other').displayName, null);
  assert.equal(sanitizeDisplayName('  <b>Minh</b>  '), 'bMinh/b');
  assert.equal(sanitizeDisplayName('x'), null);
});

test('order fills at server quote + slippage, charges fee, creates position; requires join', async () => {
  const { engine, store } = setup();
  await rejects(engine.placeOrder('u1', order()), 'NOT_JOINED');
  engine.join('u1');
  const { order: o, position } = await engine.placeOrder('u1', order({ target: 460 }));
  assert.equal(o.fillPrice, 450.25); // 1 tick adverse slippage on a buy
  assert.equal(position.status, 'OPEN');
  assert.equal(o.feeVnd, 2.5 * 25_000);
  assert.equal(store.getParticipant(engine.currentSeason(), 'u1')!.balanceVnd, 500_000_000 - 62_500);
  assert.ok(o.riskPct !== null && o.riskPct < 2);
});

test('fail closed: stop required, bad stop, quote and spec rejections, fx missing', async () => {
  const a = setup();
  a.engine.join('u');
  await rejects(a.engine.placeOrder('u', order({ stop: null })), 'STOP_REQUIRED');
  await rejects(a.engine.placeOrder('u', order({ stop: undefined })), 'STOP_REQUIRED');
  await rejects(a.engine.placeOrder('u', order({ stop: 460 })), 'BAD_STOP');
  await rejects(a.engine.placeOrder('u', order({ contracts: 0 })), 'BAD_QTY');
  await rejects(a.engine.placeOrder('u', order({ contracts: 500 })), 'BAD_QTY');
  await rejects(a.engine.placeOrder('u', order({ contracts: 20 })), 'NO_FREE_MARGIN');

  for (const status of ['UNAVAILABLE', 'INVALID', 'STALE', 'HISTORICAL']) {
    const b = setup({ quote: { price: 450, status } });
    b.engine.join('u');
    await rejects(b.engine.placeOrder('u', order()), `QUOTE_${status}`);
  }
  const nq = setup({ quote: null });
  nq.engine.join('u');
  await rejects(nq.engine.placeOrder('u', order()), 'QUOTE_NO_QUOTE');
  const np = setup({ quote: { price: null, status: 'CURRENT' } });
  np.engine.join('u');
  await rejects(np.engine.placeOrder('u', order()), 'QUOTE_NO_PRICE');

  const unverified = setup({ spec: { ...SPEC, verificationStatus: 'UNVERIFIED' } });
  unverified.engine.join('u');
  await rejects(unverified.engine.placeOrder('u', order()), 'SPEC_UNVERIFIED');
  const notUsd = setup({ spec: { ...SPEC, tradingCurrency: 'VND' } });
  notUsd.engine.join('u');
  await rejects(notUsd.engine.placeOrder('u', order()), 'SPEC_NOT_USD');
  const nospec = setup({ spec: null });
  nospec.engine.join('u');
  await rejects(nospec.engine.placeOrder('u', order()), 'SPEC_NO_SPEC');
  const nofx = setup({ fx: null });
  nofx.engine.join('u');
  await rejects(nofx.engine.placeOrder('u', order()), 'FX_UNAVAILABLE');
});

test('stop check closes at latest quote, target closes, no quote means no fill', async () => {
  const { engine, store, state } = setup();
  engine.join('u');
  const { position } = await engine.placeOrder('u', order({ target: 470 }));
  state.quote = { price: 447, status: 'DELAYED' };
  assert.deepEqual(await engine.runStopCheck(), { checked: 1, closed: 0 });
  state.quote = { price: 0, status: 'UNAVAILABLE' };
  assert.equal((await engine.runStopCheck()).closed, 0);
  state.quote = { price: 444, status: 'DELAYED' };
  assert.deepEqual(await engine.runStopCheck(), { checked: 1, closed: 1 });
  const closed = store.getPosition(position.id)!;
  assert.equal(closed.status, 'CLOSED');
  assert.equal(closed.closeReason, 'STOP_LOSS');
  assert.equal(closed.exitPrice, 443.75);
  assert.ok((closed.pnlVnd ?? 0) < 0);
  await rejects(engine.closePosition('u', position.id), 'ALREADY_CLOSED');

  state.quote = { price: 450, status: 'DELAYED' };
  const t = await engine.placeOrder('u', order({ target: 470 }));
  state.quote = { price: 471, status: 'DELAYED' };
  await engine.runStopCheck();
  assert.equal(store.getPosition(t.position.id)!.closeReason, 'TAKE_PROFIT');
});

test('manual close only by owner; no order edit API on engine', async () => {
  const { engine } = setup();
  engine.join('u');
  engine.join('v');
  const { position } = await engine.placeOrder('u', order());
  await rejects(engine.closePosition('v', position.id), 'NOT_FOUND');
  const closed = await engine.closePosition('u', position.id);
  assert.equal(closed.closeReason, 'MANUAL');
  assert.equal((engine as unknown as Record<string, unknown>).editOrder, undefined);
});

test('positions open in the previous season are still checked by the job', async () => {
  const { engine, store, state } = setup();
  engine.join('u');
  const { position } = await engine.placeOrder('u', order());
  state.now = Date.parse('2026-12-02T03:00:00Z');
  state.quote = { price: 440, status: 'DELAYED' };
  await engine.runStopCheck();
  assert.equal(store.getPosition(position.id)!.status, 'CLOSED');
  assert.equal(engine.currentSeason(), '2026-12');
});

test('discipline score: stops, risk, drawdown, overtrading, checklist', () => {
  const day = T0;
  const good = Array.from({ length: 5 }, (_, i) => ({ hasStop: true, riskPct: 1, createdAtMs: day + i * 86_400_000, checklistDone: null as boolean | null }));
  assert.equal(disciplineScore([], 0), null);
  assert.equal(disciplineScore(good, 3)!.score, 100);
  const risky = good.map((o) => ({ ...o, riskPct: 5 }));
  assert.equal(disciplineScore(risky, 3)!.score, 70);
  assert.equal(disciplineScore(good, 20)!.score, 75);
  const nostop = good.map((o) => ({ ...o, hasStop: false }));
  assert.equal(disciplineScore(nostop, 3)!.score, 75);
  const burst = Array.from({ length: 10 }, () => ({ hasStop: true, riskPct: 1, createdAtMs: day, checklistDone: null as boolean | null }));
  assert.equal(disciplineScore(burst, 0)!.score, 96); // 4 excess orders x 5 = 20 pts x 20% weight
  const withPlan = good.map((o) => ({ ...o, riskPct: 5, checklistDone: true as boolean | null }));
  assert.equal(disciplineScore(withPlan, 3)!.score, 80);
  assert.equal(Math.round(maxDrawdownPct([100, 120, 90, 130])), 25);
});

test('combined ranking: 50% return percentile + 50% discipline, ties share rank, badges', () => {
  const r = combinedRanking([
    { id: 'a', returnPct: 10, discipline: 40 },
    { id: 'b', returnPct: 5, discipline: 100 },
    { id: 'c', returnPct: -3, discipline: 90 },
  ]);
  assert.deepEqual(r.map((x) => [x.id, x.combined]), [['b', 75], ['a', 70], ['c', 45]]);
  assert.equal(combinedRanking([{ id: 'x', returnPct: 1, discipline: 60 }])[0].combined, 80);
  const tie = combinedRanking([{ id: 'a', returnPct: 1, discipline: 50 }, { id: 'b', returnPct: 1, discipline: 50 }]);
  assert.equal(tie[0].returnRankPct, 50);
  assert.deepEqual(computeBadges({ orders: 6, closedTrades: 6, discipline: 95, maxDdPct: 4, returnPct: 3 }), ['IRON_DISCIPLINE', 'NO_BLOWUP', 'STEADY']);
  assert.deepEqual(computeBadges({ orders: 2, closedTrades: 0, discipline: 95, maxDdPct: 30, returnPct: -25 }), []);
});

test('leaderboard is anonymised and ranks participants with orders only', async () => {
  const { engine } = setup();
  engine.join('u1');
  engine.join('u2', 'Lan');
  engine.join('idle');
  await engine.placeOrder('u1', order());
  await engine.placeOrder('u2', order({ stop: 449 }));
  const lb = engine.leaderboard(undefined, 'u2');
  assert.equal(lb.length, 2);
  assert.ok(lb.every((r) => !('uid' in r)));
  assert.ok(lb.some((r) => r.name === 'Lan' && r.isMe));
  assert.ok(lb.some((r) => /^Nhà đầu tư #\d{4}$/.test(r.name)));
  assert.deepEqual(lb.map((r) => r.rank), [1, 2]);
});

test('verifyFirebaseIdToken: valid, wrong audience, expired, bad signature', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const nowS = Math.floor(T0 / 1000);
  const mk = (claims: Record<string, unknown>, key = privateKey) => {
    const h = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'k1' })).toString('base64url');
    const p = Buffer.from(JSON.stringify({ aud: 'proj', iss: 'https://securetoken.google.com/proj', sub: 'uid1', iat: nowS - 10, exp: nowS + 3600, ...claims })).toString('base64url');
    const sig = createSign('RSA-SHA256').update(`${h}.${p}`).sign(key).toString('base64url');
    return `${h}.${p}.${sig}`;
  };
  const opts = { projectId: 'proj', getKeys: async () => ({ k1: pem }), now: () => T0 };
  assert.deepEqual(await verifyFirebaseIdToken(mk({}), opts), { uid: 'uid1' });
  assert.equal(await verifyFirebaseIdToken(mk({ aud: 'other' }), opts), null);
  assert.equal(await verifyFirebaseIdToken(mk({ exp: nowS - 1 }), opts), null);
  assert.equal(await verifyFirebaseIdToken(mk({}, generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey), opts), null);
  assert.equal(await verifyFirebaseIdToken('garbage', opts), null);
});

test('routes: auth required for join/orders/me, public leaderboard, full flow with mock verifier', async () => {
  const store = new ContestStore(':memory:');
  const app = express();
  app.use(express.json());
  registerContestRoutes(app, {
    deps: { getQuote: async () => ({ price: 450, status: 'DELAYED' }), getSpec: () => SPEC, getFx: async () => 25_000, now: () => T0 },
    store,
    verifier: async (t) => (t === 'good-token' ? { uid: 'route-user' } : null),
  });
  const srv = app.listen(0);
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  try {
    const post = (path: string, body: unknown, token?: string) =>
      fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    assert.equal((await post('/api/contest/join', {})).status, 401);
    assert.equal((await post('/api/contest/orders', order())).status, 401);
    assert.equal((await post('/api/contest/join', {}, 'bad')).status, 401);
    assert.equal((await fetch(`${base}/api/contest/me`)).status, 401);
    assert.equal((await fetch(`${base}/api/contest/leaderboard`)).status, 200);
    assert.equal((await fetch(`${base}/api/contest/leaderboard?season=nope`)).status, 400);
    assert.equal((await post('/api/contest/orders', order(), 'good-token')).status, 403); // not joined
    assert.equal((await post('/api/contest/join', { displayName: 'Hoa' }, 'good-token')).status, 200);
    assert.equal((await post('/api/contest/orders', { ...order(), stop: undefined }, 'good-token')).status, 422);
    assert.equal((await post('/api/contest/orders', { ...order(), extra: 1 }, 'good-token')).status, 400);
    const ok = await post('/api/contest/orders', order(), 'good-token');
    assert.equal(ok.status, 200);
    const body = (await ok.json()) as { order: Record<string, unknown>; position: { id: string } };
    assert.equal('uid' in body.order, false);
    const me = (await (await fetch(`${base}/api/contest/me`, { headers: { authorization: 'Bearer good-token' } })).json()) as {
      joined: boolean;
      positions: unknown[];
      leaderboard: { isMe: boolean }[];
    };
    assert.equal(me.joined, true);
    assert.equal(me.positions.length, 1);
    assert.equal(me.leaderboard[0].isMe, true);
    assert.equal((await post(`/api/contest/positions/${body.position.id}/close`, {}, 'good-token')).status, 200);
  } finally {
    srv.close();
    srv.closeAllConnections?.();
  }
});
