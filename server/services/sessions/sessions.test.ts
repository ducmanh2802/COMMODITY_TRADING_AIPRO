import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { isSessionInProgress, retentionCutoffMs, sessionOf } from './sessionOf.ts';
import { summarizeSessions, type SessionBar } from './sessionSummary.ts';
import { pruneIntraday, syncYahooIntraday } from '../yahooIntradayHistory.ts';
import { InMemoryCandleRepository, type CandleRow } from '../../storage/candleRepository.ts';
import { createProviderCandlePersister } from '../../providers/syncPersistence.ts';
import { parseYahooIntradayCandles, YAHOO_SYMBOL_MAP } from '../../providers/yahooAdapter.ts';
import { YAHOO_HISTORY_CONTRACT_CODE } from '../yahooHistory.ts';
import { INITIAL_INSTRUMENTS } from '../../data/instruments.ts';
import { registerSessionRoutes } from '../../routes/sessionRoutes.ts';

const CBOT = { exchange: 'CBOT' };
const COMEX = { exchange: 'COMEX' };
const ICE = { exchange: 'ICE' };
const zc = INITIAL_INSTRUMENTS.find((i) => i.exchangeSymbol === 'ZC')!;
const DAY = 86_400_000;

test('sessionOf: CBOT evening bar belongs to the next trading day, daytime to its own day', () => {
  // Tue 2026-01-13 19:05 CST (=01:05Z Wed) -> Wednesday session
  assert.equal(sessionOf(Date.parse('2026-01-14T01:05:00Z'), CBOT), '2026-01-14');
  // Wed 2026-01-14 09:30 CST (=15:30Z) -> Wednesday
  assert.equal(sessionOf(Date.parse('2026-01-14T15:30:00Z'), CBOT), '2026-01-14');
  // 18:45 CST is still the same (closed) day; 19:00 CST starts the next
  assert.equal(sessionOf(Date.parse('2026-01-14T00:45:00Z'), CBOT), '2026-01-13');
  assert.equal(sessionOf(Date.parse('2026-01-14T01:00:00Z'), CBOT), '2026-01-14');
});

test('sessionOf: Sunday evening open maps to Monday; Friday evening/Saturday map to Monday', () => {
  // Sun 2026-01-11 19:00 CST = Mon 01:00Z
  assert.equal(sessionOf(Date.parse('2026-01-12T01:00:00Z'), CBOT), '2026-01-12');
  // Fri 2026-01-16 19:30 CST = Sat 01:30Z: no real session, but never maps onto a weekend date
  assert.equal(sessionOf(Date.parse('2026-01-17T01:30:00Z'), CBOT), '2026-01-19');
});

test('sessionOf: DST start (2026-03-08) and end (2026-11-01) use the zone, not a fixed offset', () => {
  // After US DST starts, 19:30 CDT = 00:30Z; a fixed UTC-6 would read 18:30 and miss the rollover.
  assert.equal(sessionOf(Date.parse('2026-03-09T00:30:00Z'), CBOT), '2026-03-09');
  // Before DST (still CST) the same instant of day 00:30Z is 18:30 CST -> not rolled
  assert.equal(sessionOf(Date.parse('2026-03-07T00:30:00Z'), CBOT), '2026-03-06');
  // After DST ends, 19:30 CST = 01:30Z (Sun->Mon session)
  assert.equal(sessionOf(Date.parse('2026-11-02T01:30:00Z'), CBOT), '2026-11-02');
  // 00:30Z on the first Monday after the change is 18:30 CST: not yet rolled (a CDT assumption would roll it)
  assert.equal(sessionOf(Date.parse('2026-11-03T00:30:00Z'), CBOT), '2026-11-02');
});

test('sessionOf: COMEX opens 18:00 New York; ICE softs have no prior-evening start; unknown exchange -> null', () => {
  assert.equal(sessionOf(Date.parse('2026-01-14T23:05:00Z'), COMEX), '2026-01-15'); // 18:05 EST Wed
  assert.equal(sessionOf(Date.parse('2026-01-14T22:55:00Z'), COMEX), '2026-01-14'); // 17:55 EST
  assert.equal(sessionOf(Date.parse('2026-01-14T23:05:00Z'), ICE), '2026-01-14'); // ICE: same day
  assert.equal(sessionOf(Date.parse('2026-01-14T10:00:00Z'), { exchange: 'SGX' }), null);
});

test('isSessionInProgress: open between rollover and close, closed in the gap', () => {
  const d = '2026-01-14';
  assert.equal(isSessionInProgress(d, Date.parse('2026-01-14T15:00:00Z'), CBOT), true); // 09:00 CST
  assert.equal(isSessionInProgress(d, Date.parse('2026-01-14T20:30:00Z'), CBOT), false); // 14:30 CST, closed
  assert.equal(isSessionInProgress(d, Date.parse('2026-01-14T01:30:00Z'), CBOT), true); // prior evening, overnight
});

function bars15(inst: { exchange: string }, fromIso: string, days: number): CandleRow[] {
  // one bar every 4h per calendar day across `days`, enough to give every weekday session a few bars
  const rows: CandleRow[] = [];
  const start = Date.parse(fromIso);
  for (let d = 0; d < days; d++) {
    for (const hourUtc of [3, 9, 15, 19]) {
      const ts = start + d * DAY + hourUtc * 3_600_000;
      const dow = new Date(ts).getUTCDay();
      if (dow === 0 || dow === 6) continue;
      const p = 400 + (d % 7);
      rows.push({ timestampMs: ts, open: p, high: p + 2, low: p - 2, close: p + 1, volume: 10, openInterest: null });
    }
  }
  void inst;
  return rows;
}

test('retentionCutoffMs: never prunes below 20 sessions even when they are older than the window', () => {
  const now = Date.parse('2026-06-30T12:00:00Z');
  // 25 weekday sessions ending 2026-03-31 -- ALL older than a 30-day window
  const rows = bars15(CBOT, '2026-02-23T00:00:00Z', 36);
  const ts = rows.map((r) => r.timestampMs);
  const cutoff = retentionCutoffMs({ barTimestampsMs: ts, instrument: CBOT, nowMs: now, keepDays: 30 })!;
  const kept = ts.filter((t) => t >= cutoff);
  const keptSessions = new Set(kept.map((t) => sessionOf(t, CBOT)));
  assert.ok(keptSessions.size >= 20, `kept ${keptSessions.size} sessions`);
  assert.ok(keptSessions.size < new Set(ts.map((t) => sessionOf(t, CBOT))).size, 'older sessions were still trimmed');
});

test('retentionCutoffMs: calendar window wins when more than 20 recent sessions fit inside it', () => {
  const now = Date.parse('2026-04-10T00:00:00Z');
  const ts = bars15(CBOT, '2026-01-01T00:00:00Z', 100).map((r) => r.timestampMs).filter((t) => t <= now);
  const cutoff = retentionCutoffMs({ barTimestampsMs: ts, instrument: CBOT, nowMs: now, keepDays: 30 })!;
  assert.equal(cutoff, now - 30 * DAY);
  assert.equal(retentionCutoffMs({ barTimestampsMs: ts.slice(0, 20), instrument: CBOT, nowMs: now, keepDays: 30 }), null);
  assert.equal(retentionCutoffMs({ barTimestampsMs: ts, instrument: { exchange: 'SGX' }, nowMs: now, keepDays: 30 }), null);
});

test('pruneIntraday deletes old bars but leaves >= 20 sessions in the repository', async () => {
  const repo = new InMemoryCandleRepository();
  const persist = createProviderCandlePersister(repo);
  const now = Date.parse('2026-06-30T12:00:00Z');
  const candles = bars15(CBOT, '2026-02-23T00:00:00Z', 36).map((r) => ({
    symbol: 'ZC', exchange: 'CBOT' as const, timeframe: 'M15' as const,
    timestamp: new Date(r.timestampMs).toISOString(), retrievedAt: '', open: r.open, high: r.high, low: r.low,
    close: r.close, volume: r.volume, openInterest: null, isComplete: true, source: 'x', status: 'HISTORICAL' as const,
  }));
  await persist({ providerId: 'YAHOO_UNOFFICIAL', providerName: 'Yahoo', instrument: zc, timeframe: 'M15', candles, verifiedPriceUnit: zc.specification.quotationUnit });
  const removed = await pruneIntraday(repo, zc, 'M15', now);
  assert.ok(removed > 0);
  const { rows } = await repo.queryCandles({ instrumentId: zc.id, contractCode: YAHOO_HISTORY_CONTRACT_CODE, timeframe: 'M15' });
  assert.ok(new Set(rows.map((r) => sessionOf(r.timestampMs, CBOT))).size >= 20);
  assert.equal((await repo.listDatasets({ instrumentId: zc.id })).length, 1, 'dataset with remaining bars is kept');
});

const mk = (iso: string, o: number, h: number, l: number, c: number, v: number | null): SessionBar => ({
  timestampMs: Date.parse(iso), open: o, high: h, low: l, close: c, volume: v,
});

test('summarizeSessions: OHLC aggregation, change, range, overnight bars, daily fallback and gaps', () => {
  const nowMs = Date.parse('2026-02-20T00:00:00Z');
  // Monday session (2026-01-12) includes the Sunday-evening bar; first intraday session is skipped as possibly partial
  const m15: SessionBar[] = [
    mk('2026-01-12T01:00:00Z', 100, 101, 99, 100, 5), // Sun 19:00 CST -> Mon 01-12 (earliest session -> skipped)
    mk('2026-01-13T01:00:00Z', 100, 103, 99, 102, 5), // Mon eve -> Tue 01-13
    mk('2026-01-13T15:00:00Z', 102, 108, 101, 106, 7), // Tue day
    mk('2026-01-14T15:00:00Z', 106, 107, 100, 101, null), // Wed
  ];
  const daily: SessionBar[] = [
    mk('2026-01-12T00:00:00Z', 90, 95, 89, 94, 1000),
    mk('2026-01-16T00:00:00Z', 90, 96, 88, 92, 2000),
  ];
  const rows = summarizeSessions({
    instrument: CBOT,
    intraday: [{ timeframe: 'M15', source: 'Y M15', bars: m15 }],
    daily: { timeframe: 'D1', source: 'Y D1', bars: daily },
    count: 20,
    nowMs,
  });
  assert.deepEqual(rows.map((r) => r.sessionDate), ['2026-01-12', '2026-01-13', '2026-01-14', '2026-01-16']);
  const [mon, tue, wed, fri] = rows;
  assert.equal(mon.fromDaily, true); // Mon intraday skipped -> falls back to D1
  assert.equal(mon.close, 94);
  assert.equal(tue.fromDaily, false);
  assert.equal(tue.bars, 2);
  assert.deepEqual([tue.open, tue.high, tue.low, tue.close, tue.volume], [100, 108, 99, 106, 12]);
  assert.equal(tue.change, 12);
  assert.equal(tue.range, 9);
  assert.ok(Math.abs(tue.changePct! - (12 / 94) * 100) < 1e-9);
  assert.ok(Math.abs(tue.rangePct - (9 / 106) * 100) < 1e-9);
  assert.equal(wed.volume, null, 'all-null volume stays null, never 0');
  assert.equal(wed.change, -5);
  assert.equal(fri.fromDaily, true);
  assert.equal(fri.gapWeekdaysBefore, 1, 'Thursday 01-15 has no data: reported, not invented');
  assert.equal(mon.change, null);
  assert.equal(tue.atr14, null, 'fewer than 5 prior sessions -> no ATR');
  assert.ok(rows.every((r) => r.status === 'COMPLETE'));
});

test('summarizeSessions: ATR ratio from prior sessions and count slicing', () => {
  const daily: SessionBar[] = [];
  for (let i = 0; i < 30; i++) {
    const day = new Date(Date.parse('2026-01-05T00:00:00Z') + i * DAY);
    if (day.getUTCDay() === 0 || day.getUTCDay() === 6) continue;
    daily.push({ timestampMs: day.getTime(), open: 100, high: 105, low: 95, close: 100, volume: 1 });
  }
  const rows = summarizeSessions({ instrument: CBOT, intraday: [], daily: { timeframe: 'D1', source: 'D1', bars: daily }, count: 5, nowMs: Date.parse('2026-03-01T00:00:00Z') });
  assert.equal(rows.length, 5);
  assert.equal(rows[4].atr14, 10);
  assert.equal(rows[4].rangeVsAtr, 1);
});

const FIXTURE = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../providers/__fixtures__/yahoo/ZC_F_5d_15m.json', import.meta.url)), 'utf8')
);

test('Yahoo intraday parsing (real ZC 15m fixture): nulls and the in-progress bar are dropped, cents kept', () => {
  const mapping = YAHOO_SYMBOL_MAP.ZC;
  const lastTs = FIXTURE.chart.result[0].timestamp.at(-1) as number;
  const nowMs = lastTs * 1000 + 5 * 60_000; // 5 min after the last (still forming) bar
  const r = parseYahooIntradayCandles(FIXTURE.chart.result[0], zc, mapping, 'M15', nowMs);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.ok(r.candles.length > 50);
  assert.ok(r.dropped > 0, 'null bars dropped');
  assert.ok(r.droppedIncomplete >= 1, 'forming bar dropped');
  assert.ok(r.candles.every((c) => c.timeframe === 'M15' && c.high >= c.low && c.open > 0 && c.source.startsWith('YAHOO_UNOFFICIAL')));
  const ts = r.candles.map((c) => Date.parse(c.timestamp));
  assert.deepEqual(ts, [...ts].sort((a, b) => a - b));
  assert.ok(Math.max(...ts) + 15 * 60_000 <= nowMs - mapping.delayMinutes * 60_000);
  // the real series spans >= 4 distinct CBOT sessions
  assert.ok(new Set(ts.map((t) => sessionOf(t, CBOT))).size >= 4);
  // wrong exchange is refused, not guessed
  const bad = parseYahooIntradayCandles({ ...FIXTURE.chart.result[0], meta: { ...FIXTURE.chart.result[0].meta, exchangeName: 'NYM' } }, zc, mapping, 'M15', nowMs);
  assert.equal(bad.ok, false);
});

test('syncYahooIntraday: sequential 1 request per symbol/timeframe, persisted as M15 and H1 datasets with labels', async () => {
  const prev = process.env.YAHOO_ENABLED;
  process.env.YAHOO_ENABLED = 'true';
  try {
    const repo = new InMemoryCandleRepository();
    const persist = createProviderCandlePersister(repo);
    const mapping = YAHOO_SYMBOL_MAP.ZC;
    const lastTs = FIXTURE.chart.result[0].timestamp.at(-1) as number;
    const nowMs = lastTs * 1000 + 5 * 60_000;
    const calls: string[] = [];
    const adapter = {
      supports: () => true,
      async getCandles(symbol: string, tf: string) {
        calls.push(`${symbol}:${tf}`);
        const p = parseYahooIntradayCandles(FIXTURE.chart.result[0], zc, mapping, 'M15', nowMs);
        assert.ok(p.ok);
        return { candles: p.ok ? p.candles.map((c) => ({ ...c, timeframe: tf })) : [], status: 'HISTORICAL' };
      },
    };
    const out = await syncYahooIntraday({ adapter, repository: repo, persist, providerName: 'Yahoo test', instruments: [zc], now: () => nowMs });
    assert.equal(out.enabled, true);
    assert.deepEqual(calls, ['ZC:M15', 'ZC:H1']);
    assert.equal(out.requests, 2);
    assert.deepEqual(out.results.map((r) => r.status), ['PERSISTED', 'PERSISTED']);
    const ds = await repo.listDatasets({ instrumentId: zc.id });
    assert.deepEqual(ds.map((d) => d.timeframe).sort(), ['H1', 'M15']);
    assert.ok(ds.every((d) => d.sourceQuality === 'UNOFFICIAL' && /UNOFFICIAL/.test(d.sourceLabel) && d.contractCode === YAHOO_HISTORY_CONTRACT_CODE));
    process.env.YAHOO_ENABLED = 'false';
    const off = await syncYahooIntraday({ adapter, repository: repo, persist, providerName: 'Yahoo test', instruments: [zc] });
    assert.equal(off.enabled, false);
    assert.equal(calls.length, 2, 'no request when disabled');
  } finally {
    if (prev === undefined) delete process.env.YAHOO_ENABLED;
    else process.env.YAHOO_ENABLED = prev;
  }
});

test('GET /api/market/sessions/:symbol: shape, count, 404 and validation', async () => {
  const repo = new InMemoryCandleRepository();
  const persist = createProviderCandlePersister(repo);
  const dailyCandles = [];
  for (let i = 0; i < 25; i++) {
    const day = new Date(Date.parse('2026-01-05T00:00:00Z') + i * DAY);
    if (day.getUTCDay() === 0 || day.getUTCDay() === 6) continue;
    dailyCandles.push({
      symbol: 'ZC', exchange: 'CBOT' as const, timeframe: 'D1' as const, timestamp: day.toISOString(), retrievedAt: '',
      open: 450, high: 455, low: 445, close: 452, volume: 100, openInterest: null, isComplete: true, source: 'x', status: 'HISTORICAL' as const,
    });
  }
  await persist({ providerId: 'YAHOO_UNOFFICIAL', providerName: 'Yahoo', instrument: zc, timeframe: 'D1', candles: dailyCandles, verifiedPriceUnit: zc.specification.quotationUnit });
  const app = express();
  registerSessionRoutes(app, {
    candles: repo,
    findInstrument: async (s) => (s.toUpperCase() === 'ZC' || s === zc.id ? zc : null),
    now: () => Date.parse('2026-03-01T00:00:00Z'),
  });
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const ok = await (await fetch(`${base}/api/market/sessions/ZC?count=10`)).json();
    assert.equal(ok.symbol, 'ZC');
    assert.equal(ok.count, 10);
    assert.equal(ok.status, 'HISTORICAL');
    assert.deepEqual(ok.sourcesUsed, ['D1']);
    const row = ok.sessions[9];
    for (const k of ['sessionDate', 'open', 'high', 'low', 'close', 'change', 'changePct', 'range', 'rangePct', 'atr14', 'rangeVsAtr', 'volume', 'bars', 'source', 'status', 'fromDaily', 'gapWeekdaysBefore']) {
      assert.ok(k in row, `missing ${k}`);
    }
    assert.equal(row.fromDaily, true);
    assert.equal(row.bars, null);
    const partial = await (await fetch(`${base}/api/market/sessions/ZC?count=60`)).json();
    assert.equal(partial.status, 'PARTIAL');
    assert.ok(partial.count < 60 && /not invented/.test(partial.reason));
    assert.equal((await fetch(`${base}/api/market/sessions/NOPE`)).status, 404);
    assert.equal((await fetch(`${base}/api/market/sessions/ZC?count=0`)).status, 400);
  } finally {
    server.close();
  }
});

test('scheduler: yahoo-intraday job runs on start and every 2 hours', async () => {
  const { buildSchedulerJobs } = await import('../../scheduler/jobs.ts');
  const jobs = buildSchedulerJobs({ env: {}, yahooIntradaySync: async () => ({ results: [{ status: 'PERSISTED' }] }) });
  const job = jobs.find((j) => j.id === 'yahoo-intraday')!;
  assert.ok(job);
  assert.equal(job.runOnStart, true);
  const now = new Date('2026-01-01T00:00:00Z');
  assert.equal(job.next(now).getTime() - now.getTime(), 2 * 3_600_000);
  await job.run();
  const failing = buildSchedulerJobs({ env: {}, yahooIntradaySync: async () => ({ results: [{ status: 'FAILED' }] }) }).find((j) => j.id === 'yahoo-intraday')!;
  await assert.rejects(() => failing.run());
});
