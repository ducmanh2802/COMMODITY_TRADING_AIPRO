import { RefreshCw } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTerminal } from '../../contexts/TerminalContext';
import { formatTimestampInZone } from '../../shared/utils/time';
import { DataStatusBadge } from '../common/DataStatusBadge';

export function DataHealthView() {
  const { health, providers, loading, refreshBackendData } = useTerminal();
  const { firestoreStatus } = useAuth();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight">
            Data Sources & Health
          </h1>
          <p className="text-sm text-[#E5E7EB]/65 mt-1">
            Live verification of backend runtime, Firebase persistence, and MarketDataProvider adapters.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void refreshBackendData()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#172033] hover:bg-[#172033]/80 border border-[#263244] rounded-md text-xs font-medium text-white disabled:opacity-50 whitespace-nowrap self-start"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          <span>Run Health Check</span>
        </button>
      </div>

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
            Server-side only · AI Analyst activates in Phase 5
          </p>
        </div>
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
