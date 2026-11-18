import { useEffect, useState } from 'react';
import { ArrowRight, CloudDownload, ShieldAlert } from 'lucide-react';
import { useTerminal } from '../../contexts/TerminalContext';
import { formatTimestampInZone } from '../../shared/utils/time';
import { DataStatusBadge } from '../common/DataStatusBadge';
import { fmtFixed, useT } from '../../i18n';

interface OverviewTechSummary {
  status: string;
  mainTrend: string;
  marketRegime: string;
  atr14: number | null;
  rsi14: number | null;
}

export function OverviewDashboard() {
  const {
    instruments,
    quotesBySymbol,
    providers,
    datasets,
    marketScope,
    timeframe,
    tradingStyle,
    selectedSymbol,
    health,
    searchQuery,
    setActiveModule,
    openInstrumentIn,
    syncProviderFeeds,
    syncing,
    loading,
    loadError,
  } = useTerminal();

  const t = useT();
  const [techSummary, setTechSummary] = useState<OverviewTechSummary | null>(null);
  const [macroCount, setMacroCount] = useState(0);
  const [newsCount, setNewsCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function loadSecondary() {
      try {
        const [techRes, fundRes] = await Promise.all([
          fetch(`/api/technical/${encodeURIComponent(selectedSymbol)}?timeframe=${timeframe}`),
          fetch('/api/fundamental/records'),
        ]);
        if (cancelled) return;
        if (techRes.ok) {
          const tj = await techRes.json();
          const snap = tj.snapshot;
          setTechSummary({
            status: snap?.status ?? 'UNAVAILABLE',
            mainTrend: snap?.marketStructure?.mainTrend ?? 'UNCERTAIN',
            marketRegime: snap?.marketStructure?.marketRegime ?? 'INSUFFICIENT_DATA',
            atr14: snap?.atr14 ?? null,
            rsi14: snap?.rsi14 ?? null,
          });
        }
        if (fundRes.ok) {
          const fj = await fundRes.json();
          setMacroCount(Array.isArray(fj.records) ? fj.records.length : 0);
          setNewsCount(Array.isArray(fj.news) ? fj.news.length : 0);
        }
      } catch {
        // Ignore transient background fetch error on overview summary
      }
    }
    void loadSecondary();
    return () => {
      cancelled = true;
    };
  }, [selectedSymbol, timeframe, datasets.length]);

  const filteredInstruments = instruments.filter((inst) => {
    if (marketScope === 'MXV' && !inst.isMvxListed) return false;
    if (marketScope === 'INTERNATIONAL' && inst.exchange === 'MXV') return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      return (
        inst.productName.toLowerCase().includes(q) ||
        (inst.commodityProfile?.vietnameseName.toLowerCase().includes(q) ?? false) ||
        inst.exchangeSymbol.toLowerCase().includes(q) ||
        (inst.mxvMapping?.mxvSymbol?.toLowerCase().includes(q) ?? false)
      );
    }
    return true;
  });

  const activeInstrument =
    instruments.find((i) => i.exchangeSymbol === selectedSymbol) ?? filteredInstruments[0] ?? null;

  const watchlistPreview = filteredInstruments.slice(0, 10);
  const verifiedSpecCount = instruments.filter(
    (i) => i.specification.verificationStatus === 'VERIFIED'
  ).length;
  const connectedProviderCount = providers.filter(
    (p) => p.connectionState === 'CONNECTED'
  ).length;
  const overallStatus = health?.capabilities.marketDataOverallStatus ?? 'UNAVAILABLE';

  return (
    <div className="space-y-6">
      {/* Page Title & Active Context */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight">
            {marketScope === 'MXV'
              ? t('dash.ov.titleMxv')
              : t('dash.ov.title')}
          </h1>
          <p className="text-sm text-[#E5E7EB]/65 mt-1">
            {t('dash.ov.context', { scope: t(`topbar.scope.${marketScope}`), name: activeInstrument?.commodityProfile?.vietnameseName ?? selectedSymbol, symbol: selectedSymbol, tf: timeframe, style: tradingStyle })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void syncProviderFeeds({ timeframe })}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#6366F1] hover:bg-[#6366F1]/90 rounded-md text-xs font-medium text-white disabled:opacity-50"
          >
            <CloudDownload className={`w-3.5 h-3.5 ${syncing ? 'animate-pulse' : ''}`} aria-hidden="true" />
            <span>{syncing ? t('dash.ov.syncing') : t('dash.ov.sync')}</span>
          </button>
          <DataStatusBadge status={overallStatus} />
        </div>
      </div>

      {loadError && (
        <div className="bg-[#111622] border border-[#EF4444]/40 rounded-lg p-4 text-sm text-[#EF4444]">
          {t('dash.ov.syncError', { error: loadError })}
        </div>
      )}

      {/* Fail-Closed Market Data Integrity Banner */}
      <section
        aria-label={t('dash.ov.integrityAria')}
        className="bg-[#111622] border border-[#263244] rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div className="flex items-start gap-3">
          <ShieldAlert
            className={`w-5 h-5 shrink-0 mt-0.5 ${
              overallStatus === 'UNAVAILABLE' ? 'text-[#F59E0B]' : 'text-[#6366F1]'
            }`}
            aria-hidden="true"
          />
          <div className="space-y-1">
            <p className="text-sm font-medium text-white font-mono">
              {overallStatus === 'UNAVAILABLE'
                ? t('dash.ov.banner.unavailable')
                : overallStatus === 'CURRENT'
                  ? t('dash.ov.banner.current', { providers: connectedProviderCount, datasets: datasets.length })
                  : overallStatus === 'DELAYED'
                    ? t('dash.ov.banner.delayed', { providers: connectedProviderCount, datasets: datasets.length })
                    : t('dash.ov.banner.historical', { datasets: datasets.length })}
            </p>
            <p className="text-xs text-[#E5E7EB]/65 leading-relaxed">
              {overallStatus === 'UNAVAILABLE'
                ? t('dash.ov.banner.unavailableHint')
                : t('dash.ov.banner.okHint')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveModule('data-health')}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#172033] hover:bg-[#172033]/80 border border-[#263244] rounded-md text-xs font-medium text-[#E5E7EB] whitespace-nowrap"
          >
            <span>{t('dash.ov.secretsCsv')}</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </section>

      {/* Active Commodity Intelligence Card (Vietnam MXV Focus) */}
      {activeInstrument?.commodityProfile && (
        <section
          aria-label={t('dash.ov.briefAria')}
          className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-3"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#263244] pb-2.5">
            <div>
              <h2 className="text-sm font-semibold text-white">
                {activeInstrument.commodityProfile.vietnameseName} ({activeInstrument.exchange}:{activeInstrument.exchangeSymbol}
                {activeInstrument.mxvMapping?.mxvSymbol
                  ? ` · MXV ${activeInstrument.mxvMapping.mxvSymbol}`
                  : ''})
              </h2>
              <p className="text-xs font-mono text-[#E5E7EB]/60 mt-0.5">
                {t('dash.ov.sessionIct', { sessions: activeInstrument.commodityProfile.vietnamTradingSessionsIct })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => openInstrumentIn(activeInstrument.exchangeSymbol, 'explorer')}
              className="text-xs font-medium text-[#6366F1] hover:underline whitespace-nowrap self-start sm:self-center"
            >
              {t('dash.ov.viewContract')}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
            <div className="space-y-1">
              <p className="text-[#E5E7EB]/55 font-medium">{t('dash.ov.vnRelevance')}</p>
              <p className="text-[#E5E7EB]/85 leading-relaxed">
                {activeInstrument.commodityProfile.vietnamMarketRelevance}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[#E5E7EB]/55 font-medium">{t('dash.ov.drivers')}</p>
              <ul className="list-disc pl-4 space-y-0.5 text-[#E5E7EB]/85">
                {activeInstrument.commodityProfile.fundamentalDrivers.slice(0, 3).map((d, idx) => (
                  <li key={idx}>{d}</li>
                ))}
              </ul>
            </div>
            <div className="space-y-1">
              <p className="text-[#E5E7EB]/55 font-medium">{t('dash.ov.seasonal')}</p>
              <p className="text-[#E5E7EB]/85 leading-relaxed">
                {activeInstrument.commodityProfile.seasonalPattern}
              </p>
              <p className="text-[#F59E0B]/90 leading-relaxed">
                {activeInstrument.commodityProfile.fxSensitivity}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* 4-Column Market Overview Strip */}
      <section aria-label={t('dash.ov.metricsAria')} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-1">
          <p className="text-xs text-[#E5E7EB]/60">{t('dash.ov.instruments')}</p>
          <p className="text-2xl font-mono font-semibold text-white tabular-nums">
            {loading ? '—' : filteredInstruments.length}
          </p>
          <p className="text-xs text-[#E5E7EB]/50">
            {t('dash.ov.mxvMapped', { n: filteredInstruments.filter((i) => i.isMvxListed).length })}
          </p>
        </div>

        <div className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-1">
          <p className="text-xs text-[#E5E7EB]/60">{t('dash.ov.verifiedSpecs')}</p>
          <p className="text-2xl font-mono font-semibold text-white tabular-nums">
            {loading ? '—' : `${verifiedSpecCount} / ${instruments.length}`}
          </p>
          <button
            type="button"
            onClick={() => setActiveModule('explorer')}
            className="text-xs text-[#6366F1] hover:underline"
          >
            {t('dash.ov.inspectExplorer')}
          </button>
        </div>

        <div className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-1">
          <p className="text-xs text-[#E5E7EB]/60">{t('dash.ov.providersDatasets')}</p>
          <p className="text-2xl font-mono font-semibold text-white tabular-nums">
            {loading ? '—' : `${connectedProviderCount}/${providers.length} · ${datasets.length} OHLCV`}
          </p>
          <p className="text-xs text-[#E5E7EB]/50">{t('dash.ov.failClosed')}</p>
        </div>

        <div className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-1">
          <p className="text-xs text-[#E5E7EB]/60">{t('dash.ov.geminiKey')}</p>
          <p className="text-2xl font-mono font-semibold text-white">
            {health?.capabilities.geminiServerKeyConfigured ? t('dash.ov.configured') : t('dash.ov.notSet')}
          </p>
          <button
            type="button"
            onClick={() => setActiveModule('ai-analyst')}
            className="text-xs text-[#6366F1] hover:underline"
          >
            {t('dash.ov.openAi')}
          </button>
        </div>
      </section>

      {/* Primary Two-Column Terminal Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Watchlist Preview (2/3 width) */}
        <section
          aria-label={t('dash.ov.watchAria')}
          className="xl:col-span-2 bg-[#111622] border border-[#263244] rounded-lg flex flex-col"
        >
          <div className="px-4 py-3 border-b border-[#263244] flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">
                {marketScope === 'MXV' ? t('dash.ov.watchMxv') : t('dash.ov.watch')}
              </h2>
              <p className="text-xs text-[#E5E7EB]/55">
                {t('dash.ov.watchSub')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveModule('markets')}
              className="text-xs font-medium text-[#6366F1] hover:text-[#6366F1]/80 whitespace-nowrap"
            >
              {t('dash.ov.openMarketWatch')}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#263244] text-xs text-[#E5E7EB]/55">
                  <th className="py-2.5 px-4 font-medium">{t('dash.ov.colCommodity')}</th>
                  <th className="py-2.5 px-3 font-medium">{t('common.exchange')}</th>
                  <th className="py-2.5 px-3 font-medium">{t('dash.ov.colMxvCode')}</th>
                  <th className="py-2.5 px-3 font-medium text-right">{t('dash.ov.colLast')}</th>
                  <th className="py-2.5 px-4 font-medium text-right">{t('common.status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#263244]/70 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-8 px-4 text-center text-[#E5E7EB]/55">
                      {t('dash.ov.loadingInstruments')}
                    </td>
                  </tr>
                ) : watchlistPreview.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 px-4 text-center text-[#E5E7EB]/55">
                      {t('dash.ov.noMatch')}
                    </td>
                  </tr>
                ) : (
                  watchlistPreview.map((inst) => {
                    const quote = quotesBySymbol[inst.exchangeSymbol];
                    return (
                      <tr
                        key={inst.id}
                        onClick={() => openInstrumentIn(inst.exchangeSymbol, 'charts')}
                        className="hover:bg-[#172033]/50 transition-colors cursor-pointer"
                      >
                        <td className="py-2.5 px-4">
                          <div className="font-medium text-white">
                            {inst.commodityProfile?.vietnameseName ?? inst.productName}
                          </div>
                          <div className="text-[11px] text-[#E5E7EB]/50 font-mono">
                            {inst.exchangeSymbol} · {inst.productName}
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
                            ? `${fmtFixed(quote.price, 2)} ${quote.currency}`
                            : <span title={t('status.DATA_UNAVAILABLE.desc')}>{t('status.DATA_UNAVAILABLE')}</span>}
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
            aria-label={t('dash.ov.opp')}
            className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-white">{t('dash.ov.opp')}</h2>
              <button
                type="button"
                onClick={() => setActiveModule('scanner')}
                className="text-xs text-[#6366F1] hover:text-[#6366F1]/80 whitespace-nowrap"
              >
                {t('dash.ov.openScanner')}
              </button>
            </div>
            {datasets.length === 0 ? (
              <div className="bg-[#0B0E14] border border-[#263244] rounded-md p-3 space-y-1.5">
                <DataStatusBadge status="UNAVAILABLE" />
                <p className="text-xs text-[#E5E7EB]/65 leading-relaxed">
                  {t('dash.ov.oppSuppressed')}
                </p>
              </div>
            ) : (
              <div className="bg-[#0B0E14] border border-[#263244] rounded-md p-3 space-y-2">
                <DataStatusBadge status="HISTORICAL" />
                <p className="text-xs text-[#E5E7EB]/75 leading-relaxed">
                  {t('dash.ov.oppReady', { n: datasets.length })}
                </p>
                <div className="text-[11px] font-mono text-[#E5E7EB]/50">
                  {t('dash.ov.latestImport', { time: formatTimestampInZone(datasets[0].importedAt, 'Asia/Ho_Chi_Minh') })}
                </div>
              </div>
            )}
          </section>

          <section
            aria-label={t('dash.ov.healthAria')}
            className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-white">{t('dash.ov.health')}</h2>
              <button
                type="button"
                onClick={() => setActiveModule('data-health')}
                className="text-xs text-[#6366F1] hover:text-[#6366F1]/80 whitespace-nowrap"
              >
                {t('dash.ov.apiKeys')}
              </button>
            </div>
            <ul className="divide-y divide-[#263244]/70 text-xs">
              {providers.slice(0, 7).map((provider) => (
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
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">{t('dash.ov.trend', { symbol: selectedSymbol })}</h2>
            <button
              type="button"
              onClick={() => setActiveModule('technical')}
              className="text-xs text-[#6366F1] hover:underline"
            >
              {t('dash.ov.engine')}
            </button>
          </div>
          <DataStatusBadge
            status={(techSummary?.status as 'UNAVAILABLE' | 'HISTORICAL') ?? 'UNAVAILABLE'}
          />
          {techSummary && techSummary.status !== 'UNAVAILABLE' ? (
            <div className="text-xs font-mono text-[#E5E7EB]/80 space-y-1 pt-1 tabular-nums">
              <p>{t('dash.ov.trendLine', { trend: techSummary.mainTrend, regime: techSummary.marketRegime })}</p>
              <p>
                RSI(14): {techSummary.rsi14 !== null ? fmtFixed(techSummary.rsi14, 2) : t('common.na')} · ATR(14):{' '}
                {techSummary.atr14 !== null ? fmtFixed(techSummary.atr14, 4) : t('common.na')}
              </p>
            </div>
          ) : (
            <p className="text-xs text-[#E5E7EB]/65 leading-relaxed">
              {t('dash.ov.trendNeedData', { symbol: selectedSymbol })}
            </p>
          )}
        </section>

        <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">{t('dash.ov.aiTitle')}</h2>
            <button
              type="button"
              onClick={() => setActiveModule('ai-analyst')}
              className="text-xs text-[#6366F1] hover:underline"
            >
              {t('dash.ov.launch')}
            </button>
          </div>
          <DataStatusBadge status={overallStatus} />
          <p className="text-xs text-[#E5E7EB]/65 leading-relaxed">
            {t('dash.ov.aiDesc')}
          </p>
        </section>

        <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">{t('dash.ov.calTitle')}</h2>
            <button
              type="button"
              onClick={() => setActiveModule('news')}
              className="text-xs text-[#6366F1] hover:underline"
            >
              {t('dash.ov.openCal')}
            </button>
          </div>
          <DataStatusBadge status={macroCount > 0 || newsCount > 0 ? 'HISTORICAL' : 'UNAVAILABLE'} />
          <p className="text-xs text-[#E5E7EB]/65 leading-relaxed">
            {macroCount + newsCount > 0
              ? t('dash.ov.calHas', { macro: macroCount, news: newsCount })
              : t('dash.ov.calEmpty')}
          </p>
        </section>
      </div>
    </div>
  );
}
