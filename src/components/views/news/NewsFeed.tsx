import { useState } from 'react';
import { Newspaper } from 'lucide-react';
import { formatTimestampInZone } from '../../../shared/utils/time';
import { useT } from '../../../i18n';
import { TaggedNewsPanel } from './TaggedNewsPanel';
import { FeedHeader } from './FeedHeader';
import { RecordForm, codeLabel } from './RecordForm';
import { useFundamentalNews } from './useFundamentalNews';

/** Commodity news: tagged panel + sourced news list (first 10, then "show more") + manual entry. */
export function NewsFeed() {
  const t = useT();
  const { news, status, loading, refetch } = useFundamentalNews();
  const [showAll, setShowAll] = useState(false);

  return (
    <div className="space-y-6">
      <FeedHeader title={t('news.title.news')} status={status} onSynced={refetch} />
      <TaggedNewsPanel />
      <RecordForm initialKind="NEWS" onSaved={refetch} />
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] flex items-center gap-2">
          <Newspaper className="w-4 h-4 text-[var(--accent)]" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('news.list.title', { n: news.length })}</h2>
        </div>
        {loading ? (
          <div className="p-6 text-xs font-mono text-[var(--text)]/60">{t('news.list.loading')}</div>
        ) : news.length === 0 ? (
          <div className="p-6 text-xs font-mono text-[var(--warning)]">{t('news.list.empty')}</div>
        ) : (
          <div className="divide-y divide-[var(--border)]/70">
            {(showAll ? news : news.slice(0, 10)).map((n) => (
              <div key={n.id} className="p-4 space-y-1 text-xs">
                <details>
                  <summary className="cursor-pointer flex min-h-10 items-center justify-between gap-2">
                    <span className="font-semibold text-[var(--text-strong)] min-w-0">{n.headline}</span>
                    <span className="shrink-0 rounded-full border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-2 py-0.5 text-[var(--accent-text)]">{codeLabel('news.dir.', n.classification)}</span>
                  </summary>
                  <p className="mt-1 text-[var(--text)]/80">{n.summary}</p>
                </details>
                <p className="text-[11px] font-mono text-[var(--text)]/50">
                  {t('news.sourceLine', { source: n.source, time: formatTimestampInZone(n.publicationTimestamp, 'Asia/Ho_Chi_Minh') })}
                </p>
              </div>
            ))}
          </div>
        )}
        {news.length > 10 && !showAll && (
          <div className="px-4 py-3">
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="inline-flex min-h-10 items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] hover:bg-[var(--accent)] hover:text-white"
            >
              {t('drv.more')}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
