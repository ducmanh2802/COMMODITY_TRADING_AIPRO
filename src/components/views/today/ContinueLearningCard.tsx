import { useMemo } from 'react';
import { useTerminal } from '../../../contexts/TerminalContext';
import { useT } from '../../../i18n';
import { sendAcademyIntent } from '../../common/palette/paletteBridge';
import { Card } from '../../ui/Card';
import { CURRICULUM_INDEX, LESSON_META_BY_ID } from '../learn/curriculum/meta';
import { useAcademyProgress } from '../learn/progress';
import { dueItems, loadReview } from '../learn/review';
import { computeContinue } from './continueMath';

const btn = 'min-h-10 px-4 py-2 rounded-md text-sm font-medium';

/** "Học tiếp": next unfinished lesson, level progress, due review cards. Light index only (no lesson bodies). */
export function ContinueLearningCard() {
  const t = useT();
  const { setActiveModule } = useTerminal();
  const { progress } = useAcademyProgress();
  const st = useMemo(() => computeContinue(CURRICULUM_INDEX, progress.lessons), [progress.lessons]);
  const due = useMemo(() => dueItems(loadReview(), Date.now()).filter((i) => LESSON_META_BY_ID.has(i.lessonId)).length, []);
  if (!st) return null;

  const openLesson = (id: string) => {
    setActiveModule('learn');
    sendAcademyIntent({ lessonId: id });
  };
  const openReview = () => {
    setActiveModule('learn');
    sendAcademyIntent({ tab: 'lessons' });
  };
  const pct = st.total > 0 ? Math.round((st.done / st.total) * 100) : 0;
  const line =
    st.kind === 'complete'
      ? t('tdcont.allDone')
      : st.kind === 'start'
        ? t('tdcont.start', { title: st.title })
        : t('tdcont.next', { title: st.title });

  return (
    <Card as="section" aria-label={t('tdcont.title')} data-testid="today-continue">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 basis-60">
          <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('tdcont.title')}</h2>
          <p className="text-sm text-[var(--text)] break-words mt-0.5">{line}</p>
          <div className="mt-2 flex items-center gap-2">
            <div
              className="h-1.5 flex-1 rounded-full bg-[var(--surface-3)] overflow-hidden"
              role="progressbar"
              aria-label={t('tdcont.progress', { n: st.levelNumber })}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
            >
              <div className="h-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs text-[var(--muted)] shrink-0">{t('tdcont.level', { n: st.levelNumber, done: st.done, total: st.total })}</span>
          </div>
          {due > 0 && <p className="text-xs text-[var(--warning)] mt-1.5">{t('tdcont.due', { n: due })}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {st.kind !== 'complete' && (
            <button
              type="button"
              data-testid="today-continue-go"
              onClick={() => openLesson(st.lessonId)}
              className={`${btn} bg-[var(--accent)] text-[var(--on-accent)]`}
            >
              {st.kind === 'start' ? t('tdcont.begin') : t('tdcont.resume')}
            </button>
          )}
          {(due > 0 || st.kind === 'complete') && (
            <button
              type="button"
              data-testid="today-continue-review"
              onClick={openReview}
              className={`${btn} border border-[var(--border)] text-[var(--text-strong)] hover:border-[var(--accent)]`}
            >
              {t('tdcont.review')}
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}
