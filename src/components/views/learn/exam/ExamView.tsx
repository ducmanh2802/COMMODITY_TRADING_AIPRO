import { useEffect, useMemo, useState } from 'react';
import { useT } from '../../../../i18n';
import { Badge } from '../../../ui/Badge';
import { Card } from '../../../ui/Card';
import { CURRICULUM } from '../curriculum';
import type { Level } from '../curriculum';
import { recordAnswerStored } from '../review';
import { downloadCertificate } from './certificateLoader';
import type { CertificateData } from './certificatePdf';
import {
  applyAttempt,
  drawExam,
  drawFinalExam,
  EXAM_MINUTES,
  EXAM_PASS_PCT,
  examUnlocked,
  FINAL_EXAM_MINUTES,
  FINAL_EXAM_SIZE,
  FINAL_ID,
  LEVEL_EXAM_SIZE,
  loadExams,
  loadLearnerName,
  saveExams,
  saveLearnerName,
  scoreExam,
  verificationCode,
  type ExamQuestion,
  type ExamRecord,
  type ExamStore,
} from './examLogic';

export type ExamTarget = { kind: 'level'; levelId: string } | { kind: 'final' };

const btnCls = 'text-xs px-3 py-1.5 rounded-md border border-[var(--border)] hover:border-[var(--accent)]';
const primaryCls = 'text-xs px-3 py-1.5 rounded-md bg-[var(--accent)] text-white disabled:opacity-50';

const today = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const levelShortTitle = (l: Level) => l.title.split(' — ').slice(1).join(' — ') || l.title;

/** Name input + "download certificate" for a passed exam record. */
function CertificateAction({ examId, level, record }: { examId: string; level?: Level; record: ExamRecord }) {
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
      levelLabel: level ? t('exam.cert.levelLabel', { n: level.number }) : t('exam.cert.finalLabel', { n: CURRICULUM.length }),
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
  const level = isFinal ? undefined : CURRICULUM.find((l) => l.id === target.levelId);
  const [store] = useState<ExamStore>(loadExams);
  const rec = store[examId];
  const unlocked = examUnlocked(doneLessons, totalLessons);
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

function fmtClock(sec: number) {
  const s = Math.abs(sec);
  return { m: String(Math.floor(s / 60)).padStart(2, '0'), s: String(s % 60).padStart(2, '0') };
}

/** Full-page exam: answer all, submit, per-question review, certificate. */
export function ExamRunner({ target, onExit }: { target: ExamTarget; onExit: () => void }) {
  const t = useT();
  const isFinal = target.kind === 'final';
  const examId = isFinal ? FINAL_ID : target.levelId;
  const level = isFinal ? undefined : CURRICULUM.find((l) => l.id === target.levelId);
  const [store, setStore] = useState<ExamStore>(loadExams);
  // Attempt number the current draw is seeded with; frozen until the learner retakes.
  const [attempt, setAttempt] = useState(() => loadExams()[examId]?.attempts ?? 0);
  const questions: ExamQuestion[] = useMemo(() => {
    if (isFinal) return drawFinalExam(CURRICULUM, attempt);
    return level ? drawExam(level, attempt) : [];
  }, [isFinal, level, attempt]);
  const limit = (isFinal ? FINAL_EXAM_MINUTES : EXAM_MINUTES) * 60;

  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (submitted) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [submitted]);

  const answeredCount = answers.filter((a) => a !== null && a !== undefined).length;
  const remaining = limit - Math.floor((now - startedAt) / 1000);
  const score = submitted ? scoreExam(questions, answers) : null;

  const submit = () => {
    const sc = scoreExam(questions, answers);
    questions.forEach((qu, i) => recordAnswerStored(qu.lessonId, qu.question.q, answers[i] === qu.question.answer));
    const next = applyAttempt(store, examId, sc, today());
    saveExams(next);
    setStore(next);
    setSubmitted(true);
    window.scrollTo?.({ top: 0 });
  };

  const retry = () => {
    setAttempt(store[examId]?.attempts ?? attempt + 1);
    setAnswers([]);
    setSubmitted(false);
    setStartedAt(Date.now());
    setNow(Date.now());
    window.scrollTo?.({ top: 0 });
  };

  const title = isFinal ? t('exam.final.title') : `${t('exam.card.title')}: ${level?.title ?? ''}`;
  const clock = fmtClock(remaining);

  return (
    <div className="space-y-4 max-w-3xl">
      <button type="button" onClick={onExit} className="text-xs text-[var(--accent-text)] hover:underline">
        {t('exam.back')}
      </button>
      <h1 className="text-lg font-semibold text-[var(--text-strong)]">{title}</h1>

      {!submitted && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
          <span className="text-xs text-[var(--muted)]">{t('exam.progress', { a: answeredCount, n: questions.length })}</span>
          <span className={`text-xs font-mono ${remaining < 0 ? 'text-[var(--warning)]' : 'text-[var(--text-strong)]'}`} role="timer">
            {remaining >= 0 ? t('exam.timer', clock) : t('exam.timer.over', { m: Math.max(1, Math.floor(-remaining / 60)) })}
          </span>
        </div>
      )}

      {score && (
        <Card tone={score.passed ? 'accent' : 'warning'} className="space-y-2">
          <p className="text-sm font-semibold">{t('exam.result.title')}</p>
          <p className="text-sm">{t('exam.result.score', { c: score.correct, n: score.total, pct: score.pct })}</p>
          <p className="text-xs">{score.passed ? t('exam.result.pass', { p: EXAM_PASS_PCT }) : t('exam.result.fail', { p: EXAM_PASS_PCT })}</p>
          {score.passed && store[examId] && <CertificateAction examId={examId} level={level} record={store[examId]} />}
          <button type="button" onClick={retry} className={btnCls}>
            {t('exam.result.retry')}
          </button>
        </Card>
      )}

      <ol className="space-y-3">
        {questions.map((qu, i) => {
          const picked = answers[i] ?? null;
          const ok = picked === qu.question.answer;
          return (
            <li key={`${attempt}-${i}-${qu.lessonId}-${qu.question.q}`}>
              <Card tone={submitted && !ok ? 'warning' : 'default'} className="space-y-2">
                <fieldset className="space-y-1.5">
                  <legend className="text-sm font-medium text-[var(--text-strong)]">
                    {i + 1}. {qu.question.q}
                  </legend>
                  {qu.question.options.map((o, oi) => {
                    const isPick = picked === oi;
                    const show = submitted && (oi === qu.question.answer || isPick);
                    const tone = show ? (oi === qu.question.answer ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--warning)]') : isPick ? 'border-[var(--accent)]' : 'border-[var(--border)]';
                    return (
                      <label key={o} className={`flex items-start gap-2 text-xs rounded-md border px-2.5 py-2 ${submitted ? '' : 'cursor-pointer'} ${tone}`}>
                        <input
                          type="radio"
                          name={`exam-${i}`}
                          className="mt-0.5"
                          checked={isPick}
                          disabled={submitted}
                          onChange={() =>
                            setAnswers((prev) => {
                              const next = prev.slice();
                              while (next.length < questions.length) next.push(null);
                              next[i] = oi;
                              return next;
                            })
                          }
                        />
                        <span>{o}</span>
                      </label>
                    );
                  })}
                </fieldset>
                {submitted && (
                  <div className="space-y-1 text-xs">
                    <p>
                      <Badge tone={ok ? 'accent' : 'warning'}>{ok ? t('exam.review.ok') : t('exam.review.bad')}</Badge>{' '}
                      {picked === null ? t('exam.review.unanswered') : t('exam.review.yours', { a: qu.question.options[picked] })}
                    </p>
                    {!ok && <p>{t('exam.review.correct', { a: qu.question.options[qu.question.answer] })}</p>}
                    <p className="text-[var(--muted)]">{t('exam.review.why', { why: qu.question.why })}</p>
                  </div>
                )}
              </Card>
            </li>
          );
        })}
      </ol>

      {!submitted && (
        <div className="space-y-2">
          {answeredCount < questions.length && <p className="text-xs text-[var(--muted)]">{t('exam.submit.unanswered', { n: questions.length - answeredCount })}</p>}
          <button type="button" onClick={submit} disabled={questions.length === 0} className={primaryCls}>
            {t('exam.submit')}
          </button>
        </div>
      )}
      {submitted && (
        <button type="button" onClick={onExit} className={btnCls}>
          {t('exam.back')}
        </button>
      )}
    </div>
  );
}
