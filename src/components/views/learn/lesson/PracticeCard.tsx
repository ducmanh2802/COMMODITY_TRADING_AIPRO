import { useTerminal } from '../../../../contexts/TerminalContext';
import { useT } from '../../../../i18n';
import { sendAcademyIntent } from '../../../common/palette/paletteBridge';
import { Card } from '../../../ui/Card';
import { PRACTICE_LABEL, practiceFor, type PracticeTarget } from '../curriculum/practice';

/** "Thực hành ngay": 1-2 buttons to existing tools that match the lesson. Renders nothing when there is no good match. */
export function PracticeCard({ lessonId }: { lessonId: string }) {
  const t = useT();
  const { setActiveModule } = useTerminal();
  const targets = practiceFor(lessonId);
  if (targets.length === 0) return null;
  const go = (tg: PracticeTarget) => {
    if (tg.to === 'sandbox') {
      setActiveModule('learn');
      sendAcademyIntent({ tab: 'sandbox' });
    } else setActiveModule(tg.to);
  };
  return (
    <Card data-testid="lesson-practice">
      <p className="text-sm font-semibold text-[var(--text-strong)]">{t('prac.title')}</p>
      <p className="text-xs text-[var(--muted)] mt-0.5 mb-2.5">{t('prac.line')}</p>
      <div className="flex flex-wrap gap-2">
        {targets.map((tg) => (
          <button
            key={tg.to}
            type="button"
            data-testid={`practice-${tg.to}`}
            onClick={() => go(tg)}
            className="min-h-10 px-3.5 py-2 rounded-md border border-[var(--accent)]/50 bg-[var(--accent-soft)] text-xs font-medium text-[var(--accent-text)] hover:border-[var(--accent)]"
          >
            {t(PRACTICE_LABEL[tg.to])} →
          </button>
        ))}
      </div>
    </Card>
  );
}
