import { useEffect, useMemo, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { fmtFixed, useT, type TKey } from '../../../i18n';
import { upcomingEventRisk, vietnamTimeLabel } from '../../../shared/events/eventRisk';

/** Drivers-calendar rows (/api/drivers/:symbol events.upcoming); only WASDE rows (official ESMIS dates) are used. */
export interface DriverEventRow {
  date: string;
  kind?: string;
}

/**
 * Gold, non-blocking banner on the paper order ticket: high-impact reports due in the next 24h for the selected
 * instrument (Vietnam time). Education only — never blocks the order and never advises buying/selling.
 */
export function EventRiskBanner({ symbol, upcoming }: { symbol: string | null | undefined; upcoming: readonly DriverEventRow[] | null }) {
  const t = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const wasdeOfficialDates = useMemo(() => (upcoming ? upcoming.filter((e) => e.kind === 'WASDE').map((e) => e.date) : null), [upcoming]);
  const items = useMemo(() => (symbol ? upcomingEventRisk({ symbol, nowMs: now, wasdeOfficialDates }) : []), [symbol, now, wasdeOfficialDates]);
  if (items.length === 0) return null;

  return (
    <div role="note" aria-label={t('er.aria')} className="border border-[var(--warning)]/50 bg-[var(--warning)]/10 rounded-md p-3 text-xs text-[var(--text-strong)] space-y-2 break-words">
      <p className="flex items-center gap-2 font-semibold text-[var(--warning)]">
        <CalendarClock className="w-4 h-4 shrink-0" aria-hidden="true" />
        {t('er.title')}
      </p>
      <ul className="space-y-1.5">
        {items.map((it) => (
          <li key={`${it.kind}-${it.atMs}`} className="min-w-0">
            <span className="font-semibold">{t(`er.kind.${it.kind}` as TKey)}</span>
            {it.scope === 'macro' && <span className="text-[var(--text)]/70"> · {t('er.scope.macro')}</span>}
            <span className="block text-[var(--text)]/80">
              {t('er.when', { time: vietnamTimeLabel(it.atMs), h: fmtFixed(it.hoursUntil, 1) })}
              {' · '}
              <a href={it.source} target="_blank" rel="noopener noreferrer" className={`underline ${it.status === 'estimated' ? 'text-[var(--warning)]' : 'text-[var(--accent-text)]'}`} title={t('er.source')}>
                {t(`er.status.${it.status}` as TKey)}
              </a>
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[var(--text)]/75">{t('er.note')}</p>
    </div>
  );
}
