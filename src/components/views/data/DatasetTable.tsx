import { useEffect, useRef } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import { formatStoredTimestamp, type DatasetRecord } from '../../../api/dataApi';

interface DatasetTableProps {
  datasets: DatasetRecord[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onRequestDelete: (d: DatasetRecord) => void;
}

const QUALITY_COLOR: Record<string, string> = {
  OFFICIAL: 'text-[#22C55E]',
  LICENSED_VENDOR: 'text-[#6366F1]',
  UNOFFICIAL: 'text-[#F59E0B]',
  USER_PROVIDED: 'text-[#F59E0B]',
};

export function DatasetTable({ datasets, loading, error, onRefresh, onRequestDelete }: DatasetTableProps) {
  return (
    <section aria-label="Imported datasets" className="bg-[#111622] border border-[#263244] rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-[#263244] flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Imported datasets</h2>
          <p className="text-xs text-[#E5E7EB]/55 mt-0.5">Provenance of every stored series. Deleting removes the candles a dataset owns.</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-[#263244] text-[#E5E7EB]/80 hover:text-white hover:bg-[#172033]"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh
        </button>
      </div>
      {error && <p className="px-4 py-2 text-xs text-[#EF4444] border-b border-[#263244]">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[1080px]">
          <thead>
            <tr className="border-b border-[#263244] bg-[#172033]/50 text-xs text-[#E5E7EB]/65">
              <th className="py-3 px-4 font-medium">Instrument</th>
              <th className="py-3 px-3 font-medium">Contract</th>
              <th className="py-3 px-3 font-medium">TF</th>
              <th className="py-3 px-3 font-medium">Source</th>
              <th className="py-3 px-3 font-medium">Quality</th>
              <th className="py-3 px-3 font-medium">Unit</th>
              <th className="py-3 px-3 font-medium text-right">Rows (owned)</th>
              <th className="py-3 px-3 font-medium">Range</th>
              <th className="py-3 px-3 font-medium">Source TZ</th>
              <th className="py-3 px-3 font-medium">SHA-256</th>
              <th className="py-3 px-3 font-medium">Imported (UTC)</th>
              <th className="py-3 px-4 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#263244]/70 text-xs">
            {datasets.length === 0 ? (
              <tr>
                <td colSpan={12} className="py-10 px-4 text-center text-[#E5E7EB]/55">
                  {loading ? 'Loading datasets...' : 'No datasets imported yet — DATA_UNAVAILABLE.'}
                </td>
              </tr>
            ) : (
              datasets.map((d) => (
                <tr key={d.id} className="hover:bg-[#172033]/40 transition-colors">
                  <td className="py-2.5 px-4 font-mono text-white whitespace-nowrap">{d.instrumentId}</td>
                  <td className="py-2.5 px-3 font-mono text-white whitespace-nowrap">
                    {d.contractCode}
                    {d.continuousAdjustment !== 'NONE' && (
                      <span className="text-[#E5E7EB]/50"> · {d.continuousAdjustment}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[#E5E7EB]/80">{d.timeframe}</td>
                  <td className="py-2.5 px-3 text-[#E5E7EB]/85 max-w-[180px] truncate" title={d.sourceLabel}>
                    {d.sourceLabel}
                  </td>
                  <td className={`py-2.5 px-3 font-mono whitespace-nowrap ${QUALITY_COLOR[d.sourceQuality] ?? ''}`}>
                    {d.sourceQuality}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[#E5E7EB]/80 whitespace-nowrap">
                    {d.priceUnit}
                    {d.priceUnitDeclared && <span className="text-[#F59E0B]"> (declared)</span>}
                  </td>
                  <td className="py-2.5 px-3 font-mono tabular-nums text-right text-[#E5E7EB]/80 whitespace-nowrap">
                    {d.rowCount.toLocaleString()} ({d.insertedCount.toLocaleString()})
                  </td>
                  <td className="py-2.5 px-3 font-mono tabular-nums text-[#E5E7EB]/80 whitespace-nowrap">
                    {formatStoredTimestamp(d.firstTimestamp, d.timeframe)} → {formatStoredTimestamp(d.lastTimestamp, d.timeframe)}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[#E5E7EB]/60 whitespace-nowrap">{d.timezone}</td>
                  <td className="py-2.5 px-3 font-mono text-[#E5E7EB]/60" title={d.checksum}>
                    {d.checksum.slice(0, 12)}…
                  </td>
                  <td className="py-2.5 px-3 font-mono tabular-nums text-[#E5E7EB]/60 whitespace-nowrap">
                    {d.importedAt.slice(0, 16).replace('T', ' ')}
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => onRequestDelete(d)}
                      aria-label={`Delete dataset ${d.instrumentId} ${d.contractCode} ${d.timeframe}`}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-[#EF4444]/85 hover:text-[#EF4444] hover:bg-[#EF4444]/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface ConfirmDeleteDialogProps {
  dataset: DatasetRecord;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDeleteDialog({ dataset, busy, error, onCancel, onConfirm }: ConfirmDeleteDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-title"
        className="w-full max-w-md bg-[#111622] border border-[#263244] rounded-lg p-5 space-y-4"
      >
        <h2 id="confirm-delete-title" className="text-sm font-semibold text-white">
          Delete dataset?
        </h2>
        <p className="text-xs text-[#E5E7EB]/75 leading-relaxed">
          This permanently removes dataset <span className="font-mono text-white">{dataset.id.slice(0, 8)}</span> (
          <span className="font-mono">
            {dataset.instrumentId} · {dataset.contractCode} · {dataset.timeframe}
          </span>
          , source “{dataset.sourceLabel}”) and the{' '}
          <span className="font-mono text-white">{dataset.insertedCount.toLocaleString()}</span> candles it owns. This cannot be undone.
        </p>
        {error && <p className="text-xs text-[#EF4444]">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-3 py-1.5 text-xs rounded-md border border-[#263244] text-[#E5E7EB]/85 hover:bg-[#172033] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="px-3 py-1.5 text-xs rounded-md bg-[#EF4444] text-white hover:bg-[#DC2626] disabled:opacity-50"
          >
            {busy ? 'Deleting…' : 'Delete dataset'}
          </button>
        </div>
      </div>
    </div>
  );
}
