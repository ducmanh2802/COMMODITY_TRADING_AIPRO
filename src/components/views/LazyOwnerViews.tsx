import type { ComponentType } from 'react';
import { lazyWithRetry } from '../common/lazyWithRetry';

/**
 * Lazily-loaded module views with automatic retry & scoped error recovery so transient dev-server
 * restarts or dep pre-bundling never leave a stuck broken import.
 */
function lazyNamed<M, K extends keyof M, P extends object = M[K] extends ComponentType<infer Q> ? Q & object : object>(
  load: () => Promise<M>,
  name: K
): ComponentType<P> {
  return lazyWithRetry(
    load,
    (mod) => mod[name] as unknown as ComponentType<P>,
    'Đang tải mô-đun…',
    `Lazy(${String(name)})`
  );
}

export const LazyMarketWatchView = lazyNamed(() => import('./MarketWatchView'), 'MarketWatchView');
export const LazyOwnerContractExplorerView = lazyNamed(() => import('./ContractExplorerView'), 'ContractExplorerView');
export const LazyOwnerChartsView = lazyNamed(() => import('./ChartsView'), 'ChartsView');
export const LazyTechnicalAnalysisView = lazyNamed(() => import('./TechnicalAnalysisView'), 'TechnicalAnalysisView');
export const LazySignalsView = lazyNamed(() => import('./SignalsView'), 'SignalsView');
export const LazyAiAnalystView = lazyNamed(() => import('./AiAnalystView'), 'AiAnalystView');
export const LazyScannerView = lazyNamed(() => import('./ScannerView'), 'ScannerView');
export const LazyRiskManagementView = lazyNamed(() => import('./RiskManagementView'), 'RiskManagementView');
export const LazyBacktestView = lazyNamed(() => import('./BacktestView'), 'BacktestView');
export const LazyPortfolioView = lazyNamed(() => import('./PortfolioView'), 'PortfolioView');
export const LazyTradeJournalView = lazyNamed(() => import('./TradeJournalView'), 'TradeJournalView');
export const LazyResearchNotebookView = lazyNamed(() => import('./journal/ResearchNotebookView'), 'ResearchNotebookView');
export const LazyPaperTradingView = lazyNamed(() => import('./papertrade/PaperTradingView'), 'PaperTradingView');
export const LazyDataHealthView = lazyNamed(() => import('./DataHealthView'), 'DataHealthView');
export const LazySettingsView = lazyNamed(() => import('./SettingsView'), 'SettingsView');
export const LazyCommodityWorldView = lazyNamed(() => import('./CommodityWorldView'), 'CommodityWorldView');
export const LazyCommodityProfileView = lazyNamed(() => import('./CommodityProfileView'), 'CommodityProfileView');
export const LazyCycleScannerView = lazyNamed(() => import('./CycleScannerView'), 'CycleScannerView');
export const LazyCycleResearchReportView = lazyNamed(() => import('./CycleResearchReportView'), 'CycleResearchReportView');
export const LazyBriefView = lazyNamed(() => import('./brief/BriefView'), 'BriefView');
export const LazyScorecardView = lazyNamed(() => import('./scorecard/ScorecardView'), 'ScorecardView');
