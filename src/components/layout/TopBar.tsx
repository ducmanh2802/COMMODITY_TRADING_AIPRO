import { useEffect, useState } from 'react';
import { LogIn, LogOut, Menu, RefreshCw, Search, User as UserIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTerminal } from '../../contexts/TerminalContext';
import type { Timeframe } from '../../shared/types/instrument';
import type { MarketScope } from '../../shared/types/market';
import { getVietnamClockLabel } from '../../shared/utils/time';
import { DataStatusBadge } from '../common/DataStatusBadge';
import { LanguageSwitch } from '../common/LanguageSwitch';
import { ThemeSwitch } from '../common/ThemeSwitch';
import { TopBarMore } from './TopBarMore';
import { RadarBell } from '../radar/RadarBell';
import { WatchlistAlerts } from '../watchlist/WatchlistAlerts';
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
    lastHealthUpdatedAt,
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
    <header className="sticky top-0 z-30 bg-[var(--surface)]/90 backdrop-blur border-b border-[var(--border)] px-3 sm:px-5 py-2 flex flex-wrap lg:flex-nowrap items-center justify-between gap-2 sm:gap-3 shrink-0 max-w-full overflow-x-clip">
      {/* Left zone: Mobile menu trigger + Market selection + Instrument search */}
      <div className="contents sm:flex sm:items-center sm:gap-2.5 sm:flex-1 sm:min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label={t('nav.openMenu')}
          className="lg:hidden w-10 h-10 grid place-items-center bg-[var(--surface-2)] border border-[var(--border)] rounded-[10px] text-[var(--text)] hover:text-[var(--text-strong)]"
        >
          <Menu className="w-4 h-4" aria-hidden="true" />
        </button>

        <div className="flex items-center gap-1 bg-[var(--bg)] border border-[var(--border)] rounded-[10px] p-0.5 order-last w-full sm:order-none sm:w-auto shrink-0">
          {(['ALL', 'MXV', 'INTERNATIONAL'] as MarketScope[]).map((scope) => (
            <button
              key={scope}
              type="button"
              onClick={() => setMarketScope(scope)}
              className={`h-10 flex-auto min-w-0 truncate sm:flex-none px-1.5 sm:px-3 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                marketScope === scope
                  ? 'bg-[var(--accent)] text-white shadow-sm'
                  : 'text-[var(--muted)] hover:text-[var(--text-strong)]'
              }`}
            >
              {t(`topbar.scope.${scope}`)}
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-24 max-w-56 hidden sm:block">
          <label htmlFor="topbar-instrument-search" className="sr-only">
            {t('topbar.search')}
          </label>
          <Search
            className="w-3.5 h-3.5 text-[var(--text)]/45 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
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
            className="w-full h-10 bg-[var(--bg)] border border-[var(--border)] rounded-[10px] pl-9 pr-3 text-sm text-[var(--text)] placeholder:text-[var(--faint)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/25"
          />
        </div>
      </div>

      {/* Right zone: Timeframe + Data status + Local ICT clock + Refresh + User Profile */}
      <div className="flex items-center gap-1.5 xl:gap-3 min-w-0 max-w-full shrink-0">
        <div className="hidden 2xl:flex items-center gap-1.5">
          <label htmlFor="topbar-timeframe" className="sr-only">
            {t('topbar.timeframe')}
          </label>
          <select
            id="topbar-timeframe"
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value as Timeframe)}
            className="h-10 bg-[var(--bg)] border border-[var(--border)] rounded-[10px] px-2.5 text-xs tabular-nums text-[var(--text)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/25"
          >
            {TIMEFRAMES.map((tf) => (
              <option key={tf} value={tf}>
                {tf}
              </option>
            ))}
          </select>
        </div>

        <div className="hidden 2xl:flex items-center gap-3 h-10 px-3 bg-[var(--bg)] border border-[var(--border)] rounded-[10px]">
          <button
            type="button"
            onClick={() => setActiveModule('data-health')}
            data-testid="topbar-data-health-status"
            data-health-status={overallDataStatus}
            title={lastHealthUpdatedAt ? new Date(lastHealthUpdatedAt).toLocaleTimeString() : undefined}
            className="inline-flex items-center hover:opacity-85 transition-opacity"
          >
            <DataStatusBadge status={overallDataStatus} />
          </button>
          <span className="text-[var(--border)]" aria-hidden="true">
            |
          </span>
          <span className="text-xs text-[var(--text)] tabular-nums whitespace-nowrap">
            {clockLabel}
          </span>
        </div>

        <RadarBell />
        <WatchlistAlerts />
        <div className="hidden xl:flex items-center gap-3">
          <ThemeSwitch />
          <LanguageSwitch />
        </div>
        <TopBarMore />

        <button
          type="button"
          onClick={() => void refreshBackendData()}
          aria-label={t('topbar.refresh')}
          title={t('topbar.refresh')}
          disabled={loading}
          className="w-10 h-10 grid place-items-center bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border)] rounded-[10px] text-[var(--text)] disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
        </button>

        {user ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveModule('settings')}
              aria-label={user.displayName || user.email || t('topbar.signIn')}
              title={user.displayName || user.email || undefined}
              className="flex items-center justify-center gap-2 h-10 min-w-10 px-2.5 2xl:px-3 bg-[var(--surface-2)] border border-[var(--border)] rounded-[10px] text-xs text-[var(--text)] hover:border-[var(--accent)] transition-colors whitespace-nowrap"
            >
              <UserIcon className="w-3.5 h-3.5 text-[var(--accent)]" aria-hidden="true" />
              <span className="hidden 2xl:inline max-w-[120px] truncate">
                {user.displayName || user.email}
              </span>
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              aria-label={t('topbar.signOut')}
              title={t('topbar.signOut')}
              className="w-10 h-10 grid place-items-center bg-[var(--surface-2)] hover:bg-[var(--negative)]/15 border border-[var(--border)] hover:border-[var(--negative)]/40 rounded-[10px] text-[var(--text)]/80 hover:text-[var(--negative)] transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            aria-label={t('topbar.signIn')}
            title={t('topbar.signIn')}
            className="inline-flex items-center justify-center gap-1.5 h-10 w-10 xl:w-auto xl:px-4 bg-[var(--accent)] hover:brightness-110 text-white text-xs font-semibold rounded-[10px] transition-colors whitespace-nowrap shrink-0"
          >
            <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden xl:inline">{t('topbar.signIn')}</span>
          </button>
        )}
      </div>
    </header>
  );
}
