import { lazy, Suspense, useState } from 'react';
import { useTerminal } from '../../../contexts/TerminalContext';
import { useI18n } from '../../../i18n';
import { loadProgram } from '../../../shared/program/threeMonth';
import { Card } from '../../ui/Card';

// The full weekly card needs the whole curriculum + the paper-trade store (Firestore). Load it only when the
// programme has been started, so the Today entry chunk stays free of Academy / Firestore code.
const TodayWeekProgress = lazy(() => import('./TodayWeekProgress').then((m) => ({ default: m.TodayWeekProgress })));

/** Card shown before the 12-week programme is started (also the shell while the full card loads). */
export function TodayWeekCta({ title, hint }: { title?: string; hint?: string }) {
  const { t } = useI18n();
  const { setActiveModule } = useTerminal();
  return (
    <Card as="section" aria-label={title ?? t('prog.title')} data-testid="today-week-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--text-strong)]">{title ?? t('prog.title')}</h2>
          <p className="text-xs text-[var(--muted)]">{hint ?? t('prog.today.cta')}</p>
        </div>
        <button type="button" onClick={() => setActiveModule('learn')} className="text-xs px-3 py-1.5 rounded-md border border-[var(--border)] hover:border-[var(--accent)]">
          {t('prog.today.go')}
        </button>
      </div>
    </Card>
  );
}

/** Compact "Tuần này" card for the Today panel. Hidden detail lives in the Academy. */
export function TodayWeekCard() {
  const { t } = useI18n();
  const [started] = useState(() => loadProgram().startDate !== null);
  if (!started) return <TodayWeekCta />;
  return (
    <Suspense fallback={<TodayWeekCta title={t('prog.today.title')} hint={' '} />}>
      <TodayWeekProgress />
    </Suspense>
  );
}
