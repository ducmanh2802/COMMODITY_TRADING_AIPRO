/**
 * T49 — FxService: caches FX source adapters (ECB + FRED).
 *
 * Successful results are cached per source (TTL below); failures for only 60 s so a recovered source
 * is picked up quickly. Concurrent callers share one in-flight request. Fetch, env and clock are
 * injectable so tests never touch the network.
 */
import type { MacroDatapoint } from '../../../src/shared/types/macro.ts';
import {
  FX_PAIRS,
  type FxPairId,
  buildFredFxDatapoint,
  ecbPairFor,
  fetchEcbDaily,
  fetchEcbHistorical,
  fetchFredFxCsv,
  parseEcbDailyXml,
  parseEcbHistoricalXml,
  parseFredFxCsv,
  type FetchLike,
  ECB_DAILY_XML_URL,
} from './sources.ts';

const DAY_MS = 86_400_000;

const FX_TTL_MS = {
  ecb: 60 * 60_000,
  fred: 6 * 60 * 60_000,
  failure: 60_000,
} as const;

/** An HTML error page or empty body must count as a failure (short TTL), not as a good payload cached for hours. */
const looksLikeEcbXml = (v: string): boolean => /<Cube\s+time=["']\d{4}-\d{2}-\d{2}["']/.test(v);

export interface FxServiceOptions {
  fetchFn?: FetchLike;
  now?: () => Date;
}

interface CacheEntry<T> {
  expires: number;
  value: T;
}

export interface FxRateResult {
  pair: FxPairId;
  label: { vi: string; en: string };
  unit: string;
  source: 'ECB' | 'FRED';
  value: number | null;
  asOf: string | null;
  change1w: number | null;
  change1m: number | null;
  note: { vi: string; en: string };
  spark: { date: string; value: number }[];
  quality: 'OFFICIAL';
  sourceUrl: string;
  fetchedAt: string;
  reason?: string;
}

export class FxService {
  private readonly fetchFn: FetchLike;
  private readonly now: () => Date;
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(opts: FxServiceOptions = {}) {
    this.fetchFn = opts.fetchFn ?? ((input, init) => globalThis.fetch(input, init));
    this.now = opts.now ?? (() => new Date());
  }

  private async cached<T>(key: string, ttl: number, ok: (v: T) => boolean, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key) as CacheEntry<T> | undefined;
    if (hit && hit.expires > this.now().getTime()) return hit.value;
    const pending = this.inflight.get(key) as Promise<T> | undefined;
    if (pending) return pending;
    const p = load()
      .then((value) => {
        this.cache.set(key, {
          value,
          expires: this.now().getTime() + (ok(value) ? ttl : FX_TTL_MS.failure),
        });
        return value;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  /** Get latest FX rates for all commodity-relevant pairs. */
  async getAllRates(): Promise<FxRateResult[]> {
    const now = this.now();
    const fetchedAt = now.toISOString();

    // Fetch ECB daily + historical once for all ECB-sourced pairs
    const [ecbDailyXml, ecbHistXml] = await Promise.all([
      this.cached('ecb:daily', FX_TTL_MS.ecb, looksLikeEcbXml, () => fetchEcbDaily(this.fetchFn, now).catch(() => '')),
      this.cached('ecb:hist', FX_TTL_MS.ecb, looksLikeEcbXml, () => fetchEcbHistorical(this.fetchFn, now).catch(() => '')),
    ]);

    // Fetch FRED series for each FRED-sourced pair
    const fredSeries = await Promise.all(
      FX_PAIRS.map(async (p) => {
        const key = `fred:${p.fredId}`;
        const csv = await this.cached(key, FX_TTL_MS.fred, (v: string) => parseFredFxCsv(v).length > 0, () =>
          fetchFredFxCsv(this.fetchFn, p.fredId, now).catch(() => '')
        );
        return { pair: p.id, csv };
      })
    );

    const results: FxRateResult[] = [];

    for (const pairDef of FX_PAIRS) {
      const pair = pairDef.id;
      const ecbInfo = ecbPairFor(pair);

      if (pair === 'EURUSD') {
        // Direct from ECB: EUR/USD
        const dp = parseEcbDailyXml(ecbDailyXml, 'USD', now, fetchedAt);
        const hist = parseEcbHistoricalXml(ecbHistXml, 'USD').slice(-120);
        const change1w = this.changeOver(hist, 7);
        const change1m = this.changeOver(hist, 30);
        results.push({
          pair,
          label: pairDef.label,
          unit: pairDef.unit,
          source: 'ECB',
          value: dp?.value ?? null,
          asOf: dp?.asOf ?? null,
          change1w,
          change1m,
          note: pairDef.note,
          spark: hist,
          quality: 'OFFICIAL',
          sourceUrl: ECB_DAILY_XML_URL,
          fetchedAt,
          reason: dp?.reason ?? 'ECB data unavailable (source down or unparseable); no value shown.',
        });
      } else if (pair === 'AUDUSD') {
        // Cross: AUD/USD = EUR/USD / EUR/AUD
        const eurUsd = parseEcbDailyXml(ecbDailyXml, 'USD', now, fetchedAt);
        const eurAud = parseEcbDailyXml(ecbDailyXml, 'AUD', now, fetchedAt);
        const histUsd = parseEcbHistoricalXml(ecbHistXml, 'USD').slice(-120);
        const histAud = parseEcbHistoricalXml(ecbHistXml, 'AUD').slice(-120);
        // Align by date and compute cross
        const crossHist = this.computeCrossHistory(histUsd, histAud);
        const latestCross = crossHist.length > 0 ? crossHist[crossHist.length - 1] : null;
        const change1w = this.changeOver(crossHist, 7);
        const change1m = this.changeOver(crossHist, 30);
        results.push({
          pair,
          label: pairDef.label,
          unit: pairDef.unit,
          source: 'ECB',
          value: latestCross?.value ?? null,
          asOf: latestCross?.date ?? (eurUsd?.asOf ?? eurAud?.asOf ?? null),
          change1w,
          change1m,
          note: pairDef.note,
          spark: crossHist,
          quality: 'OFFICIAL',
          sourceUrl: ECB_DAILY_XML_URL,
          fetchedAt,
          reason: eurUsd?.reason ?? eurAud?.reason ?? 'ECB data unavailable (source down or unparseable); no value shown.',
        });
      } else {
        // USD/XXX from FRED (DEXJPUS, DEXCHUS, DEXBZUS)
        const fred = fredSeries.find((f) => f.pair === pair)!;
        const series = parseFredFxCsv(fred.csv);
        const dp = buildFredFxDatapoint(pair, series, now, fetchedAt);
        const hist = series.slice(-120);
        const change1w = this.changeOver(hist, 7);
        const change1m = this.changeOver(hist, 30);
        results.push({
          pair,
          label: pairDef.label,
          unit: pairDef.unit,
          source: 'FRED',
          value: dp.value,
          asOf: dp.asOf,
          change1w,
          change1m,
          note: pairDef.note,
          spark: hist,
          quality: 'OFFICIAL',
          sourceUrl: `https://fred.stlouisfed.org/series/${pairDef.fredId}`,
          fetchedAt,
          reason: dp.reason,
        });
      }
    }

    return results;
  }

  /** Get rate for a single pair. */
  async getRate(pair: FxPairId): Promise<FxRateResult> {
    const all = await this.getAllRates();
    return all.find((r) => r.pair === pair)!;
  }

  /** Compute percentage change over N days (calendar days, not trading days). */
  private changeOver(series: { date: string; value: number }[], days: number): number | null {
    if (series.length < 2) return null;
    const last = series[series.length - 1];
    const targetDate = new Date(Date.parse(`${last.date}T00:00:00Z`) - days * DAY_MS).toISOString().slice(0, 10);
    const prev = series.find((p) => p.date === targetDate);
    if (!prev) return null;
    return ((last.value - prev.value) / prev.value) * 100;
  }

  /** Compute cross rate history: EUR/USD / EUR/XXX for XXX=USD pairs, or EUR/USD / EUR/AUD for AUD/USD. */
  private computeCrossHistory(
    eurUsdHist: { date: string; value: number }[],
    eurXxxHist: { date: string; value: number }[]
  ): { date: string; value: number }[] {
    const usdMap = new Map(eurUsdHist.map((p) => [p.date, p.value]));
    const out: { date: string; value: number }[] = [];
    for (const p of eurXxxHist) {
      const usd = usdMap.get(p.date);
      if (usd && p.value > 0) {
        out.push({ date: p.date, value: usd / p.value });
      }
    }
    return out;
  }

  /** Clear cache (for tests). */
  clearCache(): void {
    this.cache.clear();
    this.inflight.clear();
  }
}