import { useState } from 'react';
import { useT } from '../../../i18n';
import { Card } from '../../ui/Card';
import type { QuizQuestion } from './curriculum/types';
import { loadLevels } from './curriculum/loader';
import { LESSON_META_BY_ID } from './curriculum/meta';
import { BOX_DAYS, dueItems, hashQuestion, loadReview, recordAnswerStored } from './review';

interface Entry {
  lessonId: string;
  question: QuizQuestion;
}

/** Due items whose lesson still exists (cheap: only the light index is needed). */
function dueKnown(now: number) {
  return dueItems(loadReview(), now).filter((it) => LESSON_META_BY_ID.has(it.lessonId));
}

/**
 * Resolve due review items to live curriculum questions; stale ids (edited/removed questions) are skipped.
 * Loads only the levels that actually have due items.
 */
async function resolveDue(now: number): Promise<Entry[]> {
  const due = dueKnown(now);
  const levelIds = [...new Set(due.map((it) => LESSON_META_BY_ID.get(it.lessonId)!.level.id))];
  const levels = await loadLevels(levelIds);
  const index = new Map<string, QuizQuestion>();
  for (const level of levels) {
    for (const lesson of level.lessons) {
      for (const qu of lesson.quiz) index.set(`${lesson.id}:${hashQuestion(qu.q)}`, qu);
    }
  }
  const out: Entry[] = [];
  for (const it of due) {
    const question = index.get(it.id);
    if (question) out.push({ lessonId: it.lessonId, question });
  }
  return out;
}

const btnCls = 'text-xs px-3 py-1.5 rounded-md border border-[var(--border)] hover:border-[var(--accent)]';

function Session({ entries, onExit }: { entries: Entry[]; onExit: () => void }) {
  const t = useT();
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [msg, setMsg] = useState('');
  const finished = i >= entries.length;

  if (finished) {
    return (
      <Card tone="accent" className="space-y-3 max-w-3xl">
        <p className="text-sm font-semibold">{t('review.summary.title')}</p>
        <p className="text-sm">{t('review.summary.score', { c: score, n: entries.length })}</p>
        <button type="button" onClick={onExit} className={btnCls}>
          {t('review.summary.done')}
        </button>
      </Card>
    );
  }

  const { lessonId, question: qu } = entries[i];
  const answered = picked !== null;
  const answer = (oi: number) => {
    if (answered) return;
    const ok = oi === qu.answer;
    const next = recordAnswerStored(lessonId, qu.q, ok);
    setPicked(oi);
    if (ok) {
      setScore((s) => s + 1);
      const item = next[`${lessonId}:${hashQuestion(qu.q)}`];
      setMsg(item ? t('review.correct', { d: BOX_DAYS[item.box - 1] }) : t('review.correctDone'));
    } else {
      setMsg(t('review.wrong'));
    }
  };

  return (
    <Card className="space-y-3 max-w-3xl">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-[var(--muted)]">{t('review.progress', { i: i + 1, n: entries.length })}</span>
        <button type="button" onClick={onExit} className="text-xs text-[var(--accent-text)] hover:underline">
          {t('review.back')}
        </button>
      </div>
      <fieldset className="space-y-1.5">
        <legend className="text-sm text-[var(--text-strong)] font-medium">{qu.q}</legend>
        {qu.options.map((o, oi) => {
          const isPick = picked === oi;
          const show = answered && (oi === qu.answer || isPick);
          const tone = show ? (oi === qu.answer ? 'border-[var(--accent)]' : 'border-[var(--warning)]') : 'border-[var(--border)]';
          return (
            <label key={o} className={`flex items-start gap-2 text-xs rounded-md border px-2.5 py-1.5 cursor-pointer ${tone}`}>
              <input type="radio" name={`review-${i}`} className="mt-0.5" checked={isPick} disabled={answered} onChange={() => answer(oi)} />
              <span>{o}</span>
            </label>
          );
        })}
      </fieldset>
      {answered && (
        <>
          <p className="text-xs">{msg}</p>
          <p className="text-xs text-[var(--muted)]">{t('review.why', { why: qu.why })}</p>
          <button
            type="button"
            onClick={() => {
              setI(i + 1);
              setPicked(null);
            }}
            className="text-xs px-3 py-1.5 rounded-md bg-[var(--accent)] text-white"
          >
            {i + 1 >= entries.length ? t('review.finish') : t('review.next')}
          </button>
        </>
      )}
    </Card>
  );
}

/** Home-page card: due count + start button; swaps to the session in place. */
export function ReviewCard() {
  const t = useT();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [dueCount, setDueCount] = useState(() => dueKnown(Date.now()).length);
  const [loading, setLoading] = useState(false);

  const start = async () => {
    setLoading(true);
    try {
      const list = await resolveDue(Date.now());
      setDueCount(list.length);
      if (list.length > 0) setEntries(list);
    } finally {
      setLoading(false);
    }
  };

  if (entries) {
    return (
      <Session
        entries={entries}
        onExit={() => {
          setEntries(null);
          setDueCount(dueKnown(Date.now()).length);
        }}
      />
    );
  }
  if (dueCount === 0) {
    return (
      <Card>
        <p className="text-xs text-[var(--muted)]">{t('review.empty')}</p>
      </Card>
    );
  }
  return (
    <Card tone="accent">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t('review.card.title', { n: dueCount })}</p>
          <p className="text-xs text-[var(--muted)]">{t('review.card.hint')}</p>
        </div>
        <button type="button" onClick={start} disabled={loading} className="text-xs px-3 py-1.5 rounded-md bg-[var(--accent)] text-white disabled:opacity-60">
          {loading ? t('review.loading') : t('review.card.start')}
        </button>
      </div>
    </Card>
  );
}
