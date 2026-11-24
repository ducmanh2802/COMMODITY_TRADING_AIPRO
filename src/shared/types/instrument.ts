export type ProductCategory =
  | 'AGRICULTURE'
  | 'SOFT_COMMODITIES'
  | 'METALS'
  | 'ENERGY';

export type ExchangeCode =
  | 'MXV'
  | 'CBOT'
  | 'CME'
  | 'COMEX'
  | 'NYMEX'
  | 'ICE'
  | 'SGX';

export type Timeframe = 'M1' | 'M5' | 'M15' | 'M30' | 'H1' | 'H4' | 'D1' | 'W1';

export type TradingStyle = 'SCALPING' | 'INTRADAY' | 'SWING' | 'POSITION';

type SpecificationStatus = 'VERIFIED' | 'UNVERIFIED' | 'UNAVAILABLE';

type MvxMappingStatus = 'VERIFIED' | 'UNVERIFIED' | 'UNAVAILABLE';

export interface ContractSpecification {
  contractSize: number | null;
  contractSizeUnit: string;
  minimumTickSize: number | null;
  tickValue: number | null;
  tradingCurrency: string;
  quotationUnit: string;
  expirationDate: string | null;
  firstNoticeDate: string | null;
  tradingHoursTimezone: string;
  tradingHoursSummary: string;
  marginRequirement: number | null;
  marginCurrency: string | null;
  settlementMethod: 'PHYSICAL' | 'CASH' | 'UNSPECIFIED';
  dataSource: string;
  verificationStatus: SpecificationStatus;
}

/** Physical units used by MXV contract sizes (normalized; see server/services/mxvEstimator.ts). */
export type MxvContractSizeUnit = 'bushel' | 'short ton' | 'lb' | 'cwt' | 'metric ton' | 'troy oz';

/**
 * MXV's own contract specification, as read on the MXV product page (`sourceUrl`). Only present when
 * the page was read; MXV contracts can differ from the linked international contract (mini/micro).
 */
export interface MxvContractSpec {
  contractSize: number;
  contractSizeUnit: MxvContractSizeUnit;
  /** Minimum tick as shown by MXV, in `quotationUnit`. */
  minimumTick: number;
  /** Quotation unit as shown on the MXV page, e.g. 'cents/bushel'. */
  quotationUnit: string;
  /** Linked foreign exchange label exactly as MXV shows it (CBOT, ICEUS, ICEEU, COMEX, NYMEX, SGX). */
  linkedExchangeLabel: string;
  sourceUrl: string;
  checkedOn: string;
}

interface MvxInstrumentMapping {
  mxvSymbol: string | null;
  internationalSymbol: string;
  internationalExchange: ExchangeCode;
  mappingStatus: MvxMappingStatus;
  notes: string;
  /** Optional (T32): MXV contract size etc. read on the MXV product page. */
  mxvContractSpec?: MxvContractSpec;
}

export interface CommodityAnalysisProfile {
  vietnameseName: string;
  contractMonths: string[];
  contractCycleSummary: string;
  deliveryGrade: string;
  vietnamTradingSessionsIct: string;
  vietnamMarketRelevance: string;
  correlationGroup: string;
  fundamentalDrivers: string[];
  seasonalPattern: string;
  fxSensitivity: string;
  riskNotes: string;
}

export interface ProviderSymbolMapping {
  alphaVantageFunction?: string;
  alphaVantageNote?: string;
  twelveDataSymbol?: string;
  twelveDataNote?: string;
  fmpSymbol?: string;
  commoditiesApiSymbol?: string;
  eiaSeriesType?: 'WTI' | 'BRENT' | 'NATURAL_GAS';
  usdaCommodity?: 'SOYBEANS' | 'CORN' | 'WHEAT' | 'COTTON' | 'RICE';
  mxvCode?: string | null;
}

export interface InstrumentDefinition {
  id: string;
  productName: string;
  category: ProductCategory;
  exchange: ExchangeCode;
  exchangeSymbol: string;
  contractMonth: string | null;
  contractYear: number | null;
  isMvxListed: boolean;
  specification: ContractSpecification;
  mxvMapping: MvxInstrumentMapping | null;
  commodityProfile?: CommodityAnalysisProfile;
  providerMappings?: ProviderSymbolMapping;
  enabled: boolean;
}
