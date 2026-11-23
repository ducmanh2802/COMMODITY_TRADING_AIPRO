import { FRED_BENCHMARK_DEFS, parseFredCsv, type FredBenchmarkDef, type FredObs } from '../providers/fredBenchmarks.ts';

/**
 * T76 - benchmark reference series for instruments with no futures price history.
 * A benchmark is a published spot/average price (FRED/IMF/EIA), NOT a contract price.
 * Nothing is invented: when the upstream CSV cannot be read the series comes back empty with a reason.
 */
export interface BenchmarkPoint {
  date: string;
  value: number;
}

export interface BenchmarkSeries {
  instrumentId: string;
  seriesId: string;
  label: string;
  frequency: 'daily' | 'monthly';
  /** Unit of `points[].value`. */
  unit: string;
  /** Unit published by the source (differs from `unit` only when an exact conversion was applied). */
  nativeUnit: string;
  conversionNote: string | null;
  source: string;
  sourceUrl: string;
  points: BenchmarkPoint[];
  lastUpdated: string | null;
  /** Set when `points` is empty. */
  reason: string | null;
}

export interface BenchmarkListItem {
  instrumentId: string;
  symbol: string;
  seriesId: string;
  label: string;
  frequency: 'daily' | 'monthly';
}

/** instrument id -> FRED series id (JRU is an MXV-only product, so this is a static map, not an instrument lookup). */
export const BENCHMARK_INSTRUMENTS: Record<string, string> = {
  'ICE:RC': 'PCOFFROBUSDM',
  'ICE:CT': 'PCOTTINDUSDM',
  'CME:TIO': 'PIORECRUSDM',
  'SGX:FEF': 'PIORECRUSDM',
  'ICE:BRN': 'DCOILBRENTEU',
  'MXV:JRU': 'PRUBBUSDM',
};

const PUBLISHER_NAME: Record<FredBenchmarkDef['publisher'], string> = {
  IMF: 'IMF (qua FRED)',
  EIA: 'EIA (qua FRED)',
};

export function resolveBenchmarkInstrumentId(instrumentId: string): string | null {
  const key = instrumentId.trim().toUpperCase();
  if (!key) return null;
  if (BENCHMARK_INSTRUMENTS[key]) return key;
  if (key.includes(':')) return null;
  for (const canonical of Object.keys(BENCHMARK_INSTRUMENTS)) {
    if (canonical.split(':')[1] === key) return canonical;
  }
  return null;
}

export function benchmarkDefForInstrument(instrumentId: string): FredBenchmarkDef | null {
  const canonical = resolveBenchmarkInstrumentId(instrumentId);
  const seriesId = canonical ? BENCHMARK_INSTRUMENTS[canonical] : undefined;
  return seriesId ? (FRED_BENCHMARK_DEFS.find((d) => d.seriesId === seriesId) ?? null) : null;
}

export function listBenchmarkInstruments(): BenchmarkListItem[] {
  const out: BenchmarkListItem[] = [];
  for (const [instrumentId, seriesId] of Object.entries(BENCHMARK_INSTRUMENTS)) {
    const def = FRED_BENCHMARK_DEFS.find((d) => d.seriesId === seriesId);
    if (!def) continue;
    out.push({
      instrumentId,
      symbol: instrumentId.split(':')[1] ?? instrumentId,
      seriesId,
      label: def.label,
      frequency: def.periodicity === 'MONTHLY' ? 'monthly' : 'daily',
    });
  }
  return out;
}

/** Pure mapping from parsed observations to the API shape (applies the exact unit conversion when the def has one). */
export function buildBenchmarkSeries(
  instrumentId: string,
  def: FredBenchmarkDef,
  obs: FredObs[],
  reason: string | null = null
): BenchmarkSeries {
  const conv = def.conversion;
  const points: BenchmarkPoint[] = obs.map((o) => ({
    date: o.date,
    value: conv ? Math.round(o.val * conv.factor * 100) / 100 : o.val,
  }));
  return {
    instrumentId,
    seriesId: def.seriesId,
    label: def.label,
    frequency: def.periodicity === 'MONTHLY' ? 'monthly' : 'daily',
    unit: conv ? conv.toUnit : def.nativeUnit,
    nativeUnit: def.nativeUnit,
    conversionNote: conv ? conv.note : null,
    source: PUBLISHER_NAME[def.publisher],
    sourceUrl: `https://fred.stlouisfed.org/series/${def.seriesId}`,
    points,
    lastUpdated: points.length > 0 ? points[points.length - 1].date : null,
    reason: points.length === 0 ? (reason ?? 'Chưa có dữ liệu cho chuỗi này.') : null,
  };
}

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export interface BenchmarkSeriesServiceOptions {
  fetchFn?: FetchLike;
  now?: () => number;
  ttlMs?: number;
  /** Max points returned (most recent kept); daily Brent has ~10k rows. */
  maxPoints?: number;
}

export class BenchmarkSeriesService {
  private readonly fetchFn: FetchLike;
  private readonly now: () => number;
  private readonly ttlMs: number;
  private readonly maxPoints: number;
  private readonly cache = new Map<string, { at: number; obs: FredObs[] }>();

  constructor(opts: BenchmarkSeriesServiceOptions = {}) {
    this.fetchFn = opts.fetchFn ?? ((url, init) => globalThis.fetch(url, init));
    this.now = opts.now ?? (() => Date.now());
    this.ttlMs = opts.ttlMs ?? 6 * 3_600_000;
    this.maxPoints = opts.maxPoints ?? 1500;
  }

  list(): BenchmarkListItem[] {
    return listBenchmarkInstruments();
  }

  /** null = instrument has no benchmark mapping (404). */
  async get(instrumentId: string): Promise<BenchmarkSeries | null> {
    const id = resolveBenchmarkInstrumentId(instrumentId);
    if (!id) return null;
    const def = benchmarkDefForInstrument(id);
    if (!def) return null;
    const hit = this.cache.get(def.seriesId);
    if (hit && this.now() - hit.at < this.ttlMs) return this.finish(id, def, hit.obs);
    try {
      const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(def.seriesId)}`;
      const res = await this.fetchFn(url, { signal: AbortSignal.timeout(12_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const obs = parseFredCsv(await res.text());
      if (obs.length === 0) throw new Error('CSV không có dòng số hợp lệ');
      this.cache.set(def.seriesId, { at: this.now(), obs });
      return this.finish(id, def, obs);
    } catch (err) {
      // Serve a stale cached copy rather than nothing; otherwise an honest empty result.
      if (hit) return this.finish(id, def, hit.obs);
      const msg = err instanceof Error ? err.message : 'lỗi không rõ';
      return buildBenchmarkSeries(id, def, [], `Chưa tải được chuỗi ${def.seriesId} từ FRED (${msg}). Không hiển thị số liệu thay thế.`);
    }
  }

  private finish(id: string, def: FredBenchmarkDef, obs: FredObs[]): BenchmarkSeries {
    return buildBenchmarkSeries(id, def, obs.slice(-this.maxPoints));
  }
}
