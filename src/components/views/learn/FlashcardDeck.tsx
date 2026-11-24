import { useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, RotateCcw, Shuffle } from 'lucide-react';
import { useI18n, type TKey } from '../../../i18n';
import { Card } from '../../ui/Card';
import {
  buildFlashcardDeck,
  loadMasteredFlashcards,
  saveMasteredFlashcards,
  shuffleFlashcards,
  type FlashcardSourceFilter,
} from './academyUtils';
import { GLOSSARY } from './glossary';
import { SLANG } from './glossarySlang';

const SOURCE_OPTIONS: readonly FlashcardSourceFilter[] = ['ALL', 'FORMAL', 'SLANG'];

export function FlashcardDeck() {
  const { t } = useI18n();
  const [source, setSource] = useState<FlashcardSourceFilter>('ALL');
  const [dueOnly, setDueOnly] = useState(false);
  const [shuffleSeed, setShuffleSeed] = useState<number>(0);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [mastered, setMastered] = useState<Set<string>>(() => loadMasteredFlashcards());

  const fullDeck = useMemo(() => buildFlashcardDeck(GLOSSARY, SLANG, source), [source]);

  const orderedDeck = useMemo(() => {
    const filtered = dueOnly ? fullDeck.filter((c) => !mastered.has(c.id)) : fullDeck;
    return shuffleSeed > 0 ? shuffleFlashcards(filtered, shuffleSeed) : filtered;
  }, [fullDeck, dueOnly, mastered, shuffleSeed]);

  const safeIdx = orderedDeck.length > 0 ? Math.min(index, orderedDeck.length - 1) : 0;
  const card = orderedDeck[safeIdx] ?? null;

  const masteredInSource = useMemo(
    () => fullDeck.filter((c) => mastered.has(c.id)).length,
    [fullDeck, mastered]
  );
  const dueCount = fullDeck.length - masteredInSource;

  const updateMastery = (id: string, isMastered: boolean) => {
    setMastered((prev) => {
      const next = new Set(prev);
      if (isMastered) next.add(id);
      else next.delete(id);
      saveMasteredFlashcards(next);
      return next;
    });
    setFlipped(false);
    if (orderedDeck.length > 1) {
      setIndex((i) => (i + 1 >= orderedDeck.length ? 0 : i + 1));
    }
  };

  const resetMastery = () => {
    const empty = new Set<string>();
    setMastered(empty);
    saveMasteredFlashcards(empty);
    setIndex(0);
    setFlipped(false);
  };

  const step = (delta: number) => {
    if (orderedDeck.length === 0) return;
    setFlipped(false);
    setIndex((i) => (i + delta + orderedDeck.length) % orderedDeck.length);
  };

  const counts: Record<FlashcardSourceFilter, number> = {
    ALL: GLOSSARY.length + SLANG.length,
    FORMAL: GLOSSARY.length,
    SLANG: SLANG.length,
  };

  const pct = fullDeck.length > 0 ? Math.round((masteredInSource / fullDeck.length) * 100) : 0;

  return (
    <div className="space-y-4" data-testid="academy-flashcards">
      {/* Controls row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div
          role="group"
          aria-label={t('ac.fc.tab')}
          className="inline-flex items-center gap-1 p-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] self-start max-w-full overflow-x-auto"
        >
          {SOURCE_OPTIONS.map((opt) => {
            const active = source === opt;
            return (
              <button
                key={opt}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setSource(opt);
                  setIndex(0);
                  setFlipped(false);
                }}
                className={`min-h-9 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  active ? 'bg-[var(--accent-soft)] text-[var(--text-strong)]' : 'text-[var(--muted)] hover:text-[var(--text-strong)]'
                }`}
              >
                {t(`ac.fc.source.${opt}` as TKey, { n: counts[opt] })}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={dueOnly}
            onClick={() => {
              setDueOnly((v) => !v);
              setIndex(0);
              setFlipped(false);
            }}
            className={`min-h-9 px-3 py-1.5 rounded-md border text-xs font-medium whitespace-nowrap transition-colors ${
              dueOnly
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-strong)]'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text-strong)]'
            }`}
          >
            {t('ac.fc.dueOnly', { n: dueCount })}
          </button>
          <button
            type="button"
            onClick={() => {
              setShuffleSeed((s) => s + 1);
              setIndex(0);
              setFlipped(false);
            }}
            className="inline-flex items-center gap-1.5 min-h-9 px-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)] text-xs text-[var(--text)] whitespace-nowrap"
          >
            <Shuffle className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t('ac.fc.shuffle')}</span>
          </button>
          {mastered.size > 0 && (
            <button
              type="button"
              onClick={resetMastery}
              className="inline-flex items-center gap-1.5 min-h-9 px-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--warning)] text-xs text-[var(--muted)] hover:text-[var(--text-strong)] whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('ac.fc.resetMastery')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Mastery progress bar */}
      <div className="flex items-center gap-3">
        <div
          className="flex-1 h-2 rounded-full overflow-hidden bg-[var(--surface-2)]"
          role="progressbar"
          aria-label={t('ac.fc.mastered', { done: masteredInSource, total: fullDeck.length })}
          aria-valuemin={0}
          aria-valuemax={fullDeck.length}
          aria-valuenow={masteredInSource}
        >
          <div className="h-full bg-[var(--positive)] transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs font-mono tabular-nums text-[var(--muted)] whitespace-nowrap">
          {t('ac.fc.mastered', { done: masteredInSource, total: fullDeck.length })}
        </span>
      </div>

      {/* Active Flashcard */}
      {!card ? (
        <Card className="text-sm text-[var(--muted)]">{t('ac.fc.empty')}</Card>
      ) : (
        <div className="space-y-3">
          <button
            type="button"
            data-testid="flashcard-surface"
            aria-pressed={flipped}
            onClick={() => setFlipped((f) => !f)}
            className="w-full text-left rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)] p-6 min-h-[14rem] flex flex-col justify-between gap-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <div className="flex items-center justify-between gap-2 text-xs text-[var(--muted)] tabular-nums">
              <span>
                {card.source === 'FORMAL' ? 'Thuật ngữ' : 'Từ lóng'} · {t('ac.fc.cardOf', { i: safeIdx + 1, total: orderedDeck.length })}
              </span>
              {mastered.has(card.id) && (
                <span className="inline-flex items-center gap-1 text-[var(--positive)] font-medium">
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  {t('ac.fc.know')}
                </span>
              )}
            </div>

            {!flipped ? (
              <div className="py-6 text-center">
                <p className="text-xl font-semibold text-[var(--text-strong)]">{card.term}</p>
              </div>
            ) : (
              <div className="space-y-2.5 text-sm">
                <p className="font-semibold text-[var(--text-strong)]">{card.term}</p>
                <p className="text-[var(--text)] leading-relaxed">{card.definition}</p>
                {card.example && (
                  <p className="text-xs text-[var(--muted)]">
                    <span className="font-medium text-[var(--text)]">{t('ac.fc.example')} </span>
                    {card.example}
                  </p>
                )}
                {card.warning && (
                  <p className="text-xs text-[var(--warning)]">{card.warning}</p>
                )}
                {card.related && (
                  <p className="text-xs text-[var(--muted)]">
                    {t('ac.fc.related')} {card.related}
                  </p>
                )}
              </div>
            )}

            <div className="text-[11px] text-[var(--muted)] text-center">
              {flipped ? t('ac.fc.backHint') : t('ac.fc.frontHint')}
            </div>
          </button>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => step(-1)}
                className="inline-flex items-center gap-1 min-h-10 px-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)] text-xs text-[var(--text)]"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                <span>{t('ac.fc.prev')}</span>
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                className="inline-flex items-center gap-1 min-h-10 px-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)] text-xs text-[var(--text)]"
              >
                <span>{t('ac.fc.next')}</span>
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="flashcard-review-again"
                onClick={() => updateMastery(card.id, false)}
                className="min-h-10 px-3.5 py-1.5 rounded-md border border-[var(--warning)]/60 text-xs font-medium text-[var(--warning)] hover:bg-[var(--warning)]/10"
              >
                {t('ac.fc.reviewAgain')}
              </button>
              <button
                type="button"
                data-testid="flashcard-know"
                onClick={() => updateMastery(card.id, true)}
                className="inline-flex items-center gap-1.5 min-h-10 px-3.5 py-1.5 rounded-md bg-[var(--accent)] text-white text-xs font-medium hover:brightness-110"
              >
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t('ac.fc.know')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
