import { useEffect, useMemo, useState } from 'react';
import { useT } from '../../../../i18n';
import { Badge } from '../../../ui/Badge';
import { Card } from '../../../ui/Card';
import { loadLevel, loadLevels } from '../curriculum/loader';
import { CURRICULUM_INDEX } from '../curriculum/meta';
import type { Level } from '../curriculum/types';
import { recordAnswerStored } from '../review';
import { CertificateAction, today, type ExamTarget } from './ExamView';
import {
  applyAttempt,
  drawExam,
  drawFinalExam,
  EXAM_MINUTES,
  EXAM_PASS_PCT,
  FINAL_EXAM_MINUTES,
  FINAL_ID,
  loadExams,
  saveExams,
  scoreExam,
  type ExamQuestion,
  type ExamStore,
} from './examLogic';

const btnCls = 'text-xs px-3 py-1.5 rounded-md border border-[var(--border)] hover:border-[var(--accent)]';
const primaryCls = 'text-xs px-3 py-1.5 rounded-md bg-[var(--accent)] text-white disabled:opacity-50';

function fmtClock(sec: number) {
  const s = Math.abs(sec);
  return { m: String(Math.floor(s / 60)).padStart(2, '0'), s: String(s % 60).padStart(2, '0') };
}

function ExamRunnerBody({ target, levels, onExit }: { target: ExamTarget; levels: Level[]; onExit: () => void }) {
  const t = useT();
  const isFinal = target.kind === 'final';
  const examId = isFinal ? FINAL_ID : target.levelId;
  const level = isFinal ? undefined : levels[0];
  const levelMeta = isFinal ? undefined : CURRICULUM_INDEX.find((l) => l.id === target.levelId);
  const [store, setStore] = useState<ExamStore>(loadExams);
  // Attempt number the current draw is seeded with; frozen until the learner retakes.
  const [attempt, setAttempt] = useState(() => loadExams()[examId]?.attempts ?? 0);
  const questions: ExamQuestion[] = useMemo(() => {
    if (isFinal) return drawFinalExam(levels, attempt);
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
      <h2 className="text-lg font-semibold text-[var(--text-strong)]">{title}</h2>

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
          {score.passed && store[examId] && <CertificateAction examId={examId} level={levelMeta} record={store[examId]} />}
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

/**
 * Full-page exam: answer all, submit, per-question review, certificate.
 * The questions come from the lesson quizzes, so the level(s) are loaded first (one level, or all for the final exam).
 */
export function ExamRunner({ target, onExit }: { target: ExamTarget; onExit: () => void }) {
  const t = useT();
  const levelKey = target.kind === 'final' ? FINAL_ID : target.levelId;
  const [loaded, setLoaded] = useState<{ key: string; levels: Level[] } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    const p = target.kind === 'final' ? loadLevels(CURRICULUM_INDEX.map((l) => l.id)) : loadLevel(target.levelId).then((l) => [l]);
    p.then((levels) => alive && setLoaded({ key: levelKey, levels })).catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [target, levelKey]);

  if (loaded && loaded.key === levelKey) return <ExamRunnerBody target={target} levels={loaded.levels} onExit={onExit} />;
  return (
    <div className="space-y-3 max-w-3xl" aria-busy={!failed}>
      <button type="button" onClick={onExit} className="text-xs text-[var(--accent-text)] hover:underline">
        {t('exam.back')}
      </button>
      <p className={`text-sm ${failed ? 'text-[var(--warning)]' : 'text-[var(--muted)]'}`} role="status" data-testid="exam-loading">
        {failed ? t('exam.loadError') : t('exam.loading')}
      </p>
    </div>
  );
}
