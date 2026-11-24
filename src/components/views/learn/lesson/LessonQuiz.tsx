import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '../../../ui/Badge';
import type { QuizQuestion } from '../curriculum/types';
import { recordAnswerStored } from '../review';

const AUTO_ADVANCE_MS = 450;

/**
 * Lesson quiz, one question at a time with progress dots. Scoring and storage are unchanged:
 * submit is enabled once every question is answered; on submit each answer feeds spaced review and
 * the percentage goes to onScore. After submitting, all questions are listed with explanations.
 * A pointer pick moves to the next question; keyboard arrows only change the selection.
 */
export function LessonQuiz({ lessonId, questions, best, onScore }: { lessonId: string; questions: QuizQuestion[]; best?: number; onScore: (pct: number) => void }) {
  const [picked, setPicked] = useState<(number | null)[]>(() => questions.map(() => null));
  const [submitted, setSubmitted] = useState(false);
  const [cur, setCur] = useState(0);
  const pointer = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const correct = picked.filter((p, i) => p === questions[i].answer).length;
  const answered = picked.filter((p) => p !== null).length;
  const allAnswered = answered === questions.length;
  const pct = Math.round((correct / questions.length) * 100);
  const last = questions.length - 1;

  const go = (i: number) => {
    window.clearTimeout(timer.current);
    setCur(Math.max(0, Math.min(last, i)));
  };

  const pick = (qi: number, oi: number) => {
    setPicked((p) => p.map((v, i) => (i === qi ? oi : v)));
    if (pointer.current && qi < last) {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCur(qi + 1), AUTO_ADVANCE_MS);
    }
    pointer.current = false;
  };

  const shown = submitted ? questions.map((_, i) => i) : [cur];

  return (
    <div className="space-y-4">
      {!submitted && (
        <div className="flex items-center justify-between gap-3">
          <ol className="flex flex-wrap items-center gap-1.5 list-none p-0 m-0" aria-label="Tiến độ câu hỏi">
            {questions.map((qu, i) => {
              const done = picked[i] !== null;
              return (
                <li key={qu.q}>
                  <button
                    type="button"
                    onClick={() => go(i)}
                    aria-current={i === cur ? 'step' : undefined}
                    aria-label={`Câu ${i + 1}${done ? ' (đã trả lời)' : ''}`}
                    className="grid place-items-center w-6 h-6 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                  >
                    <span
                      aria-hidden="true"
                      className={`block rounded-full transition-all ${i === cur ? 'w-3 h-3 ring-2 ring-[var(--accent)]/40' : 'w-2.5 h-2.5'} ${
                        done ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'
                      }`}
                    />
                  </button>
                </li>
              );
            })}
          </ol>
          <span className="text-[11px] text-[var(--muted)] tabular-nums whitespace-nowrap">
            Câu {cur + 1}/{questions.length} · đã trả lời {answered}
          </span>
        </div>
      )}
      {shown.map((qi) => {
        const qu = questions[qi];
        return (
          <fieldset
            key={qu.q}
            className="space-y-1.5 min-w-0"
            onKeyDown={() => {
              pointer.current = false;
            }}
          >
            <legend className="text-sm text-[var(--text-strong)] font-medium mb-1">
              {qi + 1}. {qu.q}
            </legend>
            {qu.options.map((o, oi) => {
              const isPick = picked[qi] === oi;
              const show = submitted && (oi === qu.answer || isPick);
              const tone = show ? (oi === qu.answer ? 'border-[var(--positive)] bg-[var(--positive)]/5' : 'border-[var(--negative)] bg-[var(--negative)]/5') : isPick ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--border)]';
              return (
                <label key={o} onPointerDown={() => {
                    pointer.current = true;
                  }} className={`flex items-start gap-2 text-[13px] rounded-md border px-3 py-2 min-h-10 cursor-pointer ${tone}`}>
                  <input type="radio" name={`${lessonId}-${qu.q}`} className="mt-0.5" checked={isPick} disabled={submitted} onChange={() => pick(qi, oi)} />
                  <span>{o}</span>
                </label>
              );
            })}
            {submitted && <p className="text-xs text-[var(--muted)]">Giải thích: {qu.why}</p>}
          </fieldset>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">
        {!submitted ? (
          <>
            <button type="button" onClick={() => go(cur - 1)} disabled={cur === 0} className="inline-flex items-center gap-1 text-xs min-h-9 px-3 py-1.5 rounded-md border border-[var(--border)] disabled:opacity-40">
              <ChevronLeft aria-hidden="true" className="w-3.5 h-3.5" />
              Câu trước
            </button>
            {cur < last && (
              <button type="button" onClick={() => go(cur + 1)} className="inline-flex items-center gap-1 text-xs min-h-9 px-3 py-1.5 rounded-md border border-[var(--border)] hover:border-[var(--accent)]">
                Câu sau
                <ChevronRight aria-hidden="true" className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              disabled={!allAnswered}
              onClick={() => {
                window.clearTimeout(timer.current);
                setSubmitted(true);
                questions.forEach((qu, i) => recordAnswerStored(lessonId, qu.q, picked[i] === qu.answer));
                onScore(pct);
              }}
              className="text-xs min-h-9 px-3 py-1.5 rounded-md bg-[var(--accent)] text-white disabled:opacity-40"
            >
              Nộp bài
            </button>
          </>
        ) : (
          <>
            <Badge tone={pct >= 60 ? 'positive' : 'warning'}>
              Điểm: {correct}/{questions.length} ({pct}%)
            </Badge>
            <button
              type="button"
              onClick={() => {
                setPicked(questions.map(() => null));
                setSubmitted(false);
                setCur(0);
              }}
              className="text-xs min-h-9 px-3 py-1.5 rounded-md border border-[var(--border)]"
            >
              Làm lại
            </button>
          </>
        )}
        {best !== undefined && <span className="text-[11px] text-[var(--muted)]">Điểm cao nhất: {best}%</span>}
      </div>
    </div>
  );
}
