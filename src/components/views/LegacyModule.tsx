import { LazyAnalysisView, LazyChartsView, LazyCotView, LazyDataImportView } from './data/LazyViews';
import { LazyContractExplorerView, LazyTermStructureView } from './explorer/LazyExplorerViews';
import { LazyLearnView } from './learn/LazyLearnView';
import { DualViewTabs } from './DualViewTabs';
import {
  LazyAiAnalystView,
  LazyBacktestView,
  LazyCommodityProfileView,
  LazyCommodityWorldView,
  LazyCycleResearchReportView,
  LazyCycleScannerView,
  LazyDataHealthView,
  LazyFundamentalNewsView,
  LazyMarketWatchView,
  LazyOwnerChartsView,
  LazyOwnerContractExplorerView,
  LazyPortfolioView,
  LazyRiskManagementView,
  LazyScannerView,
  LazySettingsView,
  LazyBriefView,
  LazyScorecardView,
  LazySignalsView,
  LazyTechnicalAnalysisView,
  LazyTradeJournalView,
  LazyResearchNotebookView,
} from './LazyOwnerViews';
import type { AppModuleId } from '../../shared/types/risk';
import { useT } from '../../i18n';
import { lazyWithRetry } from '../common/lazyWithRetry';

// Lazy so the 800+ line dashboard (and its deps) stay out of the main chunk; same retry helper as LazyOwnerViews.
const LazyOverviewDashboard = lazyWithRetry(
  () => import('./OverviewDashboard'),
  (mod) => mod.OverviewDashboard,
  'Đang tải mô-đun…',
  'Lazy(OverviewDashboard)'
);

/** Renders one original (leaf) module view. Hubs reuse these inside tabs; hub ids themselves are not leaves. */
export function LegacyModule({ id, onOpenInstrument }: { id: AppModuleId; onOpenInstrument?: (symbol: string) => void }) {
  const t = useT();
  switch (id) {
    case 'overview':
      return <LazyOverviewDashboard />;
    case 'commodity-world':
      return <LazyCommodityWorldView />;
    case 'commodity-profile':
      return <LazyCommodityProfileView />;
    case 'cycle-hunter':
      return <LazyCycleScannerView />;
    case 'research-report':
      return <LazyCycleResearchReportView />;
    case 'markets':
      return <LazyMarketWatchView />;
    case 'explorer':
      // Primary: agent-work explorer (verified specs, contract chain, calendar rules, fail-closed tick
      // calculator). Owner's explorer (commodity profiles, provider mappings) kept as second tab.
      return (
        <DualViewTabs
          tabs={[
            { id: 'chain', label: t('app.explorer.chain'), note: t('app.explorer.chainNote'), render: () => <LazyContractExplorerView /> },
            { id: 'profiles', label: t('app.explorer.profiles'), note: t('app.explorer.profilesNote'), render: () => <LazyOwnerContractExplorerView /> },
          ]}
        />
      );
    case 'charts':
      // Primary: agent-work charts over the SQLite data layer. Owner's chart kept as second tab.
      return (
        <DualViewTabs
          tabs={[
            { id: 'datasets', label: t('app.charts.datasets'), note: t('app.charts.datasetsNote'), render: () => <LazyChartsView /> },
            { id: 'overlay', label: t('app.charts.overlay'), note: t('app.charts.overlayNote'), render: () => <LazyOwnerChartsView /> },
          ]}
        />
      );
    case 'technical':
      return <LazyTechnicalAnalysisView />;
    case 'signals':
      return <LazySignalsView />;
    case 'ai-analyst':
      return <LazyAiAnalystView />;
    case 'scanner':
      return <LazyScannerView />;
    case 'risk':
      return <LazyRiskManagementView />;
    case 'backtest':
      return <LazyBacktestView />;
    case 'portfolio':
      return <LazyPortfolioView />;
    case 'journal':
      return <LazyTradeJournalView />;
    case 'fundamental':
      return <LazyFundamentalNewsView mode="fundamental" />;
    case 'news':
      return <LazyFundamentalNewsView mode="news" />;
    case 'data-health':
      return <LazyDataHealthView />;
    case 'data-import':
      return <LazyDataImportView />;
    case 'term-structure':
      return <LazyTermStructureView />;
    case 'scorecard':
      return <LazyScorecardView onOpenInstrument={onOpenInstrument} />;
    case 'brief':
      return <LazyBriefView />;
    case 'analysis':
      return <LazyAnalysisView />;
    case 'cot':
      return <LazyCotView />;
    case 'settings':
      return <LazySettingsView />;
    case 'learn':
      return <LazyLearnView />;
    default:
      return null;
  }
}

export { LazyResearchNotebookView };
