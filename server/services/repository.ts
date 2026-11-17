import type { InstrumentDefinition, ProductCategory, ExchangeCode } from '../../src/shared/types/instrument.ts';
import type { MarketScope, ProviderHealth } from '../../src/shared/types/market.ts';

export interface InstrumentFilter {
  category?: ProductCategory;
  exchange?: ExchangeCode;
  marketScope?: MarketScope;
  search?: string;
}

/**
 * Repository abstraction designed to allow migration from in-memory / Firestore
 * storage to PostgreSQL / TimescaleDB without changing service contracts.
 */
export interface IInstrumentRepository {
  list(filter?: InstrumentFilter): Promise<InstrumentDefinition[]>;
  findBySymbol(symbol: string): Promise<InstrumentDefinition | null>;
}

export interface IProviderHealthRepository {
  getAll(): Promise<ProviderHealth[]>;
}
