import { ExternalLink } from 'lucide-react';
import { useT } from '../../../i18n';
import { Card } from '../../ui/Card';
import { ImpactBadge, newsTime, useTaggedNews } from '../news/newsShared';

/** T91: compact "Tin liên quan" card, latest 5 news items tagged for this instrument. */
export function RelatedNews({ symbol }: { symbol: string }) {
  const t = useT();
  const state = useTaggedNews(symbol, 5);
  const items = state.status === 'ok' ? state.data.items.slice(0, 5) : [];
  return (
    <Card className="space-y-2" aria-labelledby="ins-related-news" data-testid="related-news">
      <h2 id="ins-related-news" className="text-sm font-semibold text-[var(--text-strong)]">
        {t('nw.related.title')}
      </h2>
      {state.status === 'loading' ? (
        <p className="text-xs text-[var(--muted)]">{t('nw.loading')}</p>
      ) : state.status === 'error' ? (
        <p className="text-xs text-[var(--warning)]">{t('nw.error')}</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">{t('nw.related.empty')}</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]/70">
          {items.map((n) => (
            <li key={n.id} className="py-2 space-y-1">
              <div className="flex items-start justify-between gap-2">
                {n.link ? (
                  <a
                    href={n.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-[var(--text-strong)] hover:text-[var(--accent)] inline-flex items-start gap-1"
                  >
                    <span>{n.title}</span>
                    <ExternalLink className="w-3 h-3 mt-1 shrink-0" aria-hidden="true" />
                  </a>
                ) : (
                  <span className="text-sm text-[var(--text-strong)]">{n.title}</span>
                )}
                <ImpactBadge impact={n.impact} />
              </div>
              <p className="text-[11px] font-mono text-[var(--faint)]">
                {n.source} · {newsTime(n.publishedAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-[var(--faint)]">{t('nw.related.note')}</p>
    </Card>
  );
}
