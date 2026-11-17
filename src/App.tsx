import { useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { DataHealthView } from './components/views/DataHealthView';
import { MarketWatchView } from './components/views/MarketWatchView';
import { OverviewDashboard } from './components/views/OverviewDashboard';
import { PhaseModulePlaceholder } from './components/views/PhaseModulePlaceholder';
import { SettingsView } from './components/views/SettingsView';
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
      case 'data-health':
        return <DataHealthView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <PhaseModulePlaceholder moduleId={activeModule} />;
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
