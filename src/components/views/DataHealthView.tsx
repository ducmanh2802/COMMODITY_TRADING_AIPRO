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
import { CotHealthSection } from './cot/CotHealthSection';

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
    provider: 'FRED Economic Data (Macro Cycle)',
    secretName: 'FRED_API_KEY (hoặc Public CSV 0-key)',
    latencyAndTier: 'Official Fed St. Louis (Public CSV 0-key hoặc JSON API 120 req/min)',
    commodityCoverage: 'DXY Broad Dollar (DTWEXBGS), Fed Funds (FEDFUNDS), US 10Y Yield (DGS10), CPI (CPIAUCSL)',
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
    commodityCoverage: 'ZC ZS ZM ZL ZW ZR KC SB CC HG GC SI PL CL NG (không hỗ trợ RC, BRN, TIO, JRU, CT)',
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
    score >= 75 ? 'text-[#22C55E]' : score >= 45 ? 'text-[#F59E0B]' : 'text-[#EF4444]';

  const scoreBarColor = (score: number) =>
    score >= 75 ? 'bg-[#22C55E]' : score >= 45 ? 'bg-[#F59E0B]' : 'bg-[#EF4444]';

  return (
    <div className="space-y-6">
      {/* Header & Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight">
            Data Health Monitor &amp; Intelligence
          </h1>
          <p className="text-sm text-[#E5E7EB]/65 mt-1">
            Giám sát độ phủ dữ liệu 20 hàng hóa (D1/W1/Monthly · 5Y–10Y), nguồn sàn MXV/CME/ICE/COMEX/NYMEX, COT &amp; Fundamental Engine.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start">
          <label className="inline-flex items-center gap-1.5 bg-[#111622] border border-[#263244] rounded-md px-2.5 py-1.5 text-xs text-[#E5E7EB]/80">
            <span>Lịch sử Yahoo</span>
            <select
              aria-label="Historical Range"
              value={historicalRange}
              onChange={(e) => setHistoricalRange(e.target.value as '2y' | '5y' | '10y')}
              className="bg-transparent font-mono text-white focus:outline-none"
            >
              <option value="2y" className="bg-[#111622]">2Y</option>
              <option value="5y" className="bg-[#111622]">5Y</option>
              <option value="10y" className="bg-[#111622]">10Y</option>
            </select>
          </label>

          <button
            type="button"
            onClick={() => void syncProviderFeeds({ timeframe, historicalRange, includePublicMacro: true })}
            disabled={syncing || loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#6366F1] hover:bg-[#6366F1]/90 rounded-md text-xs font-medium text-white disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <CloudDownload className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{syncing ? 'Đang đồng bộ...' : 'Sync Feeds & Public Macro'}</span>
          </button>

          <button
            type="button"
            onClick={() => void refreshBackendData()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#172033] hover:bg-[#172033]/80 border border-[#263244] rounded-md text-xs font-medium text-white disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>Run Health Check</span>
          </button>
        </div>
      </div>

      {/* Sync Summary Banner */}
      {lastSyncSummary && (
        <section
          aria-label="Latest Sync Result"
          className="bg-[#111622] border border-[#6366F1]/40 rounded-lg p-4 space-y-3"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <p className="text-xs font-semibold text-white font-mono">
              Sync Completed ({formatTimestampInZone(lastSyncSummary.syncedAt, 'Asia/Ho_Chi_Minh')} ICT)
            </p>
            <span className="text-xs font-mono text-[#22C55E] tabular-nums">
              +{lastSyncSummary.totalCandlesDatasetsAdded} OHLCV series · +{lastSyncSummary.totalMacroAdded} Macro records
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
            {lastSyncSummary.outcomes.map((o) => (
              <div key={o.providerId} className="bg-[#0B0E14] border border-[#263244] rounded p-2.5 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-white truncate">{o.providerName}</span>
                  <span
                    className={`font-mono text-[11px] shrink-0 ${
                      o.status === 'CONNECTED'
                        ? 'text-[#22C55E]'
                        : o.status === 'UNCONFIGURED'
                          ? 'text-[#E5E7EB]/50'
                          : 'text-[#F59E0B]'
                    }`}
                  >
                    {o.status}
                  </span>
                </div>
                <p className="text-[11px] text-[#E5E7EB]/70">{o.message}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Top KPI Strip */}
      <section aria-label="Data Quality KPI Overview" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-[#E5E7EB]/60">
            <span>Data Quality Score</span>
            <ShieldCheck className="w-4 h-4 text-[#6366F1]" aria-hidden="true" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className={`text-2xl font-mono font-semibold tabular-nums ${scoreColor(dataHealthReport?.overallQualityScore ?? 0)}`}>
              {dataHealthReport ? `${dataHealthReport.overallQualityScore}/100` : '—'}
            </span>
            {dataHealthReport && <DataStatusBadge status={dataHealthReport.overallStatus} compact />}
          </div>
          <div className="h-1.5 bg-[#0B0E14] rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${scoreBarColor(dataHealthReport?.overallQualityScore ?? 0)}`}
              style={{ width: `${dataHealthReport?.overallQualityScore ?? 0}%` }}
            />
          </div>
        </div>

        <div className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-[#E5E7EB]/60">
            <span>Historical &amp; Price Coverage</span>
            <Database className="w-4 h-4 text-[#6366F1]" aria-hidden="true" />
          </div>
          <p className="text-2xl font-mono font-semibold text-white tabular-nums">
            {dataHealthReport
              ? `${dataHealthReport.coverageSummary.withDailyHistory}/${dataHealthReport.coverageSummary.totalCommodities}`
              : '—'}
          </p>
          <p className="text-xs font-mono text-[#E5E7EB]/55 tabular-nums">
            {dataHealthReport
              ? `5Y: ${dataHealthReport.coverageSummary.with5YHistory} · 10Y: ${dataHealthReport.coverageSummary.with10YHistory} · COT: ${dataHealthReport.coverageSummary.withCotHistory}`
              : 'Loading coverage metrics...'}
          </p>
        </div>

        <div className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-[#E5E7EB]/60">
            <span>Status Taxonomy</span>
            <Activity className="w-4 h-4 text-[#6366F1]" aria-hidden="true" />
          </div>
          <div className="grid grid-cols-3 gap-x-2 gap-y-1 text-[11px] font-mono tabular-nums pt-0.5">
            <span className="text-[#22C55E]">RT: {dataHealthReport?.statusBreakdown.current ?? 0}</span>
            <span className="text-[#F59E0B]">DLY: {dataHealthReport?.statusBreakdown.delayed ?? 0}</span>
            <span className="text-[#6366F1]">HIST: {dataHealthReport?.statusBreakdown.historical ?? 0}</span>
            <span className="text-[#F59E0B]">STALE: {dataHealthReport?.statusBreakdown.stale ?? 0}</span>
            <span className="text-[#E5E7EB]/65">N/A: {dataHealthReport?.statusBreakdown.unavailable ?? 0}</span>
            <span className="text-[#EF4444]">INV: {dataHealthReport?.statusBreakdown.invalid ?? 0}</span>
          </div>
          <p className="text-[11px] font-mono text-[#E5E7EB]/50 tabular-nums">
            Gaps: {dataHealthReport?.coverageSummary.totalMissingGaps ?? 0} · Stale series: {dataHealthReport?.coverageSummary.totalStaleSeries ?? 0}
          </p>
        </div>

        <div className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-[#E5E7EB]/60">
            <span>Providers &amp; Runtime</span>
            <CheckCircle2 className="w-4 h-4 text-[#6366F1]" aria-hidden="true" />
          </div>
          <p className="text-lg font-mono font-semibold text-white tabular-nums">
            {dataHealthReport
              ? `${dataHealthReport.providerSummary.connected}/${dataHealthReport.providerSummary.total} Connected`
              : health?.status ?? 'CHECKING'}
          </p>
          <p className="text-[11px] font-mono text-[#E5E7EB]/55 truncate">
            Gemini: {health?.capabilities.geminiServerKeyConfigured ? 'KEY PRESENT' : 'NOT SET'} · DB: {firestoreStatus}
          </p>
          <p className="text-[11px] font-mono text-[#E5E7EB]/45 truncate">
            Updated: {dataHealthReport?.providerSummary.lastSuccessfulUpdate
              ? `${formatTimestampInZone(dataHealthReport.providerSummary.lastSuccessfulUpdate, 'Asia/Ho_Chi_Minh')} ICT`
              : 'Chưa đồng bộ'}
          </p>
        </div>
      </section>

      {/* Navigation Tabs */}
      <div
        role="tablist"
        aria-label="Data Health Sections"
        className="flex flex-wrap items-center gap-1 border-b border-[#263244] pb-2"
      >
        {(
          [
            { id: 'COVERAGE', label: 'Coverage 20 Hàng hóa', icon: Layers },
            { id: 'PROVIDERS', label: 'Sàn & Provider Adapters', icon: KeyRound },
            { id: 'FUNDAMENTALS', label: 'Fundamental Engine (8) & COT', icon: Activity },
            { id: 'CSV_SERIES', label: 'Import CSV & Chuỗi Rollover', icon: FileSpreadsheet },
          ] as const
        ).map(({ id, label, icon: Icon }) => {
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
                  ? 'bg-[#6366F1] text-white'
                  : 'bg-[#111622] text-[#E5E7EB]/70 hover:text-white border border-[#263244]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: 20-Commodity Historical & Quality Coverage Matrix */}
      {activeTab === 'COVERAGE' && (
        <div className="space-y-6">
          <section
            aria-label="20-Commodity Historical Coverage Matrix"
            className="bg-[#111622] border border-[#263244] rounded-lg overflow-hidden"
          >
            <div className="p-4 border-b border-[#263244] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Độ phủ Dữ liệu Lịch sử &amp; Chỉ số Chất lượng theo Từng Hàng hóa ({filteredCommodities.length}/20)
                </h2>
                <p className="text-xs text-[#E5E7EB]/55 mt-0.5">
                  Kiểm tra nến D1 / W1 / Monthly (MN), độ dài lịch sử 5Y–10Y, nến thiếu (gaps), trùng lặp (dups), COT &amp; điểm chất lượng 0–100.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#E5E7EB]/45 absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                  <input
                    type="text"
                    value={coverageSearch}
                    onChange={(e) => setCoverageSearch(e.target.value)}
                    placeholder="Tìm mã hoặc tên hàng..."
                    aria-label="Search commodity coverage"
                    className="bg-[#0B0E14] border border-[#263244] rounded-md pl-8 pr-3 py-1.5 text-xs text-white placeholder-[#E5E7EB]/40 focus:outline-none focus:border-[#6366F1]"
                  />
                </div>

                <select
                  aria-label="Filter by Exchange"
                  value={exchangeFilter}
                  onChange={(e) => setExchangeFilter(e.target.value)}
                  className="bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#6366F1]"
                >
                  <option value="ALL">Tất cả Sàn (20)</option>
                  <option value="MXV">Liên thông MXV</option>
                  <option value="CBOT">CBOT</option>
                  <option value="ICE">ICE</option>
                  <option value="COMEX">COMEX</option>
                  <option value="NYMEX">NYMEX</option>
                </select>

                <select
                  aria-label="Filter by Readiness"
                  value={coverageFilter}
                  onChange={(e) => setCoverageFilter(e.target.value as 'ALL' | 'READY' | 'GAPS_OR_STALE' | 'MISSING')}
                  className="bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#6366F1]"
                >
                  <option value="ALL">Mọi trạng thái</option>
                  <option value="READY">Có dữ liệu (&gt;=30 D1)</option>
                  <option value="GAPS_OR_STALE">Có Gaps / Stale</option>
                  <option value="MISSING">Thiếu OHLCV</option>
                </select>
              </div>
            </div>

            {!dataHealthReport ? (
              <div className="p-6 text-xs font-mono text-[#E5E7EB]/60">
                Đang tải báo cáo Data Health Monitor...
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[980px]">
                  <thead>
                    <tr className="border-b border-[#263244] bg-[#172033]/50 text-[11px] text-[#E5E7EB]/65">
                      <th className="py-2.5 px-4 font-medium">Mã / Hàng hóa</th>
                      <th className="py-2.5 px-3 font-medium">Sàn</th>
                      <th className="py-2.5 px-3 font-medium">Giá / Quote</th>
                      <th className="py-2.5 px-3 font-medium text-right">D1 / W1 / MN</th>
                      <th className="py-2.5 px-3 font-medium text-right">Span (5Y / 10Y)</th>
                      <th className="py-2.5 px-3 font-medium text-right">Gaps / Dups</th>
                      <th className="py-2.5 px-3 font-medium">COT / Fund</th>
                      <th className="py-2.5 px-3 font-medium">Quality Score</th>
                      <th className="py-2.5 px-4 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#263244]/70 text-xs">
                    {filteredCommodities.map((row) => (
                      <tr key={row.instrumentId} className="hover:bg-[#172033]/40 transition-colors">
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold text-white">{row.symbol}</span>
                            <span className="text-[#E5E7EB]/85">{row.vietnameseName}</span>
                          </div>
                          <div className="text-[11px] font-mono text-[#E5E7EB]/45">
                            {row.quotationUnit}{row.isMvxListed ? ' · MXV Linked' : ''}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[#E5E7EB]/80">{row.exchange}</td>
                        <td className="py-2.5 px-3">
                          <DataStatusBadge status={row.quoteStatus} compact />
                          {row.quotePrice !== null && (
                            <div className="font-mono text-[11px] text-white tabular-nums mt-0.5">
                              {row.quotePrice.toLocaleString()}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#E5E7EB]">
                          {row.dailyBars} / {row.weeklyBars} / {row.monthlyBars}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          <div className="text-white">{row.spanYears}y</div>
                          <div className="text-[11px] text-[#E5E7EB]/55">
                            {row.coverage5Y}% · {row.coverage10Y}%
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          <span className={row.missingGapCount > 0 ? 'text-[#F59E0B]' : 'text-[#E5E7EB]/65'}>
                            {row.missingGapCount}
                          </span>
                          <span className="text-[#E5E7EB]/40"> / </span>
                          <span className={row.duplicateCount > 0 ? 'text-[#F59E0B]' : 'text-[#E5E7EB]/65'}>
                            {row.duplicateCount}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] tabular-nums">
                          <div
                            className={
                              row.cotStatus === 'SYNCED'
                                ? 'text-[#22C55E]'
                                : row.cotStatus === 'NOT_REPORTED'
                                  ? 'text-[#E5E7EB]/45'
                                  : 'text-[#F59E0B]'
                            }
                          >
                            COT: {row.cotStatus === 'NOT_REPORTED' ? 'N/A' : `${row.cotWeeks}w`}
                          </div>
                          <div className="text-[#E5E7EB]/55">Fund: {row.fundamentalCount} rec</div>
                        </td>
                        <td className="py-2.5 px-3 min-w-[115px]">
                          <div className="flex items-center justify-between font-mono text-xs tabular-nums">
                            <span className={scoreColor(row.dataQualityScore)}>{row.dataQualityScore}</span>
                            <span className="text-[10px] text-[#E5E7EB]/45">/100</span>
                          </div>
                          <div className="h-1 bg-[#0B0E14] rounded-full overflow-hidden mt-1">
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
                            className="px-2.5 py-1 bg-[#172033] hover:bg-[#6366F1] border border-[#263244] rounded text-[11px] font-medium text-white transition-colors whitespace-nowrap"
                          >
                            Profile
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
              aria-label="Analysis Engines Data Readiness"
              className="bg-[#111622] border border-[#263244] rounded-lg overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-[#263244]">
                <h2 className="text-sm font-semibold text-white">
                  Trạng thái Kết nối Dữ liệu vào Các Engine Phân tích
                </h2>
                <p className="text-xs text-[#E5E7EB]/55 mt-0.5">
                  Cycle Engine, Bottom Detection Engine (giữ nguyên thang 100đ), Opportunity Radar, Scanner &amp; AI Research Report chỉ đọc dữ liệu đã xác thực.
                </p>
              </div>
              <div className="divide-y divide-[#263244]/70">
                {dataHealthReport.engineReadiness.map((eng) => (
                  <div
                    key={eng.id}
                    className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{eng.name}</span>
                        {eng.formulaPreserved && (
                          <span className="font-mono text-[10px] text-[#22C55E]">· 100pt formula locked</span>
                        )}
                      </div>
                      <p className="text-[#E5E7EB]/60">{eng.notes}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 font-mono tabular-nums">
                      <span className="text-[#E5E7EB]/75">
                        {eng.readyInstruments}/{eng.totalInstruments} mã
                      </span>
                      <span
                        className={
                          eng.status === 'READY'
                            ? 'text-[#22C55E]'
                            : eng.status === 'PARTIAL'
                              ? 'text-[#F59E0B]'
                              : 'text-[#E5E7EB]/50'
                        }
                      >
                        {eng.status}
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
              aria-label="Exchange Licensing & Access Assessment"
              className="bg-[#111622] border border-[#263244] rounded-lg overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-[#263244]">
                <h2 className="text-sm font-semibold text-white">
                  Đánh giá Khả năng Truy cập &amp; Bản quyền theo Sàn (MXV · CME/CBOT · ICE · COMEX · NYMEX)
                </h2>
                <p className="text-xs text-[#E5E7EB]/55 mt-0.5">
                  Không scrape trái phép hoặc giả lập giá; hiển thị rõ nguồn miễn phí chính thống vs yêu cầu bản quyền và cơ chế fallback CSV.
                </p>
              </div>
              <div className="divide-y divide-[#263244]/70">
                {dataHealthReport.exchangeAdapters.map((ex) => (
                  <div key={ex.id} className="p-4 space-y-2 text-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-white">{ex.exchangeGroup}</h3>
                        <p className="font-mono text-[11px] text-[#6366F1] mt-0.5">{ex.primaryOfficialFeed}</p>
                      </div>
                      <div className="flex items-center gap-3 font-mono text-[11px] shrink-0">
                        <span className={ex.requiresPaidLicense ? 'text-[#F59E0B]' : 'text-[#22C55E]'}>
                          {ex.accessTier}
                        </span>
                        <span className="text-[#E5E7EB]/60">
                          {ex.publicApiAvailable ? 'Public API Available' : 'Key / CSV Fallback'}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] text-[#E5E7EB]/75 pt-1">
                      <div>
                        <span className="text-[#E5E7EB]/50 font-medium">Nguồn miễn phí / khả dụng: </span>
                        {ex.supportedFreeSources.join(' · ')}
                      </div>
                      <div>
                        <span className="text-[#E5E7EB]/50 font-medium">Chuẩn Rollover &amp; CSV: </span>
                        {ex.contractRollPolicy}
                      </div>
                    </div>
                    <p className="text-[11px] text-[#E5E7EB]/55">
                      <span className="text-[#E5E7EB]/45 font-medium">Giới hạn &amp; Tuân thủ: </span>
                      {ex.rateLimitNote} {ex.legalAndComplianceNote}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Provider Adapters Live Status Table */}
          <section
            aria-label="Market Data Provider Adapters"
            className="bg-[#111622] border border-[#263244] rounded-lg overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-[#263244]">
              <h2 className="text-sm font-semibold text-white">MarketDataProvider Runtime Adapters</h2>
              <p className="text-xs text-[#E5E7EB]/55 mt-0.5">
                Các adapter thiếu key sẽ fail-closed với DATA_UNAVAILABLE thay vì sinh dữ liệu giả.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[820px]">
                <thead>
                  <tr className="border-b border-[#263244] bg-[#172033]/50 text-xs text-[#E5E7EB]/65">
                    <th className="py-3 px-4 font-medium">Provider</th>
                    <th className="py-3 px-3 font-medium">Exchanges</th>
                    <th className="py-3 px-3 font-medium">Status</th>
                    <th className="py-3 px-3 font-medium">Credentials</th>
                    <th className="py-3 px-3 font-medium">Capabilities</th>
                    <th className="py-3 px-3 font-medium">Checked (ICT)</th>
                    <th className="py-3 px-4 font-medium">Diagnostic Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#263244]/70 text-xs">
                  {providers.map((p) => (
                    <tr key={p.providerId} className="hover:bg-[#172033]/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-medium text-white">{p.name}</div>
                        <div className="font-mono text-[11px] text-[#E5E7EB]/45">{p.providerId}</div>
                      </td>
                      <td className="py-3 px-3 font-mono text-[#E5E7EB]/85">
                        {p.exchanges.join(', ')}
                      </td>
                      <td className="py-3 px-3">
                        <DataStatusBadge status={p.dataStatus} compact sourceQuality={p.sourceQuality} />
                        {p.delayNote && (
                          <div className="font-mono text-[10px] text-[#E5E7EB]/50 mt-0.5">{p.delayNote}</div>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono text-[#E5E7EB]/75">
                        {p.credentialsConfigured ? 'CONFIGURED' : 'NOT_SET'}
                      </td>
                      <td className="py-3 px-3 font-mono text-[#E5E7EB]/70">
                        {[p.supportsRealtime ? 'RT' : null, p.supportsHistorical ? 'HIST' : null]
                          .filter(Boolean)
                          .join(' / ')}
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums text-[#E5E7EB]/65 whitespace-nowrap">
                        {formatTimestampInZone(p.lastCheckedAt, 'Asia/Ho_Chi_Minh')}
                      </td>
                      <td className="py-3 px-4 text-[#E5E7EB]/70 max-w-md">{p.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Server Secrets Reference */}
          <section
            aria-label="Server-Side Commodity API Secrets Guide"
            className="bg-[#111622] border border-[#263244] rounded-lg overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-[#263244]">
              <h2 className="text-sm font-semibold text-white">
                Server-Side Commodity API Secrets Reference
              </h2>
              <p className="text-xs text-[#E5E7EB]/60 mt-0.5">
                Cấu hình các biến môi trường trên server trong AI Studio <span className="font-mono text-white">Settings &gt; Secrets</span> (không bao giờ lộ ra trình duyệt).
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[860px]">
                <thead>
                  <tr className="border-b border-[#263244] bg-[#172033]/50 text-xs text-[#E5E7EB]/65">
                    <th className="py-2.5 px-4 font-medium">Provider</th>
                    <th className="py-2.5 px-3 font-medium">Server Env Secret</th>
                    <th className="py-2.5 px-3 font-medium">Latency &amp; Tier</th>
                    <th className="py-2.5 px-3 font-medium">Commodity Coverage</th>
                    <th className="py-2.5 px-4 font-medium text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#263244]/70 text-xs">
                  {SERVER_API_SECRETS.map((spec) => {
                    const liveState = providers.find((p) => p.providerId === spec.providerId);
                    return (
                      <tr key={spec.secretName} className="hover:bg-[#172033]/40">
                        <td className="py-2.5 px-4">
                          <div className="font-medium text-white">{spec.provider}</div>
                          <div className="text-[11px] font-mono text-[#E5E7EB]/45">{spec.officialDoc}</div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[#6366F1]">{spec.secretName}</td>
                        <td className="py-2.5 px-3 text-[#E5E7EB]/75">{spec.latencyAndTier}</td>
                        <td className="py-2.5 px-3 text-[#E5E7EB]/75">{spec.commodityCoverage}</td>
                        <td className="py-2.5 px-4 text-right font-mono">
                          <span
                            className={
                              liveState?.credentialsConfigured ? 'text-[#22C55E]' : 'text-[#E5E7EB]/50'
                            }
                          >
                            {liveState?.credentialsConfigured ? 'CONFIGURED' : 'NOT_SET'}
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
              aria-label="Fundamental Data Engine Status"
              className="bg-[#111622] border border-[#263244] rounded-lg overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-[#263244]">
                <h2 className="text-sm font-semibold text-white">
                  Fundamental Data Engine (8 Bộ Dữ liệu Cơ bản &amp; Chống Look-Ahead Bias)
                </h2>
                <p className="text-xs text-[#E5E7EB]/55 mt-0.5">
                  Mỗi bản ghi gắn chặt Source, Observation Date, Publication Date, Unit &amp; Freshness Status. Bộ lọc lịch sử <span className="font-mono text-white">asOf</span> chặn tuyệt đối dữ liệu công bố trong tương lai.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[880px]">
                  <thead>
                    <tr className="border-b border-[#263244] bg-[#172033]/50 text-xs text-[#E5E7EB]/65">
                      <th className="py-2.5 px-4 font-medium">Dataset Domain</th>
                      <th className="py-2.5 px-3 font-medium">Nguồn chính &amp; Chu kỳ</th>
                      <th className="py-2.5 px-3 font-medium">Obs Date / Pub Date</th>
                      <th className="py-2.5 px-3 font-medium">Unit</th>
                      <th className="py-2.5 px-3 font-medium">Freshness</th>
                      <th className="py-2.5 px-4 font-medium">Status &amp; Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#263244]/70 text-xs">
                    {dataHealthReport.fundamentalDomains.map((dom) => (
                      <tr key={dom.id} className="hover:bg-[#172033]/40">
                        <td className="py-3 px-4">
                          <div className="font-medium text-white">{dom.nameVi}</div>
                          <div className="text-[11px] font-mono text-[#E5E7EB]/45">{dom.id}</div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="text-[#E5E7EB]/85">{dom.primarySource}</div>
                          <div className="text-[11px] text-[#E5E7EB]/50">
                            {dom.cadence} · Lag ~{dom.expectedReleaseLagDays}d
                          </div>
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px] tabular-nums text-[#E5E7EB]/80">
                          <div>Obs: {dom.latestObservationDate ?? '—'}</div>
                          <div className="text-[#E5E7EB]/50">Pub: {dom.latestPublicationDate ?? '—'}</div>
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px] text-[#E5E7EB]/75">
                          {dom.unit ?? '—'}
                        </td>
                        <td className="py-3 px-3">
                          <DataStatusBadge status={dom.status} compact />
                        </td>
                        <td className="py-3 px-4 text-[#E5E7EB]/70 max-w-sm">
                          {dom.notes}
                          {dom.envVarHint && dom.status === 'UNAVAILABLE' && (
                            <span className="font-mono text-[#6366F1] block mt-0.5">Env: {dom.envVarHint}</span>
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
            aria-label="Imported Historical Datasets"
            className="bg-[#111622] border border-[#263244] rounded-lg overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-[#263244] flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white">Validated Historical &amp; Synced OHLCV Datasets</h2>
                <p className="text-xs text-[#E5E7EB]/55 mt-0.5">
                  Dữ liệu đã xác thực trong bộ nhớ và SQLite dùng cho Biểu đồ, Cycle Engine, Scanner &amp; Backtest.
                </p>
              </div>
              <span className="font-mono text-xs text-[#E5E7EB]/65 tabular-nums">
                {datasets.length} dataset(s)
              </span>
            </div>

            {datasets.length === 0 ? (
              <div className="p-6 text-xs text-[#E5E7EB]/60 font-mono">
                DATA_UNAVAILABLE — No historical CSV or synced API OHLCV datasets loaded yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[760px]">
                  <thead>
                    <tr className="border-b border-[#263244] bg-[#172033]/50 text-xs text-[#E5E7EB]/65">
                      <th className="py-2.5 px-4 font-medium">Symbol</th>
                      <th className="py-2.5 px-3 font-medium">Exchange</th>
                      <th className="py-2.5 px-3 font-medium">TF</th>
                      <th className="py-2.5 px-3 font-medium text-right">Bars</th>
                      <th className="py-2.5 px-3 font-medium">Range (ICT)</th>
                      <th className="py-2.5 px-3 font-medium">Source</th>
                      <th className="py-2.5 px-3 font-medium">Status</th>
                      <th className="py-2.5 px-4 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#263244]/70 text-xs">
                    {datasets.map((ds) => (
                      <tr key={`${ds.symbol}-${ds.timeframe}`} className="hover:bg-[#172033]/40">
                        <td className="py-2.5 px-4 font-mono text-white">{ds.symbol}</td>
                        <td className="py-2.5 px-3 font-mono text-[#E5E7EB]/85">{ds.exchange}</td>
                        <td className="py-2.5 px-3 font-mono text-[#E5E7EB]">{ds.timeframe}</td>
                        <td className="py-2.5 px-3 font-mono text-right tabular-nums text-white">
                          {ds.barCount}
                        </td>
                        <td className="py-2.5 px-3 font-mono tabular-nums text-[#E5E7EB]/65">
                          {formatTimestampInZone(ds.earliestTimestamp, 'Asia/Ho_Chi_Minh')} →{' '}
                          {formatTimestampInZone(ds.latestTimestamp, 'Asia/Ho_Chi_Minh')}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[#E5E7EB]/70">{ds.source}</td>
                        <td className="py-2.5 px-3">
                          <DataStatusBadge status={ds.status} compact />
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => openInstrumentIn(ds.symbol, 'charts')}
                            className="px-2.5 py-1 bg-[#172033] hover:bg-[#6366F1] border border-[#263244] rounded text-[11px] font-medium text-white transition-colors"
                          >
                            Open Chart
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
              aria-label="Contract Rollover Separation Audit"
              className="bg-[#111622] border border-[#263244] rounded-lg overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-[#263244]">
                <h2 className="text-sm font-semibold text-white">
                  Kiểm toán Tách biệt Hợp đồng Kỳ hạn vs Chuỗi Liên tục (Contract vs Continuous)
                </h2>
                <p className="text-xs text-[#E5E7EB]/55 mt-0.5">
                  Ngăn ngừa nối tùy tiện các hợp đồng futures; phân biệt rõ hợp đồng riêng lẻ (ZCH25), CONTINUOUS (UNADJUSTED/BACK/RATIO) và VENDOR proxy.
                </p>
              </div>
              <div className="divide-y divide-[#263244]/70">
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
                        <span className="font-mono font-semibold text-white">{c.symbol}</span>
                        <span className="text-[#E5E7EB]/70 ml-2">{c.rollNotice ?? 'Tách chuỗi hợp lệ.'}</span>
                      </div>
                      <div className="font-mono text-[11px] text-[#E5E7EB]/60 shrink-0">
                        Contracts: {c.individualContracts.length} · Continuous: {c.continuousAdjustments.join(',') || 'NONE'} · Vendor: {c.vendorProxyCount}
                      </div>
                    </div>
                  ))}
                {dataHealthReport.commodities.every(
                  (c) => c.individualContracts.length === 0 && c.continuousAdjustments.length === 0 && c.vendorProxyCount === 0
                ) && (
                  <div className="p-5 text-xs font-mono text-[#E5E7EB]/55">
                    Chưa có chuỗi hợp đồng hoặc chuỗi liên tục SQLite nào được nạp. Hãy dùng mục Import CSV phía trên hoặc Sync Feeds.
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
