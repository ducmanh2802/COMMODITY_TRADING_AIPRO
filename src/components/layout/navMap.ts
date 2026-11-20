import type { AppModuleId } from '../../shared/types/risk';

export type HubId = 'market-hub' | 'analysis-hub' | 'instrument' | 'mine-hub';
export type SectionId = 'markets' | 'analysis' | 'academy' | 'mine' | 'settings' | 'advanced';
export interface Resolved {
  hub: HubId;
  tab?: string;
  /** Sub-view inside a tab (prices: cards | table). */
  sub?: string;
}

/** Old module ids that now live inside a hub tab. Deep links (Academy lessons etc.) keep using the old ids. */
const MAP: Partial<Record<AppModuleId, Resolved>> = {
  'market-hub': { hub: 'market-hub' },
  'commodity-world': { hub: 'market-hub', tab: 'prices', sub: 'cards' },
  markets: { hub: 'market-hub', tab: 'prices', sub: 'table' },
  news: { hub: 'market-hub', tab: 'news' },
  radar: { hub: 'market-hub', tab: 'radar' },
  fundamental: { hub: 'market-hub', tab: 'macro' },
  'analysis-hub': { hub: 'analysis-hub' },
  scorecard: { hub: 'analysis-hub', tab: 'scorecard' },
  'cycle-hunter': { hub: 'analysis-hub', tab: 'cycle' },
  'research-report': { hub: 'analysis-hub', tab: 'report' },
  instrument: { hub: 'instrument' },
  brief: { hub: 'instrument', tab: 'overview' },
  charts: { hub: 'instrument', tab: 'charts' },
  cot: { hub: 'instrument', tab: 'cot' },
  'commodity-profile': { hub: 'instrument', tab: 'profile' },
  'ai-analyst': { hub: 'instrument', tab: 'ai' },
  'mine-hub': { hub: 'mine-hub' },
  journal: { hub: 'mine-hub', tab: 'journal' },
  paper: { hub: 'mine-hub', tab: 'paper' },
  risk: { hub: 'mine-hub', tab: 'risk' },
};

export function resolveModule(id: AppModuleId): Resolved | null {
  return MAP[id] ?? null;
}

export const SETTINGS_ITEMS: AppModuleId[] = ['settings', 'data-health', 'data-import'];
export const ADVANCED_ITEMS: AppModuleId[] = [
  'overview',
  'backtest',
  'term-structure',
  'scanner',
  'signals',
  'portfolio',
  'technical',
  'explorer',
  'analysis',
];

export function sectionOf(id: AppModuleId): SectionId {
  const r = resolveModule(id);
  if (r) return r.hub === 'market-hub' ? 'markets' : r.hub === 'mine-hub' ? 'mine' : 'analysis';
  if (id === 'learn') return 'academy';
  if (SETTINGS_ITEMS.includes(id)) return 'settings';
  return 'advanced';
}
