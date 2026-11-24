import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, CircleCheck, CircleSlash, Clock } from 'lucide-react';
import { useTerminal } from '../../contexts/TerminalContext';
import { fmtDate, useI18n, type TFunction } from '../../i18n';
import type { TKey } from '../../i18n/vi';
import {
  buildAllSessionCountdowns,
  type SessionCountdownFilter,
  type SessionCountdownItem,
} from '../../shared/utils/sessionCountdown';
import { Card } from '../ui/Card';
import { SectionHeader } from '../ui/SectionHeader';

export interface SessionCountdownTimerProps {
  /** 'dashboard' renders concise summary + grid; 'full' includes full Vietnam schedule lines & city offsets. */
  variant?: 'dashboard' | 'full';
  /** Optional navigation handler to open World Markets tab (shown when variant='dashboard'). */
  onOpenWorldMarkets?: () => void;
}

const FILTER_OPTIONS: readonly SessionCountdownFilter[] = ['ALL', 'OPEN', 'CLOSED'];

function dayRange(t: TFunction, days: number[]): string {
  const name = (d: number) => t(`wd.day.${d}` as TKey);
  const order = [1, 2, 3, 4, 5, 6, 0].filter((d) => days.includes(d));
  const runs: number[][] = [];
  for (const d of order) {
    const last = runs[runs.length - 1];
    const idx = (x: number) => [1, 2, 3, 4, 5, 6, 0].indexOf(x);
    if (last && idx(last[last.length - 1]) + 1 === idx(d)) last.push(d);
    else runs.push([d]);
  }
  return runs.map((r) => (r.length > 1 ? `${name(r[0])}–${name(r[r.length - 1])}` : name(r[0]))).join(', ');
}

function offsetText(t: TFunction, tz: string, h: number): string {
  const city = t(`wd.city.${tz}` as TKey);
  if (h === 0) return t('wd.clock.offsetSame', { city });
  return h > 0 ? t('wd.clock.offset', { city, h }) : t('wd.clock.offsetAhead', { city, h: Math.abs(h) });
}

function formatCountdownText(t: TFunction, item: SessionCountdownItem): string {
  const { days, hms } = item.countdown;
  if (days > 0) {
    return `${t('wd.timer.days', { d: days })} ${hms}`;
  }
  return hms;
}

function SessionCard({
  item,
  variant,
  lang,
  onOpenInstrument,
}: {
  item: SessionCountdownItem;
  variant: 'dashboard' | 'full';
  lang: 'vi' | 'en';
  onOpenInstrument: (symbol: string) => void;
}) {
  const { t } = useI18n();
  const countdownText = formatCountdownText(t, item);
  const transitionLabel = t(item.open ? 'wd.timer.closesIn' : 'wd.timer.opensIn');
  const nextDayLabel =
    item.nextChangeVietnamWeekday !== null ? t(`wd.day.${item.nextChangeVietnamWeekday}` as TKey) : '';

  return (
    <Card
      className="flex flex-col gap-3"
      data-testid={`session-card-${item.id}`}
      data-open={String(item.open)}
    >
      {/* Header: Exchange + Status */}
      <div className="space-y-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[var(--text-strong)] truncate">
              {t(`wd.ex.${item.id}` as TKey)}
            </div>
            <div className="text-xs text-[var(--muted)] leading-snug min-h-[2rem]">
              {t(`wd.scope.${item.id}` as TKey)}
            </div>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-medium shrink-0 whitespace-nowrap ${
              item.open ? 'text-[var(--positive)]' : 'text-[var(--muted)]'
            }`}
          >
            {item.open ? (
              <CircleCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <CircleSlash className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            )}
            {item.open ? t('wd.clock.open') : t('wd.clock.closed')}
          </span>
        </div>
      </div>

      {/* Primary Countdown Readout */}
      <div className="space-y-0.5 pt-2 border-t border-[var(--border)]/60">
        <div
          className={`text-xs font-medium ${
            item.imminent ? 'text-[var(--warning)]' : 'text-[var(--muted)]'
          }`}
        >
          {transitionLabel}
        </div>
        <div
          data-testid={`session-countdown-${item.id}`}
          className={`text-xl font-semibold font-mono tabular-nums tracking-tight ${
            item.imminent ? 'text-[var(--warning)]' : 'text-[var(--text-strong)]'
          }`}
        >
          {countdownText}
        </div>
        {item.nextChangeVietnamHm && (
          <div className="text-xs text-[var(--muted)] tabular-nums">
            {t('wd.timer.atVn', { time: item.nextChangeVietnamHm, day: nextDayLabel })}
          </div>
        )}
      </div>

      {/* Vietnam Session Hours & Interactive Commodity Links */}
      <div className="mt-auto space-y-2 pt-2 border-t border-[var(--border)]/60">
        <ul className="space-y-0.5 text-xs tabular-nums text-[var(--text)]">
          {item.vietnamRanges.map((r) => (
            <li key={`${r.start}-${r.end}`} className="flex flex-wrap gap-x-1.5">
              <span className="text-[var(--muted)]">{t('wd.clock.dayLabel', { days: dayRange(t, r.days) })}</span>
              <span className="text-[var(--text-strong)] font-mono">
                {r.start}–{r.end}
                {r.endsNextDay ? t('wd.clock.nextDay') : ''}
              </span>
            </li>
          ))}
        </ul>

        {variant === 'full' && (
          <div className="text-[11px] text-[var(--muted)]">
            {offsetText(t, item.tz, item.offsetFromVietnamHours)}
          </div>
        )}

        {item.holidayToday && (
          <div className="text-[11px] text-[var(--warning)] leading-snug">
            {t('wd.timer.holiday', {
              name: lang === 'vi' ? item.holidayToday.nameVi : item.holidayToday.nameEn,
            })}
          </div>
        )}

        {item.symbols.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {item.symbols.map((sym) => (
              <button
                key={sym}
                type="button"
                onClick={() => onOpenInstrument(sym)}
                aria-label={t('wd.timer.openSymbol', { sym })}
                className="inline-flex items-center justify-center min-h-8 px-2.5 rounded-md border border-[var(--border)] bg-[var(--bg)] hover:border-[var(--accent)] hover:text-[var(--accent-text)] text-xs font-mono text-[var(--text)] transition-colors whitespace-nowrap shrink-0"
              >
                {sym}
              </button>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

export function SessionCountdownTimer({ variant = 'dashboard', onOpenWorldMarkets }: SessionCountdownTimerProps) {
  const { t, lang } = useI18n();
  const { openInstrumentIn } = useTerminal();
  const [now, setNow] = useState<Date>(() => new Date());
  const [filter, setFilter] = useState<SessionCountdownFilter>('ALL');

  useEffect(() => {
    const syncNow = () => setNow(new Date());
    const intervalId = window.setInterval(syncNow, 1000);
    const onVisChange = () => {
      if (!document.hidden) syncNow();
    };
    document.addEventListener('visibilitychange', onVisChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisChange);
    };
  }, []);

  const overview = useMemo(() => buildAllSessionCountdowns(now, filter), [now, filter]);

  const spotlightText = useMemo(() => {
    const target = overview.soonestChange;
    if (!target) return null;
    const exName = t(`wd.ex.${target.id}` as TKey);
    const formatted = formatCountdownText(t, target);
    return target.open
      ? t('wd.timer.nextClose', { ex: exName, time: formatted })
      : t('wd.timer.nextOpen', { ex: exName, time: formatted });
  }, [overview.soonestChange, t]);

  const filterCounts: Record<SessionCountdownFilter, number> = {
    ALL: overview.totalCount,
    OPEN: overview.openCount,
    CLOSED: overview.closedCount,
  };

  return (
    <section
      aria-label={t('wd.timer.title')}
      data-testid="session-countdown-timer"
      className="space-y-3"
    >
      <SectionHeader
        title={t('wd.timer.title')}
        subtitle={t('wd.timer.subtitle')}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <span
              data-testid="vietnam-live-clock"
              className="inline-flex items-center gap-1.5 text-xs font-mono tabular-nums text-[var(--text-strong)] whitespace-nowrap"
            >
              <Clock className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" aria-hidden="true" />
              <span>{overview.vietnamClockLabel}</span>
              <span className="text-[var(--muted)]" aria-hidden="true">·</span>
              <span className="text-[var(--muted)]">{fmtDate(overview.vietnamDateIso)}</span>
            </span>
            {onOpenWorldMarkets && (
              <button
                type="button"
                onClick={onOpenWorldMarkets}
                className="inline-flex items-center gap-1 min-h-9 px-2.5 rounded-md border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)] text-xs font-medium text-[var(--accent-text)] transition-colors whitespace-nowrap shrink-0"
              >
                <span>{t('wd.timer.openWorld')}</span>
                <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              </button>
            )}
          </div>
        }
      />

      {/* Filter Segmented Control + Unboxed Spotlight Metadata */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div
          role="group"
          aria-label={t('wd.timer.title')}
          className="inline-flex items-center gap-1 p-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] self-start max-w-full overflow-x-auto"
        >
          {FILTER_OPTIONS.map((opt) => {
            const active = filter === opt;
            return (
              <button
                key={opt}
                type="button"
                aria-pressed={active}
                data-testid={`session-filter-${opt}`}
                onClick={() => setFilter(opt)}
                className={`min-h-9 sm:min-h-8 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-[var(--accent-soft)] text-[var(--text-strong)]'
                    : 'text-[var(--muted)] hover:text-[var(--text-strong)]'
                }`}
              >
                {t(`wd.timer.filter.${opt}` as TKey, { n: filterCounts[opt] })}
              </button>
            );
          })}
        </div>

        {spotlightText && (
          <div
            data-testid="session-countdown-spotlight"
            className="text-xs text-[var(--muted)] tabular-nums"
          >
            {spotlightText}
          </div>
        )}
      </div>

      {/* Exchange Cards Grid */}
      {overview.sessions.length === 0 ? (
        <Card className="text-sm text-[var(--muted)]">{t('wd.timer.emptyFilter')}</Card>
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          {overview.sessions.map((item) => (
            <SessionCard
              key={item.id}
              item={item}
              variant={variant}
              lang={lang}
              onOpenInstrument={(sym) => openInstrumentIn(sym, 'instrument')}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-[var(--muted)]">{t('wd.clock.note')}</p>
    </section>
  );
}
