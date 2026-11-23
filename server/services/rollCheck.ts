/**
 * Roll-mismatch consistency check (T88).
 *
 * Yahoo's live quote (spark / chart meta) and its daily history can follow different "front months"
 * around a roll: the quote may already be on the next contract (meta.shortName "...,Mar-2027") while the
 * daily bars still reflect the expiring one. When the live price and the last stored daily close differ by
 * more than ROLL_MISMATCH_PCT we flag it, never silently reconcile or alter either number.
 */
import type { InstrumentDefinition } from '../../src/shared/types/instrument.ts';
import type { MarketQuote } from '../../src/shared/types/market.ts';
import { CONTINUOUS_CONTRACT_CODE, type ICandleRepository } from '../storage/candleRepository.ts';
import { YAHOO_HISTORY_CONTRACT_CODE } from './yahooHistory.ts';
import { getContractD1, type ContractD1Result } from './yahooContractHistory.ts';

export const ROLL_MISMATCH_PCT = 1.5;
export const ROLL_MISMATCH_FLAG = 'ROLL_MISMATCH';

export interface LastDailyClose {
  close: number;
  /** ISO timestamp of the bar. */
  timestamp: string;
  /** Contract month ('YYYY-MM') of the bar when known; Yahoo history does not report it. */
  contractMonth?: string | null;
}

export function applyRollCheck(quote: MarketQuote, last: LastDailyClose | null): MarketQuote {
  if (!last || quote.price === null || quote.price <= 0 || last.close <= 0) return quote;
  const diffPct = ((quote.price - last.close) / last.close) * 100;
  if (Math.abs(diffPct) <= ROLL_MISMATCH_PCT) return quote;
  // Differing months, or a bar month we cannot know (Yahoo history): flag. Same known month: a real move, no flag.
  if (quote.contractMonth && last.contractMonth && quote.contractMonth === last.contractMonth) return quote;
  const q = quote.contractMonth ? ` quote contract ${quote.contractLabel ?? quote.contractMonth}` : ' quote contract unknown';
  const b = last.contractMonth ? `, daily bar contract ${last.contractMonth}` : ', daily-bar contract not reported by source';
  return {
    ...quote,
    consistencyFlag: ROLL_MISMATCH_FLAG,
    statusReason: `${ROLL_MISMATCH_FLAG}: quote ${quote.price} vs last daily close ${last.close} (${last.timestamp.slice(0, 10)}) differ ${Math.abs(diffPct).toFixed(1)}% (>${ROLL_MISMATCH_PCT}%);${q}${b}; the two may be different contract months (roll). ${quote.statusReason ?? ''}`.trim(),
  };
}

export async function lastDailyClose(repo: ICandleRepository | null, inst: InstrumentDefinition): Promise<LastDailyClose | null> {
  if (!repo) return null;
  for (const contractCode of [CONTINUOUS_CONTRACT_CODE, YAHOO_HISTORY_CONTRACT_CODE]) {
    const { rows } = await repo.queryCandles({ instrumentId: inst.id, contractCode, timeframe: 'D1' }, { limit: 1 });
    const row = rows[0];
    if (row) return { close: row.close, timestamp: new Date(row.timestampMs).toISOString() };
  }
  return null;
}

/** Last close of the quote's own contract series (T96b); null when that series is unavailable. */
export function contractLastClose(contract: ContractD1Result): LastDailyClose | null {
  if (contract.status !== 'OK') return null;
  const row = contract.candles[contract.candles.length - 1];
  return row ? { close: row.close, timestamp: row.timestamp, contractMonth: contract.contractMonth } : null;
}

export type ContractD1Getter = (inst: InstrumentDefinition, contractMonth: string) => Promise<ContractD1Result>;

const CACHE_OK_MS = 10 * 60_000;
const CACHE_FAIL_MS = 2 * 60_000;
const contractCache = new Map<string, { at: number; result: ContractD1Result }>();

const cachedContractD1: ContractD1Getter = async (inst, contractMonth) => {
  const key = `${inst.id}|${contractMonth}`;
  const hit = contractCache.get(key);
  if (hit && Date.now() - hit.at < (hit.result.status === 'OK' ? CACHE_OK_MS : CACHE_FAIL_MS)) return hit.result;
  const result = await getContractD1(inst, contractMonth);
  contractCache.set(key, { at: Date.now(), result });
  return result;
};

/**
 * Quote vs last daily close of the continuous series; when that flags a mismatch and the quote's own contract
 * series is available, compare against THAT series instead (same contract => no flag, chart can show that contract).
 */
export async function withRollCheck(
  repo: ICandleRepository | null,
  inst: InstrumentDefinition,
  quote: MarketQuote,
  getContract: ContractD1Getter = cachedContractD1
): Promise<MarketQuote> {
  if (quote.price === null) return quote;
  try {
    const checked = applyRollCheck(quote, await lastDailyClose(repo, inst));
    if (checked.consistencyFlag !== ROLL_MISMATCH_FLAG || !quote.contractMonth) return checked;
    try {
      const contractLast = contractLastClose(await getContract(inst, quote.contractMonth));
      return contractLast ? applyRollCheck(quote, contractLast) : checked;
    } catch {
      return checked;
    }
  } catch {
    return quote;
  }
}
