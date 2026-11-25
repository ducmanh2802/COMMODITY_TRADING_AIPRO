import { useState } from 'react';
import { ArrowUpRight, Calculator } from 'lucide-react';
import { useTerminal } from '../../../contexts/TerminalContext';
import { useI18n, type TKey } from '../../../i18n';
import { Card } from '../../ui/Card';
import { SectionHeader } from '../../ui/SectionHeader';
import { Exercise } from './Calculators';
import { InfoTip } from '../today/InfoTip';
import { SANDBOX_EXERCISES } from './academyUtils';
import type { CalculatorId } from './curriculum/types';

export function PracticeSandbox({ onOpenLesson }: { onOpenLesson: (lessonId: string) => void }) {
  const { t } = useI18n();
  const { instruments, loading } = useTerminal();
  const [selected, setSelected] = useState<CalculatorId>('order');

  const activeMeta = SANDBOX_EXERCISES.find((ex) => ex.id === selected) ?? SANDBOX_EXERCISES[0];

  return (
    <section aria-label={t('ac.sandbox.title')} data-testid="academy-sandbox" className="space-y-4">
      <SectionHeader title={<span className="inline-flex items-center gap-1">{t('ac.sandbox.title')}<InfoTip text={t('ac.sandbox.subtitle')} /></span>} />

      <div className="grid gap-4 lg:grid-cols-[17rem_1fr] items-start">
        <nav
          aria-label={t('ac.sandbox.title')}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-1.5"
        >
          {SANDBOX_EXERCISES.map((ex) => {
            const active = ex.id === selected;
            return (
              <button
                key={ex.id}
                type="button"
                aria-pressed={active}
                data-testid={`sandbox-select-${ex.id}`}
                onClick={() => setSelected(ex.id)}
                className={`w-full text-left rounded-lg border px-3 py-2.5 min-h-10 transition-colors ${
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-strong)]'
                    : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--accent)]/60'
                }`}
              >
                <span className="flex items-center gap-2 text-xs font-semibold">
                  <Calculator className="w-3.5 h-3.5 shrink-0 text-[var(--accent-text)]" aria-hidden="true" />
                  <span className="truncate">{t(`ac.sandbox.ex.${ex.id}` as TKey)}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <Card className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2 pb-3 border-b border-[var(--border)]">
            <div className="min-w-0">
              <h3 className="flex items-center gap-1 text-base font-semibold text-[var(--text-strong)]">
                {t(`ac.sandbox.ex.${activeMeta.id}` as TKey)}
                <InfoTip text={t(`ac.sandbox.ex.${activeMeta.id}.desc` as TKey)} />
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onOpenLesson(activeMeta.lessonId)}
              className="inline-flex items-center gap-1 min-h-9 px-3 py-1.5 rounded-md border border-[var(--border)] hover:border-[var(--accent)] text-xs font-medium text-[var(--accent-text)] whitespace-nowrap shrink-0"
            >
              <span>{t('ac.sandbox.openLesson')}</span>
              <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            </button>
          </div>

          <Exercise id={selected} instruments={instruments} loading={loading} />
        </Card>
      </div>
    </section>
  );
}
