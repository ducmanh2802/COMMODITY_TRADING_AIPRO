import { Suspense, lazy, type ComponentType } from 'react';

/**
 * Lazily-loaded module views (owner modules from origin/main). Each view is split into its own chunk so
 * the entry bundle only carries the shell (layout, contexts, Overview). Views keep their named exports;
 * `lazyNamed` adapts them to React.lazy's default-export contract.
 */
function lazyNamed<M, K extends keyof M, P extends object = M[K] extends ComponentType<infer Q> ? Q & object : object>(
  load: () => Promise<M>,
  name: K
): ComponentType<P> {
  const Lazy = lazy(async () => ({ default: (await load())[name] as unknown as ComponentType<P> }));
  function LazyView(props: P) {
    return (
      <Suspense fallback={<p className="text-xs text-[#E5E7EB]/55 py-10 text-center">Loading module…</p>}>
        <Lazy {...props} />
      </Suspense>
    );
  }
  LazyView.displayName = `Lazy(${String(name)})`;
  return LazyView;
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
export const LazyFundamentalNewsView = lazyNamed(() => import('./FundamentalNewsView'), 'FundamentalNewsView');
export const LazyDataHealthView = lazyNamed(() => import('./DataHealthView'), 'DataHealthView');
export const LazySettingsView = lazyNamed(() => import('./SettingsView'), 'SettingsView');
