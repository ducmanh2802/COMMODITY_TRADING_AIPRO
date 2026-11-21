/**
 * T90 - regional growing-area weather (Open-Meteo, free, no key).
 * Forecast: one multi-location request for all points (cached ~3h).
 * Baseline: 2015-2024 daily archive per region -> day-of-year climatology (cached ~180 days, SQLite + memory).
 * A region whose forecast or baseline is unavailable is omitted - never fabricated.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { WeatherRegionResult, WeatherRegionsResponse } from '../../../src/shared/types/weather.ts';
import {
  averageDaily,
  buildClimatology,
  computeFlags,
  computeNext14d,
  type Climatology,
  type RawDaily,
} from './logic.ts';
import { WEATHER_REGIONS, type RegionDef } from './regions.ts';

export interface WeatherStore {
  get(key: string): { value: string; at: number } | null;
  set(key: string, value: string, at: number): void;
}

export class SqliteWeatherStore implements WeatherStore {
  private readonly db: DatabaseSync;
  constructor(location: string = process.env.MARKET_DB_PATH?.trim() || path.join('data', 'market.db')) {
    if (location !== ':memory:') mkdirSync(path.dirname(path.resolve(location)), { recursive: true });
    this.db = new DatabaseSync(location);
    this.db.exec('PRAGMA busy_timeout = 5000;');
    this.db.exec('CREATE TABLE IF NOT EXISTS weather_cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, fetched_at INTEGER NOT NULL)');
  }
  get(key: string) {
    const r = this.db.prepare('SELECT value, fetched_at FROM weather_cache WHERE key = ?').get(key) as
      | { value: string; fetched_at: number }
      | undefined;
    return r ? { value: r.value, at: r.fetched_at } : null;
  }
  set(key: string, value: string, at: number) {
    this.db
      .prepare('INSERT INTO weather_cache (key, value, fetched_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, fetched_at = excluded.fetched_at')
      .run(key, value, at);
  }
}

export type JsonFetcher = (url: string) => Promise<unknown>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fair-use friendly: retries 429 with backoff (Open-Meteo has a per-minute weight limit on the archive API). */
const defaultFetch: JsonFetcher = async (url) => {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { 'User-Agent': 'commodity-research-app' } });
    if (res.ok) return res.json();
    if (res.status === 429 && attempt < 3) {
      await sleep(15_000 * (attempt + 1));
      continue;
    }
    throw new Error(`Open-Meteo HTTP ${res.status}`);
  }
};

export const FORECAST_TTL_MS = 3 * 3_600_000;
export const BASELINE_TTL_MS = 180 * 86_400_000;
export const BASELINE_FROM = '2015-01-01';
export const BASELINE_TO = '2024-12-31';
const DAILY = 'precipitation_sum,temperature_2m_max,temperature_2m_min';

interface Options {
  fetchJson?: JsonFetcher;
  store?: WeatherStore | null;
  now?: () => number;
}

const asArray = (x: unknown): Array<{ daily?: RawDaily }> => (Array.isArray(x) ? x : [x]) as Array<{ daily?: RawDaily }>;

export class WeatherService {
  private readonly fetchJson: JsonFetcher;
  private readonly store: WeatherStore | null;
  private readonly now: () => number;
  private readonly mem = new Map<string, { value: string; at: number }>();
  private inflight: Promise<WeatherRegionsResponse> | null = null;

  constructor(opts: Options = {}) {
    this.fetchJson = opts.fetchJson ?? defaultFetch;
    this.store = opts.store === undefined ? safeStore() : opts.store;
    this.now = opts.now ?? Date.now;
  }

  private readCache(key: string, ttl: number): string | null {
    const m = this.mem.get(key);
    if (m && this.now() - m.at < ttl) return m.value;
    let s: { value: string; at: number } | null = null;
    try {
      s = this.store?.get(key) ?? null;
    } catch {
      s = null;
    }
    if (s && this.now() - s.at < ttl) {
      this.mem.set(key, s);
      return s.value;
    }
    return null;
  }

  private writeCache(key: string, value: string): void {
    const at = this.now();
    this.mem.set(key, { value, at });
    try {
      this.store?.set(key, value, at);
    } catch {
      /* cache is best-effort */
    }
  }

  private async baselineFor(region: RegionDef): Promise<Climatology[] | null> {
    const key = `baseline:${region.regionId}:${BASELINE_FROM}:${BASELINE_TO}`;
    const hit = this.readCache(key, BASELINE_TTL_MS);
    if (hit) return JSON.parse(hit) as Climatology[];
    try {
      const url =
        `https://archive-api.open-meteo.com/v1/archive?latitude=${region.points.map((p) => p.lat).join(',')}` +
        `&longitude=${region.points.map((p) => p.lon).join(',')}&start_date=${BASELINE_FROM}&end_date=${BASELINE_TO}` +
        `&daily=${DAILY}&timezone=UTC`;
      const arr = asArray(await this.fetchJson(url));
      const out = arr.map((r) => (r.daily ? buildClimatology(r.daily) : null));
      if (out.length !== region.points.length || out.some((c) => !c || Object.keys(c).length < 300)) return null;
      this.writeCache(key, JSON.stringify(out));
      return out as Climatology[];
    } catch {
      return null;
    }
  }

  async getRegions(): Promise<WeatherRegionsResponse> {
    const cached = this.readCache('regions:result', FORECAST_TTL_MS);
    if (cached) return JSON.parse(cached) as WeatherRegionsResponse;
    if (this.inflight) return this.inflight;
    this.inflight = this.compute().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async compute(): Promise<WeatherRegionsResponse> {
    const all = WEATHER_REGIONS.flatMap((r) => r.points);
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${all.map((p) => p.lat).join(',')}` +
      `&longitude=${all.map((p) => p.lon).join(',')}&daily=${DAILY}&forecast_days=16&timezone=UTC`;
    let forecasts: Array<{ daily?: RawDaily }>;
    try {
      forecasts = asArray(await this.fetchJson(url));
      if (forecasts.length !== all.length) throw new Error('unexpected forecast shape');
    } catch (err) {
      // Serve a stale result rather than nothing.
      const stale = this.mem.get('regions:result') ?? this.store?.get('regions:result') ?? null;
      if (stale) return JSON.parse(stale.value) as WeatherRegionsResponse;
      throw err;
    }
    const retrievedAt = new Date(this.now()).toISOString();
    const regions: WeatherRegionResult[] = [];
    let offset = 0;
    for (const region of WEATHER_REGIONS) {
      const fc = forecasts.slice(offset, offset + region.points.length);
      offset += region.points.length;
      if (fc.some((f) => !f.daily)) continue;
      const baselines = await this.baselineFor(region);
      if (!baselines) continue;
      const daily = averageDaily(fc.map((f) => f.daily as RawDaily), 14);
      const next14d = computeNext14d(daily, baselines);
      if (!next14d) continue;
      regions.push({
        regionId: region.regionId,
        nameVi: region.nameVi,
        instruments: region.instruments,
        points: region.points,
        next14d,
        daily,
        flags: computeFlags(next14d, { frostWatch: region.frostWatch }),
        source: 'Open-Meteo',
        retrievedAt,
      });
    }
    const result = { retrievedAt, regions };
    // Only cache a complete result so missing regions are retried (their baselines are cached as they arrive).
    if (regions.length === WEATHER_REGIONS.length) this.writeCache('regions:result', JSON.stringify(result));
    return result;
  }
}

function safeStore(): WeatherStore | null {
  try {
    return new SqliteWeatherStore();
  } catch {
    return null;
  }
}
