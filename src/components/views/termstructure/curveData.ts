/**
 * Builds the inputs of `buildTermStructure` from imported per-contract datasets.
 *
 * Rules (fail-closed):
 * - Only D1 datasets of individual contract codes are used (CONTINUOUS and unparseable codes are excluded).
 * - The price is the close of the D1 bar whose session date equals the as-of date EXACTLY. No nearest-date
 *   fallback, no forward fill: a contract without that bar is listed as excluded with the reason.
 * - The last trading day comes from the contract chain API as of the same date; a contract not in the chain
 *   (already expired, or beyond the encoded listing horizon) or with an UNAVAILABLE LTD is excluded.
 */
import {
  errorMessage,
  fetchCandles,
  fetchContractChain,
  type DatasetSummary,
} from '../../../api/contractsApi';
import type { ChainContract } from '../../../shared/contracts/chain';
import { utcDateOfTimestamp } from '../../../shared/contracts/dates';
import { parseContractCode } from '../../../shared/contracts/monthCodes';
import { tr } from '../../../i18n';
import {
  buildTermStructure,
  type CurvePointInput,
  type TermStructureResult,
} from '../../../shared/contracts/termStructure';
import type { InstrumentDefinition } from '../../../shared/types/instrument';

export const CURVE_TIMEFRAME = 'D1';

export interface ExcludedContract {
  contract: string;
  reason: string;
}

export interface CurveSnapshot {
  asOf: string;
  included: (CurvePointInput & { calendarStatus: string; datasetSource: string })[];
  excluded: ExcludedContract[];
  result: TermStructureResult | null;
  /** Why no curve could be built (fewer than two usable contracts, chain unavailable...). */
  unavailableReason: string | null;
  priceUnits: string[];
  chainWarnings: string[];
  calendarStatus: string | null;
}

export interface ContractDataset {
  code: string;
  month: number;
  year: number;
  datasets: DatasetSummary[];
}

/** Individual-contract D1 datasets for an instrument, grouped by contract code (sorted by expiry month). */
export function groupContractDatasets(
  instrument: InstrumentDefinition,
  datasets: DatasetSummary[],
  referenceYear: number
): { contracts: ContractDataset[]; skipped: ExcludedContract[] } {
  const roots = [instrument.exchangeSymbol, instrument.mxvMapping?.mxvSymbol].filter((r): r is string => Boolean(r));
  const byCode = new Map<string, ContractDataset>();
  const skipped: ExcludedContract[] = [];
  for (const d of datasets) {
    if (d.timeframe !== CURVE_TIMEFRAME) continue;
    if (d.contractCode === 'CONTINUOUS') continue;
    const parsed = parseContractCode(d.contractCode, { referenceYear, knownRoots: roots });
    if (!parsed) {
      if (!skipped.some((s) => s.contract === d.contractCode)) {
        skipped.push({
          contract: d.contractCode,
          reason: tr('ts.r.notContractCode', { roots: roots.join('/') }),
        });
      }
      continue;
    }
    const entry = byCode.get(d.contractCode) ?? { code: d.contractCode, month: parsed.month, year: parsed.year, datasets: [] };
    entry.datasets.push(d);
    byCode.set(d.contractCode, entry);
  }
  const contracts = [...byCode.values()].sort((a, b) => a.year - b.year || a.month - b.month);
  return { contracts, skipped };
}

export async function loadCurveSnapshot(
  instrument: InstrumentDefinition,
  datasets: DatasetSummary[],
  asOf: string,
  signal?: AbortSignal
): Promise<CurveSnapshot> {
  const snapshot: CurveSnapshot = {
    asOf,
    included: [],
    excluded: [],
    result: null,
    unavailableReason: null,
    priceUnits: [],
    chainWarnings: [],
    calendarStatus: null,
  };
  const { contracts, skipped } = groupContractDatasets(instrument, datasets, Number(asOf.slice(0, 4)));
  snapshot.excluded.push(...skipped);
  if (contracts.length === 0) {
    snapshot.unavailableReason = tr('ts.r.noDatasets', { tf: CURVE_TIMEFRAME, symbol: instrument.exchangeSymbol });
    return snapshot;
  }

  const chain = await fetchContractChain(instrument.id, { asOf, count: 36 }, signal);
  if (chain.status !== 'OK') {
    snapshot.unavailableReason = tr('ts.r.chainUnavailable', { reason: chain.reason });
    snapshot.excluded.push(...contracts.map((c) => ({ contract: c.code, reason: tr('ts.r.noExpiry') })));
    return snapshot;
  }
  snapshot.chainWarnings = chain.warnings;
  snapshot.calendarStatus = chain.calendarStatus;
  const chainByMonth = new Map<string, ChainContract>(chain.contracts.map((c) => [`${c.year}-${c.month}`, c]));

  const units = new Set<string>();
  await Promise.all(
    contracts.map(async (c) => {
      const link = chainByMonth.get(`${c.year}-${c.month}`);
      if (!link) {
        snapshot.excluded.push({
          contract: c.code,
          reason: tr('ts.r.notInChain', { asOf }),
        });
        return;
      }
      if (link.lastTradingDay.status !== 'COMPUTED') {
        snapshot.excluded.push({ contract: c.code, reason: tr('ts.r.ltdUnavailable', { reason: link.lastTradingDay.reason }) });
        return;
      }
      try {
        const res = await fetchCandles(
          {
            instrumentId: instrument.id,
            contractCode: c.code,
            timeframe: CURVE_TIMEFRAME,
            from: asOf,
            to: `${asOf}T23:59:59Z`,
            limit: 10,
          },
          signal
        );
        const bar = res.candles.find((k) => utcDateOfTimestamp(k.timestamp) === asOf);
        if (!bar) {
          snapshot.excluded.push({ contract: c.code, reason: tr('ts.r.noBar', { tf: CURVE_TIMEFRAME, asOf }) });
          return;
        }
        if (!Number.isFinite(bar.close)) {
          snapshot.excluded.push({ contract: c.code, reason: tr('ts.r.closeNotFinite', { asOf }) });
          return;
        }
        if (res.priceUnit) units.add(res.priceUnit);
        snapshot.included.push({
          contract: c.code,
          price: bar.close,
          timestamp: bar.timestamp,
          lastTradingDay: link.lastTradingDay.date,
          calendarStatus: link.calendarStatus,
          datasetSource: res.provenance.map((p) => `${p.sourceLabel} (${p.sourceQuality})`).join('; '),
        });
      } catch (err) {
        if (signal?.aborted) throw err;
        snapshot.excluded.push({ contract: c.code, reason: tr('ts.r.candleFailed', { error: errorMessage(err) }) });
      }
    })
  );
  snapshot.priceUnits = [...units];
  snapshot.included.sort((a, b) => a.lastTradingDay.localeCompare(b.lastTradingDay));
  snapshot.excluded.sort((a, b) => a.contract.localeCompare(b.contract));

  if (snapshot.included.length < 2) {
    snapshot.unavailableReason = tr('ts.r.tooFew', { n: snapshot.included.length, tf: CURVE_TIMEFRAME, asOf });
    return snapshot;
  }
  if (units.size > 1) {
    snapshot.unavailableReason = tr('ts.r.mixedUnits', { units: [...units].join(', ') });
    return snapshot;
  }
  snapshot.result = buildTermStructure(
    snapshot.included.map(({ contract, price, timestamp, lastTradingDay }) => ({ contract, price, timestamp, lastTradingDay }))
  );
  return snapshot;
}
