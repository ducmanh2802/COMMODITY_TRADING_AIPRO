import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MarketCandle } from '../../../src/shared/types/market.ts';
import { RATING_MAX, gradeOf, rateInstrument, setupLevels, weeklyCloses, type RatingInput } from './rating.ts';
import { toBars, type SetupCore } from './scoring.ts';

function candle(i: number, close: number, spread = 0.5): MarketCandle {
  const d = new Date(Date.UTC(2024, 0, 1) + i * 86_400_000).toISOString();
  return { symbol: 'X', exchange: 'CBOT', timeframe: 'D1', timestamp: d, retrievedAt: d, open: close, high: close + spread, low: close - spread, close, volume: 1000 + (i % 5) * 100, openInterest: null, isComplete: true, source: 'TEST', status: 'HISTORICAL' } as MarketCandle;
}
const bars = (closes: number[], spread = 0.5) => toBars(closes.map((c, i) => candle(i, c, spread)));
const up = (n: number, slope = 0.3) => Array.from({ length: n }, (_, i) => 100 + i * slope + Math.sin(i / 3.5) * 3);
const down = (n: number) => Array.from({ length: n }, (_, i) => 300 - i * 0.3 + Math.sin(i / 3.5) * 3);
const chop = (n: number) => Array.from({ length: n }, (_, i) => 100 + 5 * Math.sin(i / 6) + 3 * Math.sin(i / 2.3));
const UP: SetupCore = { direction: 'UP', conditions: [] };
const DOWN: SetupCore = { direction: 'DOWN', conditions: [] };
const base = (closes: number[], o: Partial<RatingInput> = {}): RatingInput => ({ bars: bars(closes), setup: null, cotIndex: 50, eventDays: null, quality: 'OFFICIAL', source: 'CME', ageDays: 0, ...o });
const comp = (r: ReturnType<typeof rateInstrument>, label: string) => r.components.find((c) => c.label.startsWith(label))!;

test('weights sum to 100 and components cover them', () => {
  assert.equal(Object.values(RATING_MAX).reduce((a, b) => a + b, 0), 100);
  const r = rateInstrument(base(up(260)));
  assert.equal(r.components.reduce((a, c) => a + c.max, 0), 100);
  for (const c of r.components) assert.ok(c.points >= 0 && c.points <= c.max && c.note.length > 0);
});

test('grades map to thresholds', () => {
  assert.deepEqual([80, 75, 70, 60, 50, 45, 10].map(gradeOf), ['A', 'A', 'B', 'B', 'C', 'C', 'D']);
});

test('strong uptrend + good setup ranks well above choppy market', () => {
  const strong = rateInstrument(base(up(260), { setup: UP }));
  const choppy = rateInstrument(base(chop(250)));
  assert.equal(strong.direction, 'TĂNG');
  assert.equal(choppy.direction, 'CHƯA RÕ');
  assert.ok(strong.rating > choppy.rating + 25, `${strong.rating} vs ${choppy.rating}`);
  assert.ok(['A', 'B'].includes(strong.grade));
  assert.ok(['C', 'D'].includes(choppy.grade));
});

test('shorts can score high in a clean downtrend', () => {
  const r = rateInstrument(base(down(260), { setup: DOWN }));
  assert.equal(r.direction, 'GIẢM');
  assert.ok(r.rating >= 60, String(r.rating));
  const noSetup = rateInstrument(base(down(260)));
  assert.equal(noSetup.direction, 'GIẢM');
  assert.ok(comp(noSetup, 'Xu hướng ngày').points > 14);
});

test('high ATR% is penalised', () => {
  const calm = rateInstrument({ ...base(up(260)), bars: bars(up(260), 0.5) });
  const wild = rateInstrument({ ...base(up(260)), bars: bars(up(260), 9) });
  assert.ok(comp(wild, 'Biến động').points < comp(calm, 'Biến động').points);
  assert.ok(comp(wild, 'Biến động').points <= 1);
  assert.ok(wild.rating < calm.rating);
});

test('event within 24h is penalised more than event in 3 days; none is best', () => {
  const none = rateInstrument(base(up(260)));
  const soon = rateInstrument(base(up(260), { eventDays: 1 }));
  const later = rateInstrument(base(up(260), { eventDays: 3 }));
  assert.equal(comp(soon, 'Sự kiện').points, 0);
  assert.ok(none.rating > later.rating && later.rating > soon.rating);
});

test('COT crowding on the same side is penalised, opposite extreme is not', () => {
  const normal = rateInstrument(base(up(260), { cotIndex: 50 }));
  const crowded = rateInstrument(base(up(260), { cotIndex: 95 }));
  const opposite = rateInstrument(base(up(260), { cotIndex: 5 }));
  assert.equal(comp(crowded, 'Vị thế COT').points, 0);
  assert.ok(crowded.rating < normal.rating);
  assert.equal(opposite.rating, normal.rating);
  const shortCrowded = rateInstrument(base(down(260), { cotIndex: 5 }));
  assert.equal(comp(shortCrowded, 'Vị thế COT').points, 0);
});

test('overheated RSI against the direction scores lower', () => {
  const hotCloses = [...up(246), ...Array.from({ length: 14 }, (_, k) => 100 + 245 * 0.3 + 4 * (k + 1) * 1.5)];
  const hot = rateInstrument(base(hotCloses));
  const healthy = rateInstrument(base(up(260)));
  assert.ok(comp(hot, 'Động lượng').points < comp(healthy, 'Động lượng').points);
});

test('missing inputs: unavailable components, capped rating, lower confidence, nothing fabricated', () => {
  const full = rateInstrument(base(up(260), { setup: UP }));
  assert.equal(full.confidence, 'CAO');
  const noCot = rateInstrument(base(up(260), { setup: UP, cotIndex: null }));
  assert.equal(comp(noCot, 'Vị thế COT').available, false);
  assert.equal(comp(noCot, 'Vị thế COT').points, 0);
  assert.equal(noCot.confidence, 'TRUNG BÌNH');
  assert.ok(noCot.rating <= 95);
  const short = rateInstrument(base(up(45)));
  assert.equal(comp(short, 'Xu hướng tuần').available, false);
  const tiny = rateInstrument(base(up(30)));
  assert.equal(comp(tiny, 'Xu hướng ngày').available, false);
  assert.equal(tiny.confidence, 'THẤP');
  assert.ok(tiny.rating <= 80);
});

test('data quality: STALE / UNOFFICIAL / HISTORICAL lower confidence and points', () => {
  const ok = rateInstrument(base(up(260)));
  const unoff = rateInstrument(base(up(260), { quality: 'UNOFFICIAL' }));
  const hist = rateInstrument(base(up(260), { quality: 'HISTORICAL', source: 'DB' }));
  const stale = rateInstrument(base(up(260), { quality: 'STALE' }));
  assert.equal(ok.confidence, 'CAO');
  assert.equal(unoff.confidence, 'TRUNG BÌNH');
  assert.equal(hist.confidence, 'TRUNG BÌNH');
  assert.equal(stale.confidence, 'THẤP');
  assert.ok(ok.rating > unoff.rating && unoff.rating >= stale.rating);
  assert.ok(comp(rateInstrument(base(up(260), { ageDays: 6 })), 'Chất lượng dữ liệu').points <= 3);
});

test('setup quality: reward:risk levels and notes', () => {
  const lv = setupLevels(bars(up(100)), 1, 1);
  assert.ok(lv && lv.target >= 100 && lv.rr >= 0);
  const withSetup = rateInstrument(base(up(260), { setup: UP }));
  assert.ok(comp(withSetup, 'Chất lượng thiết lập').points > 0);
  assert.ok(comp(withSetup, 'Chất lượng thiết lập').note.includes('R:R'));
  assert.equal(comp(rateInstrument(base(up(260))), 'Chất lượng thiết lập').points, 0);
});

test('weekly closes group by week', () => {
  const w = weeklyCloses(bars(Array.from({ length: 28 }, (_, i) => 100 + i)));
  assert.ok(w.length >= 4 && w.length <= 5);
  assert.equal(w[w.length - 1], 127);
});

test('notes never contain buy/sell instructions', () => {
  const r = rateInstrument(base(up(260), { setup: UP, eventDays: 1, cotIndex: 95 }));
  for (const c of r.components) assert.ok(!/(mua ngay|bán ngay|nên mua|nên bán)/i.test(c.note));
});
