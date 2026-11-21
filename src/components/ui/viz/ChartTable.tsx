import { useState } from 'react';
import { useT } from '../../../i18n';

/** Table-view twin of a chart (accessible equivalent). Collapsed by default; rows are capped to keep the DOM small. */
export function ChartTable({ columns, rows, maxRows = 60 }: { columns: string[]; rows: (string | number)[][]; maxRows?: number }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (rows.length === 0) return null;
  const shown = rows.length > maxRows ? rows.slice(rows.length - maxRows) : rows;
  return (
    <div className="mt-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] text-[var(--muted)] underline underline-offset-2 hover:text-[var(--text)]"
      >
        {open ? t('chart.tableHide') : t('chart.tableView')}
      </button>
      {open && (
        <div className="mt-1 max-h-56 overflow-auto rounded-md border border-[var(--border)]">
          <table className="w-full text-[11px] tabular-nums">
            <thead className="sticky top-0 bg-[var(--surface-2)] text-left text-[var(--muted)]">
              <tr>
                {columns.map((c) => (
                  <th key={c} scope="col" className="px-2 py-1 font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={i} className="border-t border-[var(--border)]">
                  {r.map((c, j) => (
                    <td key={j} className="px-2 py-0.5 text-[var(--text)]">
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
