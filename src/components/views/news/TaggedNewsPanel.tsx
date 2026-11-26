import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useT } from '../../../i18n';
import { COMMODITY_VISUALS } from '../../../shared/data/commodityVisuals';
import { ImpactBadge, newsTime, useTaggedNews } from './newsShared';

function chipLabel(id: string): string {
  return COMMODITY_VISUALS[id]?.nameVi ?? id.split(':')[1] ?? id;
}

/** T91: news list with instrument chips (client-side filter over one fetch) and impact badges. */
export function TaggedNewsPanel() {
  const t = useT();
  const [sel, setSel] = useState<string | null>(null);
  const state = useTaggedNews(null, 100);
  const items = state.status === 'ok' ? state.data.items : [];
  const ids = [...new Set(items.flatMap((n) => n.instruments))].sort();
  const shown = sel ? items.filter((n) => n.instruments.includes(sel)) : items;

  return (
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden" data-testid="tagged-news">
      <div className="px-4 py-3 border-b border-[var(--border)] space-y-2">
        <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('nw.title')}</h2>
        <div role="group" aria-label={t('nw.filter.label')} className="flex flex-wrap gap-1.5">
          {[null, ...ids].map((id) => (
            <button
              key={id ?? 'all'}
              type="button"
              aria-pressed={sel === id}
              onClick={() => setSel(id)}
              className={`h-8 px-3 rounded-full text-xs border ${
                sel === id
                  ? 'bg-[var(--accent)] border-[var(--accent)] text-white font-semibold'
                  : 'border-[var(--border)] text-[var(--text)] hover:text-[var(--text-strong)]'
              }`}
            >
              {id ? chipLabel(id) : t('nw.filter.all')}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-[var(--faint)]">{t('nw.impact.note')}</p>
        {state.status === 'ok' && !state.data.aiSummaries && <p className="text-[11px] text-[var(--faint)]">{t('nw.noAi')}</p>}
      </div>
      {state.status === 'loading' ? (
        <div className="p-4 text-xs text-[var(--muted)] min-h-[24rem]">{t('nw.loading')}</div>
      ) : state.status === 'error' ? (
        <div className="p-4 text-xs text-[var(--warning)]">{t('nw.error')}</div>
      ) : shown.length === 0 ? (
        <div className="p-4 text-xs text-[var(--warning)]">{t('nw.empty')}</div>
      ) : (
        <ul className="divide-y divide-[var(--border)]/70">
          {shown.map((n) => (
            <li key={n.id} className="p-4 space-y-1.5 text-xs">
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-sm text-[var(--text-strong)]">{n.title}</span>
                <ImpactBadge impact={n.impact} />
              </div>
              {n.summaryVi ? (
                <p className="text-[var(--text)]">
                  {n.summaryVi}
                  <span className="block text-[11px] text-[var(--faint)]">{t('nw.ai.label')}</span>
                </p>
              ) : n.snippet ? (
                <p className="text-[var(--text)]/80">{n.snippet}</p>
              ) : null}
              <div className="flex flex-wrap items-center gap-1.5">
                {n.instruments.map((i) => (
                  <span key={i} className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] text-[var(--muted)]">
                    {chipLabel(i)}
                  </span>
                ))}
                <span className="text-[11px] font-mono text-[var(--faint)]">
                  {n.source} · {newsTime(n.publishedAt)}
                </span>
                {n.link && (
                  <a href={n.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 min-h-10 sm:min-h-0 text-[var(--accent)] hover:underline">
                    {t('nw.read')}
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="px-4 py-2 border-t border-[var(--border)] text-[11px] text-[var(--faint)]">{t('nw.src')}</p>
    </section>
  );
}
