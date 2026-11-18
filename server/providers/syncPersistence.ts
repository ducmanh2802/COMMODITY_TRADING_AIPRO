/**
 * Persists candles fetched by POST /api/providers/sync into the SQLite data layer as datasets with
 * provenance, instead of only the owner's in-memory store (which is lost on restart).
 *
 * Series: (instrument.id, contractCode `VENDOR_<PROVIDER_ID>`, timeframe). Provider series are kept
 * apart from CONTINUOUS / contract series on purpose: several providers return spot or proxy prices
 * (e.g. XAU/USD), not exchange futures settlements, so they must never be mixed into futures series
 * the engines read. Mode is `append` (new timestamps only; conflicting bars are reported, never
 * overwritten). The provider's price unit is not verified, so priceUnit is recorded as such, unless the
 * adapter verified it (verifiedPriceUnit, e.g. Yahoo currency USX/USD checked against quotationUnit).
 */
import { createHash, randomUUID } from 'node:crypto';
import type { InstrumentDefinition, Timeframe } from '../../src/shared/types/instrument.ts';
import type { MarketCandle, ProviderId } from '../../src/shared/types/market.ts';
import type { CandleRow, DatasetRecord, ICandleRepository, SourceQuality } from '../storage/candleRepository.ts';

/** Source quality per provider (see docs/DATA_IMPORT.md §4). */
export const PROVIDER_SOURCE_QUALITY: Partial<Record<ProviderId, SourceQuality>> = {
  MXV_OFFICIAL: 'LICENSED_VENDOR', // authorized MXV member feed
  THIRD_PARTY_FEED: 'LICENSED_VENDOR', // operator-configured authorized brokerage feed
  TWELVE_DATA: 'UNOFFICIAL', // aggregator; spot/proxy symbols, not exchange-licensed futures data
  FMP_COMMODITIES: 'UNOFFICIAL',
  ALPHA_VANTAGE: 'UNOFFICIAL',
  EIA_ENERGY: 'OFFICIAL', // U.S. government spot series (not futures settlements)
  YAHOO_UNOFFICIAL: 'UNOFFICIAL', // Yahoo continuous front month, delayed, personal use only (T30)
};

export const VENDOR_CONTRACT_PREFIX = 'VENDOR_';

/** Contract code overrides for provider series (default `VENDOR_<PROVIDER_ID>`). */
export const PROVIDER_CONTRACT_CODE: Partial<Record<ProviderId, string>> = {
  YAHOO_UNOFFICIAL: `${VENDOR_CONTRACT_PREFIX}YAHOO`,
};
/** Extra honesty label appended to the dataset source label (what the series is NOT). */
export const PROVIDER_SERIES_NOTE: Partial<Record<ProviderId, string>> = {
  YAHOO_UNOFFICIAL: 'continuous front-month, NOT roll-adjusted, not a specific contract month, UNOFFICIAL',
};
export const UNVERIFIED_PROVIDER_UNIT = 'UNVERIFIED_PROVIDER_UNIT';

export interface PersistOutcome {
  providerId: ProviderId;
  instrumentId: string;
  contractCode: string;
  timeframe: string;
  status: 'PERSISTED' | 'NO_NEW_ROWS' | 'SKIPPED' | 'FAILED';
  datasetId: string | null;
  rowsWritten: number;
  conflicts: number;
  message: string;
}

export type PersistProviderCandles = (args: {
  providerId: ProviderId;
  providerName: string;
  instrument: InstrumentDefinition;
  timeframe: Timeframe;
  candles: MarketCandle[];
  /** Price unit verified by the adapter (e.g. Yahoo currency checked against quotationUnit). */
  verifiedPriceUnit?: string;
}) => Promise<PersistOutcome>;

export function createProviderCandlePersister(
  repository: ICandleRepository,
  now: () => Date = () => new Date()
): PersistProviderCandles {
  return async ({ providerId, providerName, instrument, timeframe, candles, verifiedPriceUnit }) => {
    const contractCode = PROVIDER_CONTRACT_CODE[providerId] ?? `${VENDOR_CONTRACT_PREFIX}${providerId}`;
    const base = { providerId, instrumentId: instrument.id, contractCode, timeframe };
    const quality = PROVIDER_SOURCE_QUALITY[providerId];
    if (!quality) {
      return { ...base, status: 'SKIPPED', datasetId: null, rowsWritten: 0, conflicts: 0, message: `No source quality mapped for ${providerId}; not persisted.` };
    }
    const rows: CandleRow[] = [];
    for (const c of candles) {
      const ts = Date.parse(c.timestamp);
      if (Number.isNaN(ts)) continue;
      rows.push({
        timestampMs: ts,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume ?? null,
        openInterest: c.openInterest ?? null,
      });
    }
    rows.sort((a, b) => a.timestampMs - b.timestampMs);
    // Drop duplicate timestamps (keep the last) so the repository sees one row per bar.
    const unique = rows.filter((r, i) => i === rows.length - 1 || rows[i + 1].timestampMs !== r.timestampMs);
    if (unique.length === 0) {
      return { ...base, status: 'SKIPPED', datasetId: null, rowsWritten: 0, conflicts: 0, message: 'No valid timestamps.' };
    }
    const checksum = createHash('sha256').update(JSON.stringify(unique)).digest('hex');
    const symbols = [...new Set(candles.map((c) => c.symbol))].join(',');
    const dataset: DatasetRecord = {
      id: randomUUID(),
      instrumentId: instrument.id,
      contractCode,
      timeframe,
      continuousAdjustment: 'NONE',
      sourceLabel: `${providerName} API sync (provider symbol ${symbols || instrument.exchangeSymbol})${
        PROVIDER_SERIES_NOTE[providerId] ? ` - ${PROVIDER_SERIES_NOTE[providerId]}` : ''
      }`.slice(0, 200),
      sourceQuality: quality,
      importedAt: now().toISOString(),
      rowCount: unique.length,
      insertedCount: 0,
      firstTimestamp: new Date(unique[0].timestampMs).toISOString(),
      lastTimestamp: new Date(unique[unique.length - 1].timestampMs).toISOString(),
      timezone: 'UTC',
      dateFormat: 'ISO-8601 (provider API)',
      priceUnit: verifiedPriceUnit?.trim() || UNVERIFIED_PROVIDER_UNIT,
      priceUnitDeclared: true,
      checksum,
      importMode: 'append',
    };
    try {
      const result = await repository.commitImport(dataset, unique, 'append');
      const conflicts = result.plan.conflicts.length;
      if (!result.committed) {
        return {
          ...base,
          status: result.plan.seriesMismatch ? 'FAILED' : 'NO_NEW_ROWS',
          datasetId: null,
          rowsWritten: 0,
          conflicts,
          message: result.plan.seriesMismatch ?? 'No new bars to persist.',
        };
      }
      return {
        ...base,
        status: 'PERSISTED',
        datasetId: result.dataset?.id ?? dataset.id,
        rowsWritten: result.dataset?.insertedCount ?? result.plan.rowsToWrite.length,
        conflicts,
        message: conflicts > 0 ? `${conflicts} conflicting bar(s) kept as stored (append mode).` : 'Persisted.',
      };
    } catch (err) {
      return {
        ...base,
        status: 'FAILED',
        datasetId: null,
        rowsWritten: 0,
        conflicts: 0,
        message: err instanceof Error ? err.message : 'Persistence failed.',
      };
    }
  };
}
