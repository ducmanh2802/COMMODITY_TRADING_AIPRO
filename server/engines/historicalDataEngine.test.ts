import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_INSTRUMENTS } from '../services/instrumentRegistry.ts';
import type { MarketCandle } from '../../src/shared/types/market.ts';
import type { DatasetRecord } from '../storage/candleRepository.ts';
import {
  auditHistoricalCoverage,
  classifyHistoricalSeriesFreshness,
  detectDailySessionGaps,
  isValidIanaTimezone,
  normalizeHistoricalCandles,
  resampleDailyToWeeklyAndMonthly,
  resolveUnitConversionFactor,
  toExchangeLocalDateIso,
} from './historicalDataEngine.ts';

function makeDailyCandle(dateIso: string, open: number, high: number, low: number, close: number, volume = 1000): MarketCandle {
  return {
    symbol: 'ZC',
    exchange: 'CBOT',
    timeframe: 'D1',
    timestamp: `${dateIso}T00:00:00.000Z`,
    retrievedAt: '2026-11-18T00:00:00.000Z',
    open,
    high,
    low,
    close,
    volume,
    openInterest: 50000,
    isComplete: true,
    source: 'TEST_FIXTURE',
    status: 'HISTORICAL',
  };
}

test('historicalDataEngine: resamples D1 into W1 and Monthly (MN) OHLCV bars deterministically', () => {
  const daily: MarketCandle[] = [
    makeDailyCandle('2026-01-05', 440, 445, 438, 442, 100), // Mon Jan 5
    makeDailyCandle('2026-01-06', 442, 449, 441, 448, 200), // Tue Jan 6
    makeDailyCandle('2026-01-09', 447, 452, 444, 450, 300), // Fri Jan 9
    makeDailyCandle('2026-01-12', 451, 460, 449, 458, 400), // Mon Jan 12
    makeDailyCandle('2026-02-02', 460, 470, 455, 465, 500), // Mon Feb 2
  ];

  const { weekly, monthly } = resampleDailyToWeeklyAndMonthly(daily);
  assert.equal(weekly.length, 3);
  assert.equal(weekly[0].timestamp, '2026-01-05T00:00:00.000Z');
  assert.equal(weekly[0].open, 440);
  assert.equal(weekly[0].high, 452);
  assert.equal(weekly[0].low, 438);
  assert.equal(weekly[0].close, 450);
  assert.equal(weekly[0].volume, 600);
  assert.equal(weekly[0].barCount, 3);

  assert.equal(monthly.length, 2);
  assert.equal(monthly[0].timestamp, '2026-01-01T00:00:00.000Z');
  assert.equal(monthly[0].open, 440);
  assert.equal(monthly[0].high, 460);
  assert.equal(monthly[0].low, 438);
  assert.equal(monthly[0].close, 458);
  assert.equal(monthly[0].volume, 1000);
  assert.equal(monthly[0].barCount, 4);
  assert.equal(monthly[1].timestamp, '2026-02-01T00:00:00.000Z');
  assert.equal(monthly[1].close, 465);
});

test('historicalDataEngine: timezone validation & exchange-local date formatting', () => {
  assert.equal(isValidIanaTimezone('America/Chicago'), true);
  assert.equal(isValidIanaTimezone('Asia/Ho_Chi_Minh'), true);
  assert.equal(isValidIanaTimezone('Mars/Olympus'), false);

  // 2026-11-18T02:00:00Z is 2026-11-17 20:00 in America/Chicago (UTC-6), and 2026-11-18 09:00 in ICT
  const ts = Date.parse('2026-11-18T02:00:00.000Z');
  assert.equal(toExchangeLocalDateIso(ts, 'America/Chicago'), '2026-11-17');
  assert.equal(toExchangeLocalDateIso(ts, 'Asia/Ho_Chi_Minh'), '2026-11-18');
});

test('historicalDataEngine: price unit normalization converts compatible units and rejects invalid units', () => {
  const same = resolveUnitConversionFactor('cents/bushel', 'cents/bushel');
  assert.deepEqual(same, { ok: true, factor: 1, converted: false });

  const usdToUsx = resolveUnitConversionFactor('USD/bushel', 'cents/bushel');
  assert.deepEqual(usdToUsx, { ok: true, factor: 100, converted: true });

  const invalid = resolveUnitConversionFactor('USD/metric ton', 'cents/bushel');
  assert.equal(invalid.ok, false);

  const normalizedRes = normalizeHistoricalCandles(
    [makeDailyCandle('2026-01-05', 4.5, 4.6, 4.4, 4.55)],
    {
      exchangeTimezone: 'America/Chicago',
      sourceUnit: 'USD/bushel',
      expectedUnit: 'cents/bushel',
    }
  );
  assert.equal(normalizedRes.valid, true);
  assert.equal(normalizedRes.unitConverted, true);
  assert.equal(normalizedRes.candles[0].open, 450);
  assert.equal(normalizedRes.candles[0].close, 455);

  const rejectedRes = normalizeHistoricalCandles(
    [makeDailyCandle('2026-01-05', 450, 460, 440, 455)],
    {
      exchangeTimezone: 'America/Chicago',
      sourceUnit: 'USD/bbl',
      expectedUnit: 'cents/bushel',
    }
  );
  assert.equal(rejectedRes.valid, false);
  assert.equal(rejectedRes.status, 'INVALID');
});

test('historicalDataEngine: detects missing session gaps, duplicate timestamps, and invalid OHLC bounds', () => {
  const candles: MarketCandle[] = [
    makeDailyCandle('2026-01-05', 440, 445, 438, 442),
    makeDailyCandle('2026-01-05', 440, 446, 439, 443), // duplicate timestamp
    makeDailyCandle('2026-01-06', 443, 448, 441, 445),
    makeDailyCandle('2026-01-16', 446, 450, 444, 449), // 10-day calendar gap
  ];

  const gaps = detectDailySessionGaps(candles, 4);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].fromDate, '2026-01-06');
  assert.equal(gaps[0].toDate, '2026-01-16');

  const res = normalizeHistoricalCandles(candles, { deduplicate: true });
  assert.equal(res.valid, true);
  assert.equal(res.candles.length, 3);
  assert.equal(res.duplicatesRemoved, 1);
  assert.equal(res.missingGapCount, 1);
  assert.equal(res.candles[0].close, 443); // latest retained on dedupe

  const badOhlc = normalizeHistoricalCandles([
    makeDailyCandle('2026-01-05', 450, 440, 460, 445), // high < open/low
  ]);
  assert.equal(badOhlc.valid, false);
  assert.equal(badOhlc.status, 'INVALID');
  assert.equal(badOhlc.invalidOhlcCount, 1);
});

test('historicalDataEngine: classifies stale daily series (>7d) and audits 5Y/10Y coverage & contract separation', () => {
  const zc = INITIAL_INSTRUMENTS.find((i) => i.exchangeSymbol === 'ZC')!;
  const nowMs = Date.parse('2026-11-18T12:00:00.000Z');

  assert.equal(classifyHistoricalSeriesFreshness('2026-11-17T00:00:00.000Z', nowMs), 'HISTORICAL');
  assert.equal(classifyHistoricalSeriesFreshness('2026-11-01T00:00:00.000Z', nowMs), 'STALE');
  assert.equal(classifyHistoricalSeriesFreshness('2027-01-01T00:00:00.000Z', nowMs), 'INVALID');
  assert.equal(classifyHistoricalSeriesFreshness(null, nowMs), 'UNAVAILABLE');

  // Generate 1260 trading-day bars (~5Y)
  const bars: MarketCandle[] = [];
  let t = Date.parse('2021-11-18T00:00:00.000Z');
  while (bars.length < 1260) {
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) {
      bars.push(makeDailyCandle(new Date(t).toISOString().slice(0, 10), 450, 455, 445, 452));
    }
    t += 86_400_000;
  }

  const datasets: DatasetRecord[] = [
    {
      id: 'ds1',
      instrumentId: zc.id,
      contractCode: 'CONTINUOUS',
      timeframe: 'D1',
      continuousAdjustment: 'UNADJUSTED',
      sourceLabel: 'Test Continuous',
      sourceQuality: 'USER_PROVIDED',
      importedAt: '2026-11-18T00:00:00Z',
      rowCount: 1260,
      insertedCount: 1260,
      firstTimestamp: bars[0].timestamp,
      lastTimestamp: bars[bars.length - 1].timestamp,
      timezone: 'America/Chicago',
      dateFormat: 'ISO',
      priceUnit: 'cents/bushel',
      priceUnitDeclared: true,
      checksum: 'abc',
      importMode: 'replace',
    },
    {
      id: 'ds2',
      instrumentId: zc.id,
      contractCode: 'ZCH26',
      timeframe: 'D1',
      continuousAdjustment: 'NONE',
      sourceLabel: 'Single Contract',
      sourceQuality: 'USER_PROVIDED',
      importedAt: '2026-11-18T00:00:00Z',
      rowCount: 180,
      insertedCount: 180,
      firstTimestamp: '2025-09-01T00:00:00Z',
      lastTimestamp: '2026-03-01T00:00:00Z',
      timezone: 'America/Chicago',
      dateFormat: 'ISO',
      priceUnit: 'cents/bushel',
      priceUnitDeclared: true,
      checksum: 'def',
      importMode: 'replace',
    },
  ];

  const audit = auditHistoricalCoverage({
    instrument: zc,
    dailyCandles: bars,
    datasets,
    nowMs,
  });

  assert.equal(audit.dailyBars, 1260);
  assert.ok(audit.weeklyBars >= 250);
  assert.ok(audit.monthlyBars >= 58);
  assert.equal(audit.coverage5Y, 100);
  assert.equal(audit.coverage10Y, 50);
  assert.deepEqual(audit.seriesSeparation.individualContracts, ['ZCH26']);
  assert.equal(audit.seriesSeparation.continuousSeries[0].adjustment, 'UNADJUSTED');
  assert.equal(audit.seriesSeparation.mixedSeriesViolation, false);
  assert.match(audit.seriesSeparation.rollNotice ?? '', /UNADJUSTED/);
});
