/** Pure math for "Vì sao & sắp tới" (T56). No I/O. */
import type { DatedValue } from '../marketPulse/math.ts';
import type { ConeBand, DriverEventFlag, DriverPartId } from '../../../src/shared/types/drivers.ts';

const Z50 = 0.6744897501960817;
export const Z80 = 1.2815515655446004;

/** Solves A x = b (Gaussian elimination, partial pivoting). Null when singular. */
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-14) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

/** OLS with intercept. X rows = observations. Returns [alpha, ...betas] and R². */
export function ols(X: number[][], y: number[]): { coef: number[]; r2: number } | null {
  const n = y.length;
  const k = X[0]?.length ?? 0;
  if (n < k + 2) return null;
  const D = X.map((r) => [1, ...r]);
  const m = k + 1;
  const A = Array.from({ length: m }, () => new Array<number>(m).fill(0));
  const b = new Array<number>(m).fill(0);
  for (let i = 0; i < n; i++)
    for (let a = 0; a < m; a++) {
      b[a] += D[i][a] * y[i];
      for (let c = 0; c < m; c++) A[a][c] += D[i][a] * D[i][c];
    }
  const coef = solveLinear(A, b);
  if (!coef) return null;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let ssr = 0;
  let sst = 0;
  for (let i = 0; i < n; i++) {
    const fit = D[i].reduce((s, v, j) => s + v * coef[j], 0);
    ssr += (y[i] - fit) ** 2;
    sst += (y[i] - my) ** 2;
  }
  return { coef, r2: sst > 0 ? Math.max(0, 1 - ssr / sst) : 0 };
}

/** Forward-filled value of `series` at each of `dates` (null before first obs or when older than maxAgeDays). */
function ffillTo(dates: string[], series: DatedValue[], maxAgeDays = 10): (number | null)[] {
  const out: (number | null)[] = [];
  let j = -1;
  for (const d of dates) {
    while (j + 1 < series.length && series[j + 1].date <= d) j++;
    if (j < 0) {
      out.push(null);
      continue;
    }
    const age = (Date.parse(`${d}T00:00:00Z`) - Date.parse(`${series[j].date}T00:00:00Z`)) / 86_400_000;
    out.push(age <= maxAgeDays ? series[j].value : null);
  }
  return out;
}

export interface DecomposeInput {
  target: DatedValue[];
  peers: DatedValue[][];
  usd: DatedValue[] | null;
  y10: DatedValue[] | null;
}
interface DecomposeHorizon {
  days: 1 | 5 | 20;
  startDate: string;
  endDate: string;
  totalPct: number;
  parts: { id: DriverPartId; pct: number; share: number | null; beta: number | null }[];
  dates: string[];
}
export interface DecomposeResult {
  r2: number;
  sampleDays: number;
  used: DriverPartId[];
  horizons: DecomposeHorizon[];
}

const lnr = (a: number | null, b: number | null): number | null => (a !== null && b !== null && a > 0 && b > 0 ? Math.log(b / a) : null);

/** Rolling 1y OLS of target log-returns on factor returns; attributes each horizon's return. Null if < minRows. */
export function decompose(inp: DecomposeInput, opts: { window?: number; minRows?: number } = {}): DecomposeResult | null {
  const window = opts.window ?? 252;
  const minRows = opts.minRows ?? 120;
  const dates = inp.target.map((p) => p.date);
  const n = dates.length;
  if (n < 30) return null;
  const tv: (number | null)[] = inp.target.map((p) => p.value);
  const peerV = inp.peers.map((s) => ffillTo(dates, s, 5));
  const usdV = inp.usd ? ffillTo(dates, inp.usd) : null;
  const yV = inp.y10 ? ffillTo(dates, inp.y10) : null;
  const ids: DriverPartId[] = [];
  if (peerV.length > 0) ids.push('group');
  if (usdV) ids.push('usd');
  if (yV) ids.push('rates');
  if (ids.length === 0) return null;
  const rows: { i: number; y: number; x: number[] }[] = [];
  for (let i = 1; i < n; i++) {
    const y = lnr(tv[i - 1], tv[i]);
    if (y === null) continue;
    const x: number[] = [];
    let ok = true;
    for (const id of ids) {
      let v: number | null = null;
      if (id === 'group') {
        const rs = peerV.map((p) => lnr(p[i - 1], p[i])).filter((r): r is number => r !== null);
        v = rs.length > 0 ? rs.reduce((s, r) => s + r, 0) / rs.length : null;
      } else if (id === 'usd') v = lnr(usdV![i - 1], usdV![i]);
      else v = yV![i] !== null && yV![i - 1] !== null ? yV![i]! - yV![i - 1]! : null; // pp
      if (v === null) {
        ok = false;
        break;
      }
      x.push(v);
    }
    if (ok) rows.push({ i, y, x });
  }
  const win = rows.slice(-window);
  if (win.length < minRows) return null;
  const fit = ols(win.map((r) => r.x), win.map((r) => r.y));
  if (!fit) return null;
  const betas = fit.coef.slice(1);
  const byIdx = new Map(rows.map((r) => [r.i, r]));
  const horizons: DecomposeHorizon[] = [];
  for (const days of [1, 5, 20] as const) {
    if (n <= days) continue;
    const idxs = Array.from({ length: days }, (_, k) => n - days + k);
    let totalLog = 0;
    const contrib = ids.map(() => 0);
    let complete = true;
    for (const i of idxs) {
      const r = byIdx.get(i);
      const y = lnr(tv[i - 1], tv[i]);
      if (!r || y === null) {
        complete = false;
        break;
      }
      totalLog += y;
      ids.forEach((_, k) => (contrib[k] += betas[k] * r.x[k]));
    }
    if (!complete) continue;
    const simple = Math.exp(totalLog) - 1;
    const scale = Math.abs(totalLog) > 1e-12 ? simple / totalLog : 1;
    const own = totalLog - contrib.reduce((s, v) => s + v, 0);
    const toPct = (v: number) => v * scale * 100;
    const totalPct = simple * 100;
    const mk = (id: DriverPartId, v: number, beta: number | null) => ({
      id,
      pct: toPct(v),
      share: Math.abs(totalPct) > 1e-9 ? toPct(v) / totalPct : null,
      beta,
    });
    horizons.push({
      days,
      startDate: dates[n - days - 1],
      endDate: dates[n - 1],
      totalPct,
      parts: [...ids.map((id, k) => mk(id, contrib[k], betas[k])), mk('own', own, null)],
      dates: idxs.map((i) => dates[i]),
    });
  }
  return { r2: fit.r2, sampleDays: win.length, used: ids, horizons };
}

/** Realized daily log-return std over the last `window` returns (sample std). */
export function realizedSigma(closes: number[], window = 60): number | null {
  const r: number[] = [];
  for (let i = Math.max(1, closes.length - window); i < closes.length; i++)
    if (closes[i] > 0 && closes[i - 1] > 0) r.push(Math.log(closes[i] / closes[i - 1]));
  if (r.length < 20) return null;
  const m = r.reduce((s, v) => s + v, 0) / r.length;
  return Math.sqrt(r.reduce((s, v) => s + (v - m) ** 2, 0) / (r.length - 1));
}

/** Linear-interpolated quantile of an unsorted array (q in 0..1). */
export function quantile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

const band = (last: number, loRet: number, hiRet: number): ConeBand => ({
  lo: last * (1 + loRet),
  hi: last * (1 + hiRet),
  loPct: loRet * 100,
  hiPct: hiRet * 100,
});

/** Parametric lognormal-style bands, zero drift: price * exp(+-z * sigma * sqrt(h)). */
export function parametricCone(last: number, sigmaDaily: number, h: number): { b50: ConeBand; b80: ConeBand } {
  const s = sigmaDaily * Math.sqrt(h);
  const f = (z: number) => band(last, Math.exp(-z * s) - 1, Math.exp(z * s) - 1);
  return { b50: f(Z50), b80: f(Z80) };
}

/** Empirical bands from historical overlapping h-day simple returns. Null when fewer than minN samples. */
export function empiricalCone(closes: number[], last: number, h: number, minN = 250): { n: number; b50: ConeBand; b80: ConeBand; median: number } | null {
  const rets: number[] = [];
  for (let i = h; i < closes.length; i++) if (closes[i - h] > 0) rets.push(closes[i] / closes[i - h] - 1);
  if (rets.length < minN) return null;
  return {
    n: rets.length,
    b50: band(last, quantile(rets, 0.25), quantile(rets, 0.75)),
    b80: band(last, quantile(rets, 0.1), quantile(rets, 0.9)),
    median: quantile(rets, 0.5) * 100,
  };
}

/** Dates (YYYY-MM-DD) within [from, to] inclusive that fall on a given UTC weekday (0=Sun). */
export function weekdayDates(from: string, to: string, weekday: number): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) {
    const d = new Date(t);
    if (d.getUTCDay() === weekday) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export const addDays = (date: string, days: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Past event days among `dates` (WASDE from official release dates; EIA Wednesdays for energy; COT Fridays). */
export function flagEventDays(dates: string[], category: string, wasdeDates: Set<string>, hasCot: boolean): DriverEventFlag[] {
  const out: DriverEventFlag[] = [];
  for (const d of dates) {
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (category === 'AGRICULTURE' && wasdeDates.has(d)) out.push({ date: d, kind: 'WASDE', label: { vi: 'báo cáo WASDE', en: 'WASDE report' } });
    if (category === 'ENERGY' && wd === 3)
      out.push({ date: d, kind: 'EIA', label: { vi: 'tồn kho dầu thô EIA hằng tuần', en: 'weekly EIA petroleum stocks' } });
    if (hasCot && wd === 5) out.push({ date: d, kind: 'COT', label: { vi: 'báo cáo vị thế COT', en: 'COT positioning report' } });
  }
  return out;
}
