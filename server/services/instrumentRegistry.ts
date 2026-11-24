import type { InstrumentDefinition } from '../../src/shared/types/instrument.ts';
import type { IInstrumentRepository, InstrumentFilter } from './repository.ts';

import { INITIAL_INSTRUMENTS } from '../data/instruments.ts';
import { OWNER_ADDED_INSTRUMENTS, OWNER_INSTRUMENT_ENRICHMENT } from '../data/ownerInstrumentProfiles.ts';

export { INITIAL_INSTRUMENTS, CONTRACT_CALENDAR_RULES } from '../data/instruments.ts';
export type { ContractCalendarRule } from '../data/instruments.ts';

/**
 * Centralized Instrument Master Registry.
 * Seed data lives in server/data/instruments.ts. Specifications are VERIFIED only when read on an
 * official exchange page (URL in `dataSource`); MXV mappings are VERIFIED only with an MXV source.
 * Never invents or extrapolates tick values or margin requirements.
 *
 * Merged with the owner's registry (origin/main e7a6c70): the verified specs/MXV mappings above win;
 * the owner's descriptive `commodityProfile` and external-API `providerMappings` are attached, and the
 * owner-only instruments (currently MXV:JRU, UNVERIFIED) are appended. See ownerInstrumentProfiles.ts.
 */
export const MERGED_INSTRUMENTS: InstrumentDefinition[] = [
  ...INITIAL_INSTRUMENTS.map((inst) => {
    const enrichment = OWNER_INSTRUMENT_ENRICHMENT[inst.id];
    return enrichment ? { ...inst, ...enrichment } : inst;
  }),
  ...OWNER_ADDED_INSTRUMENTS.filter((added) => !INITIAL_INSTRUMENTS.some((inst) => inst.id === added.id)),
];

class InMemoryInstrumentRepository implements IInstrumentRepository {
  private readonly instruments: InstrumentDefinition[];

  constructor(seed: InstrumentDefinition[] = MERGED_INSTRUMENTS) {
    this.instruments = seed;
  }

  async list(filter: InstrumentFilter = {}): Promise<InstrumentDefinition[]> {
    const searchLower = filter.search?.trim().toLowerCase();

    return this.instruments.filter((inst) => {
      if (filter.category && inst.category !== filter.category) {
        return false;
      }
      if (filter.exchange && inst.exchange !== filter.exchange) {
        return false;
      }
      if (filter.marketScope === 'MXV' && !inst.isMvxListed) {
        return false;
      }
      if (filter.marketScope === 'INTERNATIONAL' && inst.exchange === 'MXV') {
        return false;
      }
      if (searchLower) {
        const hay = [
          inst.productName,
          inst.commodityProfile?.vietnameseName ?? '',
          inst.exchangeSymbol,
          inst.exchange,
          inst.mxvMapping?.mxvSymbol ?? '',
          inst.category,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(searchLower)) {
          return false;
        }
      }
      return true;
    });
  }

  async findBySymbol(symbol: string): Promise<InstrumentDefinition | null> {
    const normalized = symbol.trim().toUpperCase();
    return (
      this.instruments.find(
        (inst) =>
          inst.exchangeSymbol.toUpperCase() === normalized ||
          inst.id.toUpperCase() === normalized ||
          inst.mxvMapping?.mxvSymbol?.toUpperCase() === normalized
      ) ?? null
    );
  }
}

export const instrumentRepository = new InMemoryInstrumentRepository();
