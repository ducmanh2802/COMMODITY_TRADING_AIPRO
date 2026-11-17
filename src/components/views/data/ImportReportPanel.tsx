import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { formatStoredTimestamp, type ImportReport } from '../../../api/dataApi';

interface ImportReportPanelProps {
  report: ImportReport;
  httpStatus: number;
  timeframe: string;
}

function fmtOhlc(s: { open: number; high: number; low: number; close: number }): string {
  return `${s.open} / ${s.high} / ${s.low} / ${s.close}`;
}

export function ImportReportPanel({ report, httpStatus, timeframe }: ImportReportPanelProps) {
  const ok = report.ok && report.errorCount === 0;
  const StatusIcon = ok ? CheckCircle2 : XCircle;
  const statusColor = ok ? 'text-[#22C55E]' : 'text-[#EF4444]';

  return (
    <section
      aria-label={report.dryRun ? 'Dry run report' : 'Import report'}
      className="bg-[#111622] border border-[#263244] rounded-lg overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-[#263244] bg-[#172033]/50 flex flex-wrap items-center gap-3">
        <StatusIcon className={`w-4 h-4 ${statusColor}`} aria-hidden="true" />
        <h2 className="text-sm font-semibold text-white">{report.dryRun ? 'Dry run report' : 'Import result'}</h2>
        <span className={`font-mono text-xs ${statusColor}`}>{report.status}</span>
        <span className="font-mono text-[11px] text-[#E5E7EB]/45">HTTP {httpStatus}</span>
      </div>

      <div className="p-4 space-y-4 text-xs">
        <p className="text-[#E5E7EB]/80">{report.message}</p>

        <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ['Data rows', report.parse.dataRowCount.toLocaleString()],
            ['Valid rows', report.parse.validRowCount.toLocaleString()],
            ['First bar', formatStoredTimestamp(report.parse.firstTimestamp, timeframe)],
            ['Last bar', formatStoredTimestamp(report.parse.lastTimestamp, timeframe)],
            ['Delimiter', report.parse.delimiter ?? '—'],
            [
              'Date format',
              report.parse.dateFormat ? `${report.parse.dateFormat} (${report.parse.dateFormatSource ?? '?'})` : '—',
            ],
            ['Errors', String(report.errorCount)],
            ['Warnings', String(report.warningCount)],
          ].map(([k, v]) => (
            <div key={k} className="bg-[#0B0E14] border border-[#263244] rounded-md px-3 py-2">
              <dt className="text-[#E5E7EB]/50">{k}</dt>
              <dd className="font-mono tabular-nums text-white mt-0.5 break-all">{v}</dd>
            </div>
          ))}
        </dl>

        {Object.keys(report.parse.columns).length > 0 && (
          <p className="text-[#E5E7EB]/60">
            Column mapping:{' '}
            <span className="font-mono text-[#E5E7EB]/85">
              {Object.entries(report.parse.columns)
                .map(([field, col]) => `${field}←"${col}"`)
                .join(', ')}
            </span>
          </p>
        )}

        {report.plan && (
          <p className="text-[#E5E7EB]/60">
            Write plan ({report.plan.mode}):{' '}
            <span className="font-mono text-[#E5E7EB]/85">
              {report.plan.rowsToWrite} to write · {report.plan.unchanged} unchanged · {report.plan.conflicts} conflicts ·{' '}
              {report.plan.existingSeriesRows} existing rows in series
            </span>
          </p>
        )}

        {report.errors.length > 0 && (
          <IssueTable
            title={`Errors (${report.errorCount}${report.errors.length < report.errorCount ? `, first ${report.errors.length} shown` : ''})`}
            tone="error"
            rows={report.errors.map((e) => ({ line: e.line, code: e.field ?? '', message: e.message }))}
          />
        )}

        {report.warnings.length > 0 && (
          <IssueTable
            title={`Warnings (${report.warningCount}${report.warnings.length < report.warningCount ? `, first ${report.warnings.length} shown` : ''})`}
            tone="warning"
            rows={report.warnings.map((w) => ({ line: w.line ?? null, code: w.code, message: w.message }))}
          />
        )}

        {report.conflicts.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-[#EF4444] mb-2">Conflicts ({report.conflicts.length})</h3>
            <div className="overflow-x-auto border border-[#263244] rounded-md max-h-72">
              <table className="w-full text-left border-collapse min-w-[640px]">
                <thead className="sticky top-0 bg-[#172033]">
                  <tr className="text-[#E5E7EB]/65">
                    <th className="py-2 px-3 font-medium">Line</th>
                    <th className="py-2 px-3 font-medium">Timestamp</th>
                    <th className="py-2 px-3 font-medium">Stored O/H/L/C</th>
                    <th className="py-2 px-3 font-medium">Incoming O/H/L/C</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#263244]/70 font-mono tabular-nums">
                  {report.conflicts.map((c) => (
                    <tr key={c.timestamp}>
                      <td className="py-1.5 px-3 text-[#E5E7EB]/70">{c.line ?? '—'}</td>
                      <td className="py-1.5 px-3 text-white">{formatStoredTimestamp(c.timestamp, timeframe)}</td>
                      <td className="py-1.5 px-3 text-[#E5E7EB]/80">{fmtOhlc(c.stored)}</td>
                      <td className="py-1.5 px-3 text-[#F59E0B]">{fmtOhlc(c.incoming)}</td>
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
  const color = tone === 'error' ? 'text-[#EF4444]' : 'text-[#F59E0B]';
  return (
    <div>
      <h3 className={`text-xs font-semibold mb-2 flex items-center gap-1.5 ${color}`}>
        <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
        {title}
      </h3>
      <div className="overflow-x-auto border border-[#263244] rounded-md max-h-72">
        <table className="w-full text-left border-collapse min-w-[560px]">
          <thead className="sticky top-0 bg-[#172033]">
            <tr className="text-[#E5E7EB]/65">
              <th className="py-2 px-3 font-medium w-16">Line</th>
              <th className="py-2 px-3 font-medium w-44">{tone === 'error' ? 'Field' : 'Code'}</th>
              <th className="py-2 px-3 font-medium">Message</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#263244]/70">
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="py-1.5 px-3 font-mono tabular-nums text-[#E5E7EB]/70">{r.line ?? 'file'}</td>
                <td className={`py-1.5 px-3 font-mono ${color}`}>{r.code || '—'}</td>
                <td className="py-1.5 px-3 text-[#E5E7EB]/85">{r.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
