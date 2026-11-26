/**
 * Soybean board crush (education only). Per CME Group "Soybean Crush Reference Guide":
 * 1 bushel (60 lb) of soybeans yields ~44 lb of meal (= 0.022 short ton, since 1 short ton = 2000 lb)
 * and ~11 lb of oil. Board crush ($/bu) = ZM($/short ton) × 0.022 + ZL(cents/lb) × 0.11 − ZS(cents/bu) / 100.
 * Inputs must be in those quote units; callers state them. Pure functions, no I/O, never invent data.
 */
import type { SeriesPoint } from './core';

export const MEAL_SHORT_TON_PER_BU = 0.022;
/** 11 lb of oil per bushel; oil quoted in cents/lb, so USD/bu = cents/lb × 11 / 100 = × 0.11. */
export const OIL_LB_PER_BU = 11;
export const DEFAULT_Z_WINDOW = 252;

/** Board crush in USD/bu; null if any input is not a finite positive number. */
export function boardCrush(mealUsdPerShortTon: number, oilCentsPerLb: number, beanCentsPerBu: number): number | null {
  for (const x of [mealUsdPerShortTon, oilCentsPerLb, beanCentsPerBu]) {
    if (typeof x !== 'number' || !Number.isFinite(x) || x <= 0) return null;
  }
  return mealUsdPerShortTon * MEAL_SHORT_TON_PER_BU + oilCentsPerLb * (OIL_LB_PER_BU / 100) - beanCentsPerBu / 100;
}

export interface CrushSeries {
  timestamps: string[];
  values: number[];
  /** Points dropped per leg (not on the common timestamps or invalid). */
  dropped: { ZM: number; ZL: number; ZS: number };
}

/** Crush on the intersection of timestamps of the three legs (no fill). Empty legs give an empty result. */
export function crushSeries(zm: SeriesPoint[], zl: SeriesPoint[], zs: SeriesPoint[]): CrushSeries {
  const toMap = (s: SeriesPoint[]) => {
    const m = new Map<string, number>();
    for (const p of s ?? []) if (p && typeof p.v === 'number' && Number.isFinite(p.v) && p.v > 0) m.set(p.t, p.v);
    return m;
  };
  const mm = toMap(zm);
  const lm = toMap(zl);
  const sm = toMap(zs);
  const timestamps: string[] = [];
  const values: number[] = [];
  for (const t of [...mm.keys()].sort()) {
    const l = lm.get(t);
    const s = sm.get(t);
    if (l === undefined || s === undefined) continue;
    const c = boardCrush(mm.get(t) as number, l, s);
    if (c === null) continue;
    timestamps.push(t);
    values.push(c);
  }
  return {
    timestamps,
    values,
    dropped: { ZM: mm.size - values.length, ZL: lm.size - values.length, ZS: sm.size - values.length },
  };
}

export type CrushZStatus = 'OK' | 'INSUFFICIENT_DATA' | 'INVALID_INPUT' | 'ZERO_VARIANCE';

export interface CrushZ {
  status: CrushZStatus;
  /** z of the latest value vs. the trailing window (includes the latest value; sample std). */
  z: number | null;
  mean: number | null;
  std: number | null;
  window: number;
}

/** Latest rolling z-score. Guards: non-finite input, fewer than `window` bars, zero std. */
export function crushZScore(values: number[], window: number = DEFAULT_Z_WINDOW): CrushZ {
  const base = { z: null, mean: null, std: null, window };
  if (!Array.isArray(values) || !Number.isInteger(window) || window < 3) return { ...base, status: 'INVALID_INPUT' };
  if (values.some((v) => typeof v !== 'number' || !Number.isFinite(v))) return { ...base, status: 'INVALID_INPUT' };
  if (values.length < window) return { ...base, status: 'INSUFFICIENT_DATA' };
  const w = values.slice(values.length - window);
  const m = w.reduce((s, x) => s + x, 0) / window;
  const sd = Math.sqrt(w.reduce((s, x) => s + (x - m) * (x - m), 0) / (window - 1));
  if (!(sd > 0)) return { ...base, mean: m, std: sd, status: 'ZERO_VARIANCE' };
  return { status: 'OK', z: (values[values.length - 1] - m) / sd, mean: m, std: sd, window };
}

export interface CrushSeasonal {
  /** 12 entries, month 1 = January; avg null when the month has no data. */
  months: { month: number; avg: number | null; n: number }[];
  /** Distinct calendar years contributing at least one observation. */
  years: number;
}

/** Average crush by calendar month (UTC) over the supplied history. */
export function crushSeasonal(timestamps: string[], values: number[]): CrushSeasonal {
  const sum = new Array<number>(12).fill(0);
  const cnt = new Array<number>(12).fill(0);
  const years = new Set<number>();
  const n = Math.min(timestamps?.length ?? 0, values?.length ?? 0);
  for (let i = 0; i < n; i++) {
    const ms = Date.parse(timestamps[i]);
    const v = values[i];
    if (!Number.isFinite(ms) || typeof v !== 'number' || !Number.isFinite(v)) continue;
    const d = new Date(ms);
    sum[d.getUTCMonth()] += v;
    cnt[d.getUTCMonth()]++;
    years.add(d.getUTCFullYear());
  }
  return {
    months: sum.map((s, m) => ({ month: m + 1, avg: cnt[m] > 0 ? s / cnt[m] : null, n: cnt[m] })),
    years: years.size,
  };
}
