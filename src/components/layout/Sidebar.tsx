import { useState } from 'react';
import {
  CandlestickChart,
  GraduationCap,
  LayoutDashboard,
  Newspaper,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Target,
  TrendingUp,
  X,
} from 'lucide-react';
import type { AppModuleId } from '../../shared/types/risk';
import { useTerminal } from '../../contexts/TerminalContext';
import { useT, type TKey } from '../../i18n';
import { ADVANCED_ITEMS, sectionOf, type SectionId } from './navMap';

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

interface NavItem {
  id: AppModuleId;
  section: SectionId;
  labelKey: TKey;
  Icon: typeof LayoutDashboard;
}

/** Six main sections; each opens a hub whose tabs hold the original views (see navMap.ts). */
const MAIN_ITEMS: NavItem[] = [
  { id: 'today-hub', section: 'today', labelKey: 'n2.sec.today', Icon: LayoutDashboard },
  { id: 'market-hub', section: 'markets', labelKey: 'n2.sec.markets', Icon: CandlestickChart },
  { id: 'news-hub', section: 'news', labelKey: 'n2.sec.news', Icon: Newspaper },
  { id: 'analysis-hub', section: 'analysis', labelKey: 'n2.sec.analysis', Icon: Target },
  { id: 'learn', section: 'academy', labelKey: 'n2.sec.academy', Icon: GraduationCap },
  { id: 'mine-hub', section: 'mine', labelKey: 'n2.sec.mine', Icon: NotebookPen },
];

const SMALL_KEY: Partial<Record<AppModuleId, TKey>> = {
  'term-structure': 'n2.item.term-structure',
  explorer: 'n2.item.explorer',
  analysis: 'n2.item.analysis',
  'scan-hub': 'n2.item.scan-hub',
  backtest: 'n2.item.backtest',
};

const COLLAPSE_KEY = 'ctap.sidebar.collapsed';

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

export function Sidebar({ mobileOpen, onCloseMobile }: SidebarProps) {
  const { activeModule, setActiveModule } = useTerminal();
  const t = useT();
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        /* storage unavailable: keep in-memory state only */
      }
      return !c;
    });
  };

  const handleSelect = (id: AppModuleId) => {
    setActiveModule(id);
    onCloseMobile();
  };

  const currentSection = sectionOf(activeModule);

  const smallButton = (id: AppModuleId) => {
    const key = SMALL_KEY[id];
    if (!key) return null;
    const isActive = activeModule === id;
    return (
      <li key={id}>
        <button
          type="button"
          onClick={() => handleSelect(id)}
          aria-current={isActive ? 'page' : undefined}
          className={`w-full text-left px-3 py-1.5 rounded-md text-xs transition-colors ${
            isActive ? 'bg-[var(--accent-soft)] text-[var(--text-strong)]' : 'text-[var(--muted)] hover:text-[var(--text-strong)] hover:bg-[var(--surface-2)]'
          }`}
        >
          {t(key)}
        </button>
      </li>
    );
  };

  // `rail` = icon-only mode; only applies on desktop (the mobile drawer is always full width).
  const rail = collapsed;

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        aria-label={t('nav.ariaLabel')}
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-[var(--surface)] border-r border-[var(--border)] flex flex-col transition-all duration-200 lg:static lg:translate-x-0 lg:max-w-none ${
          rail ? 'lg:w-[72px]' : 'lg:w-64'
        } ${mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}
      >
        <div className="h-14 px-4 border-b border-[var(--border)] flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="w-8 h-8 rounded-[10px] bg-gradient-to-br from-[var(--accent)] to-[#8B5CF6] grid place-items-center text-[var(--text-strong)] shrink-0"
              aria-hidden="true"
            >
              <TrendingUp className="w-4 h-4" />
            </span>
            <span
              className={`text-sm font-semibold tracking-tight text-[var(--text-strong)] truncate ${rail ? 'lg:hidden' : ''}`}
            >
              COMMODITY AI PRO
            </span>
          </div>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label={t('nav.closeMenu')}
            className="lg:hidden p-2 text-[var(--muted)] hover:text-[var(--text-strong)] rounded-md"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4" aria-label={t('nav.ariaLabel')}>
          <ul className="space-y-0.5">
            {MAIN_ITEMS.map((item) => {
              const Icon = item.Icon;
              const isActive = currentSection === item.section;
              const label = t(item.labelKey);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    title={rail ? label : undefined}
                    className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-sm transition-colors whitespace-nowrap ${
                      rail ? 'lg:justify-center lg:px-0' : ''
                    } ${
                      isActive
                        ? 'bg-[var(--accent-soft)] text-[var(--text-strong)] font-medium'
                        : 'text-[var(--muted)] hover:text-[var(--text-strong)] hover:bg-[var(--surface-2)]'
                    }`}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r bg-[var(--accent)]" aria-hidden="true" />
                    )}
                    <Icon className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-[var(--accent-text)]' : ''}`} aria-hidden="true" />
                    <span className={`truncate ${rail ? 'lg:sr-only' : ''}`}>{label}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className={`pt-3 border-t border-[var(--border)] ${rail ? 'lg:hidden' : ''}`}>
            <details open={currentSection === 'advanced'} className="group">
              <summary className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--faint)] cursor-pointer hover:text-[var(--text-strong)]">
                {t('n2.sec.advanced')}
              </summary>
              <p className="px-3 pb-1 text-[11px] text-[var(--faint)]">{t('n2.adv.hint')}</p>
              <ul className="space-y-0.5 mt-1">
                {ADVANCED_ITEMS.map((id) => smallButton(id))}
              </ul>
            </details>
          </div>
        </nav>

        <div className="px-3 py-3 border-t border-[var(--border)] flex items-center gap-2">
          <p className={`flex-1 text-xs text-[var(--faint)] truncate ${rail ? 'lg:hidden' : ''}`}>{t('nav.slogan')}</p>
          <button
            type="button"
            onClick={() => handleSelect('settings-hub')}
            aria-label={t('n2.sec.settings')}
            title={t('n2.sec.settings')}
            aria-current={currentSection === 'settings' ? 'page' : undefined}
            className={`grid place-items-center w-9 h-9 rounded-md hover:bg-[var(--surface-2)] ${
              currentSection === 'settings' ? 'text-[var(--accent-text)] bg-[var(--accent-soft)]' : 'text-[var(--muted)] hover:text-[var(--text-strong)]'
            }`}
          >
            <Settings className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={rail ? t('nav.expand') : t('nav.collapse')}
            title={rail ? t('nav.expand') : t('nav.collapse')}
            className="hidden lg:grid place-items-center w-8 h-8 mx-auto rounded-md text-[var(--muted)] hover:text-[var(--text-strong)] hover:bg-[var(--surface-2)]"
          >
            {rail ? (
              <PanelLeftOpen className="w-4 h-4" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </aside>
    </>
  );
}
