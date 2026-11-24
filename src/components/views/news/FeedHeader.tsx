import { useId, useState } from 'react';
import { CloudDownload, Info } from 'lucide-react';
import { useTerminal, type SyncOutcomeItem } from '../../../contexts/TerminalContext';
import type { DataQualityStatus } from '../../../shared/types/market';
import { DataStatusBadge } from '../../common/DataStatusBadge';
import { useT } from '../../../i18n';

type SyncChip = { id: string; label: string; ok: boolean; message: string };

/** Title + provider-sync button + data status badge shared by NewsFeed and MacroPanel. */
export function FeedHeader({
  title,
  status,
  onSynced,
}: {
  title: string;
  status: DataQualityStatus;
  onSynced: () => void | Promise<void>;
}) {
  const t = useT();
  const { syncProviderFeeds, syncing, timeframe } = useTerminal();
  const [syncChips, setSyncChips] = useState<SyncChip[] | null>(null);
  const [syncFailed, setSyncFailed] = useState(false);
  const [info, setInfo] = useState(false);
  const infoId = useId();

  const handleSync = async () => {
    setSyncChips(null);
    setSyncFailed(false);
    const res = await syncProviderFeeds({ timeframe });
    await onSynced();
    if (!res) {
      setSyncFailed(true);
      return;
    }
    const chip = (o: SyncOutcomeItem | undefined, id: string, label: string): SyncChip => ({
      id,
      label,
      ok: Boolean(o && o.status === 'CONNECTED'),
      message: o?.message ?? t('common.na'),
    });
    setSyncChips([
      chip(res.outcomes.find((o) => o.providerId === 'EIA_ENERGY'), 'eia', 'EIA'),
      chip(res.outcomes.find((o) => o.providerId === 'USDA_QUICKSTATS'), 'usda', 'USDA'),
    ]);
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-[var(--text-strong)] tracking-tight">{title}</h2>
          <p className="mt-1 flex items-center gap-1 text-sm text-[var(--text)]/65">
            <span>{t('pulse.feed.sub')}</span>
            <button
              type="button"
              aria-label={t('pulse.feed.info')}
              aria-expanded={info}
              aria-controls={infoId}
              onClick={() => setInfo((v) => !v)}
              className="shrink-0 w-10 h-10 -my-2.5 flex items-center justify-center text-[var(--muted)] hover:text-[var(--text-strong)]"
            >
              <Info className="w-4 h-4" aria-hidden="true" />
            </button>
          </p>
          {info && (
            <p id={infoId} role="note" className="mt-1 text-xs leading-relaxed text-[var(--text)] bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-2.5">
              {t('news.subtitle')}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => void handleSync()}
            disabled={syncing}
            className="inline-flex min-h-10 items-center gap-1.5 px-3 bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-white text-xs font-medium rounded-md disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <CloudDownload className={`w-3.5 h-3.5 ${syncing ? 'animate-pulse' : ''}`} aria-hidden="true" />
            <span>{syncing ? t('news.syncing') : t('news.sync')}</span>
          </button>
          <DataStatusBadge status={status} />
        </div>
      </div>
      {syncFailed && (
        <div role="status" className="text-xs">
          <span className="inline-flex rounded-full border border-[var(--warning)]/40 px-2 py-0.5 text-[var(--warning)]">{t('news.err.sync')}</span>
        </div>
      )}
      {syncChips && (
        <div role="status" className="space-y-1 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            {syncChips.map((c) => (
              <span
                key={c.id}
                className={`inline-flex rounded-full border px-2 py-0.5 ${c.ok ? 'border-[var(--accent)]/40 text-[var(--accent-text)]' : 'border-[var(--warning)]/40 text-[var(--warning)]'}`}
              >
                {c.label} · {c.ok ? t('pulse.feed.ok') : t('pulse.mc.noData')}
              </span>
            ))}
          </div>
          <details>
            <summary className="cursor-pointer inline-flex min-h-10 items-center text-[11px] text-[var(--muted)] hover:text-[var(--text)]">{t('pulse.mc.details')}</summary>
            <ul className="mt-1 space-y-0.5 text-[11px] font-mono text-[var(--text)]/80 break-words">
              {syncChips.map((c) => (
                <li key={c.id}>
                  {c.label}: {c.message}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </>
  );
}
