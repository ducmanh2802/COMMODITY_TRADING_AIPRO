import { useState } from 'react';
import { Card } from '../../ui/Card';
import { useI18n } from '../../../i18n';
import { CURRICULUM } from './curriculum';
import { LEARN_GOALS, loadGoal, nextLesson, saveGoal, type LearnGoal } from './learnPaths';

const TITLES = new Map(CURRICULUM.flatMap((l) => l.lessons.map((x) => [x.id, x.title] as const)));

interface Props {
  lessons: Record<string, { done?: boolean } | undefined>;
  onOpen: (lessonId: string) => void;
}

export function LearnGoalCard({ lessons, onOpen }: Props) {
  const { t } = useI18n();
  const [goal, setGoal] = useState<LearnGoal | null>(() => loadGoal());
  const choose = (g: LearnGoal | null) => {
    setGoal(g);
    saveGoal(g);
  };

  if (!goal) {
    return (
      <Card tone="accent">
        <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('learngoal.title')}</h2>
        <p className="text-xs text-[var(--muted)] mt-0.5">{t('learngoal.hint')}</p>
        <div className="flex gap-2 flex-wrap mt-3">
          {LEARN_GOALS.map((g) => (
            <button key={g} type="button" onClick={() => choose(g)} className="text-xs px-3 py-1.5 rounded-md border border-[var(--border)] hover:border-[var(--accent)]">
              {t(`learngoal.${g}`)}
            </button>
          ))}
        </div>
      </Card>
    );
  }

  const s = nextLesson(goal, lessons);
  return (
    <Card tone="accent">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-semibold text-[var(--text-strong)]">{t('learngoal.path', { goal: t(`learngoal.${goal}`) })}</p>
        <button type="button" onClick={() => choose(null)} className="text-xs text-[var(--accent-text)] hover:underline">
          {t('learngoal.change')}
        </button>
      </div>
      <div className="flex items-center gap-3 mt-2">
        <div
          className="flex-1 h-2 rounded-full overflow-hidden bg-[var(--surface-2)]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={s.total}
          aria-valuenow={s.doneCount}
        >
          <div className="h-full bg-[var(--accent)]" style={{ width: `${(s.doneCount / s.total) * 100}%` }} />
        </div>
        <span className="text-xs font-mono text-[var(--muted)]">
          {s.doneCount}/{s.total}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap mt-2">
        <p className="text-xs text-[var(--muted)]">
          {s.nextId ? t('learngoal.step', { step: s.step, total: s.total, title: TITLES.get(s.nextId) ?? s.nextId }) : t('learngoal.done', { total: s.total })}
        </p>
        {s.nextId && (
          <button
            type="button"
            onClick={() => onOpen(s.nextId as string)}
            className="text-xs px-3 py-1.5 rounded-md border border-[var(--accent)] text-[var(--accent-text)] hover:bg-[var(--surface-2)]"
          >
            {t('learngoal.continue')}
          </button>
        )}
      </div>
    </Card>
  );
}
