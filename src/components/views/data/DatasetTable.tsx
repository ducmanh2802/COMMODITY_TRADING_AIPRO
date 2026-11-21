import { useEffect, useRef } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import { formatStoredTimestamp, type DatasetRecord } from '../../../api/dataApi';
import { fmtInt, useT } from '../../../i18n';

interface DatasetTableProps {
  datasets: DatasetRecord[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onRequestDelete: (d: DatasetRecord) => void;
}

const QUALITY_COLOR: Record<string, string> = {
  OFFICIAL: 'text-[var(--positive)]',
  LICENSED_VENDOR: 'text-[var(--accent)]',
  UNOFFICIAL: 'text-[var(--warning)]',
  USER_PROVIDED: 'text-[var(--warning)]',
};

export function DatasetTable({ datasets, loading, error, onRefresh, onRequestDelete }: DatasetTableProps) {
  const t = useT();
  return (
    <section aria-label={t('data.ds.title')} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('data.ds.title')}</h2>
          <p className="text-xs text-[var(--text)]/55 mt-0.5">{t('data.ds.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-[var(--border)] text-[var(--text)]/80 hover:text-[var(--text-strong)] hover:bg-[var(--surface-2)]"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          {t('common.refresh')}
        </button>
      </div>
      {error && <p className="px-4 py-2 text-xs text-[var(--negative)] border-b border-[var(--border)]">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[1080px]">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]/50 text-xs text-[var(--text)]/65">
              <th className="py-3 px-4 font-medium">{t('data.ds.instrument')}</th>
              <th className="py-3 px-3 font-medium">{t('data.ds.contract')}</th>
              <th className="py-3 px-3 font-medium">{t('data.ds.tf')}</th>
              <th className="py-3 px-3 font-medium">{t('data.ds.source')}</th>
              <th className="py-3 px-3 font-medium">{t('data.ds.quality')}</th>
              <th className="py-3 px-3 font-medium">{t('data.ds.unit')}</th>
              <th className="py-3 px-3 font-medium text-right">{t('data.ds.rows')}</th>
              <th className="py-3 px-3 font-medium">{t('data.ds.range')}</th>
              <th className="py-3 px-3 font-medium">{t('data.ds.tz')}</th>
              <th className="py-3 px-3 font-medium">SHA-256</th>
              <th className="py-3 px-3 font-medium">{t('data.ds.imported')}</th>
              <th className="py-3 px-4 font-medium text-right">{t('data.ds.action')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]/70 text-xs">
            {datasets.length === 0 ? (
              <tr>
                <td colSpan={12} className="py-10 px-4 text-center text-[var(--text)]/55">
                  {loading ? t('data.ds.loading') : t('data.ds.empty')}
                </td>
              </tr>
            ) : (
              datasets.map((d) => (
                <tr key={d.id} className="hover:bg-[var(--surface-2)]/40 transition-colors">
                  <td className="py-2.5 px-4 font-mono text-[var(--text-strong)] whitespace-nowrap">{d.instrumentId}</td>
                  <td className="py-2.5 px-3 font-mono text-[var(--text-strong)] whitespace-nowrap">
                    {d.contractCode}
                    {d.continuousAdjustment !== 'NONE' && (
                      <span className="text-[var(--text)]/50"> · {d.continuousAdjustment}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[var(--text)]/80">{d.timeframe}</td>
                  <td className="py-2.5 px-3 text-[var(--text)]/85 max-w-[180px] truncate" title={d.sourceLabel}>
                    {d.sourceLabel}
                  </td>
                  <td
                    className={`py-2.5 px-3 font-mono whitespace-nowrap ${QUALITY_COLOR[d.sourceQuality] ?? ''}`}
                    title={d.sourceQuality in QUALITY_COLOR ? t(`data.q.${d.sourceQuality}` as 'data.q.OFFICIAL') : undefined}
                  >
                    {d.sourceQuality}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[var(--text)]/80 whitespace-nowrap">
                    {d.priceUnit}
                    {d.priceUnitDeclared && <span className="text-[var(--warning)]"> {t('data.ds.declared')}</span>}
                  </td>
                  <td className="py-2.5 px-3 font-mono tabular-nums text-right text-[var(--text)]/80 whitespace-nowrap">
                    {fmtInt(d.rowCount)} ({fmtInt(d.insertedCount)})
                  </td>
                  <td className="py-2.5 px-3 font-mono tabular-nums text-[var(--text)]/80 whitespace-nowrap">
                    {formatStoredTimestamp(d.firstTimestamp, d.timeframe)} → {formatStoredTimestamp(d.lastTimestamp, d.timeframe)}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[var(--text)]/60 whitespace-nowrap">{d.timezone}</td>
                  <td className="py-2.5 px-3 font-mono text-[var(--text)]/60" title={d.checksum}>
                    {d.checksum.slice(0, 12)}…
                  </td>
                  <td className="py-2.5 px-3 font-mono tabular-nums text-[var(--text)]/60 whitespace-nowrap">
                    {d.importedAt.slice(0, 16).replace('T', ' ')}
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => onRequestDelete(d)}
                      aria-label={t('data.ds.deleteAria', { id: `${d.instrumentId} ${d.contractCode} ${d.timeframe}` })}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-[var(--negative)]/85 hover:text-[var(--negative)] hover:bg-[var(--negative)]/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      {t('common.delete')}
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
  const t = useT();
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
        className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 space-y-4"
      >
        <h2 id="confirm-delete-title" className="text-sm font-semibold text-[var(--text-strong)]">
          {t('data.ds.confirmTitle')}
        </h2>
        <p className="text-xs text-[var(--text)]/75 leading-relaxed">
          {t('data.ds.confirm1')} <span className="font-mono text-[var(--text-strong)]">{dataset.id.slice(0, 8)}</span> (
          <span className="font-mono">
            {dataset.instrumentId} · {dataset.contractCode} · {dataset.timeframe}
          </span>
          {t('data.ds.confirm2', { source: dataset.sourceLabel })}{' '}
          <span className="font-mono text-[var(--text-strong)]">{fmtInt(dataset.insertedCount)}</span> {t('data.ds.confirm3')}
        </p>
        {error && <p className="text-xs text-[var(--negative)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-3 py-1.5 text-xs rounded-md border border-[var(--border)] text-[var(--text)]/85 hover:bg-[var(--surface-2)] disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="px-3 py-1.5 text-xs rounded-md bg-[var(--negative)] text-white hover:bg-[#DC2626] disabled:opacity-50"
          >
            {busy ? t('data.ds.deleting') : t('data.ds.deleteBtn')}
          </button>
        </div>
      </div>
    </div>
  );
}
