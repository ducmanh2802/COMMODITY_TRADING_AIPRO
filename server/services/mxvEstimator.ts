/**
 * T32 — MXV reference value estimator (educational / research only).
 *
 * Computes the VND notional value of ONE MXV contract as
 *   linked international price (from the existing quote chain, with its status & timestamp)
 *   x price-unit conversion to USD per physical unit
 *   x MXV contract size (read on the MXV product page, `mxvMapping.mxvContractSpec`)
 *   x USD/VND rate (provider rate, or a manual rate labelled USER_PROVIDED).
 *
 * This is NOT an MXV price: MXV prices are licensed and have no public API. The result is labelled
 * "Ước tính tham chiếu — không phải giá MXV" and carries every input with its status/timestamp.
 *
 * Refusals (no number is produced):
 * - MXV mapping not VERIFIED, or no MXV contract spec with a source URL;
 * - the linked international price is UNAVAILABLE / INVALID / missing a timestamp or price;
 * - the quote currency/unit cannot be converted to USD per MXV contract unit;
 * - the USD/VND rate is UNAVAILABLE.
 *
 * State Bank of Vietnam central rate: sbv.gov.vn publishes it only on JS-rendered pages / news
 * articles (no machine-readable official endpoint could be verified on 2026-11-18), so it is NOT
 * fetched. The existing provider rate is used; the user may pass a manual rate (e.g. the SBV central
 * rate they read themselves), which is labelled USER_PROVIDED.
 */
import type { InstrumentDefinition, MxvContractSizeUnit, MxvContractSpec } from '../../src/shared/types/instrument.ts';
import type { DataQualityStatus, MarketQuote } from '../../src/shared/types/market.ts';

export const MXV_ESTIMATE_LABEL = 'Ước tính tham chiếu — không phải giá MXV';
export const MXV_ESTIMATE_DISCLAIMER =
  'Giá trị danh nghĩa tham chiếu của 1 hợp đồng MXV, tính từ giá sàn quốc tế liên thông × độ lớn hợp đồng MXV × tỷ giá USD/VND. Chỉ dùng cho mục đích học tập/nghiên cứu; không phải giá khớp lệnh hay giá niêm yết của MXV, không dùng để giao dịch.';

export type FxInputStatus = 'CURRENT' | 'DELAYED' | 'HISTORICAL' | 'STALE' | 'UNAVAILABLE' | 'USER_PROVIDED';
export type EstimateStatus = DataQualityStatus | 'USER_PROVIDED';

/** Worst-first ordering used for "status = worst of inputs". USER_PROVIDED has unknown freshness. */
const STATUS_RANK: Record<EstimateStatus, number> = {
  CURRENT: 0,
  DELAYED: 1,
  HISTORICAL: 2,
  STALE: 3,
  USER_PROVIDED: 4,
  UNAVAILABLE: 5,
  INVALID: 6,
};

export function worstStatus(statuses: readonly EstimateStatus[]): EstimateStatus {
  return statuses.reduce<EstimateStatus>((worst, s) => (STATUS_RANK[s] > STATUS_RANK[worst] ? s : worst), 'CURRENT');
}

export interface FxRateInput {
  rate: number | null;
  status: FxInputStatus;
  timestamp: string | null;
  source: string;
  reason?: string;
}

const UNIT_ALIASES: Record<string, MxvContractSizeUnit> = {
  bushel: 'bushel',
  bushels: 'bushel',
  bu: 'bushel',
  'short ton': 'short ton',
  'short tons': 'short ton',
  lb: 'lb',
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
  cwt: 'cwt',
  mt: 'metric ton',
  'metric ton': 'metric ton',
  'metric tons': 'metric ton',
  tonne: 'metric ton',
  tonnes: 'metric ton',
  'troy oz': 'troy oz',
  'troy ounce': 'troy oz',
};

export interface PriceUnitConversion {
  /** Multiply a quoted price by this to get USD per `perUnit`. */
  usdFactor: number;
  perUnit: MxvContractSizeUnit;
}

/** Parses 'cents/bushel', 'USD/MT', 'USD/troy oz'... Returns null for anything not explicitly supported. */
export function parseQuotationUnit(unit: string): PriceUnitConversion | null {
  const m = /^\s*(cents|usd)\s*\/\s*(.+?)\s*$/i.exec(unit);
  if (!m) return null;
  const perUnit = UNIT_ALIASES[m[2].toLowerCase()];
  if (!perUnit) return null;
  return { usdFactor: m[1].toLowerCase() === 'cents' ? 0.01 : 1, perUnit };
}

export interface MxvEstimateInputs {
  mxvContract: MxvContractSpec & { mxvSymbol: string; mappingStatus: string };
  internationalPrice: {
    instrumentId: string;
    symbol: string;
    exchange: string;
    price: number | null;
    currency: string;
    unit: string;
    status: DataQualityStatus;
    timestamp: string | null;
    retrievedAt: string | null;
    source: string;
    sourceQuality: string | null;
    contract: string | null;
    statusReason: string | null;
  } | null;
  unitConversion: (PriceUnitConversion & { note: string }) | null;
  usdVnd: FxRateInput | null;
}

export interface MxvEstimateResult {
  label: typeof MXV_ESTIMATE_LABEL;
  disclaimer: string;
  mxvSymbol: string;
  internationalInstrumentId: string;
  /** Worst of the input statuses; UNAVAILABLE when refused. */
  status: EstimateStatus;
  refused: boolean;
  refusalReasons: string[];
  /** USD value of one MXV contract (unrounded), null when refused. */
  notionalUsd: number | null;
  /** VND value of one MXV contract, rounded to whole VND; null when refused. */
  notionalVnd: number | null;
  /** Formula with the actual numbers, for audit. */
  formula: string | null;
  /** Oldest timestamp among inputs that carry one (ISO-8601). */
  oldestInputTimestamp: string | null;
  inputs: MxvEstimateInputs;
  warnings: string[];
  computedAt: string;
}

/** Why an instrument is not eligible for an estimate at all (no quote/FX needed to know), or null. */
export function mxvEstimateIneligibility(instrument: InstrumentDefinition): string | null {
  const mapping = instrument.mxvMapping;
  if (!instrument.isMvxListed || !mapping?.mxvSymbol) return 'Instrument is not MXV-listed.';
  if (mapping.mappingStatus !== 'VERIFIED') {
    return `MXV mapping ${mapping.mxvSymbol} is ${mapping.mappingStatus}; estimates are only produced for VERIFIED mappings.`;
  }
  const spec = mapping.mxvContractSpec;
  if (!spec || !(spec.contractSize > 0) || !spec.sourceUrl) {
    return `MXV contract size for ${mapping.mxvSymbol} has not been verified on an MXV source; refusing to assume the international contract size.`;
  }
  return null;
}

export interface EstimateArgs {
  instrument: InstrumentDefinition;
  quote: MarketQuote | null;
  usdVnd: FxRateInput | null;
  now?: Date;
}

export function computeMxvEstimate({ instrument, quote, usdVnd, now = new Date() }: EstimateArgs): MxvEstimateResult {
  const mapping = instrument.mxvMapping;
  const spec = mapping?.mxvContractSpec;
  const reasons: string[] = [];
  const warnings: string[] = [];

  const ineligible = mxvEstimateIneligibility(instrument);
  if (ineligible) reasons.push(ineligible);

  const inputs: MxvEstimateInputs = {
    mxvContract: {
      ...(spec ?? {
        contractSize: Number.NaN,
        contractSizeUnit: 'lb',
        minimumTick: Number.NaN,
        quotationUnit: '',
        linkedExchangeLabel: '',
        sourceUrl: '',
        checkedOn: '',
      }),
      mxvSymbol: mapping?.mxvSymbol ?? '',
      mappingStatus: mapping?.mappingStatus ?? 'UNAVAILABLE',
    },
    internationalPrice: quote
      ? {
          instrumentId: instrument.id,
          symbol: quote.symbol,
          exchange: quote.exchange,
          price: quote.price,
          currency: quote.currency,
          unit: quote.unit,
          status: quote.status,
          timestamp: quote.timestamp,
          retrievedAt: quote.retrievedAt ?? null,
          source: quote.source,
          sourceQuality: quote.sourceQuality ?? null,
          contract: quote.contract ?? quote.contractMonth ?? null,
          statusReason: quote.statusReason ?? null,
        }
      : null,
    unitConversion: null,
    usdVnd,
  };

  // International price.
  const priceStatus: EstimateStatus = quote?.status ?? 'UNAVAILABLE';
  if (!quote || quote.price === null || !Number.isFinite(quote.price) || quote.price <= 0) {
    reasons.push(`Linked international price for ${instrument.id} is UNAVAILABLE${quote?.statusReason ? `: ${quote.statusReason}` : '.'}`);
  } else if (quote.status === 'UNAVAILABLE' || quote.status === 'INVALID') {
    reasons.push(`Linked international price for ${instrument.id} has status ${quote.status}.`);
  } else if (!quote.timestamp) {
    reasons.push(`Linked international price for ${instrument.id} has no market timestamp; refusing.`);
  }

  // Unit conversion: quote currency must be USD and its per-unit must equal the MXV contract unit.
  if (quote && spec) {
    const conv = parseQuotationUnit(quote.unit);
    if (quote.currency.toUpperCase() !== 'USD') {
      reasons.push(`Quote currency ${quote.currency} is not USD; no conversion is defined.`);
    } else if (!conv) {
      reasons.push(`Unsupported quotation unit "${quote.unit}"; refusing to guess a conversion.`);
    } else if (conv.perUnit !== spec.contractSizeUnit) {
      reasons.push(
        `Quotation unit "${quote.unit}" (per ${conv.perUnit}) does not match the MXV contract unit (${spec.contractSizeUnit}).`
      );
    } else {
      inputs.unitConversion = {
        ...conv,
        note:
          conv.usdFactor === 1
            ? `Price already in USD/${conv.perUnit}.`
            : `Price quoted in US cents/${conv.perUnit}; divided by 100 to USD/${conv.perUnit}.`,
      };
    }
  }

  // FX.
  const fxStatus: EstimateStatus = usdVnd?.status ?? 'UNAVAILABLE';
  if (!usdVnd || usdVnd.status === 'UNAVAILABLE' || usdVnd.rate === null || !Number.isFinite(usdVnd.rate) || usdVnd.rate <= 0) {
    reasons.push(`USD/VND rate is UNAVAILABLE${usdVnd?.reason ? `: ${usdVnd.reason}` : '.'} Pass ?usdVnd=<rate> to use a user-provided rate.`);
  }
  if (usdVnd?.status === 'USER_PROVIDED') {
    warnings.push('Tỷ giá USD/VND do người dùng cung cấp (USER_PROVIDED); không được hệ thống kiểm chứng.');
  }

  const timestamps = [quote?.timestamp ?? null, usdVnd?.timestamp ?? null].filter((t): t is string => Boolean(t));
  const oldestInputTimestamp = timestamps.length > 0 ? [...timestamps].sort()[0] : null;
  if (usdVnd?.status === 'USER_PROVIDED' && !usdVnd.timestamp) {
    warnings.push('User-provided USD/VND rate has no as-of date; it is excluded from oldestInputTimestamp.');
  }
  if (quote?.sourceQuality === 'UNOFFICIAL') {
    warnings.push('International price comes from an UNOFFICIAL source (personal use only).');
  }
  if (quote?.contract || quote?.contractMonth === null) {
    warnings.push(
      `International price refers to ${quote?.contract ?? 'an unspecified contract (likely continuous front month)'}; the MXV contract month you trade may differ.`
    );
  }
  warnings.push('MXV fees, margin, basis between MXV and the linked exchange, and trading-hour differences are not included.');

  const base = {
    label: MXV_ESTIMATE_LABEL,
    disclaimer: MXV_ESTIMATE_DISCLAIMER,
    mxvSymbol: mapping?.mxvSymbol ?? '',
    internationalInstrumentId: instrument.id,
    oldestInputTimestamp,
    inputs,
    warnings,
    computedAt: now.toISOString(),
  } as const;

  if (reasons.length > 0 || !spec || !quote || quote.price === null || !inputs.unitConversion || !usdVnd?.rate) {
    return {
      ...base,
      status: 'UNAVAILABLE',
      refused: true,
      refusalReasons: reasons.length > 0 ? reasons : ['Missing input.'],
      notionalUsd: null,
      notionalVnd: null,
      formula: null,
    };
  }

  const usdPerUnit = quote.price * inputs.unitConversion.usdFactor;
  const notionalUsd = usdPerUnit * spec.contractSize;
  const notionalVnd = Math.round(notionalUsd * usdVnd.rate);
  const formula = `${quote.price} ${quote.unit} × ${inputs.unitConversion.usdFactor} = ${usdPerUnit} USD/${spec.contractSizeUnit}; × ${spec.contractSize} ${spec.contractSizeUnit} = ${notionalUsd} USD; × ${usdVnd.rate} VND/USD = ${notionalVnd} VND`;

  return {
    ...base,
    status: worstStatus([priceStatus, fxStatus]),
    refused: false,
    refusalReasons: [],
    notionalUsd,
    notionalVnd,
    formula,
  };
}
