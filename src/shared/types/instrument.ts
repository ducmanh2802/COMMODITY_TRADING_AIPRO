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
  | 'ICE';

export type Timeframe = 'M1' | 'M5' | 'M15' | 'M30' | 'H1' | 'H4' | 'D1' | 'W1';

export type TradingStyle = 'SCALPING' | 'INTRADAY' | 'SWING' | 'POSITION';

export type SpecificationStatus = 'VERIFIED' | 'UNVERIFIED' | 'UNAVAILABLE';

export type MvxMappingStatus = 'VERIFIED' | 'UNVERIFIED' | 'UNAVAILABLE';

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

export interface MvxInstrumentMapping {
  mxvSymbol: string | null;
  internationalSymbol: string;
  internationalExchange: ExchangeCode;
  mappingStatus: MvxMappingStatus;
  notes: string;
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
