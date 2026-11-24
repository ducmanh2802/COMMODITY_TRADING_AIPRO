import { onTablistKeyDown, tablistRef } from '../../shared/hooks/tablistKeys';
import { useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  CloudDownload,
  Database,
  FileSpreadsheet,
  KeyRound,
  Layers,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTerminal } from '../../contexts/TerminalContext';
import { formatTimestampInZone } from '../../shared/utils/time';
import { CsvImportPanel } from '../common/CsvImportPanel';
import { DataStatusBadge } from '../common/DataStatusBadge';
import { fmtPrice } from '../common/quoteFormat';
import { fmtNum, hasKey, useT } from '../../i18n';
import { CotHealthSection } from './cot/CotHealthSection';
import { SystemStatusPanel } from './SystemStatusPanel';

interface ApiSecretSpec {
  provider: string;
  secretName: string;
  latencyAndTier: string;
  commodityCoverage: string;
  officialDoc: string;
  providerId: string;
}

const SERVER_API_SECRETS: ApiSecretSpec[] = [
  {
    provider: 'Twelve Data',
    secretName: 'TWELVEDATA_API_KEY',
    latencyAndTier: 'Real-time / Intraday REST (Free: 8 req/min, 800/day)',
    commodityCoverage: 'Spot Metals (XAU/USD, XAG/USD, XPT/USD), Intraday M1–W1, USD/VND FX',
    officialDoc: 'twelvedata.com',
    providerId: 'TWELVE_DATA',
  },
  {
    provider: 'Financial Modeling Prep (FMP)',
    secretName: 'FMP_API_KEY',
    latencyAndTier: 'Real-time / Delayed /stable/quote & Daily OHLCV (Free: 250 req/day)',
    commodityCoverage: 'Futures Quotes & EOD (GCUSD, CLUSD, BZUSD, HGUSD, ZCUSX, ZSUSX, KCUSX, SBUSX, CTUSX)',
    officialDoc: 'financialmodelingprep.com',
    providerId: 'FMP_COMMODITIES',
  },
  {
    provider: 'Commodities-API',
    secretName: 'COMMODITIES_API_KEY',
    latencyAndTier: 'Real-time Spot & Futures Rates (60s–1h refresh by plan)',
    commodityCoverage: 'Robusta/Arabica, Sugar, Corn, Wheat, Cotton, Soybean, Brent/WTI, Gold/Silver',
    officialDoc: 'commodities-api.com',
    providerId: 'COMMODITIES_API',
  },
  {
    provider: 'Alpha Vantage',
    secretName: 'ALPHAVANTAGE_API_KEY',
    latencyAndTier: 'Daily/Monthly Benchmarks & FX (Free key: 25 req/day)',
    commodityCoverage: 'WTI, BRENT, NATURAL_GAS, COPPER, CORN, WHEAT, COFFEE, SUGAR, COTTON + USD/VND',
    officialDoc: 'alphavantage.co',
    providerId: 'ALPHA_VANTAGE',
  },
  {
    provider: 'U.S. EIA Open Data v2',
    secretName: 'EIA_API_KEY',
    latencyAndTier: 'Official Free Government API (Unlimited)',
    commodityCoverage: 'Daily WTI/Brent/NG spot & Weekly US Crude/Natural Gas Inventories',
    officialDoc: 'eia.gov/opendata',
    providerId: 'EIA_ENERGY',
  },
  {
    provider: 'USDA NASS QuickStats',
    secretName: 'USDA_API_KEY',
    latencyAndTier: 'Official Free Government API',
    commodityCoverage: 'Official US Soybeans, Corn, Wheat, Cotton & Rice Production/Stocks Macro',
    officialDoc: 'quickstats.nass.usda.gov',
    providerId: 'USDA_QUICKSTATS',
  },
  {
    provider: 'FRED Economic Data (Macro & Spot)',
    secretName: 'FRED_API_KEY (hoặc Public CSV 0-key)',
    latencyAndTier: 'Official Fed St. Louis (Public CSV 0-key hoặc JSON API 120 req/min)',
    commodityCoverage: 'Brent Spot FOB hàng ngày (DCOILBRENTEU → BRN), DXY, Fed Funds, 10Y, CPI & IMF Monthly (RC/CT/JRU/TIO)',
    officialDoc: 'fred.stlouisfed.org',
    providerId: 'FRED_MACRO',
  },
  {
    provider: 'MXV Official / CQG Member Feed',
    secretName: 'MXV_API_KEY + MXV_API_URL',
    latencyAndTier: 'Real-time L1/L2 (Requires Thành viên Kinh doanh MXV authorization)',
    commodityCoverage: 'Direct MXV-routed contracts (LRC Robusta, JRU Rubber, SBE Soybean, ZCE Corn...)',
    officialDoc: 'mxv.com.vn',
    providerId: 'MXV_OFFICIAL',
  },
  {
    provider: 'Yahoo Finance (UNOFFICIAL)',
    secretName: 'YAHOO_ENABLED=true',
    latencyAndTier: 'Delayed ~10–30m (Free, 2y–10y D1 continuous, personal use only)',
    commodityCoverage: 'ZC ZS ZM ZL ZW ZR KC SB CC HG GC SI PL CL NG (15 mã; không hỗ trợ RC, BRN futures, TIO, JRU, CT)',
    officialDoc: 'finance.yahoo.com',
    providerId: 'YAHOO_UNOFFICIAL',
  },
];

type HealthTab = 'COVERAGE' | 'PROVIDERS' | 'FUNDAMENTALS' | 'CSV_SERIES';

export function DataHealthView() {
  const {
    health,
    providers,
    datasets,
    dataHealthReport,
    loading,
    syncing,
    timeframe,
    lastSyncSummary,
    refreshBackendData,
    syncProviderFeeds,
    openInstrumentIn,
  } = useTerminal();
  const { firestoreStatus } = useAuth();
  const t = useT();
  const label = (prefix: string, v: string) => {
    const k = `${prefix}${v}`;
    return hasKey(k) ? t(k) : v;
  };
  const connectedCount = providers.filter((p) => p.connectionState === 'CONNECTED').length;

  const [activeTab, setActiveTab] = useState<HealthTab>('COVERAGE');
  const [historicalRange, setHistoricalRange] = useState<'2y' | '5y' | '10y'>('5y');
  const [exchangeFilter, setExchangeFilter] = useState<string>('ALL');
  const [coverageSearch, setCoverageSearch] = useState<string>('');
  const [coverageFilter, setCoverageFilter] = useState<'ALL' | 'READY' | 'GAPS_OR_STALE' | 'MISSING'>('ALL');

  const filteredCommodities = useMemo(() => {
    if (!dataHealthReport) return [];
    const q = coverageSearch.trim().toLowerCase();
    return dataHealthReport.commodities.filter((c) => {
      if (exchangeFilter === 'MXV' && !c.isMvxListed) return false;
      if (exchangeFilter !== 'ALL' && exchangeFilter !== 'MXV' && c.exchange !== exchangeFilter) return false;
      if (coverageFilter === 'READY' && c.dailyBars < 30 && c.quotePrice === null) return false;
      if (
        coverageFilter === 'GAPS_OR_STALE' &&
        c.missingGapCount === 0 &&
        c.duplicateCount === 0 &&
        c.historicalFreshness !== 'STALE'
      ) {
        return false;
      }
      if (coverageFilter === 'MISSING' && c.dailyBars >= 30) return false;
      if (q) {
        const hay = `${c.symbol} ${c.productName} ${c.vietnameseName} ${c.exchange}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [dataHealthReport, exchangeFilter, coverageSearch, coverageFilter]);

  const scoreColor = (score: number) =>
    score >= 75 ? 'text-[var(--positive)]' : score >= 45 ? 'text-[var(--warning)]' : 'text-[var(--negative)]';

  const scoreBarColor = (score: number) =>
    score >= 75 ? 'bg-[var(--series-1)]' : score >= 45 ? 'bg-[var(--warning)]' : 'bg-[var(--negative)]';

  return (
    <div className="space-y-6">
      <SystemStatusPanel />
      {/* Header & Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[var(--text-strong)] tracking-tight">{t('fr.dh.title')}</h2>
          <p className="text-sm text-[var(--text)]/65 mt-1">{t('fr.dh.sub')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start">
          <label className="inline-flex items-center gap-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-xs text-[var(--text)]/80">
            <span>{t('fr.dh.yahooHist')}</span>
            <select
              aria-label={t('fr.dh.histRange')}
              value={historicalRange}
              onChange={(e) => setHistoricalRange(e.target.value as '2y' | '5y' | '10y')}
              className="bg-transparent text-[var(--text-strong)] focus:outline-none"
            >
              <option value="2y" className="bg-[var(--surface)]">{t('fr.dh.years', { n: 2 })}</option>
              <option value="5y" className="bg-[var(--surface)]">{t('fr.dh.years', { n: 5 })}</option>
              <option value="10y" className="bg-[var(--surface)]">{t('fr.dh.years', { n: 10 })}</option>
            </select>
          </label>

          <button
            type="button"
            onClick={() => void syncProviderFeeds({ timeframe, historicalRange, includePublicMacro: true })}
            disabled={syncing || loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent)]/90 rounded-md text-xs font-medium text-white disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <CloudDownload className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{syncing ? t('fr.dh.syncing') : t('fr.dh.sync')}</span>
          </button>

          <button
            type="button"
            onClick={() => void refreshBackendData()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--surface-2)] hover:bg-[var(--surface-2)]/80 border border-[var(--border)] rounded-md text-xs font-medium text-[var(--text-strong)] disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>{t('fr.dh.check')}</span>
          </button>
        </div>
      </div>

      {/* Friendly summary */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-sm text-[var(--text)]/80 space-y-1">
        <p className="font-medium text-[var(--text-strong)]">{t('fr.dh.summary', { n: connectedCount, total: providers.length })}</p>
        <p className="text-xs text-[var(--text)]/60">{t('fr.dh.envHint')}</p>
      </div>

      {/* Sync Summary Banner */}
      {lastSyncSummary && (
        <section
          aria-label={t('fr.dh.syncDoneAt', { time: formatTimestampInZone(lastSyncSummary.syncedAt, 'Asia/Ho_Chi_Minh') })}
          className="bg-[var(--surface)] border border-[var(--accent)]/40 rounded-lg p-4 space-y-3"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <p className="text-xs font-semibold text-[var(--text-strong)]">
              {t('fr.dh.syncDoneAt', { time: formatTimestampInZone(lastSyncSummary.syncedAt, 'Asia/Ho_Chi_Minh') })}
            </p>
            <span className="text-xs text-[var(--positive)] tabular-nums">
              {t('fr.dh.syncAdded', { candles: lastSyncSummary.totalCandlesDatasetsAdded, macro: lastSyncSummary.totalMacroAdded })}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
            {lastSyncSummary.outcomes.map((o) => (
              <div key={o.providerId} className="bg-[var(--bg)] border border-[var(--border)] rounded p-2.5 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-[var(--text-strong)] truncate">{o.providerName}</span>
                  <span
                    title={o.status}
                    className={`text-[11px] shrink-0 ${
                      o.status === 'CONNECTED'
                        ? 'text-[var(--positive)]'
                        : o.status === 'UNCONFIGURED'
                          ? 'text-[var(--text)]/50'
                          : 'text-[var(--warning)]'
                    }`}
                  >
                    {label('fr.dh.out.', o.status)}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text)]/70">{o.message}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Top KPI Strip */}
      <section aria-label={t('fr.dh.kpiAria')} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-[var(--text)]/60">
            <span>{t('fr.dh.kpiScore')}</span>
            <ShieldCheck className="w-4 h-4 text-[var(--accent)]" aria-hidden="true" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className={`text-2xl font-mono font-semibold tabular-nums ${scoreColor(dataHealthReport?.overallQualityScore ?? 0)}`}>
              {dataHealthReport ? `${dataHealthReport.overallQualityScore}/100` : '—'}
            </span>
            {dataHealthReport && <DataStatusBadge status={dataHealthReport.overallStatus} compact />}
          </div>
          <div className="h-1.5 bg-[var(--bg)] rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${scoreBarColor(dataHealthReport?.overallQualityScore ?? 0)}`}
              style={{ width: `${dataHealthReport?.overallQualityScore ?? 0}%` }}
            />
          </div>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-[var(--text)]/60">
            <span>{t('fr.dh.kpiCoverage')}</span>
            <Database className="w-4 h-4 text-[var(--accent)]" aria-hidden="true" />
          </div>
          <p className="text-2xl font-mono font-semibold text-[var(--text-strong)] tabular-nums">
            {dataHealthReport
              ? `${dataHealthReport.coverageSummary.withDailyHistory}/${dataHealthReport.coverageSummary.totalCommodities}`
              : '—'}
          </p>
          <p className="text-xs text-[var(--text)]/55 tabular-nums">
            {dataHealthReport
              ? t('fr.dh.kpiCoverageSub', {
                  y5: dataHealthReport.coverageSummary.with5YHistory,
                  y10: dataHealthReport.coverageSummary.with10YHistory,
                  cot: dataHealthReport.coverageSummary.withCotHistory,
                })
              : t('fr.dh.loadingMetrics')}
          </p>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-[var(--text)]/60">
            <span>{t('fr.dh.kpiStatus')}</span>
            <Activity className="w-4 h-4 text-[var(--accent)]" aria-hidden="true" />
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] tabular-nums pt-0.5">
            <span className="text-[var(--positive)]">{t('fr.status.CURRENT')}: {dataHealthReport?.statusBreakdown.current ?? 0}</span>
            <span className="text-[var(--warning)]">{t('fr.status.DELAYED')}: {dataHealthReport?.statusBreakdown.delayed ?? 0}</span>
            <span className="text-[var(--accent)]">{t('status.HISTORICAL')}: {dataHealthReport?.statusBreakdown.historical ?? 0}</span>
            <span className="text-[var(--warning)]">{t('fr.status.STALE')}: {dataHealthReport?.statusBreakdown.stale ?? 0}</span>
            <span className="text-[var(--text)]/65">{t('fr.status.UNAVAILABLE')}: {dataHealthReport?.statusBreakdown.unavailable ?? 0}</span>
            <span className="text-[var(--negative)]">{t('fr.status.INVALID')}: {dataHealthReport?.statusBreakdown.invalid ?? 0}</span>
          </div>
          <p className="text-[11px] text-[var(--text)]/50 tabular-nums">
            {t('fr.dh.gaps', { g: dataHealthReport?.coverageSummary.totalMissingGaps ?? 0, s: dataHealthReport?.coverageSummary.totalStaleSeries ?? 0 })}
          </p>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-[var(--text)]/60">
            <span>{t('fr.dh.kpiProviders')}</span>
            <CheckCircle2 className="w-4 h-4 text-[var(--accent)]" aria-hidden="true" />
          </div>
          <p className="text-lg font-semibold text-[var(--text-strong)] tabular-nums">
            {dataHealthReport
              ? t('fr.dh.connected', { n: dataHealthReport.providerSummary.connected, total: dataHealthReport.providerSummary.total })
              : health
                ? t('fr.dh.connected', { n: connectedCount, total: providers.length })
                : t('fr.dh.checking')}
          </p>
          <p className="text-[11px] text-[var(--text)]/55 break-words" title={`DB: ${firestoreStatus === 'SIGNED_OUT' ? t('fs.signedOut') : firestoreStatus}`}>
            {t('fr.dh.gemini', {
              state: health?.capabilities.geminiServerKeyConfigured ? t('fr.dh.keySet') : t('fr.dh.keyNotSet'),
              db: firestoreStatus === 'SIGNED_OUT' ? t('fs.signedOut') : firestoreStatus,
            })}
          </p>
          <p className="text-[11px] text-[var(--text)]/45 break-words">
            {t('fr.dh.updated', {
              time: dataHealthReport?.providerSummary.lastSuccessfulUpdate
                ? formatTimestampInZone(dataHealthReport.providerSummary.lastSuccessfulUpdate, 'Asia/Ho_Chi_Minh')
                : t('fr.dh.notSynced'),
            })}
          </p>
        </div>
      </section>

      {/* Navigation Tabs */}
      <div
        role="tablist" ref={tablistRef} onKeyDown={onTablistKeyDown}
        aria-label={t('fr.dh.tabsAria')}
        className="flex flex-wrap items-center gap-1 border-b border-[var(--border)] pb-2"
      >
        {(
          [
            { id: 'COVERAGE', icon: Layers },
            { id: 'PROVIDERS', icon: KeyRound },
            { id: 'FUNDAMENTALS', icon: Activity },
            { id: 'CSV_SERIES', icon: FileSpreadsheet },
          ] as const
        ).map(({ id, icon: Icon }) => {
          const selected = activeTab === id;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={selected}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                selected
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--surface)] text-[var(--text)]/70 hover:text-[var(--text-strong)] border border-[var(--border)]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t(`fr.dh.tab.${id}`)}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: 20-Commodity Historical & Quality Coverage Matrix */}
      {activeTab === 'COVERAGE' && (
        <div className="space-y-6">
          <section
            aria-label={t('fr.dh.tab.COVERAGE')}
            className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden"
          >
            <div className="p-4 border-b border-[var(--border)] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-strong)]">
                  {t('fr.dh.covTitle', { n: filteredCommodities.length, total: dataHealthReport?.commodities.length ?? 0 })}
                </h2>
                <p className="text-xs text-[var(--text)]/55 mt-0.5">{t('fr.dh.covSub')}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[var(--text)]/45 absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                  <input
                    type="text"
                    value={coverageSearch}
                    onChange={(e) => setCoverageSearch(e.target.value)}
                    placeholder={t('fr.dh.search')}
                    aria-label={t('fr.dh.search')}
                    className="bg-[var(--bg)] border border-[var(--border)] rounded-md pl-8 pr-3 py-1.5 text-xs text-[var(--text-strong)] placeholder-[var(--text)]/40 focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <select
                  aria-label={t('fr.dh.colExchange')}
                  value={exchangeFilter}
                  onChange={(e) => setExchangeFilter(e.target.value)}
                  className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-xs text-[var(--text-strong)] focus:outline-none focus:border-[var(--accent)]"
                >
                  <option value="ALL">{t('fr.dh.exAll')}</option>
                  <option value="MXV">{t('fr.dh.exMxv')}</option>
                  <option value="CBOT">CBOT</option>
                  <option value="ICE">ICE</option>
                  <option value="COMEX">COMEX</option>
                  <option value="NYMEX">NYMEX</option>
                </select>

                <select
                  aria-label={t('fr.dh.colStatus')}
                  value={coverageFilter}
                  onChange={(e) => setCoverageFilter(e.target.value as 'ALL' | 'READY' | 'GAPS_OR_STALE' | 'MISSING')}
                  className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-xs text-[var(--text-strong)] focus:outline-none focus:border-[var(--accent)]"
                >
                  <option value="ALL">{t('fr.dh.fAll')}</option>
                  <option value="READY">{t('fr.dh.fReady')}</option>
                  <option value="GAPS_OR_STALE">{t('fr.dh.fGaps')}</option>
                  <option value="MISSING">{t('fr.dh.fMissing')}</option>
                </select>
              </div>
            </div>

            {!dataHealthReport ? (
              <div className="p-6 text-xs text-[var(--text)]/60">
                {t('fr.dh.loadingReport')}
              </div>
            ) : (
              <div className="overflow-x-auto" tabIndex={0}>
                <table className="w-full text-left border-collapse min-w-[980px]">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]/50 text-[11px] text-[var(--text)]/65">
                      <th className="py-2.5 px-4 font-medium">{t('fr.dh.colName')}</th>
                      <th className="py-2.5 px-3 font-medium">{t('fr.dh.colExchange')}</th>
                      <th className="py-2.5 px-3 font-medium">{t('fr.dh.colPrice')}</th>
                      <th className="py-2.5 px-3 font-medium text-right">{t('fr.dh.colBars')}</th>
                      <th className="py-2.5 px-3 font-medium text-right">{t('fr.dh.colSpan')}</th>
                      <th className="py-2.5 px-3 font-medium text-right">{t('fr.dh.colGaps')}</th>
                      <th className="py-2.5 px-3 font-medium">{t('fr.dh.colCot')}</th>
                      <th className="py-2.5 px-3 font-medium">{t('fr.dh.colScore')}</th>
                      <th className="py-2.5 px-4 font-medium text-right">{t('fr.dh.colAction')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]/70 text-xs">
                    {filteredCommodities.map((row) => (
                      <tr key={row.instrumentId} className="hover:bg-[var(--surface-2)]/40 transition-colors">
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold text-[var(--text-strong)]">{row.symbol}</span>
                            <span className="text-[var(--text)]/85">{row.vietnameseName}</span>
                          </div>
                          <div className="text-[11px] text-[var(--text)]/45">
                            {row.quotationUnit}{row.isMvxListed ? ` · ${t('fr.dh.mxvLinked')}` : ''}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[var(--text)]/80">{row.exchange}</td>
                        <td className="py-2.5 px-3">
                          <DataStatusBadge status={row.quoteStatus} compact />
                          {row.quotePrice !== null && (
                            <div className="text-[11px] text-[var(--text-strong)] tabular-nums mt-0.5">
                              {fmtPrice(row.quotePrice)}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[var(--text)]">
                          {row.dailyBars} / {row.weeklyBars} / {row.monthlyBars}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          <div className="text-[var(--text-strong)]">{t('fr.dh.years', { n: fmtNum(row.spanYears, { maximumFractionDigits: 1 }) })}</div>
                          <div className="text-[11px] text-[var(--text)]/55">
                            {row.coverage5Y}% · {row.coverage10Y}%
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          <span className={row.missingGapCount > 0 ? 'text-[var(--warning)]' : 'text-[var(--text)]/65'}>
                            {row.missingGapCount}
                          </span>
                          <span className="text-[var(--text)]/40"> / </span>
                          <span className={row.duplicateCount > 0 ? 'text-[var(--warning)]' : 'text-[var(--text)]/65'}>
                            {row.duplicateCount}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] tabular-nums">
                          <div
                            className={
                              row.cotStatus === 'SYNCED'
                                ? 'text-[var(--positive)]'
                                : row.cotStatus === 'NOT_REPORTED'
                                  ? 'text-[var(--text)]/45'
                                  : 'text-[var(--warning)]'
                            }
                          >
                            {row.cotStatus === 'NOT_REPORTED' ? t('fr.dh.cotNa') : t('fr.dh.cotWeeks', { n: row.cotWeeks })}
                          </div>
                          <div className="text-[var(--text)]/55">{t('fr.dh.fund', { n: row.fundamentalCount })}</div>
                        </td>
                        <td className="py-2.5 px-3 min-w-[115px]">
                          <div className="flex items-center justify-between font-mono text-xs tabular-nums">
                            <span className={scoreColor(row.dataQualityScore)}>{row.dataQualityScore}</span>
                            <span className="text-[10px] text-[var(--text)]/45">/100</span>
                          </div>
                          <div className="h-1 bg-[var(--bg)] rounded-full overflow-hidden mt-1">
                            <div
                              className={`h-full ${scoreBarColor(row.dataQualityScore)}`}
                              style={{ width: `${row.dataQualityScore}%` }}
                            />
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => openInstrumentIn(row.symbol, 'commodity-profile')}
                            className="px-2.5 py-1 bg-[var(--surface-2)] hover:bg-[var(--accent)] border border-[var(--border)] rounded text-[11px] font-medium text-[var(--text-strong)] hover:text-[var(--on-accent)] transition-colors whitespace-nowrap"
                          >
                            {t('fr.dh.profile')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Engine Connection Readiness (Task 6) */}
          {dataHealthReport && (
            <section
              aria-label={t('fr.dh.engTitle')}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-[var(--border)]">
                <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('fr.dh.engTitle')}</h2>
                <p className="text-xs text-[var(--text)]/55 mt-0.5">{t('fr.dh.engSub')}</p>
              </div>
              <div className="divide-y divide-[var(--border)]/70">
                {dataHealthReport.engineReadiness.map((eng) => (
                  <div
                    key={eng.id}
                    className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[var(--text-strong)]">{eng.name}</span>
                        {eng.formulaPreserved && (
                          <span className="text-[10px] text-[var(--positive)]">· {t('fr.dh.formulaLocked')}</span>
                        )}
                      </div>
                      <p className="text-[var(--text)]/60">{eng.notes}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 tabular-nums">
                      <span className="text-[var(--text)]/75">
                        {t('fr.dh.engCount', { n: eng.readyInstruments, total: eng.totalInstruments })}
                      </span>
                      <span
                        className={
                          eng.status === 'READY'
                            ? 'text-[var(--positive)]'
                            : eng.status === 'PARTIAL'
                              ? 'text-[var(--warning)]'
                              : 'text-[var(--text)]/50'
                        }
                      >
                        {label('fr.dh.eng.', eng.status)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* TAB 2: Exchange Adapters, Licensing & API Keys */}
      {activeTab === 'PROVIDERS' && (
        <div className="space-y-6">
          {/* Exchange Licensing Matrix (Task 3) */}
          {dataHealthReport && (
            <section
              aria-label={t('fr.dh.exTitle')}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-[var(--border)]">
                <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('fr.dh.exTitle')}</h2>
                <p className="text-xs text-[var(--text)]/55 mt-0.5">{t('fr.dh.exSub')}</p>
              </div>
              <div className="divide-y divide-[var(--border)]/70">
                {dataHealthReport.exchangeAdapters.map((ex) => (
                  <div key={ex.id} className="p-4 space-y-2 text-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-[var(--text-strong)]">{ex.exchangeGroup}</h3>
                        <p className="font-mono text-[11px] text-[var(--accent)] mt-0.5">{ex.primaryOfficialFeed}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-[11px] shrink-0">
                        <span className={ex.requiresPaidLicense ? 'text-[var(--warning)]' : 'text-[var(--positive)]'}>
                          {label('fr.dh.tier.', ex.accessTier)}
                        </span>
                        <span className="text-[var(--text)]/60">
                          {ex.publicApiAvailable ? t('fr.dh.publicApi') : t('fr.dh.keyOrCsv')}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] text-[var(--text)]/75 pt-1">
                      <div>
                        <span className="text-[var(--text)]/50 font-medium">{t('fr.dh.freeSources')}</span>
                        {ex.supportedFreeSources.join(' · ')}
                      </div>
                      <div>
                        <span className="text-[var(--text)]/50 font-medium">{t('fr.dh.rollPolicy')}</span>
                        {ex.contractRollPolicy}
                      </div>
                    </div>
                    <p className="text-[11px] text-[var(--text)]/55">
                      <span className="text-[var(--text)]/45 font-medium">{t('fr.dh.limits')}</span>
                      {ex.rateLimitNote} {ex.legalAndComplianceNote}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Provider Adapters Live Status Table */}
          <section
            aria-label={t('fr.dh.provTitle')}
            className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-[var(--border)]">
              <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('fr.dh.provTitle')}</h2>
              <p className="text-xs text-[var(--text)]/55 mt-0.5">{t('fr.dh.provSub')}</p>
            </div>

            <div className="overflow-x-auto" tabIndex={0}>
              <table className="w-full text-left border-collapse min-w-[820px]">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]/50 text-xs text-[var(--text)]/65">
                    <th className="py-3 px-4 font-medium">{t('fr.dh.colProvider')}</th>
                    <th className="py-3 px-3 font-medium">{t('fr.dh.colExchange')}</th>
                    <th className="py-3 px-3 font-medium">{t('fr.dh.colStatus')}</th>
                    <th className="py-3 px-3 font-medium">{t('fr.dh.colKey')}</th>
                    <th className="py-3 px-3 font-medium">{t('fr.dh.colCaps')}</th>
                    <th className="py-3 px-3 font-medium">{t('fr.dh.colChecked')}</th>
                    <th className="py-3 px-4 font-medium">{t('fr.dh.colDetail')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]/70 text-xs">
                  {providers.map((p) => (
                    <tr key={p.providerId} className="hover:bg-[var(--surface-2)]/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-medium text-[var(--text-strong)]">{p.name}</div>
                        <div className="font-mono text-[11px] text-[var(--text)]/45">{p.providerId}</div>
                      </td>
                      <td className="py-3 px-3 font-mono text-[var(--text)]/85">
                        {p.exchanges.join(', ')}
                      </td>
                      <td className="py-3 px-3">
                        <DataStatusBadge status={p.dataStatus} compact sourceQuality={p.sourceQuality} />
                        {p.delayNote && (
                          <div className="text-[10px] text-[var(--text)]/50 mt-0.5">{p.delayNote}</div>
                        )}
                      </td>
                      <td className={`py-3 px-3 ${p.credentialsConfigured ? 'text-[var(--positive)]' : 'text-[var(--text)]/50'}`}>
                        {p.credentialsConfigured ? t('fr.dh.keySet') : t('fr.dh.keyNotSet')}
                      </td>
                      <td className="py-3 px-3 text-[var(--text)]/70">
                        {[p.supportsRealtime ? t('fr.dh.capRt') : null, p.supportsHistorical ? t('fr.dh.capHist') : null]
                          .filter(Boolean)
                          .join(' / ')}
                      </td>
                      <td className="py-3 px-3 tabular-nums text-[var(--text)]/65 whitespace-nowrap">
                        {formatTimestampInZone(p.lastCheckedAt, 'Asia/Ho_Chi_Minh')}
                      </td>
                      <td className="py-3 px-4 text-[var(--text)]/70 max-w-md">{p.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Server Secrets Reference */}
          <section
            aria-label={t('fr.dh.secTitle')}
            className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-[var(--border)]">
              <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('fr.dh.secTitle')}</h2>
              <p className="text-xs text-[var(--text)]/60 mt-0.5">{t('fr.dh.envHint')}</p>
            </div>

            <div className="overflow-x-auto" tabIndex={0}>
              <table className="w-full text-left border-collapse min-w-[860px]">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]/50 text-xs text-[var(--text)]/65">
                    <th className="py-2.5 px-4 font-medium">{t('fr.dh.colProvider')}</th>
                    <th className="py-2.5 px-3 font-medium">{t('fr.dh.colEnv')}</th>
                    <th className="py-2.5 px-3 font-medium">{t('fr.dh.colTier')}</th>
                    <th className="py-2.5 px-3 font-medium">{t('fr.dh.colCoverage')}</th>
                    <th className="py-2.5 px-4 font-medium text-right">{t('fr.dh.colKey')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]/70 text-xs">
                  {SERVER_API_SECRETS.map((spec) => {
                    const liveState = providers.find((p) => p.providerId === spec.providerId);
                    return (
                      <tr key={spec.secretName} className="hover:bg-[var(--surface-2)]/40">
                        <td className="py-2.5 px-4">
                          <div className="font-medium text-[var(--text-strong)]">{spec.provider}</div>
                          <div className="text-[11px] font-mono text-[var(--text)]/45">{spec.officialDoc}</div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[var(--accent)]">{spec.secretName}</td>
                        <td className="py-2.5 px-3 text-[var(--text)]/75">{spec.latencyAndTier}</td>
                        <td className="py-2.5 px-3 text-[var(--text)]/75">{spec.commodityCoverage}</td>
                        <td className="py-2.5 px-4 text-right">
                          <span
                            className={
                              liveState?.credentialsConfigured ? 'text-[var(--positive)]' : 'text-[var(--text)]/50'
                            }
                          >
                            {liveState?.credentialsConfigured ? t('fr.dh.keySet') : t('fr.dh.keyNotSet')}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* TAB 3: 8 Fundamental Datasets & CFTC COT */}
      {activeTab === 'FUNDAMENTALS' && (
        <div className="space-y-6">
          {dataHealthReport && (
            <section
              aria-label={t('fr.dh.fundTitle')}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-[var(--border)]">
                <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('fr.dh.fundTitle')}</h2>
                <p className="text-xs text-[var(--text)]/55 mt-0.5">{t('fr.dh.fundSub')}</p>
              </div>
              <div className="overflow-x-auto" tabIndex={0}>
                <table className="w-full text-left border-collapse min-w-[880px]">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]/50 text-xs text-[var(--text)]/65">
                      <th className="py-2.5 px-4 font-medium">{t('fr.dh.colDomain')}</th>
                      <th className="py-2.5 px-3 font-medium">{t('fr.dh.colSource')}</th>
                      <th className="py-2.5 px-3 font-medium">{t('fr.dh.colDates')}</th>
                      <th className="py-2.5 px-3 font-medium">{t('fr.dh.colUnit')}</th>
                      <th className="py-2.5 px-3 font-medium">{t('fr.dh.colFresh')}</th>
                      <th className="py-2.5 px-4 font-medium">{t('fr.dh.colNotes')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]/70 text-xs">
                    {dataHealthReport.fundamentalDomains.map((dom) => (
                      <tr key={dom.id} className="hover:bg-[var(--surface-2)]/40">
                        <td className="py-3 px-4">
                          <div className="font-medium text-[var(--text-strong)]">{dom.nameVi}</div>
                          <div className="text-[11px] font-mono text-[var(--text)]/45">{dom.id}</div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="text-[var(--text)]/85">{dom.primarySource}</div>
                          <div className="text-[11px] text-[var(--text)]/50">
                            {dom.cadence} · {t('fr.dh.lag', { n: dom.expectedReleaseLagDays })}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-[11px] tabular-nums text-[var(--text)]/80">
                          <div>{t('fr.dh.obs', { d: dom.latestObservationDate ?? '—' })}</div>
                          <div className="text-[var(--text)]/50">{t('fr.dh.pub', { d: dom.latestPublicationDate ?? '—' })}</div>
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px] text-[var(--text)]/75">
                          {dom.unit ?? '—'}
                        </td>
                        <td className="py-3 px-3">
                          <DataStatusBadge status={dom.status} compact />
                        </td>
                        <td className="py-3 px-4 text-[var(--text)]/70 max-w-sm">
                          {dom.notes}
                          {dom.envVarHint && dom.status === 'UNAVAILABLE' && (
                            <span className="text-[var(--accent-text)] block mt-0.5">{t('fr.dh.envVar', { v: dom.envVarHint })}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <CotHealthSection />
        </div>
      )}

      {/* TAB 4: CSV Import & Continuous vs Contract Separation */}
      {activeTab === 'CSV_SERIES' && (
        <div className="space-y-6">
          <CsvImportPanel />

          <section
            aria-label={t('fr.dh.dsTitle')}
            className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('fr.dh.dsTitle')}</h2>
                <p className="text-xs text-[var(--text)]/55 mt-0.5">{t('fr.dh.dsSub')}</p>
              </div>
              <span className="text-xs text-[var(--text)]/65 tabular-nums whitespace-nowrap">
                {t('fr.dh.dsCount', { n: datasets.length })}
              </span>
            </div>

            {datasets.length === 0 ? (
              <div className="p-6 text-xs text-[var(--text)]/60">
                {t('fr.dh.dsEmpty')}
              </div>
            ) : (
              <div className="overflow-x-auto" tabIndex={0}>
                <table className="w-full text-left border-collapse min-w-[760px]">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]/50 text-xs text-[var(--text)]/65">
                      <th className="py-2.5 px-4 font-medium">{t('fr.dh.colSymbol')}</th>
                      <th className="py-2.5 px-3 font-medium">{t('fr.dh.colExchange')}</th>
                      <th className="py-2.5 px-3 font-medium">{t('fr.dh.colTf')}</th>
                      <th className="py-2.5 px-3 font-medium text-right">{t('fr.dh.colBarCount')}</th>
                      <th className="py-2.5 px-3 font-medium">{t('fr.dh.colRange')}</th>
                      <th className="py-2.5 px-3 font-medium">{t('fr.dh.colProvider')}</th>
                      <th className="py-2.5 px-3 font-medium">{t('fr.dh.colStatus')}</th>
                      <th className="py-2.5 px-4 font-medium text-right">{t('fr.dh.colAction')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]/70 text-xs">
                    {datasets.map((ds) => (
                      <tr key={`${ds.symbol}-${ds.timeframe}`} className="hover:bg-[var(--surface-2)]/40">
                        <td className="py-2.5 px-4 font-mono text-[var(--text-strong)]">{ds.symbol}</td>
                        <td className="py-2.5 px-3 font-mono text-[var(--text)]/85">{ds.exchange}</td>
                        <td className="py-2.5 px-3 font-mono text-[var(--text)]">{ds.timeframe}</td>
                        <td className="py-2.5 px-3 font-mono text-right tabular-nums text-[var(--text-strong)]">
                          {fmtNum(ds.barCount)}
                        </td>
                        <td className="py-2.5 px-3 font-mono tabular-nums text-[var(--text)]/65">
                          {formatTimestampInZone(ds.earliestTimestamp, 'Asia/Ho_Chi_Minh')} →{' '}
                          {formatTimestampInZone(ds.latestTimestamp, 'Asia/Ho_Chi_Minh')}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[var(--text)]/70">{ds.source}</td>
                        <td className="py-2.5 px-3">
                          <DataStatusBadge status={ds.status} compact />
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => openInstrumentIn(ds.symbol, 'charts')}
                            className="px-2.5 py-1 bg-[var(--surface-2)] hover:bg-[var(--accent)] border border-[var(--border)] rounded text-[11px] font-medium text-[var(--text-strong)] hover:text-[var(--on-accent)] transition-colors"
                          >
                            {t('fr.dh.openChart')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {dataHealthReport && (
            <section
              aria-label={t('fr.dh.rollTitle')}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-[var(--border)]">
                <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('fr.dh.rollTitle')}</h2>
                <p className="text-xs text-[var(--text)]/55 mt-0.5">{t('fr.dh.rollSub')}</p>
              </div>
              <div className="divide-y divide-[var(--border)]/70">
                {dataHealthReport.commodities
                  .filter(
                    (c) =>
                      c.individualContracts.length > 0 ||
                      c.continuousAdjustments.length > 0 ||
                      c.vendorProxyCount > 0 ||
                      c.rollNotice !== null
                  )
                  .map((c) => (
                    <div key={c.instrumentId} className="px-4 py-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <span className="font-mono font-semibold text-[var(--text-strong)]">{c.symbol}</span>
                        <span className="text-[var(--text)]/70 ml-2">{c.rollNotice ?? t('fr.dh.rollOk')}</span>
                      </div>
                      <div className="text-[11px] text-[var(--text)]/60 shrink-0">
                        {t('fr.dh.rollCounts', {
                          a: c.individualContracts.length,
                          b: c.continuousAdjustments.join(', ') || t('fr.dh.none'),
                          c: c.vendorProxyCount,
                        })}
                      </div>
                    </div>
                  ))}
                {dataHealthReport.commodities.every(
                  (c) => c.individualContracts.length === 0 && c.continuousAdjustments.length === 0 && c.vendorProxyCount === 0
                ) && (
                  <div className="p-5 text-xs text-[var(--text)]/55">
                    {t('fr.dh.rollEmpty')}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
