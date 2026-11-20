/**
 * T47: live per-contract-month futures curve from Yahoo Finance (UNOFFICIAL, delayed, may be stale).
 *
 * Symbol format verified 2026-11-20 against the chart/spark APIs: `<ROOT><monthCode><YY>.<EXCH>`, e.g.
 * ZCH27.CBT, CLF27.NYM, GCG27.CMX, KCH27.NYB (EXCH = the exchangeName in YAHOO_SYMBOL_MAP). The contract
 * months come from the app's own calendar chain (src/shared/contracts), never guessed. One spark request
 * (daily bars) prices all months; one chart request validates exchange/currency/instrumentType of the
 * front month. A month is excluded (listed with a reason) when it has no bar, its last bar is not on the
 * common valuation date, or its last trading day cannot be computed. Result cached ~15 min per instrument.
 */
import type { InstrumentDefinition } from '../../src/shared/types/instrument.ts';
import { buildContractChain } from '../../src/shared/contracts/chain.ts';
import { buildTermStructure, type TermStructureResult } from '../../src/shared/contracts/termStructure.ts';
import {
  YAHOO_CHART_BASE,
  YAHOO_SPARK_BASE,
  YAHOO_USER_AGENT,
  YahooFinanceAdapter,
  applyUnitFactor,
  lastSparkClose,
  yahooUnitConversion,
  type FetchLike,
} from '../providers/yahooAdapter.ts';

export const YAHOO_CURVE_TTL_MS = 15 * 60_000;
export const YAHOO_CURVE_LABEL = 'Yahoo Finance (UNOFFICIAL, delayed, not an exchange settlement)';

export interface YahooCurveContract {
  contract: string;
  yahooSymbol: string;
  price: number;
  /** ISO timestamp of the bar the price comes from. */
  asOf: string;
  lastTradingDay: string;
  calendarStatus: string;
}

export type YahooCurveResponse =
  | {
      status: 'OK' | 'PARTIAL';
      instrumentId: string;
      source: string;
      unit: string;
      valuationDate: string | null;
      contracts: YahooCurveContract[];
      excluded: { contract: string; reason: string }[];
      result: TermStructureResult | null;
      notes: string[];
      fetchedAt: string;
    }
  | { status: 'UNAVAILABLE'; instrumentId: string; source: string; reason: string; fetchedAt: string };

export interface YahooCurveDeps {
  fetchFn?: FetchLike;
  now?: () => number;
  timeoutMs?: number;
}

const cache = new Map<string, { at: number; value: YahooCurveResponse }>();
export function clearYahooCurveCache(): void {
  cache.clear();
}

export async function getYahooCurve(
  instrument: InstrumentDefinition,
  count: number,
  calendarStatus: 'VERIFIED' | 'UNVERIFIED',
  deps: YahooCurveDeps = {}
): Promise<YahooCurveResponse> {
  const now = deps.now ?? Date.now;
  const key = `${instrument.id}|${count}`;
  const hit = cache.get(key);
  if (hit && now() - hit.at < YAHOO_CURVE_TTL_MS) return hit.value;
  const value = await compute(instrument, count, calendarStatus, deps);
  if (value.status !== 'UNAVAILABLE') cache.set(key, { at: now(), value });
  return value;
}

async function compute(
  instrument: InstrumentDefinition,
  count: number,
  calendarStatus: 'VERIFIED' | 'UNVERIFIED',
  deps: YahooCurveDeps
): Promise<YahooCurveResponse> {
  const now = deps.now ?? Date.now;
  const fetchFn: FetchLike = deps.fetchFn ?? fetch;
  const fetchedAt = new Date(now()).toISOString();
  const unavailable = (reason: string): YahooCurveResponse => ({
    status: 'UNAVAILABLE',
    instrumentId: instrument.id,
    source: YAHOO_CURVE_LABEL,
    reason,
    fetchedAt,
  });

  const mapping = YahooFinanceAdapter.mappingFor(instrument.exchangeSymbol);
  if (!mapping) return unavailable(YahooFinanceAdapter.unsupportedReason(instrument.exchangeSymbol));
  const conv = yahooUnitConversion(mapping.expectedCurrency, instrument.specification.quotationUnit);
  if (!conv.ok) return unavailable(conv.reason);

  const chain = buildContractChain({
    instrumentId: instrument.id,
    root: instrument.exchangeSymbol,
    mxvRoot: null,
    asOf: fetchedAt.slice(0, 10),
    count,
    calendarStatus,
  });
  if (chain.status !== 'OK') return unavailable(chain.reason);

  const entries = chain.contracts.map((c) => ({ c, symbol: `${c.code}.${mapping.expectedExchangeName}` }));
  const headers = { 'User-Agent': YAHOO_USER_AGENT, Accept: 'application/json' };
  const timeout = () => AbortSignal.timeout(deps.timeoutMs ?? 10_000);

  // 1) Validate exchange / currency / instrumentType on the front listed month (fail closed).
  try {
    const url = `${YAHOO_CHART_BASE}${encodeURIComponent(entries[0].symbol)}?range=5d&interval=1d`;
    const res = await fetchFn(url, { headers, signal: timeout() });
    const body = (await res.json()) as {
      chart?: { result?: { meta?: { exchangeName?: string; currency?: string; instrumentType?: string } }[] };
    };
    const meta = body.chart?.result?.[0]?.meta;
    if (!res.ok || !meta) return unavailable(`Yahoo did not serve ${entries[0].symbol} (HTTP ${res.status}).`);
    if (meta.exchangeName !== mapping.expectedExchangeName)
      return unavailable(`${entries[0].symbol} returned exchange "${meta.exchangeName}", expected "${mapping.expectedExchangeName}"; refused.`);
    if (meta.currency !== mapping.expectedCurrency)
      return unavailable(`${entries[0].symbol} returned currency "${meta.currency}", expected "${mapping.expectedCurrency}"; refused.`);
    if (meta.instrumentType !== 'FUTURE')
      return unavailable(`${entries[0].symbol} returned instrumentType "${meta.instrumentType}", expected FUTURE; refused.`);
  } catch (err) {
    return unavailable(`Yahoo validation request failed: ${err instanceof Error ? err.message : 'network error'}`);
  }

  // 2) One spark request with daily bars for every month.
  let spark: Record<string, { timestamp?: Array<number | null>; close?: Array<number | null> }>;
  try {
    const url = `${YAHOO_SPARK_BASE}?symbols=${entries.map((e) => encodeURIComponent(e.symbol)).join(',')}&range=5d&interval=1d`;
    const res = await fetchFn(url, { headers, signal: timeout() });
    if (!res.ok) return unavailable(`Yahoo spark request failed (HTTP ${res.status}).`);
    spark = (await res.json()) as typeof spark;
  } catch (err) {
    return unavailable(`Yahoo spark request failed: ${err instanceof Error ? err.message : 'network error'}`);
  }

  const priced: { contract: string; symbol: string; price: number; time: number; ltd: string; cal: string }[] = [];
  const excluded: { contract: string; reason: string }[] = [];
  for (const { c, symbol } of entries) {
    if (c.lastTradingDay.status !== 'COMPUTED') {
      excluded.push({ contract: c.code, reason: `Last trading day unavailable: ${c.lastTradingDay.reason}` });
      continue;
    }
    const last = lastSparkClose(spark?.[symbol]);
    if (!last) {
      excluded.push({ contract: c.code, reason: `Yahoo returned no daily price for ${symbol}.` });
      continue;
    }
    priced.push({
      contract: c.code,
      symbol,
      price: applyUnitFactor(last.price, conv.factor),
      time: last.time,
      ltd: c.lastTradingDay.date,
      cal: c.calendarStatus,
    });
  }

  // Common valuation date = the latest bar date; contracts whose last bar is older are excluded (no mixing dates).
  const dateOf = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
  const valuationDate = priced.length ? priced.map((p) => dateOf(p.time)).sort().at(-1)! : null;
  const usable = priced.filter((p) => {
    if (dateOf(p.time) === valuationDate) return true;
    excluded.push({ contract: p.contract, reason: `Last Yahoo bar is ${dateOf(p.time)}, not the common valuation date ${valuationDate}; excluded.` });
    return false;
  });

  const contracts: YahooCurveContract[] = usable
    .map((p) => ({
      contract: p.contract,
      yahooSymbol: p.symbol,
      price: p.price,
      asOf: new Date(p.time * 1000).toISOString(),
      lastTradingDay: p.ltd,
      calendarStatus: p.cal,
    }))
    .sort((a, b) => a.lastTradingDay.localeCompare(b.lastTradingDay));

  if (contracts.length < 2) {
    return unavailable(
      `Fewer than two usable contract months (${contracts.length}); ${excluded.map((e) => `${e.contract}: ${e.reason}`).join(' | ') || 'no data'}`
    );
  }
  const result = buildTermStructure(
    contracts.map((p) => ({
      contract: p.contract,
      price: p.price,
      timestamp: p.asOf,
      lastTradingDay: p.lastTradingDay as `${number}-${number}-${number}`,
    }))
  );
  const notes = [
    `${YAHOO_CURVE_LABEL}. Daily close of each individual contract month (${mapping.expectedExchangeName}); far months can be illiquid and their close may be a stale/indicative price.`,
    conv.note,
    'Last trading days are computed from the app calendar rules, not read from Yahoo.',
  ];
  return {
    status: excluded.length === 0 ? 'OK' : 'PARTIAL',
    instrumentId: instrument.id,
    source: YAHOO_CURVE_LABEL,
    unit: instrument.specification.quotationUnit,
    valuationDate,
    contracts,
    excluded,
    result,
    notes,
    fetchedAt,
  };
}
