import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, Bookmark, Briefcase, CheckCircle2, Loader2, RefreshCw, Search, Sparkles } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useTerminal } from '../../../contexts/TerminalContext';
import { getFirestoreModules } from '../../../firebase';
import { useI18n, type TKey } from '../../../i18n';
import type { ProductCategory } from '../../../shared/types/instrument';
import type { LessonRecommendationResult } from '../../../shared/types/lessonRecommendation';
import {
  COMMODITY_SEARCH_EVENT,
  COMMODITY_SEARCH_STORAGE_KEY,
  getTopSearchedCommodities,
  loadCommoditySearchStats,
  recordCommoditySearch,
} from '../../../shared/utils/commodityActivity';
import { Card } from '../../ui/Card';
import { usePaperStore } from '../papertrade/usePaperStore';
import {
  buildDirectFallbackRecommendations,
  buildSignalsSignature,
  normalizeOpenPositions,
  rankCandidateLessons,
  toSearchedSignalPayloads,
  type ManualOpenPositionInput,
} from './aiRecommendations';
import { CURRICULUM_INDEX, LESSON_META_BY_ID } from './curriculum/meta';
import type { LessonMeta } from './curriculum/types';
import { useAcademyProgress } from './progress';

export function AiLessonRecommendations({
  onOpenLesson,
}: {
  onOpenLesson: (lessonId: string) => void;
}) {
  const { lang: language, t } = useI18n();
  const { instruments, selectedSymbol, health } = useTerminal();
  const { user, authReady } = useAuth();
  const paper = usePaperStore();
  const { progress, bookmarked, toggleBookmark } = useAcademyProgress();

  const [searchStats, setSearchStats] = useState(() => loadCommoditySearchStats());
  const [manualPositions, setManualPositions] = useState<ManualOpenPositionInput[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LessonRecommendationResult | null>(null);
  const [networkError, setNetworkError] = useState(false);

  const lastFetchedSignatureRef = useRef<string | null>(null);
  const requestSeqRef = useRef(0);
  const activeAbortRef = useRef<AbortController | null>(null);

  // Listen for same-tab & cross-tab commodity search updates.
  useEffect(() => {
    const sync = () => setSearchStats(loadCommoditySearchStats());
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === COMMODITY_SEARCH_STORAGE_KEY) sync();
    };
    window.addEventListener(COMMODITY_SEARCH_EVENT, sync);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(COMMODITY_SEARCH_EVENT, sync);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  // Read verified user's open manual portfolio positions if signed in; never query Firestore when signed out.
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified) {
      setManualPositions([]);
      return;
    }
    // Firestore SDK is loaded only here (signed-in + verified); guests never fetch it.
    let disposed = false;
    let unsub: (() => void) | null = null;
    const uid = user.uid;
    void getFirestoreModules()
      .then(({ db, collection, onSnapshot, query, where }) => {
        if (disposed) return;
          const q = query(collection(db, 'positions'), where('userId', '==', uid));
          unsub = onSnapshot(
            q,
            (snap) => {
              const list: ManualOpenPositionInput[] = snap.docs.map((d) => {
                const data = d.data();
                return {
                  instrumentId: String(data.instrumentId ?? ''),
                  productName: typeof data.productName === 'string' ? data.productName : undefined,
                  category: (data.category as ProductCategory | undefined) ?? null,
                  direction: data.direction === 'SHORT' ? 'SHORT' : 'LONG',
                  contracts: Number(data.contracts) || 0,
                  status: data.status === 'CLOSED' ? 'CLOSED' : 'OPEN',
                };
              });
              setManualPositions(list);
            },
            () => {
              setManualPositions([]);
            }
          );
      })
      .catch((err) => {
        console.error('[AiLessonRecommendations] Firestore load failed', err);
        if (!disposed) setManualPositions([]);
      });
    return () => {
      disposed = true;
      unsub?.();
    };
  }, [authReady, user]);

  const topSearched = useMemo(
    () => getTopSearchedCommodities(searchStats, instruments, 5),
    [searchStats, instruments]
  );
  const searchedPayloads = useMemo(
    () => toSearchedSignalPayloads(topSearched),
    [topSearched]
  );
  const openPositions = useMemo(
    () => normalizeOpenPositions(paper.state.positions, manualPositions, instruments),
    [paper.state.positions, manualPositions, instruments]
  );

  const hasSignals = searchedPayloads.length > 0 || openPositions.length > 0;
  const candidates = useMemo(
    () =>
      hasSignals
        ? rankCandidateLessons(CURRICULUM_INDEX, progress, instruments, searchedPayloads, openPositions, 18)
        : [],
    [hasSignals, progress, instruments, searchedPayloads, openPositions]
  );

  const signature = useMemo(
    () => buildSignalsSignature(searchedPayloads, openPositions, language),
    [searchedPayloads, openPositions, language]
  );

  const lessonLookup = useMemo(() => {
    const map = new Map<string, { lesson: LessonMeta; levelNumber: number }>();
    for (const [id, e] of LESSON_META_BY_ID) map.set(id, { lesson: e.lesson, levelNumber: e.level.number });
    return map;
  }, []);

  const bookmarkedSet = useMemo(() => new Set(bookmarked), [bookmarked]);

  const fetchRecommendations = useCallback(async () => {
    if (!hasSignals || candidates.length === 0) return;

    activeAbortRef.current?.abort();
    const controller = new AbortController();
    activeAbortRef.current = controller;
    const seq = ++requestSeqRef.current;

    lastFetchedSignatureRef.current = signature;
    setLoading(true);
    setNetworkError(false);

    try {
      const res = await fetch('/api/ai/recommend-lessons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          language,
          searchedCommodities: searchedPayloads,
          openPositions,
          candidates,
          maxResults: 4,
        }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as { result: LessonRecommendationResult };
      if (seq !== requestSeqRef.current) return;
      setResult(data.result);
    } catch (err) {
      if (controller.signal.aborted || seq !== requestSeqRef.current) return;
      if ((err as { name?: string })?.name === 'AbortError') return;
      setNetworkError(true);
      setResult(null);
    } finally {
      if (seq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [hasSignals, candidates, signature, language, searchedPayloads, openPositions]);

  // Auto-fetch recommendations when signals appear or change, once server health reports Gemini availability.
  useEffect(() => {
    if (!hasSignals) {
      lastFetchedSignatureRef.current = null;
      setResult(null);
      setNetworkError(false);
      return;
    }
    if (!health?.capabilities.geminiServerKeyConfigured) return;
    if (lastFetchedSignatureRef.current === signature) return;
    void fetchRecommendations();
  }, [hasSignals, health, signature, fetchRecommendations]);

  useEffect(() => {
    return () => {
      activeAbortRef.current?.abort();
    };
  }, []);

  const directMatches = useMemo(
    () =>
      hasSignals
        ? buildDirectFallbackRecommendations(candidates, searchedPayloads, openPositions, language, 4)
        : [],
    [hasSignals, candidates, searchedPayloads, openPositions, language]
  );

  const serverKeyMissing = health !== null && !health.capabilities.geminiServerKeyConfigured;
  const unavailableReason = networkError
    ? 'NETWORK'
    : result?.status === 'UNAVAILABLE'
      ? result.unavailableReason ?? 'MODEL_ERROR'
      : serverKeyMissing && hasSignals
        ? 'NO_API_KEY'
        : null;

  const displayedItems =
    result?.status === 'OK'
      ? result.recommendations
      : unavailableReason
        ? directMatches
        : [];
  const isShowingFallback = Boolean(unavailableReason && directMatches.length > 0);

  return (
    <Card
      className="space-y-3.5 border-[var(--accent)]/35"
      data-testid="ai-lesson-recommendations"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--accent-soft)] text-[var(--accent-text)]"
            aria-hidden="true"
          >
            <Sparkles className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[var(--text-strong)]">
              {t('ac.aiRec.title')}
            </h2>
            <p className="text-xs text-[var(--muted)] mt-0.5">{t('ac.aiRec.subtitle')}</p>
          </div>
        </div>

        {hasSignals && (
          <button
            type="button"
            data-testid="ai-recommend-btn"
            disabled={loading}
            onClick={() => void fetchRecommendations()}
            className="min-h-8 px-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)] text-xs font-medium text-[var(--text-strong)] hover:border-[var(--accent)] disabled:opacity-60 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            {result ? t('ac.aiRec.refresh') : t('ac.aiRec.fetch')}
          </button>
        )}
      </div>

      {/* Detected Signals Strip */}
      {hasSignals ? (
        <div className="space-y-2 rounded-lg bg-[var(--surface-2)]/70 border border-[var(--border)] px-3 py-2.5" data-testid="ai-rec-signals">
          {openPositions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="inline-flex items-center gap-1 text-[var(--muted)] font-medium mr-1">
                <Briefcase className="w-3.5 h-3.5" aria-hidden="true" />
                {t('ac.aiRec.signalsPosition')}
              </span>
              {openPositions.map((pos) => (
                <span
                  key={`${pos.symbol}-${pos.side}`}
                  data-testid={`ai-signal-pos-${pos.symbol}`}
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium font-mono tabular-nums ${
                    pos.side === 'LONG'
                      ? 'border-[var(--positive)]/40 bg-[var(--positive)]/10 text-[var(--positive)]'
                      : 'border-[var(--negative)]/40 bg-[var(--negative)]/10 text-[var(--negative)]'
                  }`}
                >
                  {pos.side} {pos.symbol} ×{pos.contracts}
                </span>
              ))}
            </div>
          )}

          {searchedPayloads.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="inline-flex items-center gap-1 text-[var(--muted)] font-medium mr-1">
                <Search className="w-3.5 h-3.5" aria-hidden="true" />
                {t('ac.aiRec.signalsSearch')}
              </span>
              {searchedPayloads.map((item) => (
                <span
                  key={item.symbol}
                  data-testid={`ai-signal-search-${item.symbol}`}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[11px] text-[var(--text-strong)]"
                >
                  <span className="font-mono font-semibold">{item.symbol}</span>
                  <span className="text-[var(--muted)]">{item.name}</span>
                  <span className="font-mono text-[var(--muted)] tabular-nums">({item.count}×)</span>
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div
          className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-2)]/40 p-3.5 space-y-2.5"
          data-testid="ai-rec-empty"
        >
          <p className="text-xs text-[var(--muted)] leading-relaxed">{t('ac.aiRec.noSignals')}</p>
          {selectedSymbol && (
            <button
              type="button"
              data-testid="ai-rec-try-selected"
              onClick={() => recordCommoditySearch(selectedSymbol)}
              className="min-h-8 px-3 py-1.5 rounded-md bg-[var(--accent)] text-white text-xs font-medium hover:brightness-110 inline-flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              {t('ac.aiRec.trySelected', { symbol: selectedSymbol })}
            </button>
          )}
        </div>
      )}

      {/* Loading Indicator */}
      {hasSignals && loading && (
        <div
          className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/50 px-3 py-2.5 text-xs text-[var(--muted)]"
          data-testid="ai-rec-loading"
        >
          <Loader2 className="w-4 h-4 animate-spin text-[var(--accent-text)] shrink-0" aria-hidden="true" />
          <span>{t('ac.aiRec.loading')}</span>
        </div>
      )}

      {/* Honest Unavailability Notice (never masks errors as AI) */}
      {hasSignals && !loading && unavailableReason && (
        <div
          role="alert"
          data-testid="ai-rec-unavailable"
          className="flex items-start gap-2 rounded-lg border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-3 py-2 text-xs text-[var(--text)]"
        >
          <AlertCircle className="w-4 h-4 text-[var(--warning)] shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="font-semibold text-[var(--text-strong)]">{t('ac.aiRec.unavailableTitle')}</p>
            <p className="text-[var(--muted)] mt-0.5">
              {t(`ac.aiRec.unavailable.${unavailableReason}` as TKey)}
            </p>
          </div>
        </div>
      )}

      {/* AI Headline */}
      {result?.status === 'OK' && result.headline && !loading && (
        <p className="text-xs font-medium text-[var(--text-strong)]" data-testid="ai-rec-headline">
          {result.headline}
        </p>
      )}

      {/* Clearly labeled fallback heading when Gemini is unavailable */}
      {isShowingFallback && !loading && (
        <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">
          {t('ac.aiRec.fallbackTitle')}
        </p>
      )}

      {/* Recommended Lesson Cards */}
      {displayedItems.length > 0 && !loading && (
        <div className="grid gap-2.5 sm:grid-cols-2" data-testid="ai-rec-list">
          {displayedItems.map((rec) => {
            const entry = lessonLookup.get(rec.lessonId);
            if (!entry) return null;
            const { lesson, levelNumber } = entry;
            const isDone = !!progress.lessons[lesson.id]?.done;
            const isBookmarked = bookmarkedSet.has(lesson.id);

            return (
              <div
                key={lesson.id}
                data-testid={`ai-rec-card-${lesson.id}`}
                className="flex flex-col justify-between gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 hover:border-[var(--accent)]/60 transition-colors"
              >
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          rec.priority === 'HIGH'
                            ? 'bg-[var(--accent-soft)] text-[var(--accent-text)]'
                            : 'bg-[var(--surface-2)] text-[var(--muted)]'
                        }`}
                      >
                        {t(`ac.aiRec.priority.${rec.priority}` as TKey)}
                      </span>
                      <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--muted)]">
                        {t('ac.lesson.levelTag', { n: levelNumber })}
                      </span>
                      {rec.matchedSymbols.map((sym) => (
                        <span
                          key={sym}
                          className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] font-mono font-semibold text-[var(--text-strong)]"
                        >
                          {sym}
                        </span>
                      ))}
                    </div>

                    <button
                      type="button"
                      aria-pressed={isBookmarked}
                      aria-label={
                        isBookmarked
                          ? t('ac.bookmark.remove', { title: lesson.title })
                          : t('ac.bookmark.add', { title: lesson.title })
                      }
                      data-testid={`ai-rec-bookmark-${lesson.id}`}
                      onClick={() => toggleBookmark(lesson.id)}
                      className={`h-7 w-7 shrink-0 inline-flex items-center justify-center rounded-md transition-colors ${
                        isBookmarked
                          ? 'text-[var(--warning)] bg-[var(--warning)]/15 hover:bg-[var(--warning)]/25'
                          : 'text-[var(--muted)] hover:text-[var(--text-strong)] hover:bg-[var(--surface-2)]'
                      }`}
                    >
                      <Bookmark className="w-3.5 h-3.5" fill={isBookmarked ? 'currentColor' : 'none'} aria-hidden="true" />
                    </button>
                  </div>

                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[var(--text-strong)] leading-snug">
                      {lesson.title}
                    </h3>
                    {isDone && (
                      <CheckCircle2
                        className="w-4 h-4 text-[var(--positive)] shrink-0 mt-0.5"
                        aria-label="Đã học"
                      />
                    )}
                  </div>

                  <p className="text-xs text-[var(--muted)] leading-relaxed">{rec.reason}</p>
                </div>

                <div className="pt-1 flex items-center justify-end">
                  <button
                    type="button"
                    data-testid={`ai-rec-open-${lesson.id}`}
                    onClick={() => onOpenLesson(lesson.id)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent-text)] hover:underline"
                  >
                    <span>{t('ac.aiRec.openLesson')}</span>
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
