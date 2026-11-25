import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { formatStoredTimestamp, type ImportReport } from '../../../api/dataApi';
import { fmtInt, useT } from '../../../i18n';

interface ImportReportPanelProps {
  report: ImportReport;
  httpStatus: number;
  timeframe: string;
}

function fmtOhlc(s: { open: number; high: number; low: number; close: number }): string {
  return `${s.open} / ${s.high} / ${s.low} / ${s.close}`;
}

export function ImportReportPanel({ report, httpStatus, timeframe }: ImportReportPanelProps) {
  const t = useT();
  const ok = report.ok && report.errorCount === 0;
  const StatusIcon = ok ? CheckCircle2 : XCircle;
  const statusColor = ok ? 'text-[var(--accent-text)]' : 'text-[var(--warning)]';

  return (
    <section
      aria-label={report.dryRun ? t('data.rep.dryRun') : t('data.rep.import')}
      className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-2)]/50 flex flex-wrap items-center gap-3">
        <StatusIcon className={`w-4 h-4 ${statusColor}`} aria-hidden="true" />
        <h2 className="text-sm font-semibold text-[var(--text-strong)]">{report.dryRun ? t('data.rep.dryRun') : t('data.rep.result')}</h2>
        <span className={`font-mono text-xs ${statusColor}`}>{report.status}</span>
        <span className="font-mono text-[11px] text-[var(--text)]/45">HTTP {httpStatus}</span>
      </div>

      <div className="p-4 space-y-4 text-xs">
        <p className="text-[var(--text)]/80">{report.message}</p>

        <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            [t('data.rep.dataRows'), fmtInt(report.parse.dataRowCount)],
            [t('data.rep.validRows'), fmtInt(report.parse.validRowCount)],
            [t('data.rep.firstBar'), formatStoredTimestamp(report.parse.firstTimestamp, timeframe)],
            [t('data.rep.lastBar'), formatStoredTimestamp(report.parse.lastTimestamp, timeframe)],
            [t('data.delimiter'), report.parse.delimiter ?? '—'],
            [
              t('data.dateFormat'),
              report.parse.dateFormat ? `${report.parse.dateFormat} (${report.parse.dateFormatSource ?? '?'})` : '—',
            ],
            [t('data.rep.errors'), String(report.errorCount)],
            [t('data.rep.warnings'), String(report.warningCount)],
          ].map(([k, v]) => (
            <div key={k} className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-2">
              <dt className="text-[var(--text)]/50">{k}</dt>
              <dd className="font-mono tabular-nums text-[var(--text-strong)] mt-0.5 break-all">{v}</dd>
            </div>
          ))}
        </dl>

        {Object.keys(report.parse.columns).length > 0 && (
          <p className="text-[var(--text)]/60">
            {t('data.rep.columns')}{' '}
            <span className="font-mono text-[var(--text)]/85">
              {Object.entries(report.parse.columns)
                .map(([field, col]) => `${field}←"${col}"`)
                .join(', ')}
            </span>
          </p>
        )}

        {report.plan && (
          <p className="text-[var(--text)]/60">
            {t('data.rep.plan', { mode: report.plan.mode })}{' '}
            <span className="font-mono text-[var(--text)]/85">
              {t('data.rep.planDetail', {
                write: report.plan.rowsToWrite,
                unchanged: report.plan.unchanged,
                conflicts: report.plan.conflicts,
                existing: report.plan.existingSeriesRows,
              })}
            </span>
          </p>
        )}

        {report.errors.length > 0 && (
          <IssueTable
            title={`${t('data.rep.errors')} (${report.errorCount}${report.errors.length < report.errorCount ? t('data.rep.shownFirst', { n: report.errors.length }) : ''})`}
            tone="error"
            rows={report.errors.map((e) => ({ line: e.line, code: e.field ?? '', message: e.message }))}
          />
        )}

        {report.warnings.length > 0 && (
          <IssueTable
            title={`${t('data.rep.warnings')} (${report.warningCount}${report.warnings.length < report.warningCount ? t('data.rep.shownFirst', { n: report.warnings.length }) : ''})`}
            tone="warning"
            rows={report.warnings.map((w) => ({ line: w.line ?? null, code: w.code, message: w.message }))}
          />
        )}

        {report.conflicts.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-[var(--warning)] mb-2">{t('data.rep.conflicts')} ({report.conflicts.length})</h3>
            <div className="overflow-x-auto border border-[var(--border)] rounded-md max-h-72">
              <table className="w-full text-left border-collapse min-w-[640px]">
                <thead className="sticky top-0 bg-[var(--surface-2)]">
                  <tr className="text-[var(--text)]/65">
                    <th className="py-2 px-3 font-medium">{t('data.rep.line')}</th>
                    <th className="py-2 px-3 font-medium">{t('data.rep.timestamp')}</th>
                    <th className="py-2 px-3 font-medium">{t('data.rep.stored')}</th>
                    <th className="py-2 px-3 font-medium">{t('data.rep.incoming')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]/70 font-mono tabular-nums">
                  {report.conflicts.map((c) => (
                    <tr key={c.timestamp}>
                      <td className="py-1.5 px-3 text-[var(--text)]/70">{c.line ?? '—'}</td>
                      <td className="py-1.5 px-3 text-[var(--text-strong)]">{formatStoredTimestamp(c.timestamp, timeframe)}</td>
                      <td className="py-1.5 px-3 text-[var(--text)]/80">{fmtOhlc(c.stored)}</td>
                      <td className="py-1.5 px-3 text-[var(--warning)]">{fmtOhlc(c.incoming)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function IssueTable({
  title,
  tone,
  rows,
}: {
  title: string;
  tone: 'error' | 'warning';
  rows: { line: number | null; code: string; message: string }[];
}) {
  const t = useT();
  const color = tone === 'error' ? 'text-[var(--warning)]' : 'text-[var(--warning)]';
  return (
    <div>
      <h3 className={`text-xs font-semibold mb-2 flex items-center gap-1.5 ${color}`}>
        <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
        {title}
      </h3>
      <div className="overflow-x-auto border border-[var(--border)] rounded-md max-h-72">
        <table className="w-full text-left border-collapse min-w-[560px]">
          <thead className="sticky top-0 bg-[var(--surface-2)]">
            <tr className="text-[var(--text)]/65">
              <th className="py-2 px-3 font-medium w-16">{t('data.rep.line')}</th>
              <th className="py-2 px-3 font-medium w-44">{tone === 'error' ? t('data.rep.field') : t('data.rep.code')}</th>
              <th className="py-2 px-3 font-medium">{t('data.rep.message')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]/70">
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="py-1.5 px-3 font-mono tabular-nums text-[var(--text)]/70">{r.line ?? t('data.rep.file')}</td>
                <td className={`py-1.5 px-3 font-mono ${color}`}>{r.code || '—'}</td>
                <td className="py-1.5 px-3 text-[var(--text)]/85">{r.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
