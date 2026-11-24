/**
 * COT sync health panel for the Data Health view (GET /api/cot/health).
 * Shows the overall COT data status and, per instrument / report type: stored row count, report-date
 * range, last sync attempt and last successful sync. NOT_REPORTED instruments are listed with the reason.
 */
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { type CotHealthResponse, fetchCotHealth } from '../../../api/cotApi';
import { DataStatusBadge } from '../../common/DataStatusBadge';
import { tr, useT } from '../../../i18n';

export function CotHealthSection() {
  const t = useT();
  const [health, setHealth] = useState<CotHealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setHealth(await fetchCotHealth());
    } catch (e) {
      setError(e instanceof Error ? e.message : tr('cot.h.loadFailed'));
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
    <section aria-label={t('cot.h.aria')} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('cot.h.title')}</h2>
          <p className="text-xs text-[var(--text)]/55 mt-0.5">
            {t('cot.h.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {health && <DataStatusBadge status={health.overallStatus} />}
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            aria-label={t('cot.h.refresh')}
            className="p-1.5 border border-[var(--border)] rounded-md text-[var(--text)]/70 hover:text-[var(--text-strong)] disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </div>
      {error && <p className="px-4 py-3 text-xs text-[var(--warning)]">{t('cot.h.unavailable', { error })}</p>}
      {health && (
        <div className="overflow-x-auto" tabIndex={0}>
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]/50 text-xs text-[var(--text)]/65">
                <th className="py-2.5 px-4 font-medium">{t('cot.h.instrument')}</th>
                <th className="py-2.5 px-3 font-medium">{t('cot.h.code')}</th>
                <th className="py-2.5 px-3 font-medium">{t('cot.h.report')}</th>
                <th className="py-2.5 px-3 font-medium text-right">{t('cot.h.rows')}</th>
                <th className="py-2.5 px-3 font-medium">{t('cot.h.dates')}</th>
                <th className="py-2.5 px-3 font-medium">{t('cot.h.lastSync')}</th>
                <th className="py-2.5 px-4 font-medium">{t('cot.h.lastSuccess')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]/70 text-xs">
              {rows.map(({ m, r }) => (
                <tr key={`${m.instrumentId}-${r?.reportType ?? 'none'}`} className="hover:bg-[var(--surface-2)]/40">
                  <td className="py-2 px-4 font-mono text-[var(--text-strong)]">{m.instrumentId}</td>
                  <td className="py-2 px-3 font-mono text-[var(--text)]/75">{m.cftcContractMarketCode ?? '—'}</td>
                  {r === null ? (
                    <td colSpan={5} className="py-2 px-3 text-[var(--text)]/55">
                      <span className="font-mono text-[var(--warning)] mr-2" title={t('cot.h.notReported')}>
                        NOT_REPORTED
                      </span>
                      {m.notes}
                    </td>
                  ) : (
                    <>
                      <td className="py-2 px-3 font-mono text-[var(--text)]/75">{r.reportType}</td>
                      <td className="py-2 px-3 font-mono text-right tabular-nums">{r.rowCount}</td>
                      <td className="py-2 px-3 font-mono text-[var(--text)]/70 whitespace-nowrap">
                        {r.firstReportDate ? `${r.firstReportDate} → ${r.lastReportDate}` : t('cot.h.noData')}
                      </td>
                      <td className="py-2 px-3 font-mono text-[var(--text)]/70">
                        {r.lastSync ? (
                          <span title={r.lastSync.message ?? undefined}>
                            <span className={r.lastSync.status === 'SUCCESS' ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}>{r.lastSync.status}</span> ·{' '}
                            {r.lastSync.startedAt.slice(0, 16).replace('T', ' ')}Z · {t('cot.h.accRej', { acc: r.lastSync.rowsAccepted, rej: r.lastSync.rowsRejected })}
                          </span>
                        ) : (
                          t('cot.h.never')
                        )}
                      </td>
                      <td className="py-2 px-4 font-mono text-[var(--text)]/70">{r.lastSuccessfulSyncAt ?? '—'}</td>
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
