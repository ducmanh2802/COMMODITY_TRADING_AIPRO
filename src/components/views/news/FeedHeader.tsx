import { useState } from 'react';
import { CloudDownload } from 'lucide-react';
import { useTerminal } from '../../../contexts/TerminalContext';
import type { DataQualityStatus } from '../../../shared/types/market';
import { DataStatusBadge } from '../../common/DataStatusBadge';
import { useT } from '../../../i18n';

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
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const handleSync = async () => {
    setSyncMessage(null);
    const res = await syncProviderFeeds({ timeframe });
    await onSynced();
    if (!res) {
      setSyncMessage(t('news.err.sync'));
      return;
    }
    const eia = res.outcomes.find((o) => o.providerId === 'EIA_ENERGY');
    const usda = res.outcomes.find((o) => o.providerId === 'USDA_QUICKSTATS');
    setSyncMessage(`EIA: ${eia?.message ?? t('common.na')} | USDA: ${usda?.message ?? t('common.na')}`);
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[var(--text-strong)] tracking-tight">{title}</h2>
          <p className="text-sm text-[var(--text)]/65 mt-1">{t('news.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => void handleSync()}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-white text-xs font-medium rounded-md disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <CloudDownload className={`w-3.5 h-3.5 ${syncing ? 'animate-pulse' : ''}`} aria-hidden="true" />
            <span>{syncing ? t('news.syncing') : t('news.sync')}</span>
          </button>
          <DataStatusBadge status={status} />
        </div>
      </div>
      {syncMessage && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-xs font-mono text-[var(--text)]/85">
          {syncMessage}
        </div>
      )}
    </>
  );
}
