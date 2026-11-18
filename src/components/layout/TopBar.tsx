import { useEffect, useState } from 'react';
import { LogIn, LogOut, Menu, RefreshCw, Search, User as UserIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTerminal } from '../../contexts/TerminalContext';
import type { Timeframe } from '../../shared/types/instrument';
import type { MarketScope } from '../../shared/types/market';
import { getVietnamClockLabel } from '../../shared/utils/time';
import { DataStatusBadge } from '../common/DataStatusBadge';
import { LanguageSwitch } from '../common/LanguageSwitch';
import { useT } from '../../i18n';

interface TopBarProps {
  onOpenMobileMenu: () => void;
}

const TIMEFRAMES: Timeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'];

export function TopBar({ onOpenMobileMenu }: TopBarProps) {
  const { user, signInWithGoogle, logout } = useAuth();
  const {
    marketScope,
    setMarketScope,
    searchQuery,
    setSearchQuery,
    timeframe,
    setTimeframe,
    health,
    loading,
    refreshBackendData,
    setActiveModule,
  } = useTerminal();

  const t = useT();
  const [clockLabel, setClockLabel] = useState(() => getVietnamClockLabel());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockLabel(getVietnamClockLabel());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const overallDataStatus = health?.capabilities.marketDataOverallStatus ?? 'UNAVAILABLE';

  return (
    <header className="bg-[#111622] border-b border-[#263244] px-3 sm:px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
      {/* Left zone: Mobile menu trigger + Market selection + Instrument search */}
      <div className="flex items-center gap-2.5 flex-1 min-w-[240px]">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label={t('nav.openMenu')}
          className="lg:hidden p-2.5 bg-[#172033] border border-[#263244] rounded-md text-[#E5E7EB] hover:text-white"
        >
          <Menu className="w-4 h-4" aria-hidden="true" />
        </button>

        <div className="flex items-center gap-1 bg-[#0B0E14] border border-[#263244] rounded-md p-0.5 shrink-0">
          {(['ALL', 'MXV', 'INTERNATIONAL'] as MarketScope[]).map((scope) => (
            <button
              key={scope}
              type="button"
              onClick={() => setMarketScope(scope)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                marketScope === scope
                  ? 'bg-[#6366F1] text-white'
                  : 'text-[#E5E7EB]/70 hover:text-white'
              }`}
            >
              {t(`topbar.scope.${scope}`)}
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-xs hidden sm:block">
          <label htmlFor="topbar-instrument-search" className="sr-only">
            {t('topbar.search')}
          </label>
          <Search
            className="w-3.5 h-3.5 text-[#E5E7EB]/45 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            id="topbar-instrument-search"
            type="search"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (e.target.value.trim().length > 0) {
                setActiveModule('markets');
              }
            }}
            placeholder={t('topbar.searchPlaceholder')}
            className="w-full bg-[#0B0E14] border border-[#263244] rounded-md pl-8 pr-3 py-1.5 text-xs text-[#E5E7EB] placeholder:text-[#E5E7EB]/40 focus:outline-none focus:border-[#6366F1]"
          />
        </div>
      </div>

      {/* Right zone: Timeframe + Data status + Local ICT clock + Refresh + User Profile */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-1.5">
          <label htmlFor="topbar-timeframe" className="sr-only">
            {t('topbar.timeframe')}
          </label>
          <select
            id="topbar-timeframe"
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value as Timeframe)}
            className="bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-1.5 text-xs font-mono text-[#E5E7EB] focus:outline-none focus:border-[#6366F1]"
          >
            {TIMEFRAMES.map((tf) => (
              <option key={tf} value={tf}>
                {tf}
              </option>
            ))}
          </select>
        </div>

        <div className="hidden md:flex items-center gap-3 px-2.5 py-1.5 bg-[#0B0E14] border border-[#263244] rounded-md">
          <DataStatusBadge status={overallDataStatus} />
          <span className="text-[#263244]" aria-hidden="true">
            |
          </span>
          <span className="font-mono text-xs text-[#E5E7EB]/85 tabular-nums whitespace-nowrap">
            {clockLabel}
          </span>
        </div>

        <LanguageSwitch />

        <button
          type="button"
          onClick={() => void refreshBackendData()}
          aria-label={t('topbar.refresh')}
          title={t('topbar.refresh')}
          disabled={loading}
          className="p-2 bg-[#172033] hover:bg-[#172033]/80 border border-[#263244] rounded-md text-[#E5E7EB] disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
        </button>

        {user ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveModule('settings')}
              className="flex items-center gap-2 px-2.5 py-1.5 bg-[#172033] border border-[#263244] rounded-md text-xs text-[#E5E7EB] hover:border-[#6366F1] transition-colors whitespace-nowrap"
            >
              <UserIcon className="w-3.5 h-3.5 text-[#6366F1]" aria-hidden="true" />
              <span className="hidden sm:inline max-w-[120px] truncate">
                {user.displayName || user.email}
              </span>
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              aria-label={t('topbar.signOut')}
              title={t('topbar.signOut')}
              className="p-2 bg-[#172033] hover:bg-[#EF4444]/15 border border-[#263244] hover:border-[#EF4444]/40 rounded-md text-[#E5E7EB]/80 hover:text-[#EF4444] transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#6366F1] hover:bg-[#6366F1]/90 text-white text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t('topbar.signIn')}</span>
          </button>
        )}
      </div>
    </header>
  );
}
