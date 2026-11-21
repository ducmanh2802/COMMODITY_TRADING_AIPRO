import { useMemo } from 'react';
import { CalendarClock } from 'lucide-react';
import { fmtDate, useT } from '../../../i18n';
import type { InstrumentDefinition } from '../../../shared/types/instrument';
import { CALENDAR_WINDOW_DAYS, instrumentExpiry, positionReminder, readWatchKeys, relevantInstruments, todayIso } from './expiryReminders';
import { cardCls } from './paperUi';

function readWatchlistRaw(): string | null {
  try {
    return localStorage.getItem('ctap.watchlist');
  } catch {
    return null;
  }
}

const chip = 'inline-flex items-start gap-1.5 px-2 py-1 rounded-md border text-[11px] text-[var(--warning)] border-[var(--warning)]/50';

/** Roll reminder chip for an open position (null when no FND/LTD within 10 days). */
export function RollReminderChip({ inst }: { inst: InstrumentDefinition | undefined }) {
  const t = useT();
  const ev = useMemo(() => (inst ? positionReminder(inst.id, inst.exchangeSymbol, todayIso()) : null), [inst]);
  if (!ev) return null;
  const key = ev.kind === 'FND' ? (ev.daysLeft === 0 ? 'ex.chip.fndToday' : 'ex.chip.fnd') : ev.daysLeft === 0 ? 'ex.chip.ltdToday' : 'ex.chip.ltd';
  return (
    <span className={chip} role="status" title={t('ex.chip.note', { code: ev.contractCode, date: fmtDate(ev.date) })}>
      <CalendarClock className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden="true" />
      <span>{t(key, { n: ev.daysLeft })}</span>
    </span>
  );
}

interface Props {
  instruments: InstrumentDefinition[];
  heldIds: string[];
}

/** "Lịch đáo hạn": upcoming FND/LTD in the next 45 days for held + watched instruments. */
export function ExpiryCalendar({ instruments, heldIds }: Props) {
  const t = useT();
  const asOf = todayIso();
  const rows = useMemo(() => {
    const rel = relevantInstruments(instruments.filter((i) => i.enabled), heldIds, readWatchKeys(readWatchlistRaw()));
    return rel.map(({ inst, held }) => ({ inst, held, exp: instrumentExpiry(inst.id, inst.exchangeSymbol, asOf) }));
  }, [instruments, heldIds, asOf]);

  if (rows.length === 0) return null;
  const shown = rows.filter((r) => r.exp.events.length > 0 || r.exp.noCalendar || r.exp.fndUnavailable);

  return (
    <div className={cardCls}>
      <h2 className="text-sm font-semibold text-[var(--text-strong)] mb-1 flex items-center gap-2">
        <CalendarClock className="w-4 h-4 text-[var(--accent)]" aria-hidden="true" />
        {t('ex.title')}
      </h2>
      <p className="text-[11px] text-[var(--text)]/60 mb-2">{t('ex.intro', { days: CALENDAR_WINDOW_DAYS })}</p>
      {shown.length === 0 ? (
        <p className="text-xs text-[var(--text)]/65">{t('ex.none', { days: CALENDAR_WINDOW_DAYS })}</p>
      ) : (
        <ul className="space-y-2">
          {shown.map(({ inst, held, exp }) => {
            const link = exp.sourceUrl ?? (inst.specification.dataSource.startsWith('http') ? inst.specification.dataSource : null);
            return (
              <li key={inst.id} className="border border-[var(--border)] rounded-md p-2.5 text-xs space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-[var(--text-strong)]">{inst.productName}</span>
                  <span className="text-[var(--text)]/55 font-mono">{inst.exchangeSymbol}</span>
                  <span className="px-1.5 rounded-full border border-[var(--border)] text-[10px] text-[var(--text)]/70">{t(held ? 'ex.held' : 'ex.watched')}</span>
                </div>
                {exp.events.map((e) => (
                  <div key={`${e.contractCode}-${e.kind}`} className="flex flex-wrap items-center gap-x-3">
                    <span className="font-mono text-[var(--text)]/70">{e.contractCode}</span>
                    <span>{t(e.kind === 'FND' ? 'ex.fnd' : 'ex.ltd')}</span>
                    <span className="font-mono text-[var(--text-strong)]">{fmtDate(e.date)}</span>
                    <span className={e.daysLeft <= 10 ? 'text-[var(--warning)]' : 'text-[var(--text)]/65'}>{e.daysLeft === 0 ? t('ex.today') : t('ex.inDays', { n: e.daysLeft })}</span>
                    {!e.verified && <span className="text-[var(--text)]/50">({t('ex.unverified')})</span>}
                  </div>
                ))}
                {(exp.noCalendar || exp.fndUnavailable) && (
                  <p className="text-[var(--text)]/65">
                    {t(exp.noCalendar ? 'ex.noCalendar' : 'ex.noFnd')}{' '}
                    {link && (
                      <a href={link} target="_blank" rel="noopener noreferrer" className="text-[var(--accent-text)] underline">{t('ex.checkExchange')}</a>
                    )}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
