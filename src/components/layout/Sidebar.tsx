import {
  Activity,
  AreaChart,
  BarChart3,
  BookOpen,
  Bot,
  Briefcase,
  CandlestickChart,
  Compass,
  Cpu,
  FileSearch,
  FileText,
  Globe,
  GraduationCap,
  History,
  Image,
  Layers,
  LayoutDashboard,
  Newspaper,
  Radar,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  TrendingUp,
  Upload,
  Users,
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
  phase: number;
  Icon: typeof LayoutDashboard;
}

const PRIMARY_NAV_ITEMS: NavItem[] = [
  { id: 'overview', phase: 1, Icon: LayoutDashboard },
  { id: 'commodity-world', phase: 11, Icon: Image },
  { id: 'cycle-hunter', phase: 11, Icon: Target },
  { id: 'commodity-profile', phase: 11, Icon: Layers },
  { id: 'research-report', phase: 11, Icon: FileText },
  { id: 'learn', phase: 1, Icon: GraduationCap },
  { id: 'markets', phase: 1, Icon: Globe },
  { id: 'charts', phase: 3, Icon: CandlestickChart },
  { id: 'ai-analyst', phase: 5, Icon: Bot },
  { id: 'scanner', phase: 6, Icon: Radar },
  { id: 'risk', phase: 7, Icon: ShieldCheck },
  { id: 'portfolio', phase: 9, Icon: Briefcase },
  { id: 'backtest', phase: 8, Icon: History },
  { id: 'journal', phase: 9, Icon: BookOpen },
  { id: 'news', phase: 10, Icon: Newspaper },
  { id: 'data-health', phase: 1, Icon: Activity },
  { id: 'data-import', phase: 2, Icon: Upload },
  { id: 'settings', phase: 1, Icon: Settings },
];

const SECONDARY_ENGINE_ITEMS: NavItem[] = [
  { id: 'explorer', phase: 2, Icon: Compass },
  { id: 'term-structure', phase: 2, Icon: TrendingUp },
  { id: 'technical', phase: 3, Icon: BarChart3 },
  { id: 'analysis', phase: 3, Icon: AreaChart },
  { id: 'brief', phase: 3, Icon: FileSearch },
  { id: 'cot', phase: 10, Icon: Users },
  { id: 'signals', phase: 4, Icon: SlidersHorizontal },
  { id: 'fundamental', phase: 10, Icon: Cpu },
];

export function Sidebar({ mobileOpen, onCloseMobile }: SidebarProps) {
  const { activeModule, setActiveModule } = useTerminal();
  const t = useT();

  const handleSelect = (id: AppModuleId) => {
    setActiveModule(id);
    onCloseMobile();
  };

  const renderNavList = (items: NavItem[]) => (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const Icon = item.Icon;
        const isActive = activeModule === item.id;

        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => handleSelect(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 md:py-2 rounded-md text-sm transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-[#6366F1]/15 text-white border border-[#6366F1]/40 font-medium'
                  : 'text-[#E5E7EB]/75 hover:text-white hover:bg-[#172033] border border-transparent'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Icon
                  className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#6366F1]' : 'text-[#E5E7EB]/60'}`}
                  aria-hidden="true"
                />
                <span className="truncate">{t(`nav.${item.id}`)}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );

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
            className="lg:hidden p-2 text-[#E5E7EB]/70 hover:text-white rounded-md"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          <div>
            <p className="px-3 mb-2 text-xs font-medium text-[#E5E7EB]/45">{t('nav.groupTerminal')}</p>
            {renderNavList(PRIMARY_NAV_ITEMS)}
          </div>

          <div className="pt-4 border-t border-[#263244]">
            <p className="px-3 mb-2 text-xs font-medium text-[#E5E7EB]/45">{t('nav.groupEngines')}</p>
            {renderNavList(SECONDARY_ENGINE_ITEMS)}
          </div>
        </nav>

        <div className="p-4 border-t border-[#263244] text-xs text-[#E5E7EB]/55 space-y-1">
          <div className="flex items-center justify-between font-mono tabular-nums">
            <span>{t('nav.architecture')}</span>
            <span className="text-[#E5E7EB]">{t('nav.modules', { n: PRIMARY_NAV_ITEMS.length + SECONDARY_ENGINE_ITEMS.length })}</span>
          </div>
          <div className="flex items-center justify-between font-mono">
            <span>{t('nav.execution')}</span>
            <span>{t('nav.decisionSupport')}</span>
          </div>
        </div>
      </aside>
    </>
  );
}
