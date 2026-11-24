import type {
  FundamentalDatasetCategory,
  FundamentalMacroRecord,
  MarketDirection,
} from '../../src/shared/types/analysis.ts';
import type { DataQualityStatus } from '../../src/shared/types/market.ts';

type MacroDatasetType =
  | 'USDA_REPORT'
  | 'EIA_REPORT'
  | 'CROP_PRODUCTION'
  | 'GLOBAL_INVENTORY'
  | 'SUPPLY_DEMAND'
  | 'WEATHER'
  | 'EXPORT_IMPORT'
  | 'SEASONAL_TREND'
  | 'USD_INDEX'
  | 'USD_VND'
  | 'INTEREST_RATES'
  | 'INFLATION'
  | 'CENTRAL_BANK_POLICY'
  | 'GEOPOLITICAL';

export interface SourcedNewsItem {
  id: string;
  headline: string;
  source: string;
  publicationTimestamp: string;
  category: MacroDatasetType;
  relatedSymbols: string[];
  classification: MarketDirection;
  summary: string;
}

export interface FundamentalDomainStatus {
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

export interface FundamentalListFilter {
  /** Strict no-look-ahead guard: excludes any record published strictly after `asOf` ISO timestamp. */
  asOf?: string;
  category?: FundamentalDatasetCategory;
  symbol?: string;
  nowMs?: number;
}

export function sanitizeExternalText(raw: string): string {
  return raw
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/(ignore\s+previous\s+instructions|system\s*:|assistant\s*:)/gi, '[redacted]')
    .trim()
    .slice(0, 600);
}

function inferFundamentalCategory(
  dataset: string,
  source: string,
  explicit?: FundamentalDatasetCategory
): FundamentalDatasetCategory {
  if (explicit) return explicit;
  const hay = `${dataset} ${source}`.toUpperCase();
  if (hay.includes('WASDE')) return 'USDA_WASDE';
  if (hay.includes('USDA') || hay.includes('QUICKSTATS') || hay.includes('CROP') || hay.includes('PRODUCTION')) {
    return 'USDA_CROP';
  }
  if (hay.includes('EIA') || hay.includes('CRUDE_STOCKS') || hay.includes('NATURAL_GAS_STORAGE')) {
    return 'EIA_INVENTORIES';
  }
  if (hay.includes('COT') || hay.includes('CFTC')) return 'CFTC_COT';
  if (hay.includes('ICE_STOCK') || hay.includes('CERTIFIED_STOCK') || hay.includes('WAREHOUSE')) {
    return 'ICE_STOCKS';
  }
  if (hay.includes('WEATHER') || hay.includes('ENSO') || hay.includes('DROUGHT') || hay.includes('FROST')) {
    return 'WEATHER_RISK';
  }
  if (hay.includes('SEASONAL')) return 'SEASONAL';
  if (hay.includes('SUPPLY_DEMAND') || hay.includes('BALANCE') || hay.includes('GLOBAL_SD')) {
    return 'GLOBAL_SD';
  }
  return 'MACRO';
}

function deriveObservationDate(dataPeriod: string, publicationTimestamp: string): string {
  const isoMatch = dataPeriod.match(/(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  const ymMatch = dataPeriod.match(/^(\d{4})-(\d{2})$/);
  if (ymMatch) return `${ymMatch[1]}-${ymMatch[2]}-01`;
  const yearMatch = dataPeriod.match(/^(\d{4})$/);
  if (yearMatch) return `${yearMatch[1]}-01-01`;
  const pubMs = Date.parse(publicationTimestamp);
  return Number.isFinite(pubMs) ? new Date(pubMs).toISOString().slice(0, 10) : dataPeriod;
}

const CATEGORY_MAX_AGE_DAYS: Record<FundamentalDatasetCategory, number> = {
  USDA_WASDE: 45,
  USDA_CROP: 400,
  EIA_INVENTORIES: 14,
  CFTC_COT: 17,
  ICE_STOCKS: 10,
  GLOBAL_SD: 45,
  SEASONAL: 366,
  WEATHER_RISK: 21,
  MACRO: 65,
};

function evaluateFundamentalFreshness(
  publicationTimestamp: string,
  category: FundamentalDatasetCategory,
  nowMs: number = Date.now()
): DataQualityStatus {
  const pubMs = Date.parse(publicationTimestamp);
  if (!Number.isFinite(pubMs)) return 'INVALID';
  // Allow slight 12h clock skew; genuinely future-dated releases outside live `now` are INVALID if unguarded
  if (pubMs - nowMs > 24 * 3600_000) return 'INVALID';
  const maxAgeDays = CATEGORY_MAX_AGE_DAYS[category] ?? 45;
  const ageDays = (nowMs - pubMs) / 86_400_000;
  if (ageDays > maxAgeDays) return 'STALE';
  return 'HISTORICAL';
}

function computeReleaseLagDays(observationDate: string, publicationTimestamp: string): number {
  const obsMs = Date.parse(`${observationDate.slice(0, 10)}T00:00:00.000Z`);
  const pubDate = publicationTimestamp.slice(0, 10);
  const pubMs = Date.parse(`${pubDate}T00:00:00.000Z`);
  if (!Number.isFinite(obsMs) || !Number.isFinite(pubMs)) return 0;
  return Math.max(0, Math.round((pubMs - obsMs) / 86_400_000));
}

type FundamentalStoreChangeKind = 'RECORD' | 'NEWS' | 'CLEAR';

export interface FundamentalStoreChangeEvent {
  kind: FundamentalStoreChangeKind;
  timestamp: string;
  record?: FundamentalMacroRecord;
  news?: SourcedNewsItem;
}

export type FundamentalStoreListener = (event: FundamentalStoreChangeEvent) => void;

export interface FundamentalNewsFilter {
  /** Strict no-look-ahead guard: excludes any item published strictly after `asOf` ISO timestamp. */
  asOf?: string;
  symbol?: string;
  category?: MacroDatasetType;
}

function normalizeRelatedSymbols(symbols?: string[]): string[] {
  if (!symbols || symbols.length === 0) return [];
  const seen = new Set<string>();
  for (const raw of symbols) {
    const clean = raw.trim().toUpperCase();
    if (clean) seen.add(clean);
  }
  return [...seen];
}

/**
 * Stores strictly sourced fundamental and macro records.
 * Starts empty so zero unsourced or fabricated fundamental facts are ever displayed.
 */
export class FundamentalStore {
  private readonly records: FundamentalMacroRecord[] = [];
  private readonly news: SourcedNewsItem[] = [];
  private readonly listeners = new Set<FundamentalStoreListener>();

  subscribe(listener: FundamentalStoreListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: FundamentalStoreChangeEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Isolate listener failures so store writes stay reliable.
      }
    }
  }

  /**
   * Lists sourced records sorted newest-published first.
   * When `filter.asOf` is supplied, enforces strict no-look-ahead bias protection by
   * excluding any record whose `publicationTimestamp` is strictly after `asOf`.
   */
  listRecords(filter: FundamentalListFilter = {}): FundamentalMacroRecord[] {
    const nowMs = filter.nowMs ?? (filter.asOf ? Date.parse(filter.asOf) : Date.now());
    const asOfMs = filter.asOf ? Date.parse(filter.asOf) : null;
    const targetSym = filter.symbol?.trim().toUpperCase();

    return this.records
      .filter((r) => {
        if (asOfMs !== null && Number.isFinite(asOfMs)) {
          const pubMs = Date.parse(r.publicationTimestamp);
          if (!Number.isFinite(pubMs) || pubMs > asOfMs) return false;
        }
        if (filter.category && r.category !== filter.category) return false;
        if (targetSym && r.relatedSymbols && r.relatedSymbols.length > 0) {
          if (!r.relatedSymbols.map((s) => s.toUpperCase()).includes(targetSym)) return false;
        }
        return true;
      })
      .map((r) => {
        const cat = r.category ?? inferFundamentalCategory(r.dataset, r.source);
        return {
          ...r,
          category: cat,
          freshnessStatus: evaluateFundamentalFreshness(r.publicationTimestamp, cat, nowMs),
        };
      })
      .sort((a, b) => b.publicationTimestamp.localeCompare(a.publicationTimestamp));
  }

  addRecord(record: Omit<FundamentalMacroRecord, 'id'>): FundamentalMacroRecord {
    const cleanDataset = sanitizeExternalText(record.dataset);
    const cleanSource = sanitizeExternalText(record.source);
    const cleanPeriod = sanitizeExternalText(record.dataPeriod);
    const cleanUnit = sanitizeExternalText(record.unit);
    const category = inferFundamentalCategory(cleanDataset, cleanSource, record.category);
    const observationDate =
      record.observationDate ?? deriveObservationDate(cleanPeriod, record.publicationTimestamp);
    const releaseLagDays =
      record.releaseLagDays ?? computeReleaseLagDays(observationDate, record.publicationTimestamp);
    const freshnessStatus =
      record.freshnessStatus ?? evaluateFundamentalFreshness(record.publicationTimestamp, category);

    // Replace existing identical dataset + observationDate + source so repeated syncs stay idempotent
    const existingIdx = this.records.findIndex(
      (r) =>
        r.dataset === cleanDataset &&
        r.source === cleanSource &&
        (r.observationDate ?? r.dataPeriod) === observationDate
    );

    const created: FundamentalMacroRecord = {
      ...record,
      id: existingIdx >= 0 ? this.records[existingIdx].id : `macro_${Date.now()}_${this.records.length + 1}`,
      dataset: cleanDataset,
      source: cleanSource,
      dataPeriod: cleanPeriod,
      observationDate,
      category,
      relatedSymbols: record.relatedSymbols ? normalizeRelatedSymbols(record.relatedSymbols) : undefined,
      unit: cleanUnit,
      freshnessStatus,
      releaseLagDays,
    };

    if (existingIdx >= 0) {
      this.records[existingIdx] = created;
    } else {
      this.records.push(created);
    }
    this.emit({ kind: 'RECORD', timestamp: new Date().toISOString(), record: created });
    return created;
  }

  listNews(filter: FundamentalNewsFilter = {}): SourcedNewsItem[] {
    const asOfMs = filter.asOf ? Date.parse(filter.asOf) : null;
    const targetSym = filter.symbol?.trim().toUpperCase();
    return this.news
      .filter((n) => {
        if (asOfMs !== null && Number.isFinite(asOfMs)) {
          const pubMs = Date.parse(n.publicationTimestamp);
          if (!Number.isFinite(pubMs) || pubMs > asOfMs) return false;
        }
        if (filter.category && n.category !== filter.category) return false;
        if (targetSym && n.relatedSymbols.length > 0) {
          if (!n.relatedSymbols.map((s) => s.toUpperCase()).includes(targetSym)) return false;
        }
        return true;
      })
      .sort((a, b) => b.publicationTimestamp.localeCompare(a.publicationTimestamp));
  }

  addNews(item: Omit<SourcedNewsItem, 'id'>): SourcedNewsItem {
    const created: SourcedNewsItem = {
      ...item,
      id: `news_${Date.now()}_${this.news.length + 1}`,
      headline: sanitizeExternalText(item.headline),
      source: sanitizeExternalText(item.source),
      relatedSymbols: normalizeRelatedSymbols(item.relatedSymbols),
      summary: sanitizeExternalText(item.summary),
    };
    this.news.push(created);
    this.emit({ kind: 'NEWS', timestamp: new Date().toISOString(), news: created });
    return created;
  }

  clearAll(): void {
    const hadItems = this.records.length > 0 || this.news.length > 0;
    this.records.length = 0;
    this.news.length = 0;
    if (hadItems) {
      this.emit({ kind: 'CLEAR', timestamp: new Date().toISOString() });
    }
  }
}

export const fundamentalStore = new FundamentalStore();

export function buildFundamentalDomainsStatus(params: {
  records?: FundamentalMacroRecord[];
  cotHealth?: {
    overallStatus: 'CURRENT' | 'STALE' | 'UNAVAILABLE';
    reportedMarketsCount: number;
    latestReportDate: string | null;
    latestReleaseDate: string | null;
    totalWeeksStored: number;
  } | null;
  dailySeriesCount?: number;
  nowMs?: number;
}): FundamentalDomainStatus[] {
  const nowMs = params.nowMs ?? Date.now();
  const records = params.records ?? fundamentalStore.listRecords({ nowMs });

  const summarize = (
    id: FundamentalDatasetCategory,
    name: string,
    nameVi: string,
    cadence: string,
    cadenceMaxAgeDays: number,
    expectedReleaseLagDays: number,
    primarySource: string,
    requiresKey: boolean,
    envVarHint: string | null,
    missingNote: string
  ): FundamentalDomainStatus => {
    const matching = records.filter((r) => r.category === id);
    if (matching.length === 0) {
      return {
        id,
        name,
        nameVi,
        cadence,
        cadenceMaxAgeDays,
        expectedReleaseLagDays,
        primarySource,
        requiresKey,
        envVarHint,
        status: 'UNAVAILABLE',
        recordCount: 0,
        latestObservationDate: null,
        latestPublicationDate: null,
        unit: null,
        notes: missingNote,
      };
    }
    const latest = matching[0];
    const freshness = evaluateFundamentalFreshness(latest.publicationTimestamp, id, nowMs);
    return {
      id,
      name,
      nameVi,
      cadence,
      cadenceMaxAgeDays,
      expectedReleaseLagDays,
      primarySource: latest.source,
      requiresKey,
      envVarHint,
      status: freshness,
      recordCount: matching.length,
      latestObservationDate: latest.observationDate ?? latest.dataPeriod,
      latestPublicationDate: latest.publicationTimestamp.slice(0, 10),
      unit: latest.unit,
      notes: `${matching.length} bản ghi xác thực (lag ${latest.releaseLagDays ?? 0}d).`,
    };
  };

  const cot = params.cotHealth;
  const cotDomain: FundamentalDomainStatus = {
    id: 'CFTC_COT',
    name: 'CFTC Commitments of Traders',
    nameVi: 'Vị thế Đầu cơ & Thương mại CFTC COT',
    cadence: 'Hàng tuần (Chốt T3, công bố T6 15:30 ET)',
    cadenceMaxAgeDays: 17,
    expectedReleaseLagDays: 3,
    primarySource: 'CFTC Socrata Open Data / Historical Archive ZIP',
    requiresKey: false,
    envVarHint: null,
    status: cot ? (cot.totalWeeksStored > 0 ? cot.overallStatus : 'UNAVAILABLE') : 'UNAVAILABLE',
    recordCount: cot?.totalWeeksStored ?? 0,
    latestObservationDate: cot?.latestReportDate ?? null,
    latestPublicationDate: cot?.latestReleaseDate ?? null,
    unit: 'Contracts & % OI',
    notes:
      cot && cot.totalWeeksStored > 0
        ? `${cot.reportedMarketsCount} hàng hóa được đồng bộ (${cot.totalWeeksStored} tuần COT). Tuân thủ lag T3 -> T6.`
        : 'Khả dụng miễn phí 100% không cần key (nhấn Sync COT để tải 4 năm vị thế Disaggregated).',
  };

  const seasonalCount = params.dailySeriesCount ?? 0;
  const seasonalDomain: FundamentalDomainStatus = {
    id: 'SEASONAL',
    name: 'Commodity Seasonal Patterns',
    nameVi: 'Chu kỳ Mùa vụ Hàng hóa (12 Tháng)',
    cadence: 'Tính toán tất định từ chuỗi D1/Monthly',
    cadenceMaxAgeDays: 366,
    expectedReleaseLagDays: 0,
    primarySource: 'Cycle Engine Deterministic Seasonal Calculator',
    requiresKey: false,
    envVarHint: null,
    status: seasonalCount > 0 ? 'HISTORICAL' : 'UNAVAILABLE',
    recordCount: seasonalCount,
    latestObservationDate: null,
    latestPublicationDate: null,
    unit: '% Avg Return / Win Rate',
    notes:
      seasonalCount > 0
        ? `Đã tính mùa vụ thực tế cho ${seasonalCount} hàng hóa có dữ liệu OHLCV.`
        : 'DATA_UNAVAILABLE — Cần dữ liệu D1 >= 60 phiên cho từng mã để tính phân phối mùa vụ.',
  };

  return [
    summarize(
      'USDA_WASDE',
      'USDA WASDE Global Supply/Demand',
      'Báo cáo Cung – Cầu Toàn cầu USDA WASDE',
      'Hàng tháng (~ngày 12)',
      45,
      0,
      'USDA OCE WASDE / CSV Import',
      false,
      'USDA_API_KEY',
      'Chưa có bản ghi WASDE (nhập qua /api/fundamental/records hoặc đồng bộ USDA).'
    ),
    summarize(
      'USDA_CROP',
      'USDA Crop Production & Stocks',
      'Sản lượng Mùa vụ USDA QuickStats',
      'Hàng tháng / Vụ',
      400,
      5,
      'USDA NASS QuickStats API',
      true,
      'USDA_API_KEY',
      'Cần USDA_API_KEY miễn phí (quickstats.nass.usda.gov) cho Ngô, Đậu tương, Lúa mì, Bông, Gạo.'
    ),
    summarize(
      'EIA_INVENTORIES',
      'U.S. EIA Energy Inventories',
      'Tồn kho Dầu thô & Khí tự nhiên EIA',
      'Hàng tuần (Thứ 4 / Thứ 5)',
      14,
      5,
      'U.S. EIA Open Data v2',
      true,
      'EIA_API_KEY',
      'Cần EIA_API_KEY miễn phí chính phủ Mỹ cho tồn kho WTI & Natural Gas.'
    ),
    cotDomain,
    summarize(
      'ICE_STOCKS',
      'ICE Certified Warehouse Stocks',
      'Tồn kho Đạt chuẩn Sàn ICE (Cà phê / Ca cao / Đường)',
      'Hàng ngày / Tuần',
      10,
      1,
      'ICE Certified Stocks CSV / Feed',
      true,
      'ICE_API_KEY',
      'Không có API công khai miễn phí; hỗ trợ nạp thủ công có nguồn xác thực qua /api/fundamental/records.'
    ),
    summarize(
      'GLOBAL_SD',
      'Global Supply & Demand Balance',
      'Cán cân Cung – Cầu Tổng hợp Toàn cầu',
      'Hàng tháng',
      45,
      5,
      'ICO / VICOFA / USDA / IRSG Verified Records',
      false,
      null,
      'Tổng hợp từ các báo cáo Cung–Cầu xác thực (WASDE, ICO, EIA).'
    ),
    seasonalDomain,
    summarize(
      'WEATHER_RISK',
      'Commodity Weather & ENSO Risk',
      'Rủi ro Thời tiết Vùng trồng (El Niño / La Niña)',
      'Hàng tuần / Tháng',
      21,
      1,
      'NOAA CPC / Agro-Weather Sourced Record',
      false,
      null,
      'Chưa có cảnh báo thời tiết vùng trồng được nạp nguồn.'
    ),
  ];
}
