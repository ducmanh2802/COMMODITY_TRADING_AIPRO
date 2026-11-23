import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { useTerminal } from '../../contexts/TerminalContext';
import { fmtDateTime, useT } from '../../i18n';
import { closenessPct, distancePct } from '../../shared/watchlist/watchlist';
import { DataStatusBadge } from '../common/DataStatusBadge';
import { EmptyState } from '../ui/EmptyState';
import { TelegramCard } from './TelegramCard';
import { WatchEditor } from './WatchButton';
import { deleteWatchItem, useWatchlist } from './watchlistStore';
import { useWatchMeta } from './useWatchMeta';

/** "Danh sách theo dõi": personal watchlist rows with price, distance-to-zone bar, note and status chip. */
export function WatchlistPanel() {
  const t = useT();
  const { items } = useWatchlist();
  const { quotesBySymbol, openInstrumentIn } = useTerminal();
  const { nameOf, fmtPrice, zoneLabel } = useWatchMeta();
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-[var(--text-strong)]">{t('wl.panel.title')}</h2>
        <p className="text-sm text-[var(--muted)]">{t('wl.panel.subtitle')}</p>
      </div>
      {items.length === 0 ? (
        <EmptyState title={t('wl.panel.emptyTitle')} description={t('wl.panel.emptyDesc')} />
      ) : (
        <ul className="space-y-2">
          {items.map((it) => {
            const q = quotesBySymbol[it.instrumentId];
            const price = q && q.price !== null ? q.price : null;
            const dist = it.zone && price !== null ? distancePct(price, it.zone) : null;
            const inZone = dist === 0;
            const name = nameOf(it.instrumentId);
            return (
              <li key={it.instrumentId} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <button
                    type="button"
                    onClick={() => openInstrumentIn(it.instrumentId, 'instrument')}
                    aria-label={t('wl.row.open', { name })}
                    className="font-semibold text-[var(--text-strong)] hover:underline text-left min-h-[36px]"
                  >
                    {name} <span className="text-xs font-normal text-[var(--muted)]">{it.instrumentId}</span>
                  </button>
                  <span className="tabular-nums text-sm text-[var(--text-strong)]">{price !== null ? fmtPrice(price) : <span className="text-[var(--muted)]">{t('wl.row.noPrice')}</span>}</span>
                  {q && <DataStatusBadge status={q.status} compact sourceQuality={q.sourceQuality} delayMinutes={q.delayMinutes} kind={q.kind} />}
                  <span className="ml-auto flex gap-1">
                    <button type="button" onClick={() => setEditing(editing === it.instrumentId ? null : it.instrumentId)} aria-label={t('wl.row.edit')} title={t('wl.row.edit')} className="w-9 h-9 grid place-items-center rounded-lg border border-[var(--border)] text-[var(--text)]">
                      <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => deleteWatchItem(it.instrumentId)} aria-label={t('wl.row.delete')} title={t('wl.row.delete')} className="w-9 h-9 grid place-items-center rounded-lg border border-[var(--border)] text-[var(--negative)]">
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </span>
                </div>
                {it.zone ? (
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text)]">
                      <span>{zoneLabel(it.zone)}</span>
                      {dist !== null && (
                        <span
                          className="px-2 py-0.5 rounded-full border text-[11px] font-semibold"
                          style={inZone ? { color: 'var(--warning)', borderColor: 'var(--warning)' } : { color: 'var(--muted)', borderColor: 'var(--border)' }}
                        >
                          {inZone ? t('wl.row.inZone') : t('wl.row.away', { pct: dist.toFixed(1) })}
                        </span>
                      )}
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--surface-2)]" role="presentation">
                      <div className="h-full rounded-r-[4px]" style={{ width: `${closenessPct(dist)}%`, background: inZone ? 'var(--series-1)' : 'var(--series-other)' }} />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-[var(--muted)]">{t('wl.row.noZone')}</p>
                )}
                {it.note && <p className="text-sm text-[var(--text)] break-words">{it.note}</p>}
                {it.lastTriggeredAt && <p className="text-[11px] text-[var(--muted)]">{t('wl.row.triggered', { v: fmtDateTime(it.lastTriggeredAt) })}</p>}
                {editing === it.instrumentId && <WatchEditor symbol={it.instrumentId} item={it} onClose={() => setEditing(null)} />}
              </li>
            );
          })}
        </ul>
      )}
      <TelegramCard />
    </div>
  );
}
