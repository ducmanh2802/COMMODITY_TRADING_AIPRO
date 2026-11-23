import { useEffect, useRef, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { LegacyModule } from './components/views/LegacyModule';
import {
  AnalysisHub,
  InstrumentPage,
  MarketHub,
  MineHub,
  NewsHub,
  ScanHub,
  SettingsHub,
  TodayHub,
} from './components/views/hubs/Hubs';
import { resolveModule, sectionOf } from './components/layout/navMap';
import { AuthProvider } from './contexts/AuthContext';
import { TerminalProvider, useTerminal } from './contexts/TerminalContext';
import { I18nProvider, useT, type TKey } from './i18n';
import { UiModeProvider } from './contexts/UiModeContext';
import { OnboardingTour } from './components/common/OnboardingTour';

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
    const r = resolveModule(activeModule);
    if (r) {
      switch (r.hub) {
        case 'today-hub':
          return <TodayHub key={activeModule} tab={r.tab} />;
        case 'market-hub':
          return <MarketHub key={activeModule} tab={r.tab} sub={r.sub} />;
        case 'news-hub':
          return <NewsHub key={activeModule} tab={r.tab} />;
        case 'settings-hub':
          return <SettingsHub key={activeModule} tab={r.tab} />;
        case 'scan-hub':
          return <ScanHub key={activeModule} tab={r.tab} />;
        case 'analysis-hub':
          return <AnalysisHub key={activeModule} tab={r.tab} />;
        case 'instrument':
          return <InstrumentPage key={activeModule} tab={r.tab} />;
        case 'mine-hub':
          return <MineHub key={activeModule} tab={r.tab} />;
      }
    }
    return <LegacyModule id={activeModule} />;
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-[var(--accent)] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        {t('nav.skip')}
      </a>
      <Sidebar mobileOpen={mobileMenuOpen} onCloseMobile={() => setMobileMenuOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar onOpenMobileMenu={() => setMobileMenuOpen(true)} />

        <main id="main-content" tabIndex={-1} aria-label={t(`n2.sec.${sectionOf(activeModule)}` as TKey)} ref={mainRef} className="focus:outline-none flex-1 p-4 sm:p-6 overflow-y-auto">
          {renderActiveView()}
        </main>

        <footer className="px-4 sm:px-6 pb-3 text-[11px] text-[var(--faint)] text-center">
          {t('app.disclaimer')}
        </footer>
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
          <UiModeProvider>
            <TerminalWorkspace />
            <OnboardingTour />
          </UiModeProvider>
        </TerminalProvider>
      </AuthProvider>
    </ErrorBoundary>
    </I18nProvider>
  );
}
