/** Pure anomaly / flag logic for the regional weather panel (T90). No network, no I/O. */
import type { WeatherDaily, WeatherFlag } from '../../../src/shared/types/weather.ts';

interface ClimateDay {
  p: number; // mean daily precipitation, mm
  tx: number; // mean tmax, C
  tn: number; // mean tmin, C
}
/** Baseline keyed by "MM-DD". */
export type Climatology = Record<string, ClimateDay>;

export interface RawDaily {
  time: string[];
  precipitation_sum: Array<number | null>;
  temperature_2m_max: Array<number | null>;
  temperature_2m_min: Array<number | null>;
}

const mmdd = (date: string) => date.slice(5, 10);

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/** Build a smoothed (+-3 day window) day-of-year climatology from multi-year daily archive data. */
export function buildClimatology(raw: RawDaily): Climatology {
  const sums = new Map<string, { p: number[]; tx: number[]; tn: number[] }>();
  raw.time.forEach((d, i) => {
    const p = raw.precipitation_sum[i];
    const tx = raw.temperature_2m_max[i];
    const tn = raw.temperature_2m_min[i];
    if (p == null || tx == null || tn == null) return;
    const k = mmdd(d);
    const e = sums.get(k) ?? { p: [], tx: [], tn: [] };
    e.p.push(p);
    e.tx.push(tx);
    e.tn.push(tn);
    sums.set(k, e);
  });
  // Ordered key list over a leap year so +-3 neighbours wrap properly.
  const keys: string[] = [];
  for (let t = Date.UTC(2024, 0, 1); t < Date.UTC(2025, 0, 1); t += 86_400_000) keys.push(new Date(t).toISOString().slice(5, 10));
  const out: Climatology = {};
  keys.forEach((k, i) => {
    const p: number[] = [];
    const tx: number[] = [];
    const tn: number[] = [];
    for (let o = -3; o <= 3; o++) {
      const e = sums.get(keys[(i + o + keys.length) % keys.length]);
      if (e) {
        p.push(...e.p);
        tx.push(...e.tx);
        tn.push(...e.tn);
      }
    }
    if (p.length) out[k] = { p: mean(p), tx: mean(tx), tn: mean(tn) };
  });
  return out;
}

/** Average several points (same dates) into one regional daily series; null days are skipped per point. */
export function averageDaily(points: RawDaily[], days: number): WeatherDaily[] {
  const out: WeatherDaily[] = [];
  if (!points.length) return out;
  const n = Math.min(days, ...points.map((p) => p.time.length));
  for (let i = 0; i < n; i++) {
    const g = (key: 'precipitation_sum' | 'temperature_2m_max' | 'temperature_2m_min') =>
      points.map((p) => p[key][i]).filter((v): v is number => typeof v === 'number');
    const p = g('precipitation_sum');
    const tx = g('temperature_2m_max');
    const tn = g('temperature_2m_min');
    if (!p.length || !tx.length || !tn.length) continue;
    out.push({ date: points[0].time[i], precipMm: round1(mean(p)), tmax: round1(mean(tx)), tmin: round1(mean(tn)) });
  }
  return out;
}

export interface Next14d {
  precipMm: number;
  precipNormalMm: number;
  precipAnomalyPct: number | null;
  tmaxAvg: number;
  tmaxNormal: number;
  tmaxAnomalyC: number;
  tminMin: number;
}

/** Compare forecast days against the (region-averaged) climatologies of its points. */
export function computeNext14d(daily: WeatherDaily[], baselines: Climatology[]): Next14d | null {
  const rows = daily
    .map((d) => {
      const cs = baselines.map((b) => b[mmdd(d.date)]).filter((c): c is ClimateDay => !!c);
      if (!cs.length) return null;
      return { d, p: mean(cs.map((c) => c.p)), tx: mean(cs.map((c) => c.tx)) };
    })
    .filter((r): r is { d: WeatherDaily; p: number; tx: number } => r !== null);
  if (rows.length < 7) return null;
  const precip = rows.reduce((a, r) => a + r.d.precipMm, 0);
  const normal = rows.reduce((a, r) => a + r.p, 0);
  const tmaxAvg = mean(rows.map((r) => r.d.tmax));
  const tmaxNormal = mean(rows.map((r) => r.tx));
  return {
    precipMm: round1(precip),
    precipNormalMm: round1(normal),
    // Below ~5 mm normal a percentage is meaningless (dry season) -> null.
    precipAnomalyPct: normal >= 5 ? Math.round(((precip - normal) / normal) * 100) : null,
    tmaxAvg: round1(tmaxAvg),
    tmaxNormal: round1(tmaxNormal),
    tmaxAnomalyC: round1(tmaxAvg - tmaxNormal),
    tminMin: Math.min(...rows.map((r) => r.d.tmin)),
  };
}

const FLAG_THRESHOLDS = {
  dryPct: -40,
  wetPct: 50,
  minNormalMm: 20,
  hotAnomalyC: 3,
  frostTminC: 3,
} as const;

export function computeFlags(n: Next14d, opts: { frostWatch?: boolean }): WeatherFlag[] {
  const flags: WeatherFlag[] = [];
  const T = FLAG_THRESHOLDS;
  if (n.precipAnomalyPct != null && n.precipNormalMm >= T.minNormalMm) {
    if (n.precipAnomalyPct <= T.dryPct) flags.push('KHÔ_HẠN');
    else if (n.precipAnomalyPct >= T.wetPct) flags.push('MƯA_NHIỀU');
  }
  if (n.tmaxAnomalyC >= T.hotAnomalyC) flags.push('NẮNG_NÓNG');
  if (opts.frostWatch && n.tminMin <= T.frostTminC) flags.push('SƯƠNG_GIÁ_RISK');
  return flags;
}
