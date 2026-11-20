import test from 'node:test';
import assert from 'node:assert/strict';
import type { MarketCandle } from '../../../src/shared/types/market.ts';
import type { InstrumentDefinition } from '../../../src/shared/types/instrument.ts';
import { findRecommendationTerms } from '../aiAnalyst.ts';
import { computeScorecard } from './scorecardService.ts';
import { computeValuationStats, scoreValuation, zLabel } from './valuation.ts';
import { generateRulesNarrative, RULES_SOURCE } from './narrative.ts';
import { buildNarrative, callOllama, resolveAiProvider } from './narrativeProvider.ts';

/** ~4.2 years of weekday bars; close = 100 + slow sine + gentle rise (fixed, no randomness). */
function bars(n = 1100): MarketCandle[] {
  const out: MarketCandle[] = [];
  const start = Date.UTC(2022, 0, 3);
  let d = 0;
  while (out.length < n) {
    const ts = new Date(start + d * 86_400_000);
    d++;
    if (ts.getUTCDay() === 0 || ts.getUTCDay() === 6) continue;
    const i = out.length;
    const close = 100 + 10 * Math.sin(i / 40) + i * 0.02;
    out.push({ timestamp: ts.toISOString(), open: close, high: close + 1, low: close - 1, close, volume: 1000, source: 'TEST', isComplete: true } as unknown as MarketCandle);
  }
  return out;
}

const inst = {
  id: 'T:X', exchangeSymbol: 'X', exchange: 'T', productName: 'Test Corn', category: 'AGRICULTURE',
  specification: { minimumTickSize: 0.25, tickValue: 12.5, tradingCurrency: 'USD' },
} as unknown as InstrumentDefinition;

const noCot = { available: false, reason: { vi: 'x', en: 'x' }, reportDate: null, expectedReleaseDate: null, openInterest: null, mmNet: null, mmNetPctOi: null, mmChange: null, cotIndex: null, cotIndexWeeks: null, producerNet: null, stale: false, source: 'CFTC COT', weeksStored: 0 };

function card(candles: MarketCandle[]) {
  return computeScorecard({
    inst, quote: null, now: new Date('2026-03-01T00:00:00Z'), cot: noCot,
    history: { candles, origin: 'SQLITE', source: 'TEST', quality: 'USER_PROVIDED' },
  });
}

test('valuation stats on fixed inputs', () => {
  const b = bars();
  const s = computeValuationStats(b)!;
  assert.ok(s);
  assert.ok(s.pct52w >= 0 && s.pct52w <= 100);
  assert.ok(s.pct5y !== null, '5y available with >=1000 bars');
  assert.ok(s.ma200DistPct !== null && s.ma200DistAtr !== null);
  assert.ok(s.z1y !== null);
  assert.ok(s.monthVsPast && s.monthVsPast.years >= 3);
  // Recomputing gives the same numbers (deterministic).
  assert.deepEqual(computeValuationStats(b), s);
  // Monotonic rise ends at the 52w top.
  const up = b.map((c, i) => ({ ...c, close: 100 + i, high: 101 + i, low: 99 + i }));
  const su = computeValuationStats(up)!;
  assert.equal(su.pct52w, 100);
  assert.equal(scoreValuation(su, 'T', '2026-01-01').level, 'RANGE_HIGH');
  const down = b.map((c, i) => ({ ...c, close: 2000 - i, high: 2001 - i, low: 1999 - i }));
  assert.equal(scoreValuation(computeValuationStats(down)!, 'T', null).level, 'RANGE_LOW');
});

test('valuation unavailable with short history; no month stat under 3 years; z labels', () => {
  assert.equal(computeValuationStats(bars(150)), null);
  assert.equal(scoreValuation(null, 'T', null).status, 'UNAVAILABLE');
  const s = computeValuationStats(bars(300))!;
  assert.equal(s.monthVsPast, null);
  assert.equal(s.pct5y, null);
  assert.match(zLabel(2.1).vi, /Cao hơn nhiều so với trung bình 1 năm \(z=\+2\.1\)/);
  assert.match(zLabel(0.2).vi, /Gần mức trung bình/);
});

test('scorecard has valuation dimension and a clean rules narrative', () => {
  const c = card(bars());
  const v = c.dimensions.find((d) => d.id === 'valuation')!;
  assert.equal(v.status, 'OK');
  assert.ok(c.narrative);
  assert.equal(c.narrative!.provider, 'rules');
  assert.deepEqual(c.narrative!.source, RULES_SOURCE);
  for (const text of [c.narrative!.vi, c.narrative!.en]) {
    assert.ok(text.length > 100);
    assert.deepEqual(findRecommendationTerms(text), []);
  }
  assert.match(c.narrative!.vi, /USD/); // money per contract from tick data
  const n = generateRulesNarrative(c, inst, new Date('2026-03-01T00:00:00Z'));
  assert.deepEqual(n.vi, generateRulesNarrative(c, inst, new Date('2026-03-01T00:00:00Z')).vi);
  const sentences = n.vi.split(/(?<=\.)\s+/).length;
  assert.ok(sentences >= 4 && sentences <= 8, `sentences=${sentences}`);
});

test('narrative with no data states the gaps and stays neutral', () => {
  const c = card([]);
  assert.match(c.narrative!.vi, /Hiện chưa có giá/);
  assert.match(c.narrative!.vi, /thiếu dữ liệu/);
  assert.deepEqual(findRecommendationTerms(c.narrative!.vi + ' ' + c.narrative!.en), []);
});

test('provider resolution defaults to rules', () => {
  assert.equal(resolveAiProvider({}), 'rules');
  assert.equal(resolveAiProvider({ AI_PROVIDER: 'OLLAMA' } as NodeJS.ProcessEnv), 'ollama');
  assert.equal(resolveAiProvider({ AI_PROVIDER: 'junk' } as NodeJS.ProcessEnv), 'rules');
});

test('ollama: success is post-checked; unreachable or bad answer falls back to rules', async () => {
  const c = card(bars());
  const ok = (text: string) => (async () => new Response(JSON.stringify({ response: text }), { status: 200 })) as unknown as typeof fetch;
  const good = await buildNarrative(c, 'vi', { provider: 'ollama', inst, ollama: { fetchFn: ok('Giá đi ngang. Bạn nên mua ngay. Biến động trung bình.') } });
  assert.equal(good.provider, 'ollama');
  assert.doesNotMatch(good.vi, /nên mua/);
  assert.match(good.vi, /Giá đi ngang/);

  let calledUrl = '';
  await callOllama('p', { url: 'http://x:1/', model: 'm', fetchFn: (async (u: string) => { calledUrl = u; return new Response('{}', { status: 200 }); }) as unknown as typeof fetch });
  assert.equal(calledUrl, 'http://x:1/api/generate');

  const down = (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;
  const fb = await buildNarrative(c, 'vi', { provider: 'ollama', inst, ollama: { fetchFn: down } });
  assert.equal(fb.provider, 'rules');
  assert.equal(fb.fallbackFrom, 'ollama');
  const http500 = (async () => new Response('x', { status: 500 })) as unknown as typeof fetch;
  assert.equal((await buildNarrative(c, 'en', { provider: 'ollama', inst, ollama: { fetchFn: http500 } })).provider, 'rules');
  const onlyRec = await buildNarrative(c, 'en', { provider: 'ollama', inst, ollama: { fetchFn: ok('You should buy now.') } });
  assert.equal(onlyRec.provider, 'rules');
});
