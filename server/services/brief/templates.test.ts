import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildContractSection,
  buildCotSection,
  buildMissingSection,
  buildMomentumSection,
  buildPriceSection,
  buildRiskSection,
  buildSeasonalitySection,
  buildSummary,
  buildTermStructureSection,
  buildTrendSection,
  classifyCotIndex,
  classifyMoveVsAtr,
  classifyRsi,
  classifyTrend,
  classifyVolRegime,
  decimalsForTick,
  fmtDate,
  fmtNum,
  rsiSentence,
} from './templates.ts';
import { quoteSessionDate } from './briefService.ts';
import type { MarketQuote } from '../../../src/shared/types/market.ts';

const FORBIDDEN = /\b(nên mua|nên bán|điểm vào|chốt lời|cắt lỗ|should buy|should sell|entry|take profit|stop loss|target)\b/i;

function assertNeutral(text: { vi: string; en: string }) {
  assert.ok(!FORBIDDEN.test(text.vi), `vi not neutral: ${text.vi}`);
  assert.ok(!FORBIDDEN.test(text.en), `en not neutral: ${text.en}`);
}

describe('brief formatting helpers', () => {
  it('formats numbers per language and dates', () => {
    assert.equal(fmtNum(1234.5, 2, 'en'), '1,234.50');
    assert.equal(fmtNum(1234.5, 2, 'vi'), '1.234,50');
    assert.equal(fmtDate('2026-11-10', 'vi'), '10/11/2026');
    assert.equal(fmtDate('2026-11-10T00:00:00.000Z', 'en'), '2026-11-10');
    assert.equal(decimalsForTick(0.25), 2);
    assert.equal(decimalsForTick(0.1, 0), 1);
    assert.equal(decimalsForTick(0.005), 3);
  });
});

describe('classifiers', () => {
  it('RSI zones', () => {
    assert.equal(classifyRsi(72), 'OVERBOUGHT');
    assert.equal(classifyRsi(60), 'LEANING_UP');
    assert.equal(classifyRsi(50), 'BALANCED');
    assert.equal(classifyRsi(40), 'LEANING_DOWN');
    assert.equal(classifyRsi(25), 'OVERSOLD');
  });
  it('RSI 72 sentence says overbought but explicitly not a sell signal', () => {
    const s = rsiSentence(72);
    assert.match(s.vi, /RSI 72/);
    assert.match(s.vi, /quá mua/);
    assert.match(s.vi, /không phải tín hiệu bán/);
    assert.match(s.en, /not a sell signal/);
  });
  it('trend classes', () => {
    assert.equal(classifyTrend(110, 100, 90), 'UP');
    assert.equal(classifyTrend(80, 90, 100), 'DOWN');
    assert.equal(classifyTrend(95, 90, 100), 'MIXED_RECOVERING');
    assert.equal(classifyTrend(95, 100, 90), 'MIXED_WEAKENING');
    assert.equal(classifyTrend(105, 100, null), 'UP');
  });
  it('move vs ATR, vol regime and COT index buckets', () => {
    assert.equal(classifyMoveVsAtr(1, 4), 'SMALL');
    assert.equal(classifyMoveVsAtr(-4, 4), 'NORMAL');
    assert.equal(classifyMoveVsAtr(8, 4), 'LARGE');
    assert.equal(classifyVolRegime(0.3, 0.2), 'HIGH');
    assert.equal(classifyVolRegime(0.15, 0.2), 'LOW');
    assert.equal(classifyVolRegime(0.21, 0.2), 'NORMAL');
    assert.equal(classifyCotIndex(85), 'NEAR_HIGH');
    assert.equal(classifyCotIndex(10.7), 'NEAR_LOW');
    assert.equal(classifyCotIndex(50), 'MIDDLE');
  });
});

describe('section builders (fixed inputs)', () => {
  it('price: change vs previous close and ATR context', () => {
    const { section, headline } = buildPriceSection({
      price: 444.5,
      unit: 'cents/bushel',
      decimals: 2,
      quoteStatus: 'DELAYED',
      quoteSource: 'YAHOO_UNOFFICIAL:ZC=F',
      quoteQuality: 'UNOFFICIAL',
      quoteAsOf: '2026-11-18T11:19:06.000Z',
      quoteDelayMinutes: 10,
      prevClose: 440,
      prevCloseDate: '2026-11-17',
      historySource: 'YAHOO',
      historyQuality: 'UNOFFICIAL',
      atr: 6,
    });
    assert.equal(section.status, 'OK');
    assert.ok(headline);
    assert.match(section.plainText.vi, /tăng 4,50 \(1,02%\)/);
    assert.match(section.plainText.vi, /17\/11\/2026/);
    assert.match(section.plainText.en, /tương đương|in line with/);
    const change = section.facts.find((f) => f.label.en === 'Change vs previous close');
    assert.equal(change?.raw, 4.5);
    assert.equal(change?.quality, 'DERIVED');
    assert.ok(section.facts.every((f) => f.source && f.quality));
    assertNeutral(section.plainText);
  });

  it('price: unavailable without a quote says so', () => {
    const { section } = buildPriceSection({
      price: null, unit: 'USD', decimals: 2, quoteStatus: 'UNAVAILABLE', quoteSource: 'NONE', quoteQuality: 'UNOFFICIAL',
      quoteAsOf: null, prevClose: null, prevCloseDate: null, historySource: 'NONE', historyQuality: 'USER_PROVIDED', atr: null,
      quoteReason: 'no provider',
    });
    assert.equal(section.status, 'UNAVAILABLE');
    assert.equal(section.facts[0].value, null);
  });

  it('trend: above both averages → up; missing MA200 → PARTIAL', () => {
    const base = { sma50Prev: 100, rangeHigh: 130, rangeLow: 90, rangeBars: 252, unit: 'USD', decimals: 2, source: 's', quality: 'UNOFFICIAL' as const, asOf: '2026-11-17' };
    const up = buildTrendSection({ ...base, close: 120, sma50: 110, sma200: 100 });
    assert.equal(up.section.status, 'OK');
    assert.match(up.section.plainText.vi, /trên cả đường trung bình 50 và 200 phiên → xu hướng trung hạn và dài hạn đều đang đi lên/);
    assert.match(up.section.plainText.vi, /dốc lên/);
    assert.match(up.section.plainText.vi, /75%/);
    const partial = buildTrendSection({ ...base, close: 120, sma50: 110, sma200: null });
    assert.equal(partial.section.status, 'PARTIAL');
    assert.match(partial.section.plainText.vi, /Giá đang trên đường trung bình 50 phiên → xu hướng trung hạn đang đi lên\./);
    const none = buildTrendSection({ ...base, close: null, sma50: null, sma200: null });
    assert.equal(none.section.status, 'UNAVAILABLE');
    assert.equal(none.headline, null);
  });

  it('momentum', () => {
    const m = buildMomentumSection({ rsi14: 28, ret20: -0.081, ret60: -0.12, source: 's', asOf: '2026-11-17' });
    assert.equal(m.section.status, 'OK');
    assert.match(m.section.plainText.vi, /quá bán/);
    assert.match(m.section.plainText.vi, /không phải tín hiệu mua/);
    assert.match(m.section.plainText.vi, /giảm 8,1%/);
    assertNeutral(m.section.plainText);
  });

  it('risk: tick and ATR converted to money per contract', () => {
    const r = buildRiskSection({
      price: 444.5, atr14: 6, tickSize: 0.25, tickValue: 12.5, currency: 'USD', unit: 'cents/bushel', decimals: 2,
      vol20: 0.3, volMedian: 0.2,
      maxDrawdown: { value: -0.18, peakT: '2025-02-10', troughT: '2025-08-12', recovered: false },
      historyFrom: '2024-11-18', historyTo: '2026-11-17', source: 's', specSource: 'cme', asOf: '2026-11-17',
    });
    assert.equal(r.section.status, 'OK');
    assert.match(r.section.plainText.vi, /1 tick = 0,25 cents\/bushel = 12,50 USD\/hợp đồng/);
    assert.match(r.section.plainText.vi, /≈ 300 USD\/hợp đồng/);
    assert.match(r.section.plainText.vi, /cao hơn mức thường thấy/);
    assert.match(r.section.plainText.vi, /18,0%/);
    const notional = r.section.facts.find((f) => f.label.en === 'Notional value of one contract');
    assert.equal(notional?.raw, 22225);
  });

  it('seasonality needs ≥3 years', () => {
    const missing = buildSeasonalitySection({ ok: false, yearsCovered: 0, yearsAvailable: 2, reason: null, current: null, next: null, source: 's', asOf: null, profileNote: 'note' });
    assert.equal(missing.section.status, 'UNAVAILABLE');
    assert.match(missing.section.plainText.vi, /ít nhất 3 năm/);
    assert.equal(missing.section.facts.length, 1);
    const ok = buildSeasonalitySection({
      ok: true, yearsCovered: 6, yearsAvailable: 6.2, reason: null,
      current: { month: 11, count: 6, mean: 0.012, pctPositive: 4 / 6 },
      next: { month: 12, count: 6, mean: -0.004, pctPositive: 0.5 },
      source: 's', asOf: '2026-11-17', profileNote: null,
    });
    assert.equal(ok.section.status, 'OK');
    assert.match(ok.section.plainText.vi, /tháng 11 có 4\/6 năm giá tăng, thay đổi trung bình \+1,2%/);
    assert.match(ok.section.plainText.vi, /không phải dự báo/);
  });

  it('COT: net short, weekly change, index near low', () => {
    const c = buildCotSection({
      available: true, reason: null, reportDate: '2026-11-10', expectedReleaseDate: '2026-11-13', openInterest: 1979758,
      mmNet: -22628, mmNetPctOi: -1.14, mmChange: -31423, cotIndex: 10.7, cotIndexWeeks: 26, producerNet: -399128,
      stale: false, source: 'CFTC', weeksStored: 45,
    });
    assert.equal(c.section.status, 'OK');
    assert.match(c.section.plainText.vi, /bán ròng 22\.628 hợp đồng/);
    assert.match(c.section.plainText.vi, /giảm 31\.423/);
    assert.match(c.section.plainText.vi, /gần mức thấp nhất/);
    assert.equal(c.section.facts[0].quality, 'OFFICIAL');
    assert.equal(c.section.facts[0].asOf, '2026-11-10');
    const none = buildCotSection({ ...{ available: false, reason: null, reportDate: null, expectedReleaseDate: null, openInterest: null, mmNet: null, mmNetPctOi: null, mmChange: null, cotIndex: null, cotIndexWeeks: null, producerNet: null, stale: false, source: 'CFTC', weeksStored: 0 } });
    assert.equal(none.section.status, 'UNAVAILABLE');
  });

  it('term structure: unavailable by default, contango described', () => {
    const base = { unit: 'USD', decimals: 2, source: 's', quality: 'USER_PROVIDED' as const };
    assert.equal(buildTermStructureSection({ ...base, available: false, reason: null, shape: null, valuationDate: null, points: [] }).section.status, 'UNAVAILABLE');
    const t = buildTermStructureSection({
      ...base, available: true, reason: null, shape: 'CONTANGO', valuationDate: '2026-11-17',
      points: [{ contract: 'ZCZ26', price: 440, lastTradingDay: '2026-12-14' }, { contract: 'ZCH27', price: 452, lastTradingDay: '2027-03-12' }],
    });
    assert.equal(t.section.status, 'OK');
    assert.match(t.section.plainText.vi, /contango/);
  });

  it('contract spec + MXV, missing section and summary', () => {
    const c = buildContractSection({
      symbol: 'ZC', exchange: 'CBOT', contractSize: 5000, contractSizeUnit: 'bushels', tickSize: 0.25, tickValue: 12.5,
      currency: 'USD', unit: 'cents/bushel', settlement: 'PHYSICAL', verification: 'VERIFIED', specSource: 'cme',
      tradingHoursIct: null, contractCycle: null, mxv: { symbol: 'ZCE', status: 'VERIFIED', source: null }, isMxvListed: true,
      nextContract: { code: 'ZCZ26', mxvCode: 'ZCEZ26', lastTradingDay: '2026-12-14', daysToLastTrade: 26, ltdSource: null },
      chainAsOf: '2026-11-18',
    });
    assert.equal(c.section.status, 'OK');
    assert.match(c.section.plainText.vi, /Một hợp đồng ZC = 5\.000 bushels/);
    assert.match(c.section.plainText.vi, /còn 26 ngày/);
    assert.match(c.section.plainText.vi, /mã ZCE/);

    const ts = buildTermStructureSection({ unit: 'USD', decimals: 2, source: 's', quality: 'USER_PROVIDED', available: false, reason: null, shape: null, valuationDate: null, points: [] });
    const missing = buildMissingSection([c.section, ts.section]);
    assert.equal(missing.status, 'PARTIAL');
    assert.equal(missing.facts.length, 1);
    assert.match(missing.plainText.vi, /Cấu trúc kỳ hạn/);

    const summary = buildSummary({ contract: c, termStructure: ts });
    assert.ok(summary.length >= 1 && summary.length <= 5);
    assert.match(summary[summary.length - 1].vi, /Dữ liệu còn thiếu/);
  });
});

describe('quoteSessionDate', () => {
  const q = (over: Partial<MarketQuote>): MarketQuote => ({
    symbol: 'ZC', exchange: 'CBOT', contractMonth: null, price: 444.5, bid: null, ask: null, volume: null, openInterest: null,
    currency: 'USD', unit: 'cents/bushel', source: 'x', timestamp: '2026-11-18T15:00:00.000Z', retrievedAt: '2026-11-18T15:01:00.000Z',
    status: 'DELAYED', ...over,
  });
  it('uses the trading period end in the exchange time zone', () => {
    // 2026-11-18 19:20 UTC = 13:20 CT on the 18th
    assert.equal(quoteSessionDate(q({ tradingPeriod: { start: null, end: Date.parse('2026-11-18T19:20:00Z') / 1000 } }), 'America/Chicago'), '2026-11-18');
  });
  it('HISTORICAL quotes use their bar date; no price → null', () => {
    assert.equal(quoteSessionDate(q({ status: 'HISTORICAL', timestamp: '2026-11-17T00:00:00.000Z' }), 'America/Chicago'), '2026-11-17');
    assert.equal(quoteSessionDate(q({ price: null }), 'America/Chicago'), null);
  });
});
