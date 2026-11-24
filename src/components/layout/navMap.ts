import type { AppModuleId } from '../../shared/types/risk';

type HubId =
  | 'today-hub'
  | 'market-hub'
  | 'news-hub'
  | 'analysis-hub'
  | 'instrument'
  | 'mine-hub'
  | 'settings-hub'
  | 'scan-hub';
export type SectionId = 'today' | 'markets' | 'news' | 'analysis' | 'academy' | 'mine' | 'settings' | 'advanced';
export interface Resolved {
  hub: HubId;
  tab?: string;
  /** Sub-view inside a tab (prices: cards | table | watch). */
  sub?: string;
}

/**
 * Old module ids that now live inside a hub tab. Deep links (Academy lessons, onboarding, search)
 * keep using the old ids, so every id that used to be a screen must stay mapped here.
 */
const MAP: Partial<Record<AppModuleId, Resolved>> = {
  // Hôm nay
  'today-hub': { hub: 'today-hub' },
  overview: { hub: 'today-hub', tab: 'overview' },
  radar: { hub: 'today-hub', tab: 'highlights' },
  'cycle-hunter': { hub: 'today-hub', tab: 'highlights' },
  // Giá & thị trường
  'market-hub': { hub: 'market-hub' },
  world: { hub: 'market-hub', tab: 'world' },
  'commodity-world': { hub: 'market-hub', tab: 'prices', sub: 'cards' },
  markets: { hub: 'market-hub', tab: 'prices', sub: 'table' },
  // Tin & vĩ mô
  'news-hub': { hub: 'news-hub' },
  news: { hub: 'news-hub', tab: 'news' },
  fundamental: { hub: 'news-hub', tab: 'macro' },
  // Phân tích mã
  'analysis-hub': { hub: 'analysis-hub' },
  scorecard: { hub: 'analysis-hub', tab: 'scorecard' },
  'research-report': { hub: 'analysis-hub', tab: 'report' },
  instrument: { hub: 'instrument' },
  brief: { hub: 'instrument', tab: 'summary' },
  charts: { hub: 'instrument', tab: 'charts' },
  cot: { hub: 'instrument', tab: 'cot' },
  'commodity-profile': { hub: 'instrument', tab: 'profile' },
  'ai-analyst': { hub: 'instrument', tab: 'profile' },
  // Của tôi
  'mine-hub': { hub: 'mine-hub' },
  journal: { hub: 'mine-hub', tab: 'journal' },
  paper: { hub: 'mine-hub', tab: 'paper' },
  'paper-trade': { hub: 'mine-hub', tab: 'paper' },
  risk: { hub: 'mine-hub', tab: 'risk' },
  portfolio: { hub: 'mine-hub', tab: 'risk' },
  hedge: { hub: 'mine-hub', tab: 'hedge' },
  // Cài đặt
  'settings-hub': { hub: 'settings-hub' },
  settings: { hub: 'settings-hub', tab: 'prefs' },
  'data-health': { hub: 'settings-hub', tab: 'data' },
  'data-import': { hub: 'settings-hub', tab: 'import' },
  // Nâng cao: signal-style tools grouped on one page
  'scan-hub': { hub: 'scan-hub' },
  scanner: { hub: 'scan-hub', tab: 'scanner' },
  signals: { hub: 'scan-hub', tab: 'signals' },
  technical: { hub: 'scan-hub', tab: 'technical' },
};

export function resolveModule(id: AppModuleId): Resolved | null {
  return MAP[id] ?? null;
}

/** Collapsed "Advanced" list in the sidebar (each opens its own screen). */
export const ADVANCED_ITEMS: AppModuleId[] = ['term-structure', 'explorer', 'analysis', 'scan-hub', 'backtest'];

const SECTION_OF_HUB: Record<HubId, SectionId> = {
  'today-hub': 'today',
  'market-hub': 'markets',
  'news-hub': 'news',
  'analysis-hub': 'analysis',
  instrument: 'analysis',
  'mine-hub': 'mine',
  'settings-hub': 'settings',
  'scan-hub': 'advanced',
};

export function sectionOf(id: AppModuleId): SectionId {
  const r = resolveModule(id);
  if (r) return SECTION_OF_HUB[r.hub];
  if (id === 'learn') return 'academy';
  return 'advanced';
}
