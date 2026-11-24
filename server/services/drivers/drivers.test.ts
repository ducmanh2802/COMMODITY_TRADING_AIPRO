import assert from 'node:assert/strict';
import test from 'node:test';
import type { DatedValue } from '../marketPulse/math.ts';
import { addDays, decompose, empiricalCone, flagEventDays, ols, parametricCone, quantile, realizedSigma, Z80 } from './math.ts';
import { FORBIDDEN_WORDS, DRIVERS_DISCLAIMER, attributionSentence, coneSentence, roundShare } from './text.ts';
import { computeDrivers, computeSeasonality, isWasdeInstrument } from './service.ts';

// Deterministic pseudo-random (LCG) so tests are offline and stable.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296 - 0.5;
  };
}
const bizDates = (n: number, start = '2024-01-01'): string[] => {
  const out: string[] = [];
  let d = start;
  while (out.length < n) {
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(d);
    d = addDays(d, 1);
  }
  return out;
};
const build = (dates: string[], rets: number[], start = 100): DatedValue[] => {
  let p = start;
  return dates.map((date, i) => ({ date, value: (p = i === 0 ? start : p * Math.exp(rets[i])) }));
};

test('ols recovers known betas and R² on noiseless data', () => {
  const r = rng(1);
  const X = Array.from({ length: 200 }, () => [r(), r()]);
  const y = X.map(([a, b]) => 0.5 + 2 * a - 3 * b);
  const f = ols(X, y)!;
  assert.ok(Math.abs(f.coef[0] - 0.5) < 1e-9 && Math.abs(f.coef[1] - 2) < 1e-9 && Math.abs(f.coef[2] + 3) < 1e-9);
  assert.ok(f.r2 > 0.999999);
});

test('decompose: contributions + residual sum to total; group factor explains most when it drives the series', () => {
  const n = 320;
  const dates = bizDates(n);
  const r = rng(7);
  const g = Array.from({ length: n }, () => r() * 0.02);
  const own = Array.from({ length: n }, () => r() * 0.002);
  const peers = [build(dates, g), build(dates, g.map((x, i) => x + own[i] * 0.1))];
  const target = build(dates, g.map((x, i) => x + own[i]));
  const usd = build(dates, Array.from({ length: n }, () => r() * 0.004), 120);
  const y10 = build(dates, Array.from({ length: n }, () => r() * 0.01), 4);
  const d = decompose({ target, peers, usd, y10 })!;
  assert.ok(d.r2 > 0.9);
  assert.deepEqual(d.used, ['group', 'usd', 'rates']);
  for (const h of d.horizons) {
    const sum = h.parts.reduce((s, p) => s + p.pct, 0);
    assert.ok(Math.abs(sum - h.totalPct) < 1e-6, `h${h.days} ${sum} vs ${h.totalPct}`);
  }
  const h20 = d.horizons.find((h) => h.days === 20)!;
  const grp = h20.parts.find((p) => p.id === 'group')!;
  assert.ok(grp.beta! > 0.8 && grp.beta! < 1.2);
  assert.ok(Math.abs(grp.pct) > Math.abs(h20.parts.find((p) => p.id === 'own')!.pct));
});

test('decompose returns null on short history or no factors', () => {
  const dates = bizDates(60);
  const t = build(dates, dates.map(() => 0.001));
  assert.equal(decompose({ target: t, peers: [t], usd: null, y10: null }), null);
  assert.equal(decompose({ target: t, peers: [], usd: null, y10: null }), null);
});

test('quantile, parametric and empirical cone', () => {
  assert.equal(quantile([1, 2, 3, 4, 5], 0.5), 3);
  assert.equal(quantile([0, 10], 0.25), 2.5);
  const c = parametricCone(100, 0.01, 4); // sigma_h = 0.02
  assert.ok(Math.abs(c.b80.hi - 100 * Math.exp(Z80 * 0.02)) < 1e-9);
  assert.ok(Math.abs(c.b80.lo - 100 * Math.exp(-Z80 * 0.02)) < 1e-9);
  assert.ok(c.b50.hi < c.b80.hi && c.b50.lo > c.b80.lo);
  assert.ok(Math.abs(c.b80.hiPct - (c.b80.hi / 100 - 1) * 100) < 1e-9);
  // Empirical: needs >= 250 samples
  assert.equal(empiricalCone(Array.from({ length: 100 }, (_, i) => 100 + i), 100, 5), null);
  const closes = Array.from({ length: 400 }, (_, i) => 100 * (1 + 0.001 * (i % 7)));
  const e = empiricalCone(closes, 100, 5)!;
  assert.equal(e.n, 395);
  assert.ok(e.b80.lo <= e.b50.lo && e.b50.hi <= e.b80.hi);
  const sg = realizedSigma(Array.from({ length: 80 }, (_, i) => 100 * Math.exp(0.01 * (i % 2 ? 1 : -1) * 1)), 60)!;
  assert.ok(sg > 0.015 && sg < 0.025);
  assert.equal(realizedSigma([1, 2, 3], 60), null);
});

test('event day flags: WASDE (agri), EIA Wednesdays (energy), COT Fridays', () => {
  // 2026-11-18 Wed, 2026-11-20 Fri
  const dates = ['2026-11-18', '2026-11-19', '2026-11-20'];
  const agri = flagEventDays(dates, 'AGRICULTURE', new Set(['2026-11-19']), true).map((e) => e.kind);
  assert.deepEqual(agri, ['WASDE', 'COT']);
  const en = flagEventDays(dates, 'ENERGY', new Set(['2026-11-19']), true).map((e) => e.kind);
  assert.deepEqual(en, ['EIA', 'COT']);
  assert.deepEqual(flagEventDays(dates, 'METALS', new Set(), false), []);
});

test('seasonality hit rate needs >= 5 years', () => {
  const mk = (years: number): DatedValue[] => {
    const out: DatedValue[] = [];
    const start = 2026 - years;
    for (let y = start; y <= 2026; y++)
      for (let m = 1; m <= 12; m++) {
        if (y === 2026 && m > 10) break;
        // March always up 5%, December alternates, otherwise flat-ish
        const base = 100 + (y - start) * 10 + m;
        const bump = m === 3 ? 5 : m === 12 ? (y % 2 ? 4 : -4) : 0;
        out.push({ date: `${y}-${String(m).padStart(2, '0')}-15`, value: base + bump + (m >= 4 ? 5 : 0) });
      }
    return out;
  };
  const few = computeSeasonality(mk(3), '2026-02-10', 'test');
  assert.equal(few.status, 'UNAVAILABLE');
  assert.equal(few.month, 3);
  const ok = computeSeasonality(mk(9), '2026-11-10', 'test');
  assert.equal(ok.month, 12);
  if (ok.status === 'OK') {
    assert.ok(ok.years >= 5);
    assert.equal(ok.hitText!.vi, `tăng ${ok.hitUp}/${ok.years} năm`);
    assert.equal(ok.samples.filter((s) => s.ret > 0).length, ok.hitUp);
    assert.ok(ok.min! <= ok.mean! && ok.mean! <= ok.max!);
  }
  assert.equal(computeSeasonality([], null, null).status, 'UNAVAILABLE');
});

test('wording: example sentence, cone sentence, no recommendation words', () => {
  const s = attributionSentence({
    name: 'Ngô',
    category: 'AGRICULTURE',
    days: 1,
    endsToday: true,
    endDate: '2026-11-20',
    totalPct: -1.2,
    parts: [
      { id: 'group', pct: -0.8, share: 0.667 },
      { id: 'usd', pct: -0.1, share: 0.08 },
      { id: 'rates', pct: 0, share: 0 },
      { id: 'own', pct: -0.3, share: 0.25 },
    ],
    events: [{ date: '2026-11-20', kind: 'WASDE', label: { vi: 'báo cáo WASDE', en: 'WASDE report' } }],
  });
  assert.equal(s.vi, 'Hôm nay Ngô giảm 1,2%: khoảng 65% đi cùng cả nhóm nông sản; trong kỳ có báo cáo WASDE.');
  assert.equal(roundShare(0.667), 65);
  const c = coneSentence(5, { lo: 410.5, hi: 455, loPct: -4, hiPct: 5 });
  assert.match(c.vi, /khoảng 80% trường hợp giá sau 1 tuần nằm trong 410,50–455,00\. Đây không phải dự báo\.$/);
  assert.match(c.en, /not a forecast/);
  for (const x of [s, c]) {
    assert.doesNotMatch(x.vi, FORBIDDEN_WORDS);
    assert.doesNotMatch(x.en, FORBIDDEN_WORDS);
  }
  assert.match(DRIVERS_DISCLAIMER.vi, /không phải khuyến nghị/);
});

test('computeDrivers end-to-end offline: all sections, no forbidden words in generated text', () => {
  const n = 800;
  const dates = bizDates(n, '2022-06-01');
  const r = rng(3);
  const rets = Array.from({ length: n }, () => r() * 0.02);
  const series = build(dates, rets);
  const peer = build(dates, rets.map((x) => x * 0.9));
  const usd = build(dates, Array.from({ length: n }, () => r() * 0.004), 120);
  const y10 = build(dates, Array.from({ length: n }, () => r() * 0.01), 4);
  const last = dates[n - 1];
  const out = computeDrivers({
    inst: { id: 'ZC', exchangeSymbol: 'ZC', productName: 'Ngô', category: 'AGRICULTURE', exchange: 'CBOT' },
    series,
    source: 'test',
    peers: [peer],
    usd,
    y10,
    wasde: { status: 'OFFICIAL', releases: [{ releasedAtRaw: last, releasedAt: `${last}T12:00:00Z`, title: 'WASDE', files: [] }], upcoming: [{ releasedAtRaw: 'x', releasedAt: `${addDays(last, 3)}T12:00:00Z`, title: 'WASDE', files: [] }], keyNumbers: [], calendarSourceUrl: '', fetchedAt: '' } as never,
    now: new Date(`${last}T20:00:00Z`),
  });
  assert.equal(out.attribution.status, 'OK');
  assert.equal(out.attribution.horizons.length, 3);
  assert.ok(out.attribution.horizons[0].events.some((e) => e.kind === 'WASDE'));
  assert.equal(out.scenarios.status, 'OK');
  assert.equal(out.scenarios.horizons.length, 2);
  assert.ok(out.scenarios.horizons.every((h) => h.parametric && h.empirical));
  assert.equal(out.scenarios.path.length, 22);
  assert.ok(out.events.upcoming.some((e) => e.kind === 'WASDE' && e.scheduled === 'official'));
  assert.ok(out.events.upcoming.some((e) => e.kind === 'COT'));
  assert.equal(out.events.wasdeKnown, true);
  assert.ok(out.seasonality.status === 'OK' || out.seasonality.status === 'UNAVAILABLE');
  const texts = [
    ...out.attribution.horizons.map((h) => h.sentence),
    ...out.scenarios.horizons.map((h) => h.sentence!),
    ...out.events.notes,
    out.attribution.note,
  ];
  for (const x of texts) {
    assert.doesNotMatch(x.vi, FORBIDDEN_WORDS);
    assert.doesNotMatch(x.en, FORBIDDEN_WORDS);
  }
  // Thin history -> UNAVAILABLE, never invented
  const thin = computeDrivers({ inst: { id: 'ZC', exchangeSymbol: 'ZC', productName: 'Ngô', category: 'AGRICULTURE', exchange: 'CBOT' }, series: series.slice(0, 10), source: null, peers: [], usd: null, y10: null, wasde: null, now: new Date() });
  assert.equal(thin.attribution.status, 'UNAVAILABLE');
  assert.equal(thin.scenarios.status, 'UNAVAILABLE');
  assert.equal(thin.seasonality.status, 'UNAVAILABLE');
  assert.equal(thin.events.wasdeKnown, false);
});

test('WASDE events: CT/SB softs included, coffee excluded; failed ESMIS fetch -> wasdeKnown false', () => {
  assert.equal(isWasdeInstrument({ category: 'AGRICULTURE', exchangeSymbol: 'ZC' }), true);
  assert.equal(isWasdeInstrument({ category: 'SOFT_COMMODITIES', exchangeSymbol: 'CT' }), true);
  assert.equal(isWasdeInstrument({ category: 'SOFT_COMMODITIES', exchangeSymbol: 'SB' }), true);
  assert.equal(isWasdeInstrument({ category: 'SOFT_COMMODITIES', exchangeSymbol: 'KC' }), false);
  assert.equal(isWasdeInstrument({ category: 'ENERGY', exchangeSymbol: 'CL' }), false);
  const day = '2026-11-25';
  const wasde = { status: 'OFFICIAL', releases: [], upcoming: [{ releasedAtRaw: 'x', releasedAt: `${addDays(day, 2)}T12:00:00Z`, title: 'WASDE', files: [] }], keyNumbers: [], calendarSourceUrl: '', fetchedAt: '' } as never;
  const base = { series: [], source: null, peers: [], usd: null, y10: null, now: new Date(`${day}T08:00:00Z`) };
  const ct = computeDrivers({ ...base, inst: { id: 'CT', exchangeSymbol: 'CT', productName: 'Bông', category: 'SOFT_COMMODITIES', exchange: 'ICE' }, wasde });
  assert.ok(ct.events.upcoming.some((e) => e.kind === 'WASDE'));
  assert.equal(ct.events.wasdeKnown, true);
  const kc = computeDrivers({ ...base, inst: { id: 'KC', exchangeSymbol: 'KC', productName: 'Cà phê', category: 'SOFT_COMMODITIES', exchange: 'ICE' }, wasde });
  assert.ok(!kc.events.upcoming.some((e) => e.kind === 'WASDE'));
  // ESMIS unavailable: status OK, upcoming has no WASDE rows, but wasdeKnown false so clients estimate.
  const sb = computeDrivers({ ...base, inst: { id: 'SB', exchangeSymbol: 'SB', productName: 'Đường', category: 'SOFT_COMMODITIES', exchange: 'ICE' }, wasde: null });
  assert.equal(sb.events.status, 'OK');
  assert.equal(sb.events.wasdeKnown, false);
  assert.ok(!sb.events.upcoming.some((e) => e.kind === 'WASDE'));
});
