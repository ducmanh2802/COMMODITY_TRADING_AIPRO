/**
 * T96: daily (D1) series for ONE specific contract month (e.g. ZCZ26.CBT) from Yahoo (UNOFFICIAL, delayed).
 *
 * The live quote carries a contract month (quote.contractMonth 'YYYY-MM', from Yahoo's continuous shortName) while
 * the stored/continuous D1 bars may follow a different front month around a roll (ROLL_MISMATCH, T88). This
 * fetches the chart of the quote's own contract so price and chart refer to the same contract. When that series is
 * unavailable the caller falls back to the continuous series and keeps the ROLL_MISMATCH warning.
 * Symbol format verified 2026-11-20 (see yahooCurve.ts): <ROOT><monthCode><YY>.<EXCH>.
 */
import type { InstrumentDefinition } from '../../src/shared/types/instrument.ts';
import type { MarketCandle } from '../../src/shared/types/market.ts';
import { formatContractCode } from '../../src/shared/contracts/monthCodes.ts';
import { validateCandleSeries } from '../../src/shared/utils/validation.ts';
import {
  YAHOO_CHART_BASE,
  YAHOO_USER_AGENT,
  YahooFinanceAdapter,
  isYahooEnabled,
  parseYahooDailyCandles,
  yahooUnitConversion,
  type FetchLike,
} from '../providers/yahooAdapter.ts';

/** 'ZCZ26.CBT' for ('ZC', '2026-12', 'CBT'); null on malformed month/root. */
export function buildYahooContractSymbol(root: string, contractMonth: string, exchangeName: string): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(contractMonth.trim());
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  try {
    return `${formatContractCode(root.trim().toUpperCase(), month, Number(m[1]), 2)}.${exchangeName}`;
  } catch {
    return null;
  }
}

export type ContractD1Result =
  | { status: 'OK'; contractMonth: string; yahooSymbol: string; candles: MarketCandle[]; source: string }
  | { status: 'UNAVAILABLE'; contractMonth: string | null; reason: string };

export interface ContractD1Deps {
  fetchFn?: FetchLike;
  now?: () => number;
  timeoutMs?: number;
  range?: '1y' | '2y';
}

export async function getContractD1(
  inst: InstrumentDefinition,
  contractMonth: string | null | undefined,
  deps: ContractD1Deps = {}
): Promise<ContractD1Result> {
  const unavailable = (reason: string): ContractD1Result => ({ status: 'UNAVAILABLE', contractMonth: contractMonth ?? null, reason });
  if (!contractMonth) return unavailable('No contract month for the current price.');
  if (!isYahooEnabled()) return unavailable('Yahoo adapter disabled (YAHOO_ENABLED is not true).');
  const mapping = YahooFinanceAdapter.mappingFor(inst.exchangeSymbol);
  if (!mapping) return unavailable(YahooFinanceAdapter.unsupportedReason(inst.exchangeSymbol));
  if (!yahooUnitConversion(mapping.expectedCurrency, inst.specification.quotationUnit).ok) return unavailable('Unit conversion unsupported.');
  const symbol = buildYahooContractSymbol(inst.exchangeSymbol, contractMonth, mapping.expectedExchangeName);
  if (!symbol) return unavailable(`Invalid contract month "${contractMonth}".`);
  const fetchFn = deps.fetchFn ?? fetch;
  try {
    const url = `${YAHOO_CHART_BASE}${encodeURIComponent(symbol)}?range=${deps.range ?? '2y'}&interval=1d`;
    const res = await fetchFn(url, {
      headers: { 'User-Agent': YAHOO_USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(deps.timeoutMs ?? 10_000),
    });
    if (!res.ok) return unavailable(`Yahoo did not serve ${symbol} (HTTP ${res.status}).`);
    const body = (await res.json()) as { chart?: { result?: unknown[] | null } };
    const result = body.chart?.result?.[0];
    if (!result) return unavailable(`Yahoo returned no data for ${symbol}.`);
    const meta = (result as { meta?: { instrumentType?: string } }).meta;
    if (meta?.instrumentType !== 'FUTURE') return unavailable(`${symbol} instrumentType "${meta?.instrumentType}", expected FUTURE; refused.`);
    const parsed = parseYahooDailyCandles(result as Parameters<typeof parseYahooDailyCandles>[0], inst, { ...mapping, yahooSymbol: symbol }, (deps.now ?? Date.now)());
    if (!parsed.ok) return unavailable(parsed.reason);
    const v = validateCandleSeries(parsed.candles);
    if (!v.valid || v.validCandles.length === 0) return unavailable(`${symbol} series failed validation.`);
    return {
      status: 'OK',
      contractMonth,
      yahooSymbol: symbol,
      candles: v.validCandles,
      source: `UNOFFICIAL Yahoo ${symbol} D1, specific contract; delayed; personal use only.`,
    };
  } catch (err) {
    return unavailable(`Yahoo request failed: ${err instanceof Error ? err.message : 'network error'}`);
  }
}

export type ChartSeriesChoice<T> =
  | { series: 'CONTRACT'; contractMonth: string; yahooSymbol: string; candles: T[]; rollWarning: false; note: string }
  | { series: 'CONTINUOUS'; contractMonth: string | null; candles: T[]; rollWarning: true; note: string };

/** Prefer the quote's contract series; otherwise the continuous series with the ROLL_MISMATCH warning kept. */
export function chooseChartSeries<T>(contract: ContractD1Result, continuous: T[]): ChartSeriesChoice<T> {
  if (contract.status === 'OK') {
    return { series: 'CONTRACT', contractMonth: contract.contractMonth, yahooSymbol: contract.yahooSymbol, candles: contract.candles as unknown as T[], rollWarning: false, note: contract.source };
  }
  return { series: 'CONTINUOUS', contractMonth: contract.contractMonth, candles: continuous, rollWarning: true, note: `Per-contract series unavailable (${contract.reason}); continuous series, roll warning applies.` };
}
