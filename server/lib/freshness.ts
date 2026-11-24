/**
 * Data freshness monitor. Pure computation over snapshots of existing stores/services/scheduler status
 * (no fetching here). Each source has an expected cadence; status is
 *   FRESH        effective age <= cadence * STALE_FACTOR
 *   STALE        older than that
 *   UNAVAILABLE  never succeeded / no data
 * "Effective age" skips Saturday+Sunday (UTC) for trading-day sources. Exchange holidays are NOT modelled
 * (rough by design: the alert threshold is 2x cadence, which absorbs a normal holiday).
 */
import type { Express, NextFunction, Request, Response } from 'express';

export type FreshnessStatus = 'FRESH' | 'STALE' | 'UNAVAILABLE';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Status turns STALE beyond cadence * STALE_FACTOR. */
export const STALE_FACTOR = 1.5;
/** Admin alert fires when effective age exceeds cadence * ALERT_FACTOR. */
export const ALERT_FACTOR = 2;

export interface FreshnessRow {
  id: string;
  group: 'quotes' | 'candles' | 'cot' | 'fred' | 'eia' | 'news' | 'weather' | 'fx' | 'domestic' | 'job';
  label: string;
  status: FreshnessStatus;
  lastSuccessAt: string | null;
  /** Wall-clock age in ms (null when never succeeded). */
  ageMs: number | null;
  /** Age with weekends removed for trading-day sources. */
  effectiveAgeMs: number | null;
  cadenceMs: number;
  tradingDaysOnly: boolean;
  /** effectiveAge / cadence (null when never succeeded). */
  ratio: number | null;
  /** false for sources that only update on demand (quotes): never alerted. */
  alertable: boolean;
}

/** Milliseconds of Saturday/Sunday (UTC) inside (fromMs, toMs]. */
export function weekendMsBetween(fromMs: number, toMs: number): number {
  if (!(toMs > fromMs)) return 0;
  let total = 0;
  let dayStart = Math.floor(fromMs / DAY) * DAY;
  while (dayStart < toMs) {
    const dow = new Date(dayStart).getUTCDay();
    if (dow === 0 || dow === 6) {
      total += Math.max(0, Math.min(toMs, dayStart + DAY) - Math.max(fromMs, dayStart));
    }
    dayStart += DAY;
  }
  return total;
}

/** Age in ms; with tradingDaysOnly the weekend portion is removed. Never negative. */
export function effectiveAgeMs(lastMs: number, nowMs: number, tradingDaysOnly: boolean): number {
  const raw = Math.max(0, nowMs - lastMs);
  return tradingDaysOnly ? Math.max(0, raw - weekendMsBetween(lastMs, nowMs)) : raw;
}

export function classify(effAgeMs: number | null, cadenceMs: number): FreshnessStatus {
  if (effAgeMs === null) return 'UNAVAILABLE';
  return effAgeMs <= cadenceMs * STALE_FACTOR ? 'FRESH' : 'STALE';
}

export interface CadenceSpec {
  ms: number;
  tradingDaysOnly: boolean;
}

export const CADENCE = {
  quotes: { ms: 15 * MIN, tradingDaysOnly: true },
  /** Last D1 bar is dated the previous trading day; 2 days tolerates that lag plus a one-day holiday. */
  candlesD1: { ms: 2 * DAY, tradingDaysOnly: true },
  cotWeekly: { ms: 7 * DAY, tradingDaysOnly: false },
  fredDaily: { ms: 3 * DAY, tradingDaysOnly: true },
  fredMonthly: { ms: 45 * DAY, tradingDaysOnly: false },
  fredQuarterly: { ms: 120 * DAY, tradingDaysOnly: false },
  eia: { ms: 7 * DAY, tradingDaysOnly: false },
  news: { ms: 6 * HOUR, tradingDaysOnly: false },
  weather: { ms: DAY, tradingDaysOnly: false },
  fx: { ms: DAY, tradingDaysOnly: true },
  domestic: { ms: 3 * DAY, tradingDaysOnly: true },
} as const satisfies Record<string, CadenceSpec>;

/** Scheduler job id -> group/label/cadence of what it refreshes (cadence = how often it is expected to SUCCEED). */
const JOB_SPECS: Record<string, { group: FreshnessRow['group']; label: string; cadence: CadenceSpec }> = {
  'cot-weekly': { group: 'cot', label: 'COT (CFTC) hằng tuần', cadence: CADENCE.cotWeekly },
  'macro-fx': { group: 'fx', label: 'Tỷ giá USD/VND + DXY', cadence: CADENCE.fx },
  'macro-wasde': { group: 'job', label: 'USDA WASDE', cadence: { ms: DAY, tradingDaysOnly: false } },
  'macro-eia': { group: 'eia', label: 'EIA tồn kho dầu', cadence: { ms: 6 * HOUR, tradingDaysOnly: false } },
  'fred-macro': { group: 'fred', label: 'FRED đồng bộ (API)', cadence: { ms: DAY, tradingDaysOnly: false } },
  'fred-public-macro': { group: 'fred', label: 'FRED đồng bộ (CSV công khai)', cadence: { ms: DAY, tradingDaysOnly: false } },
  'yahoo-history': { group: 'candles', label: 'Yahoo lịch sử ngày', cadence: { ms: DAY, tradingDaysOnly: true } },
  'yahoo-intraday': { group: 'candles', label: 'Yahoo nội ngày', cadence: { ms: DAY, tradingDaysOnly: true } },
  'db-backup': { group: 'job', label: 'Sao lưu DB', cadence: { ms: DAY, tradingDaysOnly: false } },
};
const FIVE_MIN_JOBS = new Set(['contest-stops', 'telegram-zones', 'telegram-radar', 'channel-zones', 'channel-radar']);

export interface FreshnessInput {
  now: number;
  providers?: Array<{
    providerId: string;
    name: string;
    connectionState: string;
    credentialsConfigured: boolean;
    supportsRealtime: boolean;
    lastSuccessfulSyncAt: string | null;
  }>;
  datasets?: Array<{ instrumentId: string; timeframe: string; lastTimestamp: string }>;
  jobs?: Array<{
    id: string;
    enabled: boolean;
    lastRunAt: string | null;
    lastSuccessAt: string | null;
    nextRunAt: string | null;
  }>;
  fundamentals?: Array<{
    dataset: string;
    source: string;
    publicationTimestamp: string;
    observationDate?: string;
    dataPeriod?: string;
  }>;
  /** Last successful observation per tracked id (news/weather/fx/domestic). */
  observed?: Record<string, string>;
}

function makeRow(
  now: number,
  r: { id: string; group: FreshnessRow['group']; label: string; last: string | null; cadence: CadenceSpec; alertable?: boolean; forceUnavailable?: boolean },
): FreshnessRow {
  const lastMs = r.last && !r.forceUnavailable ? Date.parse(r.last) : NaN;
  const has = Number.isFinite(lastMs);
  const eff = has ? effectiveAgeMs(lastMs, now, r.cadence.tradingDaysOnly) : null;
  return {
    id: r.id,
    group: r.group,
    label: r.label,
    status: classify(eff, r.cadence.ms),
    lastSuccessAt: has ? new Date(lastMs).toISOString() : null,
    ageMs: has ? Math.max(0, now - lastMs) : null,
    effectiveAgeMs: eff,
    cadenceMs: r.cadence.ms,
    tradingDaysOnly: r.cadence.tradingDaysOnly,
    ratio: eff === null ? null : eff / r.cadence.ms,
    alertable: r.alertable ?? true,
  };
}

function fredCadence(period: string | undefined): CadenceSpec {
  const p = period ?? '';
  if (/quarter|\bQ[1-4]\b/i.test(p)) return CADENCE.fredQuarterly;
  if (/month|^\d{4}-\d{2}$|^[A-Za-z]{3}\s?\d{4}$/i.test(p)) return CADENCE.fredMonthly;
  return CADENCE.fredDaily;
}

/** Worst first: UNAVAILABLE, then STALE by ratio desc, then FRESH by ratio desc. */
export function sortWorstFirst(rows: FreshnessRow[]): FreshnessRow[] {
  const rank: Record<FreshnessStatus, number> = { UNAVAILABLE: 0, STALE: 1, FRESH: 2 };
  return [...rows].sort((a, b) => rank[a.status] - rank[b.status] || (b.ratio ?? 0) - (a.ratio ?? 0) || a.id.localeCompare(b.id));
}

export function computeFreshness(input: FreshnessInput): FreshnessRow[] {
  const { now } = input;
  const rows: FreshnessRow[] = [];

  for (const p of input.providers ?? []) {
    if (!p.supportsRealtime) continue;
    if (p.connectionState === 'UNCONFIGURED' && !p.credentialsConfigured && !p.lastSuccessfulSyncAt) continue;
    rows.push(
      makeRow(now, {
        id: `quotes:${p.providerId}`,
        group: 'quotes',
        label: `Giá: ${p.name}`,
        last: p.lastSuccessfulSyncAt,
        cadence: CADENCE.quotes,
        alertable: false,
        forceUnavailable: p.connectionState === 'UNAVAILABLE',
      }),
    );
  }

  const latestD1 = new Map<string, number>();
  for (const d of input.datasets ?? []) {
    if (d.timeframe !== 'D1') continue;
    const t = Date.parse(d.lastTimestamp);
    if (Number.isFinite(t) && t > (latestD1.get(d.instrumentId) ?? -Infinity)) latestD1.set(d.instrumentId, t);
  }
  for (const [id, t] of latestD1) {
    rows.push(makeRow(now, { id: `candles:D1:${id}`, group: 'candles', label: `Nến ngày: ${id}`, last: new Date(t).toISOString(), cadence: CADENCE.candlesD1 }));
  }

  for (const j of input.jobs ?? []) {
    if (!j.enabled) continue;
    const spec = JOB_SPECS[j.id];
    const cadence: CadenceSpec = spec?.cadence ?? (FIVE_MIN_JOBS.has(j.id) ? { ms: 5 * MIN, tradingDaysOnly: false } : { ms: DAY, tradingDaysOnly: false });
    rows.push(makeRow(now, { id: `job:${j.id}`, group: spec?.group ?? 'job', label: spec?.label ?? `Tác vụ ${j.id}`, last: j.lastSuccessAt, cadence }));
  }

  // FRED per dataset: age of the latest observation (falls back to publication time).
  const fred = new Map<string, { last: number; period?: string }>();
  for (const f of input.fundamentals ?? []) {
    if (!/FRED/i.test(f.source)) continue;
    const t = Date.parse(f.observationDate ?? f.publicationTimestamp);
    if (!Number.isFinite(t)) continue;
    const cur = fred.get(f.dataset);
    if (!cur || t > cur.last) fred.set(f.dataset, { last: t, period: f.dataPeriod });
  }
  for (const [dataset, v] of fred) {
    rows.push(makeRow(now, { id: `fred:${dataset}`, group: 'fred', label: `FRED: ${dataset}`, last: new Date(v.last).toISOString(), cadence: fredCadence(v.period) }));
  }

  const obs = input.observed ?? {};
  const tracked: Array<[string, FreshnessRow['group'], string, CadenceSpec]> = [
    ['news', 'news', 'Tin tức', CADENCE.news],
    ['weather', 'weather', 'Thời tiết', CADENCE.weather],
    ['fx', 'fx', 'Tỷ giá (FX)', CADENCE.fx],
    ['domestic', 'domestic', 'Giá trong nước', CADENCE.domestic],
  ];
  for (const [id, group, label, cadence] of tracked) {
    // Not alertable: observed only when someone calls the route, so silence can mean "no traffic".
    rows.push(makeRow(now, { id: `obs:${id}`, group, label, last: obs[id] ?? null, cadence, alertable: false }));
  }

  return sortWorstFirst(rows);
}

/** Remembers the last successful data timestamp per id (fed from API responses; no extra fetching). */
export class FreshnessTracker {
  private readonly last = new Map<string, string>();
  record(id: string, iso: string | null | undefined): void {
    if (!iso) return;
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return;
    const prev = this.last.get(id);
    if (!prev || t >= Date.parse(prev)) this.last.set(id, new Date(t).toISOString());
  }
  snapshot(): Record<string, string> {
    return Object.fromEntries(this.last);
  }
}

export const freshnessTracker = new FreshnessTracker();

function pickTime(body: unknown, keys: string[]): string | null {
  if (!body || typeof body !== 'object') return null;
  for (const k of keys) {
    const v = (body as Record<string, unknown>)[k];
    if (typeof v === 'string' && Number.isFinite(Date.parse(v))) return v;
  }
  return null;
}

/** Body -> timestamp to record, or null when the response carries no real data. */
export function extractObservation(id: string, body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (id === 'news') return Array.isArray(b.items) && b.items.length > 0 ? pickTime(b, ['retrievedAt']) : null;
  if (id === 'weather') return Array.isArray(b.regions) && b.regions.length > 0 ? pickTime(b, ['retrievedAt']) : null;
  if (id === 'fx') return Array.isArray(b.rates) && b.rates.length > 0 ? pickTime(b, ['retrievedAt']) : null;
  if (id === 'domestic') return pickTime(b, ['generatedAt']);
  return null;
}

const OBSERVED_PATHS: Record<string, string> = {
  '/api/news': 'news',
  '/api/weather/regions': 'weather',
  '/api/fx/rates': 'fx',
  '/api/domestic-prices': 'domestic',
};

/** Express middleware (install before routes): records timestamps of successful responses of tracked routes. */
export function freshnessObserver(tracker: FreshnessTracker = freshnessTracker) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const id = req.method === 'GET' ? OBSERVED_PATHS[req.path] : undefined;
    if (!id) return next();
    const orig = res.json.bind(res);
    res.json = ((body: unknown) => {
      try {
        if (res.statusCode >= 200 && res.statusCode < 300) tracker.record(id, extractObservation(id, body));
      } catch {
        /* never break a response */
      }
      return orig(body);
    }) as Response['json'];
    next();
  };
}

/** Compact projection for GET /api/status/freshness. */
export function compactFreshness(rows: FreshnessRow[]) {
  const counts = { FRESH: 0, STALE: 0, UNAVAILABLE: 0 };
  for (const r of rows) counts[r.status] += 1;
  return {
    overall: counts.UNAVAILABLE + counts.STALE > 0 ? (counts.STALE > 0 ? 'STALE' : 'DEGRADED') : 'FRESH',
    counts,
    sources: rows.map((r) => ({ id: r.id, status: r.status, lastSuccessAt: r.lastSuccessAt, ageSec: r.ageMs === null ? null : Math.round(r.ageMs / 1000) })),
  };
}

export interface FreshnessInputSources {
  providers?: () => Promise<NonNullable<FreshnessInput['providers']>>;
  datasets?: () => Promise<NonNullable<FreshnessInput['datasets']>>;
  jobs?: () => NonNullable<FreshnessInput['jobs']>;
  fundamentals?: () => NonNullable<FreshnessInput['fundamentals']>;
  tracker?: FreshnessTracker;
  now?: () => number;
}

/** Builds the snapshot from existing stores. Each source is isolated: one failing store never hides the others. */
export function createFreshnessSnapshot(src: FreshnessInputSources): () => Promise<FreshnessRow[]> {
  const now = src.now ?? Date.now;
  const safe = async <T>(fn: (() => T | Promise<T>) | undefined): Promise<T | undefined> => {
    try {
      return fn ? await fn() : undefined;
    } catch {
      return undefined;
    }
  };
  return async () => {
    const [providers, datasets, jobs, fundamentals] = await Promise.all([
      safe(src.providers),
      safe(src.datasets),
      safe(src.jobs),
      safe(src.fundamentals),
    ]);
    return computeFreshness({ now: now(), providers, datasets, jobs, fundamentals, observed: (src.tracker ?? freshnessTracker).snapshot() });
  };
}

export interface AlerterOptions {
  /** Sends one plain-text message; returns true when delivered. */
  send: (text: string) => Promise<boolean>;
}

/** One message per batch of sources that newly exceed 2x cadence; each id is silenced until it recovers (FRESH). */
export class FreshnessAlerter {
  private readonly alerted = new Set<string>();
  constructor(private readonly opts: AlerterOptions) {}

  async check(rows: FreshnessRow[]): Promise<string[]> {
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const id of [...this.alerted]) {
      const r = byId.get(id);
      if (!r || r.status === 'FRESH') this.alerted.delete(id);
    }
    const fresh = rows.filter((r) => r.alertable && r.status === 'STALE' && (r.ratio ?? 0) > ALERT_FACTOR && !this.alerted.has(r.id));
    if (fresh.length === 0) return [];
    const lines = fresh.slice(0, 15).map((r) => `- ${r.label}: ${Math.round((r.effectiveAgeMs ?? 0) / HOUR)} giờ (chu kỳ dự kiến ${Math.round(r.cadenceMs / HOUR)} giờ)`);
    if (fresh.length > 15) lines.push(`... và ${fresh.length - 15} nguồn khác`);
    const ok = await this.opts.send(`Cảnh báo dữ liệu cũ: ${fresh.length} nguồn quá 2 lần chu kỳ cập nhật.\n${lines.join('\n')}`);
    if (!ok) return []; // retry on next tick
    for (const r of fresh) this.alerted.add(r.id);
    return fresh.map((r) => r.id);
  }
}

export function registerFreshnessRoute(app: Express, snapshot: () => Promise<FreshnessRow[]>): void {
  app.get('/api/status/freshness', async (_req, res, next) => {
    try {
      const rows = await snapshot();
      res.setHeader('Cache-Control', 'public, max-age=15');
      res.json({ generatedAt: new Date().toISOString(), ...compactFreshness(rows) });
    } catch (err) {
      next(err);
    }
  });
}
