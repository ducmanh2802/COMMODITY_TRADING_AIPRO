import { useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { AiAnalystView } from './components/views/AiAnalystView';
import { BacktestView } from './components/views/BacktestView';
import { ChartsView } from './components/views/ChartsView';
import { ContractExplorerView } from './components/views/ContractExplorerView';
import { DataHealthView } from './components/views/DataHealthView';
import { FundamentalNewsView } from './components/views/FundamentalNewsView';
import { MarketWatchView } from './components/views/MarketWatchView';
import { OverviewDashboard } from './components/views/OverviewDashboard';
import { PortfolioView } from './components/views/PortfolioView';
import { RiskManagementView } from './components/views/RiskManagementView';
import { ScannerView } from './components/views/ScannerView';
import { SettingsView } from './components/views/SettingsView';
import { LazyAnalysisView, LazyChartsView, LazyCotView, LazyDataImportView } from './components/views/data/LazyViews';
import { LazyContractExplorerView, LazyTermStructureView } from './components/views/explorer/LazyExplorerViews';
import { SignalsView } from './components/views/SignalsView';
import { TechnicalAnalysisView } from './components/views/TechnicalAnalysisView';
import { TradeJournalView } from './components/views/TradeJournalView';
import { DualViewTabs } from './components/views/DualViewTabs';
import { AuthProvider } from './contexts/AuthContext';
import { TerminalProvider, useTerminal } from './contexts/TerminalContext';

function TerminalWorkspace() {
  const { activeModule } = useTerminal();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const renderActiveView = () => {
    switch (activeModule) {
      case 'overview':
        return <OverviewDashboard />;
      case 'markets':
        return <MarketWatchView />;
      case 'explorer':
        // Primary: agent-work explorer (verified specs, contract chain, calendar rules, fail-closed tick
        // calculator). Owner's explorer (commodity profiles, provider mappings) kept as second tab.
        return (
          <DualViewTabs
            tabs={[
              {
                id: 'chain',
                label: 'Contract chain & calculator',
                note: 'Verified specifications with sources, contract chain from calendar rules, tick calculator (refuses unverified specs).',
                render: () => <LazyContractExplorerView />,
              },
              {
                id: 'profiles',
                label: 'Commodity profiles & mappings',
                note: 'Owner module: Vietnamese commodity profiles and external API symbol mappings (descriptive text, not verified market data).',
                render: () => <ContractExplorerView />,
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
                label: 'Imported datasets',
                note: 'Candles from GET /api/market/candles (SQLite data layer) with client-side indicators.',
                render: () => <LazyChartsView />,
              },
              {
                id: 'overlay',
                label: 'Technical overlay (EMA)',
                note: 'Owner module: GET /api/market/candles/:symbol with server-computed EMA 20/50/200 overlays.',
                render: () => <ChartsView />,
              },
            ]}
          />
        );
      case 'technical':
        return <TechnicalAnalysisView />;
      case 'signals':
        return <SignalsView />;
      case 'ai-analyst':
        return <AiAnalystView />;
      case 'scanner':
        return <ScannerView />;
      case 'risk':
        return <RiskManagementView />;
      case 'backtest':
        return <BacktestView />;
      case 'portfolio':
        return <PortfolioView />;
      case 'journal':
        return <TradeJournalView />;
      case 'fundamental':
        return <FundamentalNewsView mode="fundamental" />;
      case 'news':
        return <FundamentalNewsView mode="news" />;
      case 'data-health':
        return <DataHealthView />;
      case 'data-import':
        return <LazyDataImportView />;
      case 'term-structure':
        return <LazyTermStructureView />;
      case 'analysis':
        return <LazyAnalysisView />;
      case 'cot':
        return <LazyCotView />;
      case 'settings':
        return <SettingsView />;
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0E14] text-[#E5E7EB] flex">
      <Sidebar mobileOpen={mobileMenuOpen} onCloseMobile={() => setMobileMenuOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar onOpenMobileMenu={() => setMobileMenuOpen(true)} />

        <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
          {renderActiveView()}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <TerminalProvider>
          <TerminalWorkspace />
        </TerminalProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
