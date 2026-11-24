/**
 * T21 — MacroService: caches the macro source adapters (server/macro/sources.ts).
 *
 * Successful results are cached per source (TTL below); failures for only 60 s so a recovered source
 * is picked up quickly. Concurrent callers share one in-flight request. Fetch, env and clock are
 * injectable so tests never touch the network.
 */
import type { MacroDatapoint, MacroGroupResult, MacroOverview, WasdeResult } from '../../src/shared/types/macro.ts';
import {
  fetchDxy,
  fetchEiaWeeklyStocks,
  fetchUsdVndVcb,
  fetchWasde,
  groupStatus,
  sbvCentralRateUnavailable,
  VCB_XML_URL,
  type FetchLike,
} from './sources.ts';
import {
  fetchEiaEthanol,
  fetchErsCosts,
  fetchFasExportSales,
  type ErsCommodity,
  type FasCommodity,
} from './supplySources.ts';

const MACRO_TTL_MS = {
  eia: 60 * 60_000,
  wasde: 6 * 60 * 60_000,
  // Vietcombank feed asks for at most one request per 5 minutes.
  fx: 10 * 60_000,
  ethanol: 60 * 60_000,
  fas: 6 * 60 * 60_000,
  ers: 24 * 60 * 60_000,
  failure: 60_000,
} as const;

export interface MacroServiceOptions {
  fetchFn?: FetchLike;
  env?: Record<string, string | undefined>;
  now?: () => Date;
}

interface CacheEntry<T> {
  expires: number;
  value: T;
}

export class MacroService {
  private readonly fetchFn: FetchLike;
  private readonly env: Record<string, string | undefined>;
  private readonly now: () => Date;
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(opts: MacroServiceOptions = {}) {
    this.fetchFn = opts.fetchFn ?? ((input, init) => globalThis.fetch(input, init));
    this.env = opts.env ?? process.env;
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
          expires: this.now().getTime() + (ok(value) ? ttl : MACRO_TTL_MS.failure),
        });
        return value;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  getEia(): Promise<MacroGroupResult<MacroDatapoint>> {
    return this.cached(
      'eia',
      MACRO_TTL_MS.eia,
      (v) => v.status !== 'UNAVAILABLE',
      () => fetchEiaWeeklyStocks(this.fetchFn, this.env.EIA_API_KEY, this.now())
    );
  }

  getWasde(): Promise<WasdeResult> {
    return this.cached(
      'wasde',
      MACRO_TTL_MS.wasde,
      (v) => v.status !== 'UNAVAILABLE' && v.keyNumbers.every((k) => k.value !== null),
      () => fetchWasde(this.fetchFn, this.now())
    );
  }

  getEthanol(): Promise<MacroDatapoint> {
    return this.cached('ethanol', MACRO_TTL_MS.ethanol, (v) => v.value !== null, () =>
      fetchEiaEthanol(this.fetchFn, this.env.EIA_API_KEY, this.now())
    );
  }

  getExportSales(c: FasCommodity): Promise<MacroDatapoint> {
    return this.cached(`fas:${c}`, MACRO_TTL_MS.fas, (v) => v.value !== null, () =>
      fetchFasExportSales(this.fetchFn, this.env.FAS_API_KEY, c, this.now())
    );
  }

  getErsCosts(c: ErsCommodity): Promise<MacroDatapoint> {
    return this.cached(`ers:${c}`, MACRO_TTL_MS.ers, (v) => v.value !== null, () =>
      fetchErsCosts(this.fetchFn, c, this.now())
    );
  }

  getFx(): Promise<MacroGroupResult<MacroDatapoint>> {
    return this.cached(
      'fx',
      MACRO_TTL_MS.fx,
      // The SBV item is always UNAVAILABLE and DXY may be disabled by config; the VCB feed decides.
      (v) => v.items.some((i) => i.id === 'USDVND_VCB' && i.value !== null),
      async () => {
        const now = this.now();
        const yahooEnabled = (this.env.YAHOO_ENABLED ?? '').trim().toLowerCase() === 'true';
        const [dxy, vcb] = await Promise.all([
          fetchDxy(this.fetchFn, yahooEnabled, now),
          fetchUsdVndVcb(this.fetchFn, now),
        ]);
        const items = [dxy, sbvCentralRateUnavailable(now.toISOString()), vcb];
        return { status: groupStatus(items), items, sourceUrl: VCB_XML_URL, fetchedAt: now.toISOString() };
      }
    );
  }

  async getOverview(): Promise<MacroOverview> {
    const [eia, wasde, fx] = await Promise.all([this.getEia(), this.getWasde(), this.getFx()]);
    return { eia, wasde, fx };
  }
}
