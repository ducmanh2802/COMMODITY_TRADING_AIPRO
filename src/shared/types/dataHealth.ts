import type { ExchangeCode, ProductCategory } from './instrument';
import type { DataQualityStatus } from './market';
import type { FundamentalDatasetCategory } from './analysis';

export interface DataHealthStatusCounts {
  current: number;
  delayed: number;
  historical: number;
  stale: number;
  unavailable: number;
  invalid: number;
}

export interface CommodityDataHealthRow {
  instrumentId: string;
  symbol: string;
  productName: string;
  vietnameseName: string;
  exchange: ExchangeCode;
  category: ProductCategory;
  isMvxListed: boolean;
  quotationUnit: string;
  quoteStatus: DataQualityStatus;
  quotePrice: number | null;
  quoteSource: string;
  quoteTimestamp: string | null;
  dailyBars: number;
  weeklyBars: number;
  monthlyBars: number;
  earliestDate: string | null;
  latestDate: string | null;
  spanYears: number;
  coverage1Y: number;
  coverage3Y: number;
  coverage5Y: number;
  coverage10Y: number;
  missingGapCount: number;
  duplicateCount: number;
  invalidOhlcCount: number;
  historicalFreshness: DataQualityStatus;
  individualContracts: string[];
  continuousAdjustments: string[];
  vendorProxyCount: number;
  rollNotice: string | null;
  cotStatus: 'SYNCED' | 'STALE' | 'UNSYNCED' | 'NOT_REPORTED';
  cotWeeks: number;
  cotLastReportDate: string | null;
  fundamentalCount: number;
  dataQualityScore: number;
  qualityBreakdown: {
    priceAndHistory: number;
    fundamental: number;
    cot: number;
  };
  missingItems: string[];
}

export interface ExchangeLicensingInfo {
  id: string;
  exchangeGroup: string;
  exchanges: ExchangeCode[];
  primaryOfficialFeed: string;
  accessTier: string;
  requiresPaidLicense: boolean;
  publicApiAvailable: boolean;
  supportedFreeSources: string[];
  rateLimitNote: string;
  contractRollPolicy: string;
  csvImportTemplateHint: string;
  legalAndComplianceNote: string;
}

export interface FundamentalDomainHealthItem {
  id: FundamentalDatasetCategory;
  name: string;
  nameVi: string;
  cadence: string;
  cadenceMaxAgeDays: number;
  expectedReleaseLagDays: number;
  primarySource: string;
  requiresKey: boolean;
  envVarHint: string | null;
  status: DataQualityStatus;
  recordCount: number;
  latestObservationDate: string | null;
  latestPublicationDate: string | null;
  unit: string | null;
  notes: string;
}

export interface EngineReadinessItem {
  id: string;
  name: string;
  status: 'READY' | 'PARTIAL' | 'DATA_UNAVAILABLE';
  readyInstruments: number;
  totalInstruments: number;
  formulaPreserved?: boolean;
  notes: string;
}

export interface FullDataHealthReport {
  generatedAt: string;
  overallQualityScore: number;
  overallStatus: DataQualityStatus;
  statusBreakdown: DataHealthStatusCounts;
  providerSummary: {
    total: number;
    connected: number;
    configured: number;
    degradedOrError: number;
    lastSuccessfulUpdate: string | null;
  };
  coverageSummary: {
    totalCommodities: number;
    withPriceQuote: number;
    withDailyHistory: number;
    with5YHistory: number;
    with10YHistory: number;
    withCotHistory: number;
    totalMissingGaps: number;
    totalStaleSeries: number;
  };
  commodities: CommodityDataHealthRow[];
  exchangeAdapters: ExchangeLicensingInfo[];
  fundamentalDomains: FundamentalDomainHealthItem[];
  engineReadiness: EngineReadinessItem[];
}
