import test from 'node:test';
import assert from 'node:assert/strict';
import { averageDaily, buildClimatology, computeFlags, computeNext14d, type RawDaily } from './logic.ts';
import { WeatherService, type WeatherStore } from './service.ts';
import { WEATHER_REGIONS } from './regions.ts';

/** Constant-weather archive for 2015-2024: 5 mm/day, tmax 30, tmin 20. */
function archive(): RawDaily {
  const time: string[] = [];
  for (let t = Date.UTC(2015, 0, 1); t <= Date.UTC(2024, 11, 31); t += 86_400_000) time.push(new Date(t).toISOString().slice(0, 10));
  return {
    time,
    precipitation_sum: time.map(() => 5),
    temperature_2m_max: time.map(() => 30),
    temperature_2m_min: time.map(() => 20),
  };
}

function forecast(precip: number, tmax: number, tmin: number, start = '2026-11-21'): RawDaily {
  const time = Array.from({ length: 16 }, (_, i) => new Date(Date.parse(start) + i * 86_400_000).toISOString().slice(0, 10));
  return {
    time,
    precipitation_sum: time.map(() => precip),
    temperature_2m_max: time.map(() => tmax),
    temperature_2m_min: time.map(() => tmin),
  };
}

test('climatology is constant for constant archive and covers Feb 29', () => {
  const c = buildClimatology(archive());
  assert.equal(Object.keys(c).length, 366);
  assert.equal(c['11-21'].p, 5);
  assert.equal(c['02-29'].tx, 30);
});

test('dry forecast -> KHÔ_HẠN with -60%', () => {
  const clim = buildClimatology(archive());
  const daily = averageDaily([forecast(2, 31, 20)], 14);
  const n = computeNext14d(daily, [clim]);
  assert.ok(n);
  assert.equal(n.precipNormalMm, 70);
  assert.equal(n.precipMm, 28);
  assert.equal(n.precipAnomalyPct, -60);
  assert.deepEqual(computeFlags(n, {}), ['KHÔ_HẠN']);
});

test('wet + hot forecast flags MƯA_NHIỀU and NẮNG_NÓNG', () => {
  const clim = buildClimatology(archive());
  const n = computeNext14d(averageDaily([forecast(10, 34, 22)], 14), [clim]);
  assert.ok(n);
  assert.equal(n.precipAnomalyPct, 100);
  assert.equal(n.tmaxAnomalyC, 4);
  assert.deepEqual(computeFlags(n, {}), ['MƯA_NHIỀU', 'NẮNG_NÓNG']);
});

test('frost flag only when frostWatch and tmin <= 3', () => {
  const clim = buildClimatology(archive());
  const n = computeNext14d(averageDaily([forecast(5, 30, 2)], 14), [clim]);
  assert.ok(n);
  assert.deepEqual(computeFlags(n, { frostWatch: true }), ['SƯƠNG_GIÁ_RISK']);
  assert.deepEqual(computeFlags(n, {}), []);
  const warm = computeNext14d(averageDaily([forecast(5, 30, 4)], 14), [clim]);
  assert.deepEqual(computeFlags(warm!, { frostWatch: true }), []);
});

test('tiny normal (dry season) yields null percent and no dry flag', () => {
  const raw = archive();
  raw.precipitation_sum = raw.time.map(() => 0.1);
  const n = computeNext14d(averageDaily([forecast(0, 30, 20)], 14), [buildClimatology(raw)]);
  assert.ok(n);
  assert.equal(n.precipAnomalyPct, null);
  assert.deepEqual(computeFlags(n, {}), []);
});

test('service builds regions from mocked Open-Meteo and caches', async () => {
  const total = WEATHER_REGIONS.reduce((a, r) => a + r.points.length, 0);
  const calls: string[] = [];
  const mem = new Map<string, { value: string; at: number }>();
  const store: WeatherStore = { get: (k) => mem.get(k) ?? null, set: (k, v, at) => void mem.set(k, { value: v, at }) };
  const fetchJson = async (url: string) => {
    calls.push(url);
    const n = url.includes('archive-api') ? url.split('latitude=')[1].split('&')[0].split(',').length : total;
    const mk = url.includes('archive-api') ? archive : () => forecast(1, 33, 2);
    return Array.from({ length: n }, () => ({ daily: mk() }));
  };
  const svc = new WeatherService({ fetchJson, store, now: () => Date.parse('2026-11-21T00:00:00Z') });
  const res = await svc.getRegions();
  assert.equal(res.regions.length, WEATHER_REGIONS.length);
  const minas = res.regions.find((r) => r.regionId === 'minas-gerais')!;
  assert.ok(minas.flags.includes('SƯƠNG_GIÁ_RISK'));
  assert.equal(minas.daily.length, 14);
  assert.equal(calls.length, 1 + WEATHER_REGIONS.length);
  await svc.getRegions();
  assert.equal(calls.length, 1 + WEATHER_REGIONS.length, 'second call served from cache');
});

test('service omits a region whose baseline fails', async () => {
  const total = WEATHER_REGIONS.reduce((a, r) => a + r.points.length, 0);
  const fetchJson = async (url: string) => {
    if (url.includes('archive-api')) throw new Error('boom');
    return Array.from({ length: total }, () => ({ daily: forecast(1, 33, 2) }));
  };
  const svc = new WeatherService({ fetchJson, store: null });
  assert.equal((await svc.getRegions()).regions.length, 0);
});
