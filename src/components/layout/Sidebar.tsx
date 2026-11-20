import {
  Activity,
  CandlestickChart,
  FileText,
  Globe,
  Image,
  Layers,
  LayoutDashboard,
  Newspaper,
  ShieldCheck,
  Target,
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

export function Sidebar({ mobileOpen, onCloseMobile }: SidebarProps) {
  const { activeModule, setActiveModule } = useTerminal();
  const t = useT();

  const handleSelect = (id: AppModuleId) => {
    setActiveModule(id);
    onCloseMobile();
  };

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        aria-label={t('nav.ariaLabel')}
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#111622] border-r border-[#263244] flex flex-col transition-transform duration-150 lg:static lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-14 px-4 border-b border-[#263244] flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <span className="block text-sm font-semibold tracking-tight text-white whitespace-nowrap truncate">
              COMMODITY TRADING AI PRO
            </span>
          </div>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label={t('nav.closeMenu')}
            className="lg:hidden p-2 text-[#E5E7EB]/70 hover:text-white rounded-md focus-visible:outline-2 focus-visible:outline-[#6366F1]"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {NAV_GROUPS.map((group, groupIndex) => (
            <section
              key={group.id}
              aria-labelledby={`nav-group-${group.id}`}
              className={groupIndex > 0 ? 'pt-4 border-t border-[#263244]/70' : undefined}
            >
              <h2
                id={`nav-group-${group.id}`}
                className="px-3 mb-2 text-xs font-medium text-[#E5E7EB]/50"
              >
                {t(group.labelKey)}
              </h2>
              <ul className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.Icon;
                  const isActive = activeModule === item.id;

                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => handleSelect(item.id)}
                        aria-current={isActive ? 'page' : undefined}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 md:py-2 rounded-md text-sm transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-[#6366F1] ${
                          isActive
                            ? 'bg-[#6366F1]/15 text-white border border-[#6366F1]/40 font-medium'
                            : 'text-[#E5E7EB]/75 hover:text-white hover:bg-[#172033] border border-transparent'
                        }`}
                      >
                        <Icon
                          className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#818CF8]' : 'text-[#E5E7EB]/60'}`}
                          aria-hidden="true"
                        />
                        <span className="truncate">{t(`nav.${item.id}`)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </nav>

        <div className="px-4 py-3 border-t border-[#263244]">
          <p className="text-xs text-[#E5E7EB]/50 truncate">{t('nav.slogan')}</p>
        </div>
      </aside>
    </>
  );
}
