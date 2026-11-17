import test from 'node:test';
import assert from 'node:assert/strict';
import { leapDayIndex, seasonality } from './seasonality';
import type { SeriesPoint } from './core';

const near = (a: number | null | undefined, b: number, tol = 1e-9) => {
  assert.ok(a !== null && a !== undefined && Math.abs(a - b) <= tol, `expected ${b}, got ${a}`);
};

/**
 * Constructed series: weekdays 2015-01-01 … 2021-12-31 (7 years). Price is constant within each
 * calendar month, so each monthly return is exactly the designed return:
 *   Jan +10%, Feb −5%, Mar +1% in even years / −1% in odd years, month m (4..12) +m/100.
 */
function monthReturn(y: number, m: number): number {
  if (m === 1) return 0.1;
  if (m === 2) return -0.05;
  if (m === 3) return y % 2 === 0 ? 0.01 : -0.01;
  return m / 100;
}
function build(fromYear: number, toYear: number): { series: SeriesPoint[]; level: Map<string, number> } {
  const level = new Map<string, number>();
  let p = 100;
  for (let y = fromYear; y <= toYear; y++) {
    for (let m = 1; m <= 12; m++) {
      if (!(y === fromYear && m === 1)) p *= 1 + monthReturn(y, m);
      level.set(`${y}-${m}`, p);
    }
  }
  const series: SeriesPoint[] = [];
  for (let t = Date.UTC(fromYear, 0, 1); t <= Date.UTC(toYear, 11, 31); t += 86_400_000) {
    const d = new Date(t);
    const wd = d.getUTCDay();
    if (wd === 0 || wd === 6) continue;
    series.push({ t: d.toISOString(), v: level.get(`${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`) as number });
  }
  return { series, level };
}

const { series } = build(2015, 2021);

test('monthly statistics on constructed multi-year series', () => {
  const r = seasonality(series);
  assert.equal(r.status, 'OK', r.reason);
  assert.equal(r.yearsCovered, 7);
  const jan = r.months[0];
  assert.equal(jan.count, 6); // Jan 2015 has no prior month
  near(jan.mean, 0.1, 1e-12);
  near(jan.median, 0.1, 1e-12);
  assert.equal(jan.pctPositive, 1);
  const feb = r.months[1];
  assert.equal(feb.count, 7);
  near(feb.mean, -0.05, 1e-12);
  assert.equal(feb.pctPositive, 0);
  const mar = r.months[2];
  assert.equal(mar.count, 7);
  near(mar.mean, (3 * 0.01 - 4 * 0.01) / 7, 1e-12); // even years 2016/18/20 up, 2015/17/19/21 down
  near(mar.median, -0.01, 1e-12);
  near(mar.pctPositive, 3 / 7, 1e-12);
  near(mar.min, -0.01, 1e-12);
  near(mar.max, 0.01, 1e-12);
  assert.deepEqual(
    mar.samples.map((s) => s.year),
    [2015, 2016, 2017, 2018, 2019, 2020, 2021]
  );
  for (let m = 4; m <= 11; m++) {
    assert.equal(r.months[m - 1].count, 7);
    near(r.months[m - 1].mean, m / 100, 1e-12);
  }
  // Final month (Dec 2021) excluded as potentially partial → 6 samples
  assert.equal(r.months[11].count, 6);
  assert.ok(r.warnings.some((w) => /final calendar month excluded/.test(w)));
  const inc = seasonality(series, { includeFinalMonth: true });
  assert.equal(inc.months[11].count, 7);
  // per-year sample counts
  assert.deepEqual(
    r.years.map((y) => [y.year, y.monthlyReturns, y.includedInPath]),
    [
      [2015, 11, true],
      [2016, 12, true],
      [2017, 12, true],
      [2018, 12, true],
      [2019, 12, true],
      [2020, 12, true],
      [2021, 11, true],
    ]
  );
});

test('average day-of-year path normalized to 100 at first observation of the year', () => {
  const r = seasonality(series);
  const isWeekday = (y: number, m: number, d: number) => {
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return wd !== 0 && wd !== 6;
  };
  const years = [2015, 2016, 2017, 2018, 2019, 2020, 2021];
  // Feb 16: level relative to January = 1 − 5% in every year (Jan 2015 base = Jan level too)
  const feb = r.path[leapDayIndex(2, 16) - 1];
  assert.equal(feb.monthDay, '02-16');
  assert.equal(feb.count, years.filter((y) => isWeekday(y, 2, 16)).length);
  near(feb.mean, 95, 1e-9);
  // Jun 15: 100·0.95·(1 ± 1%)·1.04·1.05·1.06, averaged over years where Jun 15 is a weekday
  const jun = r.path[leapDayIndex(6, 15) - 1];
  const contrib = years.filter((y) => isWeekday(y, 6, 15));
  const expected = contrib.map((y) => 100 * 0.95 * (y % 2 === 0 ? 1.01 : 0.99) * 1.04 * 1.05 * 1.06);
  assert.equal(jun.count, contrib.length);
  near(jun.mean, expected.reduce((s, x) => s + x, 0) / expected.length, 1e-9);
  // Feb 29 index exists only in leap years (2016, 2020); 2016-02-29 Mon, 2020-02-29 Sat
  const f29 = r.path[59];
  assert.equal(f29.monthDay, '02-29');
  assert.equal(f29.count, 1);
  // carryForward explicitly fills non-trading days within each year → all 7 years on Jun 15
  const cf = seasonality(series, { pathFill: 'carryForward' });
  const junCf = cf.path[leapDayIndex(6, 15) - 1];
  assert.equal(junCf.count, 7);
  const all = years.map((y) => 100 * 0.95 * (y % 2 === 0 ? 1.01 : 0.99) * 1.04 * 1.05 * 1.06);
  near(junCf.mean, all.reduce((s, x) => s + x, 0) / 7, 1e-9);
});

test('leap-calendar day index', () => {
  assert.equal(leapDayIndex(1, 1), 1);
  assert.equal(leapDayIndex(2, 29), 60);
  assert.equal(leapDayIndex(3, 1), 61);
  assert.equal(leapDayIndex(12, 31), 366);
});

test('INSUFFICIENT_DATA when fewer than minYears', () => {
  const short = build(2019, 2021).series;
  const r = seasonality(short);
  assert.equal(r.status, 'INSUFFICIENT_DATA');
  assert.equal(r.yearsCovered, 3);
  assert.equal(seasonality(short, { minYears: 3 }).status, 'OK');
  assert.equal(seasonality(series, { minYears: 8 }).status, 'INSUFFICIENT_DATA');
});

test('missing month is skipped, not filled', () => {
  const holed = series.filter((p) => !p.t.startsWith('2018-05'));
  const r = seasonality(holed);
  assert.equal(r.status, 'OK');
  assert.equal(r.months[4].count, 6); // May 2018 has no data
  assert.equal(r.months[5].count, 6); // June 2018 has no prior month → skipped
  assert.ok(r.warnings.some((w) => /skipped/.test(w)));
});

test('seasonality failure modes: intraday duplicates, unsorted, non-positive', () => {
  const intraday = [
    { t: '2020-01-02T10:00:00Z', v: 1 },
    { t: '2020-01-02T15:00:00Z', v: 2 },
  ];
  assert.equal(seasonality(intraday).status, 'INVALID_INPUT');
  assert.equal(seasonality([...series].reverse()).status, 'INVALID_INPUT');
  assert.equal(seasonality([{ t: '2020-01-02', v: 0 }, { t: '2020-01-03', v: 1 }]).status, 'INVALID_INPUT');
  assert.equal(seasonality(series, { minYears: 0 }).status, 'INVALID_INPUT');
});
