import type { FundamentalMacroRecord, MarketDirection } from '../../src/shared/types/analysis.ts';

export type MacroDatasetType =
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

export function sanitizeExternalText(raw: string): string {
  return raw
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/(ignore\s+previous\s+instructions|system\s*:|assistant\s*:)/gi, '[redacted]')
    .trim()
    .slice(0, 600);
}

/**
 * Stores strictly sourced fundamental and macro records.
 * Starts empty so zero unsourced or fabricated fundamental facts are ever displayed.
 */
export class FundamentalStore {
  private readonly records: FundamentalMacroRecord[] = [];
  private readonly news: SourcedNewsItem[] = [];

  listRecords(): FundamentalMacroRecord[] {
    return [...this.records].sort((a, b) =>
      b.publicationTimestamp.localeCompare(a.publicationTimestamp)
    );
  }

  addRecord(record: Omit<FundamentalMacroRecord, 'id'>): FundamentalMacroRecord {
    const created: FundamentalMacroRecord = {
      ...record,
      id: `macro_${Date.now()}_${this.records.length + 1}`,
      dataset: sanitizeExternalText(record.dataset),
      source: sanitizeExternalText(record.source),
      dataPeriod: sanitizeExternalText(record.dataPeriod),
      unit: sanitizeExternalText(record.unit),
    };
    this.records.push(created);
    return created;
  }

  listNews(): SourcedNewsItem[] {
    return [...this.news].sort((a, b) =>
      b.publicationTimestamp.localeCompare(a.publicationTimestamp)
    );
  }

  addNews(item: Omit<SourcedNewsItem, 'id'>): SourcedNewsItem {
    const created: SourcedNewsItem = {
      ...item,
      id: `news_${Date.now()}_${this.news.length + 1}`,
      headline: sanitizeExternalText(item.headline),
      source: sanitizeExternalText(item.source),
      summary: sanitizeExternalText(item.summary),
    };
    this.news.push(created);
    return created;
  }
}

export const fundamentalStore = new FundamentalStore();
