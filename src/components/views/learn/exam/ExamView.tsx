import { useState } from 'react';
import { useT } from '../../../../i18n';
import { Badge } from '../../../ui/Badge';
import { Card } from '../../../ui/Card';
import { CURRICULUM_INDEX } from '../curriculum/meta';
import type { LevelMeta } from '../curriculum/types';
import { downloadCertificate } from './certificateLoader';
import type { CertificateData } from './certificatePdf';
import {
  EXAM_PASS_PCT,
  examUnlocked,
  FINAL_EXAM_SIZE,
  FINAL_ID,
  LEVEL_EXAM_SIZE,
  loadExams,
  loadLearnerName,
  saveLearnerName,
  verificationCode,
  type ExamRecord,
  type ExamStore,
} from './examLogic';

export type ExamTarget = { kind: 'level'; levelId: string } | { kind: 'final' };

const btnCls = 'text-xs px-3 py-1.5 rounded-md border border-[var(--border)] hover:border-[var(--accent)]';
const primaryCls = 'text-xs px-3 py-1.5 rounded-md bg-[var(--accent)] text-white disabled:opacity-50';

export const today = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const levelShortTitle = (l: LevelMeta) => l.title.split(' — ').slice(1).join(' — ') || l.title;

/** Name input + "download certificate" for a passed exam record. */
export function CertificateAction({ examId, level, record }: { examId: string; level?: LevelMeta; record: ExamRecord }) {
  const t = useT();
  const [name, setName] = useState(loadLearnerName);
  const [state, setState] = useState<'idle' | 'busy' | 'error' | 'needName'>('idle');
  const download = async () => {
    const clean = name.trim();
    if (!clean) {
      setState('needName');
      return;
    }
    saveLearnerName(clean);
    setState('busy');
    const date = record.bestDate || today();
    const data: CertificateData = {
      appName: t('exam.cert.appName'),
      learnerName: clean,
      levelLabel: level ? t('exam.cert.levelLabel', { n: level.number }) : t('exam.cert.finalLabel', { n: CURRICULUM_INDEX.length }),
      levelTitle: level ? levelShortTitle(level) : t('exam.cert.finalTitle'),
      scorePct: record.best,
      correct: record.bestCorrect,
      total: record.bestTotal,
      date,
      code: verificationCode(clean, examId, record.best, date),
      labels: {
        heading: t('exam.cert.heading'),
        certifies: t('exam.cert.certifies'),
        completed: t('exam.cert.completed'),
        score: t('exam.cert.score'),
        date: t('exam.cert.date'),
        code: t('exam.cert.code'),
        disclaimer: t('exam.cert.disclaimer'),
      },
    };
    try {
      await downloadCertificate(data, `chung-nhan-${examId}.pdf`);
      setState('idle');
    } catch {
      setState('error');
    }
  };
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] text-[var(--muted)]" htmlFor={`cert-name-${examId}`}>
        {t('exam.cert.name')}
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id={`cert-name-${examId}`}
          type="text"
          value={name}
          maxLength={60}
          onChange={(e) => {
            setName(e.target.value);
            setState('idle');
          }}
          placeholder={t('exam.cert.namePh')}
          className="flex-1 min-w-[10rem] bg-[var(--surface)] border border-[var(--border)] rounded-md px-3 py-1.5 text-sm"
        />
        <button type="button" onClick={download} disabled={state === 'busy'} className={primaryCls}>
          {state === 'busy' ? t('exam.cert.busy') : t('exam.cert.download')}
        </button>
      </div>
      {state === 'error' && <p className="text-xs text-[var(--warning)]">{t('exam.cert.error')}</p>}
      {state === 'needName' && <p className="text-xs text-[var(--warning)]">{t('exam.cert.needName')}</p>}
    </div>
  );
}

/** Summary card shown at the end of a level (LearnView, last lesson) or for the final exam. */
export function ExamCard({
  target,
  doneLessons,
  totalLessons,
  onStart,
}: {
  target: ExamTarget;
  doneLessons: number;
  totalLessons: number;
  onStart: () => void;
}) {
  const t = useT();
  const isFinal = target.kind === 'final';
  const examId = isFinal ? FINAL_ID : target.levelId;
  const level = isFinal ? undefined : CURRICULUM_INDEX.find((l) => l.id === target.levelId);
  const [store] = useState<ExamStore>(loadExams);
  const rec = store[examId];
  const unlocked = examUnlocked(doneLessons, totalLessons) || rec?.passed === true;
  const size = isFinal ? FINAL_EXAM_SIZE : LEVEL_EXAM_SIZE;
  return (
    <Card tone="accent" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--text-strong)]">{isFinal ? t('exam.final.title') : t('exam.card.title')}</p>
        {rec?.passed && <Badge tone="accent">{t('exam.card.passed')}</Badge>}
      </div>
      <p className="text-xs text-[var(--muted)]">{isFinal ? t('exam.final.hint', { n: size, p: EXAM_PASS_PCT }) : t('exam.card.hint', { n: size, p: EXAM_PASS_PCT })}</p>
      {rec && <p className="text-xs">{t('exam.card.best', { pct: rec.best, a: rec.attempts })}</p>}
      {unlocked ? (
        <button type="button" onClick={onStart} className={primaryCls}>
          {rec ? t('exam.card.retry') : t('exam.card.start')}
        </button>
      ) : (
        <p className="text-xs text-[var(--warning)]">{isFinal ? t('exam.final.locked', { d: doneLessons, t: totalLessons }) : t('exam.card.locked', { d: doneLessons, t: totalLessons })}</p>
      )}
      {rec?.passed && <CertificateAction examId={examId} level={level} record={rec} />}
    </Card>
  );
}
