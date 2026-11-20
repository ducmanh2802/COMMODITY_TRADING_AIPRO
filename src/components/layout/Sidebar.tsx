import { useState } from 'react';
import {
  Activity,
  CandlestickChart,
  FileText,
  Globe,
  BookOpenText,
  Image,
  ListChecks,
  Layers,
  LayoutDashboard,
  Newspaper,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Target,
  TrendingUp,
  X,
} from 'lucide-react';
import type { AppModuleId } from '../../shared/types/risk';
import { useTerminal } from '../../contexts/TerminalContext';
import { useT } from '../../i18n';

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

interface NavItem {
  id: AppModuleId;
  Icon: typeof LayoutDashboard;
}

interface NavGroup {
  id: string;
  labelKey: 'nav.groupMarket' | 'nav.groupCycleAi' | 'nav.groupOperations';
  items: NavItem[];
}

/**
 * Focused, logically grouped navigation containing only essential daily workflows
 * (rarely used or redundant legacy sub-views are removed from the sidebar).
 */
const NAV_GROUPS: NavGroup[] = [
  {
    id: 'markets',
    labelKey: 'nav.groupMarket',
    items: [
      { id: 'overview', Icon: LayoutDashboard },
      { id: 'commodity-world', Icon: Image },
      { id: 'markets', Icon: Globe },
    ],
  },
  {
    id: 'cycle-ai',
    labelKey: 'nav.groupCycleAi',
    items: [
      { id: 'cycle-hunter', Icon: Target },
      { id: 'commodity-profile', Icon: Layers },
      { id: 'research-report', Icon: FileText },
      { id: 'charts', Icon: CandlestickChart },
      { id: 'scorecard', Icon: ListChecks },
      { id: 'brief', Icon: BookOpenText },
    ],
  },
  {
    id: 'operations',
    labelKey: 'nav.groupOperations',
    items: [
      { id: 'news', Icon: Newspaper },
      { id: 'risk', Icon: ShieldCheck },
      { id: 'data-health', Icon: Activity },
    ],
  },
];

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
              className="w-8 h-8 rounded-[10px] bg-gradient-to-br from-[#6366F1] to-[#8B5CF6] grid place-items-center text-white shrink-0"
              aria-hidden="true"
            >
              <TrendingUp className="w-4 h-4" />
            </span>
            <span
              className={`text-sm font-semibold tracking-tight text-white truncate ${rail ? 'lg:hidden' : ''}`}
            >
              COMMODITY AI PRO
            </span>
          </div>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label={t('nav.closeMenu')}
            className="lg:hidden p-2 text-[var(--muted)] hover:text-white rounded-md"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
          {NAV_GROUPS.map((group, groupIndex) => (
            <section key={group.id} aria-labelledby={`nav-group-${group.id}`}>
              <h2
                id={`nav-group-${group.id}`}
                className={`px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--faint)] ${
                  rail ? 'lg:sr-only' : ''
                }`}
              >
                {t(group.labelKey)}
              </h2>
              {rail && groupIndex > 0 && (
                <div className="hidden lg:block mx-2 mb-2 border-t border-[var(--border)]" aria-hidden="true" />
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.Icon;
                  const isActive = activeModule === item.id;
                  const label = t(`nav.${item.id}`);

                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => handleSelect(item.id)}
                        aria-current={isActive ? 'page' : undefined}
                        title={rail ? label : undefined}
                        className={`relative w-full flex items-center gap-3 px-3 py-2.5 lg:py-2 rounded-[10px] text-sm transition-colors whitespace-nowrap ${
                          rail ? 'lg:justify-center lg:px-0' : ''
                        } ${
                          isActive
                            ? 'bg-[var(--accent-soft)] text-white font-medium'
                            : 'text-[var(--muted)] hover:text-white hover:bg-[var(--surface-2)]'
                        }`}
                      >
                        {isActive && (
                          <span
                            className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r bg-[var(--accent)]"
                            aria-hidden="true"
                          />
                        )}
                        <Icon
                          className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-[var(--accent-text)]' : ''}`}
                          aria-hidden="true"
                        />
                        <span className={`truncate ${rail ? 'lg:sr-only' : ''}`}>{label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </nav>

        <div className="px-3 py-3 border-t border-[var(--border)] flex items-center gap-2">
          <p className={`flex-1 text-xs text-[var(--faint)] truncate ${rail ? 'lg:hidden' : ''}`}>{t('nav.slogan')}</p>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={rail ? t('nav.expand') : t('nav.collapse')}
            title={rail ? t('nav.expand') : t('nav.collapse')}
            className="hidden lg:grid place-items-center w-8 h-8 mx-auto rounded-md text-[var(--muted)] hover:text-white hover:bg-[var(--surface-2)]"
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
