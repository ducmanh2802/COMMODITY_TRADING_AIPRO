import { CloudDownload, KeyRound, RefreshCw } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTerminal } from '../../contexts/TerminalContext';
import { formatTimestampInZone } from '../../shared/utils/time';
import { CsvImportPanel } from '../common/CsvImportPanel';
import { DataStatusBadge } from '../common/DataStatusBadge';

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
    latencyAndTier: 'Real-time / Intraday WebSocket & REST (Free tier: 8 req/min, 800/day)',
    commodityCoverage: 'Spot Metals (XAU/USD, XAG/USD, XPT/USD), Intraday OHLCV (M1–W1), USD/VND FX',
    officialDoc: 'twelvedata.com',
    providerId: 'TWELVE_DATA',
  },
  {
    provider: 'Financial Modeling Prep (FMP)',
    secretName: 'FMP_API_KEY',
    latencyAndTier: 'Real-time / Delayed /stable/quote & Daily OHLCV (Free tier: 250 req/day)',
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
    provider: 'MXV Official / CQG Member Feed',
    secretName: 'MXV_API_KEY + MXV_API_URL',
    latencyAndTier: 'Real-time L1/L2 (Requires Thành viên Kinh doanh MXV authorization)',
    commodityCoverage: 'Direct MXV-routed contracts (LRC Robusta, JRU Rubber, SBE Soybean, ZCE Corn...)',
    officialDoc: 'mxv.com.vn',
    providerId: 'MXV_OFFICIAL',
  },
];

export function DataHealthView() {
  const {
    health,
    providers,
    datasets,
    loading,
    syncing,
    timeframe,
    lastSyncSummary,
    refreshBackendData,
    syncProviderFeeds,
    openInstrumentIn,
  } = useTerminal();
  const { firestoreStatus } = useAuth();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight">
            Data Sources & Health
          </h1>
          <p className="text-sm text-[#E5E7EB]/65 mt-1">
            Server-side commodity API integrations, Vietnam MXV adapter status, Firebase persistence, and CSV historical datasets.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start">
          <button
            type="button"
            onClick={() => void syncProviderFeeds({ timeframe })}
            disabled={syncing || loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#6366F1] hover:bg-[#6366F1]/90 rounded-md text-xs font-medium text-white disabled:opacity-50 whitespace-nowrap"
          >
            <CloudDownload className={`w-3.5 h-3.5 ${syncing ? 'animate-pulse' : ''}`} aria-hidden="true" />
            <span>{syncing ? 'Syncing Feeds...' : 'Sync Configured Providers'}</span>
          </button>

          <button
            type="button"
            onClick={() => void refreshBackendData()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#172033] hover:bg-[#172033]/80 border border-[#263244] rounded-md text-xs font-medium text-white disabled:opacity-50 whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>Run Health Check</span>
          </button>
        </div>
      </div>

      {lastSyncSummary && (
        <section
          aria-label="Latest Sync Result"
          className="bg-[#111622] border border-[#6366F1]/40 rounded-lg p-4 space-y-3"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <p className="text-xs font-semibold text-white font-mono">
              Provider Sync Completed ({formatTimestampInZone(lastSyncSummary.syncedAt, 'Asia/Ho_Chi_Minh')} ICT)
            </p>
            <span className="text-xs font-mono text-[#22C55E]">
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

      {/* System Endpoints & Platform Capabilities */}
      <section
        aria-label="System Runtime Diagnostics"
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
      >
        <div className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-1.5">
          <p className="text-xs text-[#E5E7EB]/60">Backend API (/api/health)</p>
          <p className="text-lg font-mono font-semibold text-white">
            {health ? health.status : 'CHECKING'}
          </p>
          <p className="text-xs font-mono text-[#E5E7EB]/55 tabular-nums">
            {health
              ? `Node ${health.runtime.nodeVersion} · ${health.localTimeLabel}`
              : 'Connecting to Express runtime...'}
          </p>
        </div>

        <div className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-1.5">
          <p className="text-xs text-[#E5E7EB]/60">Cloud Firestore & Auth</p>
          <p className="text-lg font-mono font-semibold text-white">{firestoreStatus}</p>
          <p className="text-xs text-[#E5E7EB]/55">
            Project provisioned · Owner-isolated rules active
          </p>
        </div>

        <div className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-1.5">
          <p className="text-xs text-[#E5E7EB]/60">Gemini Server Integration</p>
          <p className="text-lg font-mono font-semibold text-white">
            {health?.capabilities.geminiServerKeyConfigured ? 'KEY PRESENT' : 'KEY NOT SET'}
          </p>
          <p className="text-xs text-[#E5E7EB]/55">
            Server-side @google/genai active · No client key exposure
          </p>
        </div>
      </section>

      {/* Server-Side Real-Time & Macro API Keys Setup Guide (Read-only Secrets reference) */}
      <section
        aria-label="Server-Side Commodity API Secrets Guide"
        className="bg-[#111622] border border-[#263244] rounded-lg overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-[#263244] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-start gap-2.5">
            <KeyRound className="w-4 h-4 text-[#6366F1] shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold text-white">
                Real-Time & Standard Commodity API Keys (Server-Side Secrets)
              </h2>
              <p className="text-xs text-[#E5E7EB]/60 mt-0.5">
                Configure any of these environment variable names in AI Studio <span className="font-mono text-white">Settings &gt; Secrets</span> (never exposed to browser client).
              </p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[860px]">
            <thead>
              <tr className="border-b border-[#263244] bg-[#172033]/50 text-xs text-[#E5E7EB]/65">
                <th className="py-2.5 px-4 font-medium">Provider</th>
                <th className="py-2.5 px-3 font-medium">Server Env Secret Name</th>
                <th className="py-2.5 px-3 font-medium">Latency & Tier</th>
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

      {/* Historical OHLCV CSV Importer */}
      <CsvImportPanel />

      {/* Imported Historical Datasets */}
      <section
        aria-label="Imported Historical Datasets"
        className="bg-[#111622] border border-[#263244] rounded-lg overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-[#263244] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">Validated Historical & Synced OHLCV Datasets</h2>
            <p className="text-xs text-[#E5E7EB]/55 mt-0.5">
              Synced API or imported CSV series available for Multi-Timeframe Charts, Technical Engine, Scanner, and Backtests.
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

      {/* Provider Adapters Table */}
      <section
        aria-label="Market Data Provider Adapters"
        className="bg-[#111622] border border-[#263244] rounded-lg overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-[#263244]">
          <h2 className="text-sm font-semibold text-white">MarketDataProvider Adapters</h2>
          <p className="text-xs text-[#E5E7EB]/55 mt-0.5">
            Providers without authorized credentials fail closed with DATA_UNAVAILABLE rather than simulating prices.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[820px]">
            <thead>
              <tr className="border-b border-[#263244] bg-[#172033]/50 text-xs text-[#E5E7EB]/65">
                <th className="py-3 px-4 font-medium">Provider</th>
                <th className="py-3 px-3 font-medium">Exchanges</th>
                <th className="py-3 px-3 font-medium">Connection</th>
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
                    <DataStatusBadge status={p.dataStatus} compact />
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
    </div>
  );
}
