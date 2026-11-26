import test from 'node:test';
import assert from 'node:assert/strict';
import { countTrendDirections, matchesTrendFilter, resolveInstrumentTrend } from './trendDirection';
import type { ScorecardDimension } from '../types/scorecard';

function makeTrendDim(
  level: ScorecardDimension['level'],
  status: ScorecardDimension['status'] = 'OK',
  vi = 'Tăng',
  en = 'Uptrend'
): ScorecardDimension {
  return {
    id: 'trend',
    status,
    level,
    label: { vi, en },
    score: 70,
    metrics: [],
    explanation: { vi: '', en: '' },
    source: 'test',
    asOf: null,
  };
}

test('resolveInstrumentTrend maps scorecard UP and STRONG_UP to up', () => {
  const up = resolveInstrumentTrend({
    scorecard: { dimensions: [makeTrendDim('UP', 'OK', 'Xu hướng tăng', 'Uptrend')], price: { value: 100, status: 'STALE', source: 'x', sourceQuality: null, asOf: null, changePct: -0.02, note: null } },
    returns: { m1: -5, w1: -1 },
  });
  assert.equal(up.direction, 'up');
  assert.equal(up.source, 'scorecard');
  assert.equal(up.labelEn, 'Uptrend');

  const strongUp = resolveInstrumentTrend({
    scorecard: { dimensions: [makeTrendDim('STRONG_UP', 'OK', 'Tăng mạnh', 'Strong uptrend')], price: { value: 100, status: 'STALE', source: 'x', sourceQuality: null, asOf: null, changePct: null, note: null } },
  });
  assert.equal(strongUp.direction, 'up');
  assert.equal(strongUp.level, 'STRONG_UP');
});

test('resolveInstrumentTrend maps scorecard DOWN, STRONG_DOWN, and SIDEWAYS', () => {
  const down = resolveInstrumentTrend({
    scorecard: { dimensions: [makeTrendDim('STRONG_DOWN', 'OK', 'Giảm mạnh', 'Strong downtrend')], price: { value: 100, status: 'STALE', source: 'x', sourceQuality: null, asOf: null, changePct: 0.01, note: null } },
  });
  assert.equal(down.direction, 'down');
  assert.equal(down.level, 'STRONG_DOWN');

  const flat = resolveInstrumentTrend({
    scorecard: { dimensions: [makeTrendDim('SIDEWAYS', 'OK', 'Đi ngang', 'Sideways')], price: { value: 100, status: 'STALE', source: 'x', sourceQuality: null, asOf: null, changePct: null, note: null } },
  });
  assert.equal(flat.direction, 'flat');
  assert.equal(flat.level, 'SIDEWAYS');
});

test('resolveInstrumentTrend falls back to 1M return when scorecard trend is unavailable', () => {
  const upFromM1 = resolveInstrumentTrend({
    scorecard: { dimensions: [makeTrendDim(null, 'UNAVAILABLE')], price: { value: 100, status: 'STALE', source: 'x', sourceQuality: null, asOf: null, changePct: null, note: null } },
    returns: { m1: 3.5, w1: 1.0 },
  });
  assert.equal(upFromM1.direction, 'up');
  assert.equal(upFromM1.source, 'returns');

  const downFromM1 = resolveInstrumentTrend({
    returns: { m1: -2.1, w1: 0.2 },
  });
  assert.equal(downFromM1.direction, 'down');
  assert.equal(downFromM1.source, 'returns');

  const flatFromM1 = resolveInstrumentTrend({
    returns: { m1: 0.05, w1: 0 },
  });
  assert.equal(flatFromM1.direction, 'flat');
});

test('resolveInstrumentTrend falls back to changePct and returns unavailable when no data exists', () => {
  const fromChange = resolveInstrumentTrend({ changePct: -0.015 });
  assert.equal(fromChange.direction, 'down');
  assert.equal(fromChange.source, 'change');

  const none = resolveInstrumentTrend({});
  assert.equal(none.direction, 'unavailable');
  assert.equal(none.source, 'none');
});

test('matchesTrendFilter and countTrendDirections filter and count bullish, bearish, and flat items', () => {
  assert.equal(matchesTrendFilter('up', 'ALL'), true);
  assert.equal(matchesTrendFilter('down', 'ALL'), true);
  assert.equal(matchesTrendFilter('unavailable', 'ALL'), true);
  assert.equal(matchesTrendFilter('up', 'up'), true);
  assert.equal(matchesTrendFilter('down', 'up'), false);
  assert.equal(matchesTrendFilter('down', 'down'), true);
  assert.equal(matchesTrendFilter('flat', 'flat'), true);
  assert.equal(matchesTrendFilter('unavailable', 'down'), false);

  const counts = countTrendDirections(['up', 'up', 'down', 'flat', 'unavailable']);
  assert.deepEqual(counts, { all: 5, up: 2, down: 1, flat: 1 });
});
