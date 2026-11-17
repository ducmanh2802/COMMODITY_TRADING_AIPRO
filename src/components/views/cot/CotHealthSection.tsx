/**
 * COT sync health panel for the Data Health view (GET /api/cot/health).
 * Shows the overall COT data status and, per instrument / report type: stored row count, report-date
 * range, last sync attempt and last successful sync. NOT_REPORTED instruments are listed with the reason.
 */
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { type CotHealthResponse, fetchCotHealth } from '../../../api/cotApi';
import { DataStatusBadge } from '../../common/DataStatusBadge';

export function CotHealthSection() {
  const [health, setHealth] = useState<CotHealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setHealth(await fetchCotHealth());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load COT health.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  type Market = NonNullable<typeof health>['markets'][number];
  type Row = { m: Market; r: Market['reports'][number] | null };
  const rows: Row[] = (health?.markets ?? []).flatMap((m): Row[] =>
    m.status === 'NOT_REPORTED' || m.reports.length === 0
      ? [{ m, r: null }]
      : m.reports.map((r) => ({ m, r }))
  );

  return (
    <section aria-label="COT Sync Health" className="bg-[#111622] border border-[#263244] rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-[#263244] flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">CFTC COT Sync (/api/cot/health)</h2>
          <p className="text-xs text-[#E5E7EB]/55 mt-0.5">
            Weekly reports older than ~17 days are STALE. Instruments outside CFTC coverage are NOT_REPORTED (never substituted).
          </p>
        </div>
        <div className="flex items-center gap-3">
          {health && <DataStatusBadge status={health.overallStatus} />}
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            aria-label="Refresh COT health"
            className="p-1.5 border border-[#263244] rounded-md text-[#E5E7EB]/70 hover:text-white disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </div>
      {error && <p className="px-4 py-3 text-xs text-[#F59E0B]">COT health unavailable: {error}</p>}
      {health && (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="border-b border-[#263244] bg-[#172033]/50 text-xs text-[#E5E7EB]/65">
                <th className="py-2.5 px-4 font-medium">Instrument</th>
                <th className="py-2.5 px-3 font-medium">CFTC code</th>
                <th className="py-2.5 px-3 font-medium">Report</th>
                <th className="py-2.5 px-3 font-medium text-right">Rows</th>
                <th className="py-2.5 px-3 font-medium">Report dates</th>
                <th className="py-2.5 px-3 font-medium">Last sync</th>
                <th className="py-2.5 px-4 font-medium">Last success (fetchedAt)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#263244]/70 text-xs">
              {rows.map(({ m, r }) => (
                <tr key={`${m.instrumentId}-${r?.reportType ?? 'none'}`} className="hover:bg-[#172033]/40">
                  <td className="py-2 px-4 font-mono text-white">{m.instrumentId}</td>
                  <td className="py-2 px-3 font-mono text-[#E5E7EB]/75">{m.cftcContractMarketCode ?? '—'}</td>
                  {r === null ? (
                    <td colSpan={5} className="py-2 px-3 text-[#E5E7EB]/55">
                      <span className="font-mono text-[#F59E0B] mr-2">NOT_REPORTED</span>
                      {m.notes}
                    </td>
                  ) : (
                    <>
                      <td className="py-2 px-3 font-mono text-[#E5E7EB]/75">{r.reportType}</td>
                      <td className="py-2 px-3 font-mono text-right tabular-nums">{r.rowCount}</td>
                      <td className="py-2 px-3 font-mono text-[#E5E7EB]/70 whitespace-nowrap">
                        {r.firstReportDate ? `${r.firstReportDate} → ${r.lastReportDate}` : 'no data'}
                      </td>
                      <td className="py-2 px-3 font-mono text-[#E5E7EB]/70">
                        {r.lastSync ? (
                          <span title={r.lastSync.message ?? undefined}>
                            <span className={r.lastSync.status === 'SUCCESS' ? 'text-[#22C55E]' : 'text-[#EF4444]'}>{r.lastSync.status}</span> ·{' '}
                            {r.lastSync.startedAt.slice(0, 16).replace('T', ' ')}Z · {r.lastSync.rowsAccepted} acc / {r.lastSync.rowsRejected} rej
                          </span>
                        ) : (
                          'never'
                        )}
                      </td>
                      <td className="py-2 px-4 font-mono text-[#E5E7EB]/70">{r.lastSuccessfulSyncAt ?? '—'}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
