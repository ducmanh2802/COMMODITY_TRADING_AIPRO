import { ArrowRight, ShieldAlert } from 'lucide-react';
import { useTerminal } from '../../contexts/TerminalContext';
import { DataStatusBadge } from '../common/DataStatusBadge';

export function OverviewDashboard() {
  const {
    instruments,
    quotesBySymbol,
    providers,
    marketScope,
    timeframe,
    tradingStyle,
    health,
    searchQuery,
    setActiveModule,
    loading,
    loadError,
  } = useTerminal();

  const filteredInstruments = instruments.filter((inst) => {
    if (marketScope === 'MXV' && !inst.isMvxListed) return false;
    if (marketScope === 'INTERNATIONAL' && inst.exchange === 'MXV') return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      return (
        inst.productName.toLowerCase().includes(q) ||
        inst.exchangeSymbol.toLowerCase().includes(q) ||
        (inst.mxvMapping?.mxvSymbol?.toLowerCase().includes(q) ?? false)
      );
    }
    return true;
  });

  const watchlistPreview = filteredInstruments.slice(0, 8);
  const verifiedSpecCount = instruments.filter(
    (i) => i.specification.verificationStatus === 'VERIFIED'
  ).length;
  const connectedProviderCount = providers.filter(
    (p) => p.connectionState === 'CONNECTED'
  ).length;

  return (
    <div className="space-y-6">
      {/* Page Title & Active Context */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight">
            Multi-Market Commodity Overview
          </h1>
          <p className="text-sm text-[#E5E7EB]/65 mt-1">
            Scope: {marketScope} · Timeframe: {timeframe} · Style: {tradingStyle} · Decision Support Only
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DataStatusBadge status={health?.capabilities.marketDataOverallStatus ?? 'UNAVAILABLE'} />
        </div>
      </div>

      {loadError && (
        <div className="bg-[#111622] border border-[#EF4444]/40 rounded-lg p-4 text-sm text-[#EF4444]">
          Backend synchronization error: {loadError}
        </div>
      )}

      {/* Fail-Closed Market Data Integrity Banner */}
      <section
        aria-label="Market Data Integrity Notice"
        className="bg-[#111622] border border-[#263244] rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-[#F59E0B] shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-white font-mono">
              DATA_UNAVAILABLE — No verified market data available.
            </p>
            <p className="text-xs text-[#E5E7EB]/65 leading-relaxed">
              No authorized exchange feed or historical CSV dataset is active in Phase 1. Prices, volume, open interest, and trading signals remain fail-closed until verified data providers are connected.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setActiveModule('data-health')}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#172033] hover:bg-[#172033]/80 border border-[#263244] rounded-md text-xs font-medium text-[#E5E7EB] whitespace-nowrap shrink-0"
        >
          <span>Inspect Providers</span>
          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </section>

      {/* 4-Column Market Overview Strip */}
      <section aria-label="Market Overview Metrics" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-1">
          <p className="text-xs text-[#E5E7EB]/60">Registered Instruments</p>
          <p className="text-2xl font-mono font-semibold text-white tabular-nums">
            {loading ? '—' : filteredInstruments.length}
          </p>
          <p className="text-xs text-[#E5E7EB]/50">
            MXV-mapped: {filteredInstruments.filter((i) => i.isMvxListed).length}
          </p>
        </div>

        <div className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-1">
          <p className="text-xs text-[#E5E7EB]/60">Verified Contract Specs</p>
          <p className="text-2xl font-mono font-semibold text-white tabular-nums">
            {loading ? '—' : `${verifiedSpecCount} / ${instruments.length}`}
          </p>
          <p className="text-xs text-[#F59E0B]">Phase 2 specification verification pending</p>
        </div>

        <div className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-1">
          <p className="text-xs text-[#E5E7EB]/60">Active Data Providers</p>
          <p className="text-2xl font-mono font-semibold text-white tabular-nums">
            {loading ? '—' : `${connectedProviderCount} / ${providers.length}`}
          </p>
          <p className="text-xs text-[#E5E7EB]/50">All adapters failing closed honestly</p>
        </div>

        <div className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-1">
          <p className="text-xs text-[#E5E7EB]/60">Server-Side Gemini Key</p>
          <p className="text-2xl font-mono font-semibold text-white">
            {health?.capabilities.geminiServerKeyConfigured ? 'CONFIGURED' : 'NOT SET'}
          </p>
          <p className="text-xs text-[#E5E7EB]/50">AI Analyst integrates in Phase 5</p>
        </div>
      </section>

      {/* Primary Two-Column Terminal Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Watchlist Preview (2/3 width) */}
        <section
          aria-label="Watchlist Preview"
          className="xl:col-span-2 bg-[#111622] border border-[#263244] rounded-lg flex flex-col"
        >
          <div className="px-4 py-3 border-b border-[#263244] flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Watchlist</h2>
              <p className="text-xs text-[#E5E7EB]/55">
                Core agriculture, softs, metals, and energy contracts
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveModule('markets')}
              className="text-xs font-medium text-[#6366F1] hover:text-[#6366F1]/80 whitespace-nowrap"
            >
              Open Full Market Watch
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#263244] text-xs text-[#E5E7EB]/55">
                  <th className="py-2.5 px-4 font-medium">Commodity</th>
                  <th className="py-2.5 px-3 font-medium">Exchange</th>
                  <th className="py-2.5 px-3 font-medium">MXV Code</th>
                  <th className="py-2.5 px-3 font-medium text-right">Last Price</th>
                  <th className="py-2.5 px-4 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#263244]/70 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-8 px-4 text-center text-[#E5E7EB]/55">
                      Loading instrument master...
                    </td>
                  </tr>
                ) : watchlistPreview.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 px-4 text-center text-[#E5E7EB]/55">
                      No instruments match the current filter.
                    </td>
                  </tr>
                ) : (
                  watchlistPreview.map((inst) => {
                    const quote = quotesBySymbol[inst.exchangeSymbol];
                    return (
                      <tr key={inst.id} className="hover:bg-[#172033]/50 transition-colors">
                        <td className="py-2.5 px-4">
                          <div className="font-medium text-white">{inst.productName}</div>
                          <div className="text-[11px] text-[#E5E7EB]/50 font-mono">
                            {inst.exchangeSymbol} · {inst.category}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[#E5E7EB]/85">
                          {inst.exchange}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[#E5E7EB]/70">
                          {inst.mxvMapping?.mxvSymbol ?? '—'}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-right tabular-nums text-[#E5E7EB]/60">
                          {quote?.price !== null && quote?.price !== undefined
                            ? quote.price.toFixed(2)
                            : 'DATA_UNAVAILABLE'}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <div className="inline-flex justify-end">
                            <DataStatusBadge status={quote?.status ?? 'UNAVAILABLE'} compact />
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Right Column: Top Opportunities + Data Source Health */}
        <div className="space-y-6">
          <section
            aria-label="Top Trading Opportunities"
            className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-white">Top Trading Opportunities</h2>
              <button
                type="button"
                onClick={() => setActiveModule('scanner')}
                className="text-xs text-[#6366F1] hover:text-[#6366F1]/80 whitespace-nowrap"
              >
                Scanner
              </button>
            </div>
            <div className="bg-[#0B0E14] border border-[#263244] rounded-md p-3 space-y-1.5">
              <DataStatusBadge status="UNAVAILABLE" />
              <p className="text-xs text-[#E5E7EB]/65 leading-relaxed">
                Signal generation is suppressed. Validated historical OHLCV candles (Phase 2) and deterministic strategy outputs (Phase 4) are required before setups can be ranked.
              </p>
            </div>
          </section>

          <section
            aria-label="Data Source Health Summary"
            className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-white">Data Source Health</h2>
              <button
                type="button"
                onClick={() => setActiveModule('data-health')}
                className="text-xs text-[#6366F1] hover:text-[#6366F1]/80 whitespace-nowrap"
              >
                Details
              </button>
            </div>
            <ul className="divide-y divide-[#263244]/70 text-xs">
              {providers.map((provider) => (
                <li
                  key={provider.providerId}
                  className="py-2 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-[#E5E7EB] truncate">{provider.name}</p>
                    <p className="text-[11px] font-mono text-[#E5E7EB]/45">
                      {provider.exchanges.join(', ')}
                    </p>
                  </div>
                  <DataStatusBadge status={provider.dataStatus} compact />
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      {/* Secondary Terminal Grid: Trend & Volatility, AI Summary, Economic Calendar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-2">
          <h2 className="text-sm font-semibold text-white">Market Trend & Volatility</h2>
          <DataStatusBadge status="UNAVAILABLE" />
          <p className="text-xs text-[#E5E7EB]/65 leading-relaxed">
            ATR, ADX, EMA regimes, and market structure pivots activate in Phase 3 once validated OHLCV series are available.
          </p>
        </section>

        <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-2">
          <h2 className="text-sm font-semibold text-white">AI Market Summary</h2>
          <DataStatusBadge status="UNAVAILABLE" />
          <p className="text-xs text-[#E5E7EB]/65 leading-relaxed">
            Google Gemini Commodity Analyst (Phase 5) operates strictly on verified technical, fundamental, and risk outputs. Returns NO_TRADE when data is missing.
          </p>
        </section>

        <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-2">
          <h2 className="text-sm font-semibold text-white">Economic Calendar</h2>
          <DataStatusBadge status="UNAVAILABLE" />
          <p className="text-xs text-[#E5E7EB]/65 leading-relaxed">
            USDA, EIA, and macro releases activate in Phase 10 with sourced publication timestamps and revision tracking.
          </p>
        </section>
      </div>
    </div>
  );
}
