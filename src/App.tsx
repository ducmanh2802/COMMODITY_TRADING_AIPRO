import { useEffect, useRef, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { OverviewDashboard } from './components/views/OverviewDashboard';
import { LazyAnalysisView, LazyChartsView, LazyCotView, LazyDataImportView } from './components/views/data/LazyViews';
import { LazyContractExplorerView, LazyTermStructureView } from './components/views/explorer/LazyExplorerViews';
import { LazyLearnView } from './components/views/learn/LazyLearnView';
import { DualViewTabs } from './components/views/DualViewTabs';
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
} from './components/views/LazyOwnerViews';
import { hasPendingNoteContext } from './components/views/journal/researchNotes';
import { AuthProvider } from './contexts/AuthContext';
import { TerminalProvider, useTerminal } from './contexts/TerminalContext';
import { I18nProvider, useT } from './i18n';

function TerminalWorkspace() {
  const { activeModule, selectedSymbol } = useTerminal();
  const t = useT();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mainRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    mainRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [activeModule, selectedSymbol]);

  const renderActiveView = () => {
    switch (activeModule) {
      case 'overview':
        return <OverviewDashboard />;
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
              {
                id: 'chain',
                label: t('app.explorer.chain'),
                note: t('app.explorer.chainNote'),
                render: () => <LazyContractExplorerView />,
              },
              {
                id: 'profiles',
                label: t('app.explorer.profiles'),
                note: t('app.explorer.profilesNote'),
                render: () => <LazyOwnerContractExplorerView />,
              },
            ]}
          />
        );
      case 'charts':
        // Primary: agent-work charts over the SQLite data layer (per contract / CONTINUOUS, provenance).
        // Owner's chart (server EMA overlays, SQLite-first then in-memory store) kept as second tab.
        return (
          <DualViewTabs
            tabs={[
              {
                id: 'datasets',
                label: t('app.charts.datasets'),
                note: t('app.charts.datasetsNote'),
                render: () => <LazyChartsView />,
              },
              {
                id: 'overlay',
                label: t('app.charts.overlay'),
                note: t('app.charts.overlayNote'),
                render: () => <LazyOwnerChartsView />,
              },
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
        // Trade journal + T18 Research Notebook; "note on this chart" opens straight on the notebook tab.
        return (
          <DualViewTabs
            key="journal"
            initialTabId={hasPendingNoteContext() ? 'notebook' : 'trades'}
            tabs={[
              { id: 'trades', label: t('nb.tab.journal'), note: t('nb.tab.journalNote'), render: () => <LazyTradeJournalView /> },
              { id: 'notebook', label: t('nb.tab.notebook'), note: t('nb.tab.notebookNote'), render: () => <LazyResearchNotebookView /> },
            ]}
          />
        );
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
        return <LazyScorecardView />;
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
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0E14] text-[#E5E7EB] flex">
      <Sidebar mobileOpen={mobileMenuOpen} onCloseMobile={() => setMobileMenuOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar onOpenMobileMenu={() => setMobileMenuOpen(true)} />

        <main ref={mainRef} className="flex-1 p-4 sm:p-6 overflow-y-auto">
          {renderActiveView()}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
    <ErrorBoundary>
      <AuthProvider>
        <TerminalProvider>
          <TerminalWorkspace />
        </TerminalProvider>
      </AuthProvider>
    </ErrorBoundary>
    </I18nProvider>
  );
}
