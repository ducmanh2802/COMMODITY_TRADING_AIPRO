/** Pure math for the market pulse. No I/O. */
export interface DatedValue {
  date: string; // YYYY-MM-DD
  value: number;
}

/** Parses fredgraph.csv (keeps zero/negative values, skips "." and blanks). Returns [] on unexpected header. */
export function parseFredSeries(text: string): DatedValue[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2 || !/DATE/i.test(lines[0])) return [];
  const out: DatedValue[] = [];
  for (let i = 1; i < lines.length; i++) {
    const [d, s] = lines[i].split(',');
    const date = d?.trim();
    const raw = s?.trim();
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !raw || raw === '.') continue;
    const v = Number(raw);
    if (Number.isFinite(v)) out.push({ date, value: v });
  }
  return out;
}

function shiftDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
}

/** Value at the last observation on/before `date`. */
function valueOnOrBefore(series: DatedValue[], date: string): DatedValue | null {
  let best: DatedValue | null = null;
  for (const p of series) {
    if (p.date <= date) best = p;
    else break;
  }
  return best;
}

/** Change between the latest point and the point `days` calendar days earlier (on/before). pp = difference, pct = percent. */
export function changeOver(series: DatedValue[], days: number, kind: 'pp' | 'pct'): number | null {
  if (series.length < 2) return null;
  const last = series[series.length - 1];
  const prev = valueOnOrBefore(series, shiftDays(last.date, days));
  if (!prev || prev.date === last.date) return null;
  if (kind === 'pp') return last.value - prev.value;
  return prev.value !== 0 ? (last.value / prev.value - 1) * 100 : null;
}

/** 12-month change (%) of a monthly index: (X_t / X_(t-12m) - 1) * 100, matched on the same calendar month. */
export function yoySeries(monthly: DatedValue[]): DatedValue[] {
  const byMonth = new Map(monthly.map((p) => [p.date.slice(0, 7), p.value]));
  const out: DatedValue[] = [];
  for (const p of monthly) {
    const y = Number(p.date.slice(0, 4));
    const prior = byMonth.get(`${y - 1}${p.date.slice(4, 7)}`);
    if (prior !== undefined && prior !== 0) out.push({ date: p.date, value: (p.value / prior - 1) * 100 });
  }
  return out;
}

/** a - b on dates present in both series. */
export function spreadSeries(a: DatedValue[], b: DatedValue[]): DatedValue[] {
  const bm = new Map(b.map((p) => [p.date, p.value]));
  const out: DatedValue[] = [];
  for (const p of a) {
    const o = bm.get(p.date);
    if (o !== undefined) out.push({ date: p.date, value: p.value - o });
  }
  return out;
}

export function pctChange(closes: number[], lookback: number): number | null {
  const n = closes.length;
  if (n <= lookback || closes[n - 1 - lookback] <= 0) return null;
  return (closes[n - 1] / closes[n - 1 - lookback] - 1) * 100;
}

export interface BreadthCount {
  up: number;
  down: number;
  flat: number;
}

export function breadth(changes: (number | null)[]): BreadthCount {
  const r = { up: 0, down: 0, flat: 0 };
  for (const c of changes) {
    if (c === null || !Number.isFinite(c)) continue;
    if (c > 0) r.up++;
    else if (c < 0) r.down++;
    else r.flat++;
  }
  return r;
}

/** Sample stdev of log returns over the trailing `window` returns, annualized by sqrt(252), as a fraction. */
export function realizedVolSeries(closes: number[], window = 20): (number | null)[] {
  const out: (number | null)[] = closes.map(() => null);
  const r = closes.map((x, i) => (i === 0 || x <= 0 || closes[i - 1] <= 0 ? NaN : Math.log(x / closes[i - 1])));
  for (let i = window; i < closes.length; i++) {
    const w = r.slice(i - window + 1, i + 1);
    if (w.some((x) => !Number.isFinite(x))) continue;
    const m = w.reduce((a, b) => a + b, 0) / w.length;
    const v = w.reduce((a, b) => a + (b - m) ** 2, 0) / (w.length - 1);
    out[i] = Math.sqrt(v) * Math.sqrt(252);
  }
  return out;
}

/** Percentile rank (0..100) of `current` within `history` (share of history values <= current). Needs >= minN values. */
export function percentileRank(current: number, history: number[], minN = 60): number | null {
  if (history.length < minN) return null;
  return (history.filter((x) => x <= current).length / history.length) * 100;
}

export function volLevel(pct: number | null): 'HIGH' | 'NORMAL' | 'LOW' | null {
  if (pct === null) return null;
  return pct >= 80 ? 'HIGH' : pct <= 20 ? 'LOW' : 'NORMAL';
}

export function pearson(x: number[], y: number[]): number | null {
  const n = Math.min(x.length, y.length);
  if (n < 10) return null;
  const mx = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const my = y.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}

/** Daily simple returns keyed by date (return of the bar ending that date). */
export function returnsByDate(points: DatedValue[]): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 1; i < points.length; i++) {
    if (points[i - 1].value > 0) m.set(points[i].date, points[i].value / points[i - 1].value - 1);
  }
  return m;
}

/** Equal-weight average of several return maps per date (dates need >= minCount contributors). */
export function averageReturns(maps: Map<string, number>[], minCount = 1): Map<string, number> {
  const sum = new Map<string, { s: number; n: number }>();
  for (const m of maps) {
    for (const [d, v] of m) {
      const e = sum.get(d) ?? { s: 0, n: 0 };
      e.s += v;
      e.n++;
      sum.set(d, e);
    }
  }
  const out = new Map<string, number>();
  for (const [d, e] of sum) if (e.n >= minCount) out.set(d, e.s / e.n);
  return out;
}

/** Correlation of two return maps over their last `window` common dates (needs >= 30). */
export function correlationLast(a: Map<string, number>, b: Map<string, number>, window = 60): { r: number | null; n: number } {
  const dates = [...a.keys()].filter((d) => b.has(d)).sort().slice(-window);
  if (dates.length < 30) return { r: null, n: dates.length };
  return { r: pearson(dates.map((d) => a.get(d) as number), dates.map((d) => b.get(d) as number)), n: dates.length };
}
