import { useEffect, useMemo, useState } from 'react';
import { CalendarRange, Sparkles } from 'lucide-react';
import { fmtFixed, hasKey, useT, type TKey } from '../../../i18n';
import { computeWeeklyReview, reviewSummaryForAi, type ReviewLine, type WeeklyTrade } from './weeklyReview';
import { Stat, cardCls, fmtPct, fmtVnd, pnlColor, signedVnd } from './paperUi';

/** AI narratives keyed by the numbers sent, so re-renders / tab switches never re-call the server. */
const aiCache = new Map<string, string | null>();

function useAiNarrative(summary: Record<string, unknown> | null): string | null {
  const key = summary ? JSON.stringify(summary) : null;
  const [text, setText] = useState<string | null>(() => (key ? aiCache.get(key) ?? null : null));
  useEffect(() => {
    if (!key) return setText(null);
    if (aiCache.has(key)) return setText(aiCache.get(key) ?? null);
    setText(null);
    const ctrl = new AbortController();
    fetch('/api/paper/weekly-review', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ summary: JSON.parse(key) }), signal: ctrl.signal })
      .then(async (r) => {
        const j = r.ok ? ((await r.json()) as { narrative?: unknown }) : null;
        const n = j && typeof j.narrative === 'string' && j.narrative.trim() ? j.narrative.trim() : null;
        // 503 (no key) / errors: remember the miss so the formula text stays and we do not retry on every render.
        aiCache.set(key, n);
        if (!ctrl.signal.aborted) setText(n);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) aiCache.set(key, null);
      });
    return () => ctrl.abort();
  }, [key]);
  return text;
}

const fmtDay = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** "Tổng kết tuần tự động": formula review of this (or last) Vietnam ISO week of paper trades, optional AI comment. */
export function WeeklyReviewCard({ trades, startingCapitalVnd, instrumentName }: { trades: readonly WeeklyTrade[]; startingCapitalVnd: number; instrumentName?: (id: string) => string }) {
  const t = useT();
  const [offset, setOffset] = useState<0 | -1>(0);
  // 60s tick so the week window rolls over (e.g. Monday 00:00 Vietnam) without a remount.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const r = useMemo(() => computeWeeklyReview(trades, startingCapitalVnd, now, offset), [trades, startingCapitalVnd, now, offset]);
  const ai = useAiNarrative(r.trades > 0 ? reviewSummaryForAi(r) : null);
  // Mistake tags are codes (mistakeStats.ts); show their translated label when one exists.
  const tagLabel = (tag: string | number) => (hasKey(`mk.tag.${tag}`) ? t(`mk.tag.${tag}` as TKey) : String(tag));
  const line = (l: ReviewLine) => t(l.key as TKey, l.params && 'tag' in l.params ? { ...l.params, tag: tagLabel(l.params.tag) } : l.params);
  const flags = [
    r.flags.noStop > 0 && t('wr.flag.noStop', { n: r.flags.noStop }),
    r.flags.oversized > 0 && t('wr.flag.oversized', { n: r.flags.oversized }),
    r.flags.offPlan > 0 && t('wr.flag.offPlan', { n: r.flags.offPlan }),
    r.flags.eventTrades > 0 && t('wr.flag.event', { n: r.flags.eventTrades }),
  ].filter((x): x is string => typeof x === 'string');

  return (
    <section className={`${cardCls} space-y-3 min-w-0`} aria-labelledby="wr-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 id="wr-title" className="text-sm font-semibold text-[var(--text-strong)] flex items-center gap-2">
            <CalendarRange className="w-4 h-4 text-[var(--accent)] shrink-0" aria-hidden="true" />
            {t('wr.title')}
          </h2>
          <p className="text-[11px] text-[var(--text)]/60">{t('wr.range', { from: fmtDay(r.weekStart), to: fmtDay(r.weekEnd) })}</p>
        </div>
        <button
          type="button"
          onClick={() => setOffset(offset === 0 ? -1 : 0)}
          className="min-h-10 px-3 py-2 text-xs rounded-md border border-[var(--border)] text-[var(--accent-text)] hover:bg-[var(--accent)]/10"
        >
          {offset === 0 ? t('wr.prev') : t('wr.current')}
        </button>
      </div>

      {r.trades > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label={t('wr.trades')} value={String(r.trades)} />
          <Stat label={t('wr.winRate')} value={fmtPct(r.winRatePct, 0)} />
          <Stat label={t('wr.expectancy')} value={r.expectancyVnd === null ? '—' : signedVnd(r.expectancyVnd)} tone={r.expectancyVnd === null ? undefined : pnlColor(r.expectancyVnd)} />
          <Stat label={t('wr.stopPct')} value={fmtPct(r.stopLossPct, 0)} tone={r.stopLossPct !== null && r.stopLossPct < 100 ? 'text-[var(--warning)]' : undefined} />
        </div>
      )}

      <div>
        <h3 className="text-xs font-semibold text-[var(--text-strong)] mb-1">{t('wr.observations')}</h3>
        <ul className="list-disc pl-5 space-y-1 text-xs text-[var(--text)]/85">
          {r.observations.map((o) => <li key={o.key}>{line(o)}</li>)}
        </ul>
      </div>

      <div className="border border-[var(--accent)]/40 bg-[var(--accent)]/10 rounded-md p-2.5">
        <h3 className="text-xs font-semibold text-[var(--accent-text)] mb-1">{t('wr.focus')}</h3>
        <ul className="space-y-1 text-xs text-[var(--text-strong)]">
          {r.focus.map((f) => <li key={f.key}>→ {line(f)}</li>)}
        </ul>
      </div>

      {ai && (
        <div className="text-xs text-[var(--text)]/85 space-y-1">
          <p className="flex items-center gap-1.5 font-semibold text-[var(--text-strong)]">
            <Sparkles className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" aria-hidden="true" />
            {t('wr.ai')}
          </p>
          <p className="whitespace-pre-wrap break-words">{ai}</p>
        </div>
      )}

      {r.trades > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer min-h-10 flex items-center text-[var(--accent-text)]">{t('wr.details')}</summary>
          <div className="mt-2 space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label={t('wr.avgWin')} value={fmtVnd(r.avgWinVnd)} tone={r.avgWinVnd ? pnlColor(r.avgWinVnd) : undefined} />
              <Stat label={t('wr.avgLoss')} value={fmtVnd(r.avgLossVnd)} tone={r.avgLossVnd ? pnlColor(r.avgLossVnd) : undefined} />
              <Stat label={t('wr.maxDd')} value={`${fmtVnd(r.maxDrawdownVnd)} (${fmtFixed(r.maxDrawdownPct, 1)}%)`} />
              <Stat
                label={t('wr.biggestLoss')}
                value={r.biggestLoss ? signedVnd(r.biggestLoss.vnd) : '—'}
                tone={r.biggestLoss ? pnlColor(r.biggestLoss.vnd) : undefined}
                hint={r.biggestLoss && instrumentName ? instrumentName(r.biggestLoss.instrumentId) : undefined}
              />
            </div>
            <div>
              <p className="font-semibold text-[var(--text-strong)] mb-1">{t('wr.flags')}</p>
              {flags.length === 0 ? (
                <p className="text-[var(--text)]/70">{t('wr.flag.none')}</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {flags.map((f) => <li key={f} className="px-2 py-1 rounded-md border border-[var(--warning)]/50 bg-[var(--warning)]/10 text-[var(--warning)]">{f}</li>)}
                </ul>
              )}
            </div>
          </div>
        </details>
      )}

      <p className="text-[11px] text-[var(--text)]/55">{t('wr.disclaimer')}</p>
    </section>
  );
}
