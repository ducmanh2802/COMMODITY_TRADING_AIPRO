import test from 'node:test';
import assert from 'node:assert/strict';
import { binomTailHalf, scanWindows, seasonalWindow } from './seasonalWindow';
import type { SeriesPoint } from './core';

const DAY = 86_400_000;

function weekdays(from: string, to: string, price: (d: Date) => number, skip: (d: Date) => boolean = () => false): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (let ms = Date.parse(from); ms <= Date.parse(to); ms += DAY) {
    const d = new Date(ms);
    const wd = d.getUTCDay();
    if (wd === 0 || wd === 6 || skip(d)) continue;
    out.push({ t: d.toISOString(), v: price(d) });
  }
  return out;
}

// Level 100 through March; from April it is 110 (up) or 95 (down, years divisible by 3).
const level = (d: Date) => (d.getUTCMonth() < 3 ? 100 : d.getUTCFullYear() % 3 === 0 ? 95 : 110);

test('entry = first bar on/after, exit = last bar on/before (weekend dates)', () => {
  // price = days since 2015-01-01 + 100, so each bar's date is identifiable from its close.
  const s = weekdays('2015-01-01', '2017-12-31', (d) => 100 + (d.getTime() - Date.parse('2015-01-01')) / DAY);
  // 2016-01-03 is a Sunday, 2016-02-06 a Saturday.
  const r = seasonalWindow(s, { month: 1, day: 3 }, { month: 2, day: 6 });
  const y = r.years.find((x) => x.year === 2016);
  assert.ok(y);
  assert.equal(y.entryDate, '2016-01-04');
  assert.equal(y.exitDate, '2016-02-05');
  assert.equal(y.entryClose, 100 + (Date.parse('2016-01-04') - Date.parse('2015-01-01')) / DAY);
  assert.equal(y.exitClose, 100 + (Date.parse('2016-02-05') - Date.parse('2015-01-01')) / DAY);
});

test('win rate, median, mean, worst on designed series', () => {
  const s = weekdays('2015-01-01', '2024-12-31', (d) => level(d));
  const r = seasonalWindow(s, { month: 3, day: 1 }, { month: 4, day: 30 });
  assert.equal(r.status, 'OK');
  assert.equal(r.n, 10);
  assert.equal(r.skippedYears.length, 0);
  assert.equal(r.winRate, 0.7);
  assert.ok(Math.abs((r.median as number) - 0.1) < 1e-12);
  assert.ok(Math.abs((r.mean as number) - (7 * 0.1 + 3 * (95 / 100 - 1)) / 10) < 1e-12);
  assert.equal((r.worst?.year ?? 1) % 3, 0);
  assert.ok(Math.abs((r.worst?.ret as number) + 0.05) < 1e-12);
});

test('years with missing data are excluded and counted', () => {
  const s = weekdays('2015-01-01', '2024-12-31', level, (d) => d.getUTCFullYear() === 2018 && d.getUTCMonth() >= 3 && d.getUTCMonth() <= 5);
  const r = seasonalWindow(s, { month: 3, day: 1 }, { month: 4, day: 30 });
  assert.deepEqual(r.skippedYears, [2018]);
  assert.equal(r.n, 9);
  assert.ok(!r.years.some((y) => y.year === 2018));
});

test('window crossing year end uses next year exit; last incomplete year skipped', () => {
  const s = weekdays('2015-01-01', '2020-06-30', level);
  const r = seasonalWindow(s, { month: 11, day: 1 }, { month: 1, day: 31 });
  assert.deepEqual(r.years.map((y) => y.year), [2015, 2016, 2017, 2018, 2019]);
  assert.ok(r.skippedYears.includes(2020));
  assert.equal(r.years[0].exitDate.slice(0, 4), '2016');
});

test('invalid input fails closed', () => {
  assert.equal(seasonalWindow([], { month: 13, day: 1 }, { month: 2, day: 1 }).status, 'INVALID_INPUT');
  assert.equal(seasonalWindow([{ t: '2020-01-01', v: -1 }, { t: '2020-01-02', v: 1 }], { month: 1, day: 1 }, { month: 2, day: 1 }).status, 'INVALID_INPUT');
});

test('binomTailHalf', () => {
  assert.ok(Math.abs(binomTailHalf(10, 8) - 56 / 1024) < 1e-12);
  assert.equal(binomTailHalf(10, 0), 1);
  assert.equal(binomTailHalf(10, 11), 0);
});

test('scanWindows is deterministic and counts windows', () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  let p = 100;
  const s = weekdays('2000-01-01', '2019-12-31', () => (p *= 1 + (rnd() - 0.5) * 0.02));
  const a = scanWindows(s, { lengthDays: 30 });
  const b = scanWindows(s, { lengthDays: 30 });
  assert.deepEqual(a, b);
  assert.equal(a.status, 'OK');
  assert.equal(a.windows, 53);
  assert.ok(a.evaluated > 40 && a.evaluated <= a.windows);
  assert.ok(a.great <= a.evaluated);
  assert.ok(a.expectedByChance > 0 && a.expectedByChance < a.evaluated);
  assert.ok(a.best && (a.best.stats.winRate as number) >= 0.5);
});

test('scanWindows on constant-up pattern flags every window great', () => {
  const s = weekdays('2010-01-01', '2020-12-31', (d) => 100 + (d.getTime() - Date.parse('2010-01-01')) / DAY);
  const r = scanWindows(s, { lengthDays: 30 });
  assert.equal(r.great, r.evaluated);
});
