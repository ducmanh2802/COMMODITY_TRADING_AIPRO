import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MarketCandle } from '../../../src/shared/types/market.ts';
import type { InstrumentDefinition } from '../../../src/shared/types/instrument.ts';
import { diffRadar, reportText, snapshotOf } from '../../../src/shared/radar/notify.ts';
import { FORBIDDEN_WORDS } from '../drivers/text.ts';
import { buildRadar, buildEvents, eventSoonFor, atrMoney } from './service.ts';
import { MAX_POINTS, detectBreakouts, ramp, rsiCross, scoreInstrument, toBars, volumeRatio, volExpansionRatio, detectSetup, setupDescription, setupRisks } from './scoring.ts';

function candle(i: number, close: number, o: { volume?: number | null; spread?: number } = {}): MarketCandle {
  const d = new Date(Date.UTC(2025, 0, 1) + i * 86_400_000).toISOString();
  const s = o.spread ?? 0.5;
  return { symbol: 'X', exchange: 'CBOT', timeframe: 'D1', timestamp: d, retrievedAt: d, open: close, high: close + s, low: close - s, close, volume: o.volume === undefined ? 1000 : o.volume, openInterest: null, isComplete: true, source: 'TEST', status: 'HISTORICAL' } as MarketCandle;
}
const series = (closes: number[], vol: (i: number) => number | null = () => 1000) => toBars(closes.map((c, i) => candle(i, c, { volume: vol(i) })));
const flat = (n: number) => Array.from({ length: n }, (_, i) => 100 + Math.sin(i) * 0.3);

test('ramp is linear and clamped', () => {
  assert.equal(ramp(1, 1.2, 3), 0);
  assert.equal(ramp(3.5, 1.2, 3), 1);
  assert.ok(Math.abs(ramp(2.1, 1.2, 3) - 0.5) < 1e-9);
});

test('weights sum to 100', () => {
  assert.equal(Object.values(MAX_POINTS).reduce((a, b) => a + b, 0), 100);
});

test('volumeRatio uses prior 20 bars and handles missing volume', () => {
  const v: (number | null)[] = Array(25).fill(100);
  v[24] = 210;
  assert.ok(Math.abs((volumeRatio(v) as number) - 2.1) < 1e-9);
  assert.equal(volumeRatio(Array(25).fill(null)), null);
  const last = [...Array(24).fill(100), null];
  assert.equal(volumeRatio(last), null);
});

test('detects 55d and 20d breakouts against the PRIOR window only', () => {
  const closes = flat(70);
  closes.push(110);
  const b = series(closes);
  const k = detectBreakouts(b);
  assert.ok(k.includes('high55'));
  assert.ok(!k.includes('low55'));
  const closes2 = flat(70);
  closes2.push(90);
  assert.ok(detectBreakouts(series(closes2)).includes('low55'));
  assert.deepEqual(detectBreakouts(series(flat(71))), []);
  // too short for 55 but long enough for 20
  const short = flat(30);
  short.push(120);
  assert.deepEqual(detectBreakouts(series(short)), ['high20']);
});

test('rsiCross classifies threshold crossings', () => {
  assert.equal(rsiCross(65, 71), 'up70');
  assert.equal(rsiCross(35, 29), 'down30');
  assert.equal(rsiCross(48, 52), 'up50');
  assert.equal(rsiCross(52, 51), null);
  assert.equal(rsiCross(null, 50), null);
});

test('quiet market scores low, a volume + breakout day scores high with matching reasons', () => {
  const quiet = scoreInstrument({ bars: series(flat(120)), cotIndex: null, eventSoon: null, phaseNow: null, phasePrev: null });
  assert.ok(quiet.score < 15, `quiet=${quiet.score}`);
  const closes = flat(120);
  closes.push(106);
  const bars = series(closes, (i) => (i === closes.length - 1 ? 2100 : 1000));
  const hot = scoreInstrument({ bars, cotIndex: 95, eventSoon: 'Báo cáo WASDE (USDA) (2025-06-01)', phaseNow: 'MARKUP', phasePrev: 'ACCUMULATION', phaseLabelNow: 'Tăng giá' });
  assert.ok(hot.score >= 70, `hot=${hot.score}`);
  assert.ok(hot.score <= 100);
  const reasons = hot.signals.filter((s) => s.active).map((s) => s.reason as string);
  assert.ok(reasons.includes('Khối lượng gấp 2,1 lần trung bình 20 phiên'));
  assert.ok(reasons.includes('Giá vượt đỉnh 55 phiên'));
  assert.ok(reasons.some((r) => r.includes('COT')));
  assert.ok(reasons.some((r) => r.includes('Pha chu kỳ đổi')));
  for (const s of hot.signals) assert.ok(s.points <= s.max);
});

test('missing volume is reported, not invented', () => {
  const r = scoreInstrument({ bars: series(flat(100), () => null), cotIndex: null, eventSoon: null, phaseNow: null, phasePrev: null });
  const v = r.signals.find((s) => s.id === 'volume');
  assert.equal(v?.points, 0);
  assert.equal(v?.value, null);
  assert.ok(r.caveats.some((c) => c.includes('khối lượng')));
});

test('volExpansionRatio rises when the last days are much more volatile', () => {
  const calm = flat(100);
  const wild = [...calm, 104, 96, 105, 95, 106];
  assert.ok((volExpansionRatio(wild) as number) > 2);
  assert.equal(volExpansionRatio(flat(30)), null);
});

test('all generated sentences are free of recommendation words', () => {
  const closes = flat(120);
  closes.push(106);
  const hot = scoreInstrument({ bars: series(closes, (i) => (i === closes.length - 1 ? 2100 : 1000)), cotIndex: 5, eventSoon: 'Tồn kho dầu thô EIA (hằng tuần) (2025-06-04)', phaseNow: 'B', phasePrev: 'A' });
  const texts = [...hot.signals.map((s) => s.reason ?? ''), ...hot.caveats, setupDescription({ direction: 'UP', conditions: [] }), setupDescription({ direction: 'DOWN', conditions: [] }), ...setupRisks({ atrMoney: 1234, currency: 'USD', eventSoon: 'WASDE' }), ...setupRisks({ atrMoney: null, currency: null, eventSoon: null })];
  for (const t of texts) assert.ok(!FORBIDDEN_WORDS.test(t), `forbidden wording in: ${t}`);
});

test('setup detection: clean pullback in an uptrend, nothing in a flat market', () => {
  const up = Array.from({ length: 150 }, (_, i) => 100 + i * 0.5 + Math.sin(i / 2) * 0.8);
  // finish with a mild dip toward EMA20
  const bars = series([...up, up[up.length - 1] - 1.2, up[up.length - 1] - 1.6]);
  const core = detectSetup(bars);
  if (core) {
    assert.equal(core.direction, 'UP');
    assert.equal(core.conditions.length, 4);
  }
  assert.equal(detectSetup(series(Array(150).fill(100))), null);
});

test('events and atr money helpers', () => {
  const ev = buildEvents('2025-06-02', '2025-06-09', ['2025-06-05', '2025-07-01'], new Set(['AGRICULTURE', 'ENERGY']));
  assert.ok(ev.some((e) => e.kind === 'WASDE' && e.date === '2025-06-05'));
  assert.ok(!ev.some((e) => e.date === '2025-07-01'));
  assert.ok(ev.some((e) => e.kind === 'EIA'));
  assert.ok(ev.some((e) => e.kind === 'COT'));
  assert.ok(eventSoonFor(ev, 'AGRICULTURE', '2025-06-02')?.includes('WASDE'));
  assert.equal(eventSoonFor(ev, 'METALS', '2025-06-02'), null);
  const inst = { specification: { minimumTickSize: 0.25, tickValue: 12.5, tradingCurrency: 'USD' } } as InstrumentDefinition;
  assert.equal(atrMoney(inst, 5)?.value, 250);
  assert.equal(atrMoney({ specification: { minimumTickSize: null, tickValue: null, tradingCurrency: 'USD' } } as InstrumentDefinition, 5), null);
});

test('buildRadar ranks scored instruments and never throws on bad history', async () => {
  const mk = (id: string, cat: string): InstrumentDefinition => ({ id, productName: id, category: cat, exchange: 'CBOT', exchangeSymbol: id, enabled: true, specification: { minimumTickSize: 0.25, tickValue: 12.5, tradingCurrency: 'USD' } }) as unknown as InstrumentDefinition;
  const now = new Date('2025-05-02T10:00:00Z'); // candle i=121 is 2025-05-02
  const hot = flat(121);
  hot.push(108);
  const histories: Record<string, number[] | 'throw'> = { HOT: hot, CALM: flat(122), BAD: 'throw', SHORT: [1, 2, 3] };
  const r = await buildRadar({
    now: () => now,
    listInstruments: async () => [mk('HOT', 'AGRICULTURE'), mk('CALM', 'METALS'), mk('BAD', 'ENERGY'), mk('SHORT', 'ENERGY')],
    getHistory: async (inst) => {
      const h = histories[inst.id];
      if (h === 'throw') throw new Error('x');
      return { candles: h.map((c, i) => candle(i, c)), source: 'TEST', quality: null };
    },
  });
  assert.equal(r.instrumentsTotal, 4);
  assert.equal(r.instrumentsScored, 2);
  assert.equal(r.items[0].symbol, 'HOT');
  assert.ok(r.items[0].score > r.items[1].score);
  assert.ok(r.caveats.some((c) => c.includes('chưa có đủ lịch sử')));
  assert.ok(reportText(r).includes('Top 5 mã sôi động'));
});

function item(id: string, score: number, breakouts: string[] = [], reasons: string[] = []) {
  return { id, symbol: id, name: id, category: 'x', score, signals: [], reasons, breakouts, lastClose: 1, changePct: 0, asOf: '2025-01-01', source: null, quality: null, spark: [], caveats: [] } as unknown as import('../../../src/shared/types/radar.ts').RadarItem;
}

test('notification diff: baseline is silent, then only NEW top entries and NEW breakouts notify', () => {
  const first = [item('A', 80), item('B', 70), item('C', 10)];
  const base = diffRadar(null, first);
  assert.deepEqual(base.notes, []);
  assert.deepEqual(base.next.top, ['A', 'B']);

  const second = [item('A', 85, ['high55']), item('B', 70), item('C', 60, [], ['Giá vượt đỉnh 20 phiên'])];
  const d = diffRadar(base.next, second);
  const kinds = d.notes.map((n) => `${n.kind}:${n.instrumentId}`).sort();
  assert.deepEqual(kinds, ['breakout:A', 'top:C']);
  assert.ok(d.notes.find((n) => n.kind === 'breakout')?.text.includes('đỉnh 55 phiên'));

  // same state again: nothing new
  assert.deepEqual(diffRadar(d.next, second).notes, []);
  // muted instrument is silent but tracked
  const third = [item('A', 85, ['high55']), item('B', 70), item('C', 60), item('D', 90, ['low20'])];
  const m = diffRadar(d.next, third, ['D']);
  assert.deepEqual(m.notes, []);
  assert.ok(m.next.top.includes('D'));
  assert.deepEqual(snapshotOf(third).breakouts.D, ['low20']);
  // a breakout that disappears and returns notifies again
  const gone = diffRadar(d.next, [item('A', 85), item('B', 70), item('C', 60)]);
  assert.deepEqual(gone.notes, []);
  assert.equal(diffRadar(gone.next, second).notes.filter((n) => n.kind === 'breakout').length, 1);
  for (const n of [...d.notes, ...m.notes]) assert.ok(!FORBIDDEN_WORDS.test(n.text));
});
