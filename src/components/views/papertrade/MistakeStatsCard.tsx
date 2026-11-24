import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useT, type TKey } from '../../../i18n';
import { computeMonthMistakes, shiftMonth, vnMonthKey, type MistakeStatTrade } from './mistakeStats';
import { cardCls, fmtVnd } from './paperUi';

const navBtn = 'inline-flex h-10 w-10 items-center justify-center rounded-md border border-[var(--border)] disabled:opacity-40';

/** "Lỗi hay gặp tháng này": per-month mistake counts, attributed loss and top-3. */
export function MistakeStatsCard({ trades }: { trades: MistakeStatTrade[] }) {
  const t = useT();
  const thisMonth = vnMonthKey(Date.now());
  const [month, setMonth] = useState(thisMonth);
  const s = useMemo(() => computeMonthMistakes(trades, month), [trades, month]);
  const [y, m] = month.split('-');
  const max = s.rows[0]?.count ?? 1;

  return (
    <section className={`${cardCls} space-y-3 min-w-0`} aria-labelledby="mk-stats-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="mk-stats-title" className="text-sm font-semibold text-[var(--text-strong)]">{t('mk.stats.title')}</h3>
        <div className="flex items-center gap-1">
          <button type="button" className={navBtn} aria-label={t('mk.stats.prev')} onClick={() => setMonth(shiftMonth(month, -1))}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="px-2 text-xs font-mono text-[var(--text-strong)]" aria-live="polite">{t('mk.stats.month', { month: `${m}/${y}` })}</span>
          <button type="button" className={navBtn} aria-label={t('mk.stats.next')} disabled={month >= thisMonth} onClick={() => setMonth(shiftMonth(month, 1))}>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {s.taggedTrades === 0 ? (
        <p className="text-xs text-[var(--text)]/65">{t('mk.stats.empty')}</p>
      ) : (
        <>
          <p className="text-xs text-[var(--text)]/70">{t('mk.stats.summary', { tagged: s.taggedTrades, n: s.trades, loss: fmtVnd(s.attributedLossVnd) })}</p>
          <div>
            <h4 className="text-xs font-semibold text-[var(--text-strong)] mb-1.5">{t('mk.stats.top')}</h4>
            <ol className="space-y-2">
              {s.top3.map((r, i) => (
                <li key={r.tag} className="text-xs min-w-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-[var(--text-strong)]">{i + 1}. {t(`mk.tag.${r.tag}` as TKey)}</span>
                    <span className="font-mono text-[var(--text)]/75">
                      {t('mk.stats.count', { n: r.count })} · <span className="text-[var(--negative)]">{t('mk.stats.loss', { loss: fmtVnd(Math.round(r.lossVnd)) })}</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-[var(--border)]" aria-hidden="true">
                    <div className="h-full rounded-full bg-[var(--warning)]" style={{ width: `${Math.round((r.count / max) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ol>
          </div>
          {s.rows.length > 3 && (
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t('mk.stats.title')}>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[var(--text)]/55">
                    <th className="py-1 pr-3">{t('mk.stats.col.tag')}</th>
                    <th className="pr-3">{t('mk.stats.col.count')}</th>
                    <th>{t('mk.stats.col.loss')}</th>
                  </tr>
                </thead>
                <tbody>
                  {s.rows.map((r) => (
                    <tr key={r.tag} className="border-t border-[var(--border)]">
                      <td className="py-1 pr-3 text-[var(--text-strong)]">{t(`mk.tag.${r.tag}` as TKey)}</td>
                      <td className="pr-3 font-mono">{r.count}</td>
                      <td className="font-mono">{fmtVnd(Math.round(r.lossVnd))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[11px] text-[var(--text)]/55">{t('mk.stats.note')}</p>
        </>
      )}
    </section>
  );
}
