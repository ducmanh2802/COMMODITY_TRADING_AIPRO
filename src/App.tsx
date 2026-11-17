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
import { SignalsView } from './components/views/SignalsView';
import { TechnicalAnalysisView } from './components/views/TechnicalAnalysisView';
import { TradeJournalView } from './components/views/TradeJournalView';
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
        return <ContractExplorerView />;
      case 'charts':
        return <ChartsView />;
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
