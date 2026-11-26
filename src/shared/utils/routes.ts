import type { AppModuleId } from '../types/risk';

/** Default module (path "/" and any unknown path). */
export const DEFAULT_MODULE: AppModuleId = 'today-hub';

/** One slug per module id (Vietnamese, no diacritics). Single source of truth for URL routing. */
export const MODULE_SLUGS: Record<AppModuleId, string> = {
  'today-hub': '',
  overview: 'tong-quan',
  radar: 'radar',
  'cycle-hunter': 'san-chu-ky',
  'market-hub': 'thi-truong',
  world: 'the-gioi',
  'commodity-world': 'hang-hoa',
  markets: 'bang-gia',
  'news-hub': 'tin-tuc',
  news: 'tin-moi',
  fundamental: 'vi-mo',
  'analysis-hub': 'phan-tich',
  scorecard: 'cham-diem',
  'research-report': 'bao-cao',
  instrument: 'ma-hang-hoa',
  brief: 'tom-tat',
  charts: 'bieu-do',
  cot: 'cot',
  'commodity-profile': 'ho-so-hang-hoa',
  'ai-analyst': 'tro-ly-ai',
  'mine-hub': 'cua-toi',
  journal: 'nhat-ky',
  paper: 'giao-dich-thu',
  'paper-trade': 'giao-dich-ao',
  risk: 'rui-ro',
  portfolio: 'danh-muc',
  hedge: 'phong-ngua',
  'settings-hub': 'cai-dat',
  settings: 'tuy-chon',
  'data-health': 'suc-khoe-du-lieu',
  'data-import': 'nhap-du-lieu',
  'scan-hub': 'nang-cao',
  scanner: 'quet-tin-hieu',
  signals: 'tin-hieu',
  technical: 'ky-thuat',
  'term-structure': 'duong-ky-han',
  explorer: 'kham-pha',
  analysis: 'phan-tich-nang-cao',
  backtest: 'backtest',
  learn: 'hoc-vien',
};

const SLUG_TO_MODULE = new Map<string, AppModuleId>(
  (Object.keys(MODULE_SLUGS) as AppModuleId[]).map((id) => [MODULE_SLUGS[id], id]),
);

export function pathForModule(id: AppModuleId): string {
  return '/' + (MODULE_SLUGS[id] ?? '');
}

/** Maps a location pathname to a module; unknown or deeper paths fall back to the default. */
export function moduleForPath(pathname: string): AppModuleId {
  const first = pathname.split('/').filter(Boolean)[0] ?? '';
  return SLUG_TO_MODULE.get(first.toLowerCase()) ?? DEFAULT_MODULE;
}
