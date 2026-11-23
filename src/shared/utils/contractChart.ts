/**
 * T96b: pure logic for "chart uses the same contract month as the live quote".
 * No React, no fetch: selection / fallback / day-change / roll-warning rules + a safe localStorage preference.
 */
export type ChartSeriesPref = 'CONTRACT' | 'CONTINUOUS';

export interface ContractSeriesInput<T> {
  status: 'OK' | 'UNAVAILABLE';
  contractMonth: string | null;
  candles?: T[];
  reason?: string;
}

export type ChartSeriesNote = null | 'unavailable' | 'intraday';

export interface ResolvedChartSeries<T> {
  source: 'CONTRACT' | 'CONTINUOUS';
  /** Contract month ('YYYY-MM') of the displayed bars; null when continuous. */
  contractMonth: string | null;
  candles: T[];
  /** Why we show the continuous series although the contract series was wanted (null = no fallback). */
  note: ChartSeriesNote;
  /** Contract series still loading: continuous shown meanwhile, callers should suppress roll warnings. */
  pending: boolean;
}

/** '2027-03' -> '3/2027'; null on malformed input. */
export function formatContractMonthVi(month: string | null | undefined): string | null {
  const m = month ? /^(\d{4})-(\d{2})$/.exec(month) : null;
  if (!m) return null;
  const n = Number(m[2]);
  return n >= 1 && n <= 12 ? `${n}/${m[1]}` : null;
}

export function resolveChartSeries<T>(input: {
  quoteContractMonth: string | null | undefined;
  pref: ChartSeriesPref;
  timeframe: string;
  /** null = not (yet) loaded. */
  contract: ContractSeriesInput<T> | null;
  continuous: T[];
}): ResolvedChartSeries<T> {
  const cont = (note: ChartSeriesNote, pending = false): ResolvedChartSeries<T> => ({
    source: 'CONTINUOUS',
    contractMonth: null,
    candles: input.continuous,
    note,
    pending,
  });
  if (!input.quoteContractMonth || input.pref === 'CONTINUOUS') return cont(null);
  // Backend serves per-contract history for D1 only.
  if (input.timeframe !== 'D1') return cont('intraday');
  if (input.contract === null) return cont(null, true);
  if (input.contract.status === 'OK' && input.contract.contractMonth === input.quoteContractMonth && (input.contract.candles?.length ?? 0) > 0) {
    return { source: 'CONTRACT', contractMonth: input.quoteContractMonth, candles: input.contract.candles ?? [], note: null, pending: false };
  }
  return cont('unavailable');
}

/** Day change % from the last two closes of the SAME series. */
export function dayChangePct(candles: ReadonlyArray<{ close: number }>): number | null {
  if (candles.length < 2) return null;
  const last = candles[candles.length - 1].close;
  const prev = candles[candles.length - 2].close;
  return prev !== 0 ? ((last - prev) / prev) * 100 : null;
}

export const ROLL_WARN_PCT = 1.5;

/** Warn only when chart and quote may be different contracts: never for the contract series, nor while it loads. */
export function shouldWarnRollMismatch(args: {
  series: Pick<ResolvedChartSeries<unknown>, 'source' | 'pending'>;
  quotePrice: number | null;
  lastClose: number | null;
}): { warn: boolean; pct: number | null } {
  const { quotePrice, lastClose } = args;
  if (quotePrice === null || lastClose === null || lastClose === 0) return { warn: false, pct: null };
  const pct = ((quotePrice - lastClose) / lastClose) * 100;
  if (args.series.source === 'CONTRACT' || args.series.pending) return { warn: false, pct };
  return { warn: Math.abs(pct) >= ROLL_WARN_PCT, pct };
}

const prefKey = (instrumentId: string) => `chartSeriesPref:${instrumentId}`;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readChartSeriesPref(instrumentId: string | null | undefined, storage: StorageLike | null = defaultStorage()): ChartSeriesPref {
  if (!instrumentId || !storage) return 'CONTRACT';
  try {
    return storage.getItem(prefKey(instrumentId)) === 'CONTINUOUS' ? 'CONTINUOUS' : 'CONTRACT';
  } catch {
    return 'CONTRACT';
  }
}

export function writeChartSeriesPref(instrumentId: string, pref: ChartSeriesPref, storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(prefKey(instrumentId), pref);
  } catch {
    /* storage blocked: preference just is not remembered */
  }
}
