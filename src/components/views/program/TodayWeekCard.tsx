import { useTerminal } from '../../../contexts/TerminalContext';
import { useI18n, type TKey } from '../../../i18n';
import { Card } from '../../ui/Card';
import { taskLabel } from './ProgramCard';
import { useProgram } from './useProgram';

/** Compact "Tuần này" card for the Today panel. Hidden detail lives in the Academy. */
export function TodayWeekCard() {
  const { t } = useI18n();
  const { setActiveModule } = useTerminal();
  const model = useProgram();
  const open = () => setActiveModule('learn');
  if (!model.started || !model.info) {
    return (
      <Card as="section" aria-label={t('prog.title')} data-testid="today-week-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('prog.title')}</h2>
            <p className="text-xs text-[var(--muted)]">{t('prog.today.cta')}</p>
          </div>
          <button type="button" onClick={open} className="text-xs px-3 py-1.5 rounded-md border border-[var(--border)] hover:border-[var(--accent)]">
            {t('prog.today.go')}
          </button>
        </div>
      </Card>
    );
  }
  const wp = model.weeks[model.info.week - 1];
  const next = wp.tasks.filter((x) => !x.status.done).slice(0, 2);
  return (
    <Card as="section" aria-label={t('prog.today.title')} data-testid="today-week-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--text-strong)]">
            {t('prog.today.title')}: {t('prog.week', { week: wp.week })}
          </h2>
          <p className="text-xs text-[var(--muted)]">{t(`prog.w.${wp.week}` as TKey)}</p>
        </div>
        <button type="button" onClick={open} className="text-xs px-3 py-1.5 rounded-md border border-[var(--border)] hover:border-[var(--accent)]">
          {t('prog.today.go')}
        </button>
      </div>
      <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={wp.pct} aria-label={t('prog.weekPct', { week: wp.week, pct: wp.pct })} className="h-2 rounded-full overflow-hidden bg-[var(--surface-2)] mt-3">
        <div className="h-full bg-[var(--accent)]" style={{ width: `${wp.pct}%` }} />
      </div>
      {next.length === 0 ? (
        <p className="text-xs text-[var(--muted)] mt-2">{t('prog.today.allDone')}</p>
      ) : (
        <ul className="mt-2 space-y-0.5 text-xs text-[var(--text)] list-disc pl-4">
          {next.map((x) => (
            <li key={x.spec.id}>{taskLabel(t, x.spec, x.status)}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}
