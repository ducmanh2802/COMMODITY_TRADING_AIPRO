import type { TKey } from '../../../../i18n';
import type { AppModuleId } from '../../../../shared/types/risk';

/** A "try it now" destination: an existing app module (resolved through navMap) or the Academy sandbox tab. */
export type PracticeTarget = { to: AppModuleId } | { to: 'sandbox' };

/** Button label per destination (existing nav keys reused where they exist). */
export const PRACTICE_LABEL: Record<string, TKey> = {
  sandbox: 'prac.t.sandbox',
  paper: 'prac.t.paper',
  risk: 'n2.me.risk',
  journal: 'n2.me.journal',
  hedge: 'hd.tab',
  charts: 'n2.in.charts',
  cot: 'n2.in.cot',
  fundamental: 'n2.nw.macro',
  scorecard: 'n2.an.scorecard',
  'commodity-profile': 'prac.t.profile',
  'commodity-world': 'n2.mk.prices',
  'term-structure': 'n2.item.term-structure',
  analysis: 'n2.item.analysis',
  technical: 'n2.item.technical',
  backtest: 'n2.item.backtest',
  'data-health': 'n2.item.data-health',
};

const S: PracticeTarget = { to: 'sandbox' };
const m = (to: AppModuleId): PracticeTarget => ({ to });

/** Lesson id -> 0-2 destinations. Lessons without a genuine match are left out on purpose. */
export const PRACTICE: Readonly<Record<string, readonly PracticeTarget[]>> = {
  'l1-contract': [S],
  'l1-margin': [S, m('risk')],
  'l1-pnl': [S, m('paper')],
  'l1-expiry-roll': [m('term-structure')],
  'l1-hedger-spec': [m('hedge')],
  'l2-fx-fees': [S],
  'l2-margin-call': [m('risk')],
  'l5-basis-hedge': [m('hedge')],
  'l5-hedge-vn-firms': [m('hedge')],
  'l3-grains': [m('commodity-profile')],
  'l3-soy': [m('commodity-profile')],
  'l3-coffee': [m('commodity-profile')],
  'l3-softs': [m('commodity-profile')],
  'l3-precious': [m('commodity-profile')],
  'l3-industrial': [m('commodity-profile')],
  'l3-oil': [m('commodity-profile')],
  'l3-gas': [m('commodity-profile')],
  'l4-fundamental': [m('fundamental')],
  'l4-technical': [m('charts')],
  'l4-curve': [m('term-structure')],
  'l4-cot': [m('cot')],
  'l4-seasonal': [m('analysis')],
  'l4-correlation': [m('analysis')],
  'l8-dow': [m('charts')],
  'l8-price-action': [m('charts')],
  'l8-volume': [m('charts')],
  'l8-combine': [m('scorecard')],
  'l5-sizing': [S, m('risk')],
  'l5-stop': [m('paper')],
  'l5-journal': [m('journal')],
  'l5-mistakes': [m('journal')],
  'l6-data-labels': [m('data-health')],
  'l6-indicators': [m('technical')],
  'l7-swing': [m('paper')],
  'l7-backtest': [m('backtest')],
  'l9-expectancy': [m('journal')],
  'l9-mtf': [m('charts')],
  'l9-psychology': [m('journal')],
  'l9-plan': [m('journal')],
  'l9-review': [m('journal')],
  'l10-margin': [m('risk')],
  'l10-costs': [S],
};

export const practiceFor = (lessonId: string): readonly PracticeTarget[] => PRACTICE[lessonId] ?? [];
