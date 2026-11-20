import { useRef, useEffect, type ReactNode } from 'react';
import { ArrowLeft, BookOpen, Coins, PiggyBank, RefreshCw, User } from 'lucide-react';
import { useTerminal } from '../../../contexts/TerminalContext';
import { useT, type TKey } from '../../../i18n';
import type { AppModuleId } from '../../../shared/types/risk';
import { LanguageSwitch } from '../../common/LanguageSwitch';
import { paperModule } from './links';
import { ModeSwitch } from './ModeSwitch';
import { SimpleHome } from './SimpleHome';

interface NavTab {
  key: string;
  labelKey: TKey;
  Icon: typeof Coins;
  target: AppModuleId;
  active: boolean;
}

const MINE_MODULES: AppModuleId[] = ['mine-hub', 'journal', 'risk'];

/**
 * Layout of the "Dễ dùng" mode: slim header + big-button nav (bottom bar on phones, inline on desktop).
 * Home ("Giá hôm nay") is the simple view; every other destination reuses the normal view via `renderOther`.
 */
export function SimpleShell({ renderOther }: { renderOther: () => ReactNode }) {
  const t = useT();
  const { activeModule, setActiveModule, refreshBackendData, loading } = useTerminal();
  const mainRef = useRef<HTMLElement | null>(null);
  const paper = paperModule();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    mainRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [activeModule]);

  const tabs: NavTab[] = [
    { key: 'prices', labelKey: 'sm.nav.prices', Icon: Coins, target: 'market-hub', active: activeModule === 'market-hub' },
    { key: 'learn', labelKey: 'sm.nav.learn', Icon: BookOpen, target: 'learn', active: activeModule === 'learn' },
    ...(paper ? [{ key: 'paper', labelKey: 'sm.nav.paper' as TKey, Icon: PiggyBank, target: paper, active: activeModule === paper }] : []),
    { key: 'mine', labelKey: 'sm.nav.mine', Icon: User, target: 'mine-hub', active: MINE_MODULES.includes(activeModule) },
  ];
  const onTab = tabs.some((x) => x.active);

  const navButtons = (bottom: boolean) =>
    tabs.map((tab) => (
      <li key={tab.key} className={bottom ? 'flex-1' : ''}>
        <button
          type="button"
          onClick={() => setActiveModule(tab.target)}
          aria-current={tab.active ? 'page' : undefined}
          className={`w-full min-h-[56px] flex ${bottom ? 'flex-col justify-center gap-0.5 px-1 text-sm' : 'flex-row items-center gap-2 px-4 text-lg'} items-center rounded-xl font-bold focus:outline-none focus-visible:ring-4 focus-visible:ring-white/70 ${
            tab.active ? 'bg-[#6366F1] text-white' : 'text-[var(--text)] hover:bg-[var(--surface-2)]'
          }`}
        >
          <tab.Icon className="w-6 h-6 shrink-0" aria-hidden="true" />
          <span className="leading-tight text-center">{t(tab.labelKey)}</span>
        </button>
      </li>
    ));

  return (
    <div className="min-h-screen bg-[#0B0E14] text-[#E5E7EB] flex flex-col">
      <header className="sticky top-0 z-30 bg-[var(--surface)]/95 backdrop-blur border-b border-[var(--border)] px-3 sm:px-5 py-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-xl font-extrabold text-white mr-auto">COMMODITY AI PRO</span>
        <nav aria-label={t('sm.nav.aria')} className="hidden md:block">
          <ul className="flex gap-2">{navButtons(false)}</ul>
        </nav>
        <ModeSwitch large />
        <LanguageSwitch />
        <button
          type="button"
          onClick={() => void refreshBackendData()}
          aria-label={t('topbar.refresh')}
          title={t('topbar.refresh')}
          disabled={loading}
          className="w-11 h-11 grid place-items-center bg-[var(--surface-2)] border border-[var(--border)] rounded-[10px] text-white disabled:opacity-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/70"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
        </button>
      </header>

      <main ref={mainRef} className="flex-1 p-4 sm:p-6 pb-28 md:pb-8 min-w-0">
        {!onTab && (
          <button
            type="button"
            onClick={() => setActiveModule('market-hub')}
            className="mb-4 min-h-[48px] inline-flex items-center gap-2 px-4 rounded-xl border-2 border-[var(--border)] text-lg font-semibold text-white hover:bg-[var(--surface-2)] focus:outline-none focus-visible:ring-4 focus-visible:ring-white/70"
          >
            <ArrowLeft className="w-6 h-6" aria-hidden="true" />
            {t('sm.back')}
          </button>
        )}
        {activeModule === 'market-hub' ? <SimpleHome /> : renderOther()}
      </main>

      <nav
        aria-label={t('sm.nav.aria')}
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[var(--surface)] border-t-2 border-[var(--border)] px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
        <ul className="flex gap-1">{navButtons(true)}</ul>
      </nav>
    </div>
  );
}
