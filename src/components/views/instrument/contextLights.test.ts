import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cotLight, daysUntil, fundamentalLight, seasonalLight, trendLight, upcomingWarningDays } from './contextLights';

const tf = (d: 'UP' | 'DOWN' | 'SIDEWAYS' | 'UNAVAILABLE', available = true) => ({ available, trendDirection: d });

test('trend: agreement, disagreement, partial and missing', () => {
  assert.equal(trendLight(tf('UP'), tf('UP')).tone, 'green');
  assert.equal(trendLight(tf('DOWN'), tf('DOWN')).tone, 'red');
  assert.equal(trendLight(tf('UP'), tf('DOWN')).msg, 'mixed');
  assert.equal(trendLight(tf('UP'), tf('DOWN')).tone, 'yellow');
  assert.equal(trendLight(tf('SIDEWAYS'), tf('SIDEWAYS')).tone, 'yellow');
  assert.equal(trendLight(tf('UP'), tf('UNAVAILABLE', false)).msg, 'onlyDailyUp');
  assert.equal(trendLight(tf('UNAVAILABLE', false), tf('DOWN')).msg, 'onlyWeeklyDown');
  assert.equal(trendLight(tf('UNAVAILABLE', false), null).tone, 'grey');
});

test('fundamental: bias, matrix fallback, missing', () => {
  assert.equal(fundamentalLight({ bias: 'TIGHTENING' }).tone, 'green');
  assert.equal(fundamentalLight({ bias: 'SURPLUS_PRESSURE' }).tone, 'red');
  assert.equal(fundamentalLight({ bias: 'BALANCED' }).tone, 'yellow');
  assert.equal(fundamentalLight({ bias: 'DATA_UNAVAILABLE', matrix: [{ impact: 'BULLISH', state: 'OK', asOf: '2026-10' }] }).tone, 'green');
  assert.equal(
    fundamentalLight({ bias: 'DATA_UNAVAILABLE', matrix: [{ impact: 'BULLISH', state: 'OK' }, { impact: 'BEARISH', state: 'OK' }] }).tone,
    'yellow',
  );
  assert.equal(fundamentalLight({ bias: 'DATA_UNAVAILABLE', matrix: [{ impact: 'BULLISH', state: 'NEEDS_KEY' }] }).tone, 'grey');
  assert.equal(fundamentalLight(null).tone, 'grey');
});

test('seasonal: consistent up/down, mixed, few samples, missing', () => {
  const base = { status: 'OK' as const, month: 11, years: 10, mean: 2.1, hitUp: 7 };
  assert.equal(seasonalLight(base).tone, 'green');
  assert.equal(seasonalLight({ ...base, mean: -1.5, hitUp: 3 }).tone, 'red');
  assert.equal(seasonalLight({ ...base, hitUp: 5 }).tone, 'yellow');
  assert.equal(seasonalLight({ ...base, years: 3, hitUp: 3 }).tone, 'grey');
  assert.equal(seasonalLight({ ...base, years: 3, hitUp: 3 }).msg, 'few');
  assert.equal(seasonalLight({ ...base, status: 'UNAVAILABLE' }).msg, 'none');
  assert.equal(seasonalLight(null).tone, 'grey');
  assert.equal(seasonalLight(base).params.hit, 70);
});

test('cot: extremes, lean, balanced, missing', () => {
  const c = (cotIndex: number | null, available = true) => cotLight({ available, cotIndex, reportDate: '2026-11-17' });
  assert.equal(c(95).msg, 'extremeLong');
  assert.equal(c(95).tone, 'yellow');
  assert.equal(c(5).msg, 'extremeShort');
  assert.equal(c(80).msg, 'lean');
  assert.equal(c(50).tone, 'green');
  assert.equal(c(null).tone, 'grey');
  assert.equal(c(50, false).tone, 'grey');
  assert.equal(cotLight(null).tone, 'grey');
  assert.equal(c(50).asOf, '2026-11-17');
});

test('event warning window', () => {
  const now = new Date('2026-11-21T10:00:00Z');
  assert.equal(daysUntil('2026-11-23', now), 2);
  assert.equal(upcomingWarningDays('2026-11-23', now), 2);
  assert.equal(upcomingWarningDays('2026-11-21', now), 0);
  assert.equal(upcomingWarningDays('2026-11-25', now), null);
  assert.equal(upcomingWarningDays('2026-11-20', now), null);
  assert.equal(upcomingWarningDays(null, now), null);
  assert.equal(upcomingWarningDays('garbage', now), null);
});
