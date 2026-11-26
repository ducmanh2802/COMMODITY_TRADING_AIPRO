import { useEffect, useState, type ComponentProps } from 'react';
import { useT } from '../../../i18n';
import { loadLevel } from './curriculum/loader';
import type { Lesson } from './curriculum/types';
import { LessonPage } from './LessonPage';

type PageProps = Omit<ComponentProps<typeof LessonPage>, 'lesson'>;

/**
 * Lazy lesson route: this chunk holds LessonPage (figures, diagrams, quiz UI). The lesson body itself comes
 * from the per-level curriculum chunk, loaded here (and prefetched by LearnView when the page opens).
 */
export default function LessonRoute({ levelId, lessonId, ...page }: PageProps & { levelId: string; lessonId: string }) {
  const t = useT();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setLesson(null);
    setFailed(false);
    loadLevel(levelId)
      .then((level) => {
        const found = level.lessons.find((l) => l.id === lessonId);
        if (!alive) return;
        if (found) setLesson(found);
        else setFailed(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [levelId, lessonId]);

  if (lesson) return <LessonPage {...page} lesson={lesson} />;
  return (
    <div className="space-y-3 max-w-3xl" aria-busy={!failed}>
      <button type="button" onClick={page.onBack} className="text-xs text-[var(--accent-text)] hover:underline">
        {t('exam.back')}
      </button>
      <p className={`text-sm ${failed ? 'text-[var(--warning)]' : 'text-[var(--muted)]'}`} role="status" data-testid="lesson-loading">
        {failed ? t('ac.lesson.loadError') : t('ac.lesson.loading')}
      </p>
    </div>
  );
}
