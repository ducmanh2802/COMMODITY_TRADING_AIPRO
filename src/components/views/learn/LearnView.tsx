import { useMemo, useState } from 'react';
import { Award, Bookmark, BookOpen, Calculator, CheckCircle2, ChevronDown, ChevronRight, FileText, GraduationCap, Search, X } from 'lucide-react';
import { useI18n, type TKey } from '../../../i18n';
import { onTablistKeyDown, tablistRef } from '../../../shared/hooks/tablistKeys';
import { Card } from '../../ui/Card';
import { SectionHeader } from '../../ui/SectionHeader';
import { ProgramCard } from '../program/ProgramCard';
import {
  computeAcademyStats,
  extractHighlightedSnippet,
  filterCurriculum,
  highlightTextSegments,
  type AcademyTab,
  type HighlightSegment,
  type LessonStatusFilter,
} from './academyUtils';
import { AiLessonRecommendations } from './AiLessonRecommendations';
import { SourceLinks } from './Calculators';
import { CURRICULUM } from './curriculum';
import type { Lesson } from './curriculum/types';
import { ExamCard, ExamRunner, type ExamTarget } from './exam/ExamView';
import { loadExams } from './exam/examLogic';
import { FlashcardDeck } from './FlashcardDeck';
import { GLOSSARY } from './glossary';
import { filterSlang, SLANG, SLANG_TAGS, type SlangTag } from './glossarySlang';
import { MONEY_WAYS, RISK_WARNINGS } from './learnContent';
import { LearnGoalCard } from './LearnGoalCard';
import { loadGoal, type LearnGoal } from './learnPaths';
import { LessonPage } from './LessonPage';
import { PracticeSandbox } from './PracticeSandbox';
import { useAcademyProgress, type LearnProgress, type LessonProgress } from './progress';
import { ReviewCard } from './ReviewSession';

type Page = { kind: 'home' } | { kind: 'lesson'; id: string } | { kind: 'exam'; target: ExamTarget };

const ACADEMY_TABS: readonly AcademyTab[] = ['lessons', 'bookmarks', 'sandbox', 'glossary', 'exams'];
const STATUS_FILTERS: readonly LessonStatusFilter[] = ['ALL', 'TODO', 'DONE'];

function firstLetter(term: string): string {
  return term.trim().charAt(0).toLocaleUpperCase('vi').normalize('NFD').charAt(0);
}

const segBtn = (active: boolean) =>
  `min-h-9 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
    active ? 'bg-[var(--accent-soft)] text-[var(--text-strong)]' : 'text-[var(--muted)] hover:text-[var(--text-strong)]'
  }`;

const filterBtn = (active: boolean) =>
  `min-h-8 px-2.5 py-1 rounded-md border text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
    active
      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-strong)]'
      : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text-strong)]'
  }`;

function SlangList() {
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<SlangTag | null>(null);
  const [letter, setLetter] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const items = useMemo(() => {
    const base = filterSlang(SLANG, query, tag);
    return letter ? base.filter((s) => firstLetter(s.term) === letter) : base;
  }, [query, tag, letter]);
  const letters = useMemo(() => Array.from(new Set(SLANG.map((s) => firstLetter(s.term)))).sort((a, b) => a.localeCompare(b, 'vi')), []);
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--muted)]">{SLANG.length} từ lóng, giải thích để hiểu. Đây không phải lời khuyên đầu tư.</p>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Tìm từ lóng..."
        aria-label="Tìm từ lóng"
        className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-md px-3 py-2 text-sm"
      />
      <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Lọc theo nhóm">
        <button type="button" aria-pressed={tag === null} onClick={() => setTag(null)} className={filterBtn(tag === null)}>
          Tất cả
        </button>
        {SLANG_TAGS.map((t) => (
          <button key={t} type="button" aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)} className={filterBtn(tag === t)}>
            {t}
          </button>
        ))}
      </div>
      <div className="flex gap-1 flex-wrap" role="group" aria-label="Lọc theo chữ cái A đến Z">
        <button type="button" aria-pressed={letter === null} onClick={() => setLetter(null)} className={filterBtn(letter === null)}>
          A–Z
        </button>
        {letters.map((l) => (
          <button key={l} type="button" aria-pressed={letter === l} onClick={() => setLetter(letter === l ? null : l)} className={filterBtn(letter === l)}>
            {l}
          </button>
        ))}
      </div>
      {items.length === 0 && <p className="text-sm text-[var(--muted)]">Không có từ phù hợp.</p>}
      <ul className="space-y-2">
        {items.map((s) => {
          const isOpen = open.has(s.id);
          return (
            <li key={s.id}>
              <Card className="!p-3">
                <button type="button" aria-expanded={isOpen} aria-controls={`slang-${s.id}`} onClick={() => toggle(s.id)} className="w-full text-left">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-[var(--text-strong)]">{s.term}</span>
                    <span aria-hidden="true" className="text-xs text-[var(--muted)]">
                      {isOpen ? '−' : '+'}
                    </span>
                  </span>
                  <span className="block text-xs text-[var(--muted)] mt-0.5">{s.meaning}</span>
                </button>
                {isOpen && (
                  <div id={`slang-${s.id}`} className="mt-2 space-y-1.5 text-xs pt-2 border-t border-[var(--border)]/60">
                    <p>
                      <span className="font-semibold text-[var(--text-strong)]">Ví dụ đời thường: </span>
                      {s.example}
                    </p>
                    {s.warning && (
                      <p className="text-[var(--warning)]">
                        <span className="font-semibold">Lưu ý: </span>
                        {s.warning}
                      </p>
                    )}
                    <p className="text-[var(--muted)]">
                      Thuật ngữ chính thức: {s.related} · {s.tags.join(' · ')}
                    </p>
                  </div>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function GlossarySection() {
  const { t } = useI18n();
  const [sub, setSub] = useState<'flashcards' | 'formal' | 'slang'>('flashcards');
  const [query, setQuery] = useState('');
  const items = useMemo(() => {
    const n = query.trim().toLowerCase();
    return GLOSSARY.filter((g) => !n || g.term.toLowerCase().includes(n) || g.def.toLowerCase().includes(n)).sort((a, b) => a.term.localeCompare(b.term, 'vi'));
  }, [query]);

  return (
    <div className="space-y-4" data-testid="academy-glossary">
      <SectionHeader
        title={t('ac.tab.glossary')}
        subtitle={
          sub === 'flashcards'
            ? `${GLOSSARY.length + SLANG.length} thẻ thuật ngữ & từ lóng để tự kiểm tra trí nhớ.`
            : sub === 'formal'
              ? `${GLOSSARY.length} thuật ngữ chuyên ngành hàng hoá.`
              : `${SLANG.length} từ lóng & thuật ngữ cộng đồng giao dịch hay dùng.`
        }
      />

      <div
        role="tablist"
        ref={tablistRef}
        onKeyDown={onTablistKeyDown}
        className="inline-flex items-center gap-1 p-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] max-w-full overflow-x-auto"
      >
        <button type="button" role="tab" aria-selected={sub === 'flashcards'} onClick={() => setSub('flashcards')} className={segBtn(sub === 'flashcards')}>
          {t('ac.fc.tab')}
        </button>
        <button type="button" role="tab" aria-selected={sub === 'formal'} onClick={() => setSub('formal')} className={segBtn(sub === 'formal')}>
          Thuật ngữ chính thức ({GLOSSARY.length})
        </button>
        <button type="button" role="tab" aria-selected={sub === 'slang'} onClick={() => setSub('slang')} className={segBtn(sub === 'slang')}>
          Từ lóng ({SLANG.length})
        </button>
      </div>

      {sub === 'flashcards' ? (
        <FlashcardDeck />
      ) : sub === 'slang' ? (
        <SlangList />
      ) : (
        <div className="space-y-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm thuật ngữ..."
            aria-label="Tìm thuật ngữ"
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-md px-3 py-2 text-sm"
          />
          {items.length === 0 && <p className="text-sm text-[var(--muted)]">Không có thuật ngữ phù hợp.</p>}
          <dl className="grid gap-2 sm:grid-cols-2">
            {items.map((g) => (
              <Card key={g.term} className="!p-3">
                <dt className="text-sm font-semibold text-[var(--text-strong)]">{g.term}</dt>
                <dd className="text-xs text-[var(--muted)] mt-1 leading-relaxed">{g.def}</dd>
              </Card>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

function ExamsAndRiskSection({
  progress,
  onStartExam,
}: {
  progress: LearnProgress;
  onStartExam: (target: ExamTarget) => void;
}) {
  const { t } = useI18n();
  const allLessons = useMemo(() => CURRICULUM.flatMap((l) => l.lessons), []);
  const doneAll = allLessons.filter((l) => progress.lessons[l.id]?.done).length;

  return (
    <div className="space-y-6" data-testid="academy-exams-risk">
      <section className="space-y-3">
        <SectionHeader title={t('ac.examsHub.title')} subtitle={t('ac.examsHub.subtitle')} />
        <ExamCard
          target={{ kind: 'final' }}
          doneLessons={doneAll}
          totalLessons={allLessons.length}
          onStart={() => onStartExam({ kind: 'final' })}
        />
        <div className="grid gap-3 md:grid-cols-2">
          {CURRICULUM.map((lvl) => {
            const done = lvl.lessons.filter((l) => progress.lessons[l.id]?.done).length;
            return (
              <div key={lvl.id} className="space-y-1.5">
                <p className="text-xs font-semibold text-[var(--text-strong)]">{lvl.title}</p>
                <ExamCard
                  target={{ kind: 'level', levelId: lvl.id }}
                  doneLessons={done}
                  totalLessons={lvl.lessons.length}
                  onStart={() => onStartExam({ kind: 'level', levelId: lvl.id })}
                />
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader title="Các cách kiếm tiền và cảnh báo rủi ro" />
        <div className="overflow-x-auto rounded-lg border border-[var(--border)]" tabIndex={0}>
          <table className="w-full text-xs bg-[var(--surface)]">
            <thead className="bg-[var(--surface-2)] text-[var(--muted)]">
              <tr>
                {['Cách', 'Mô tả', 'Phù hợp', 'Rủi ro / lưu ý'].map((h) => (
                  <th key={h} className="text-left p-2.5 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MONEY_WAYS.map((w) => (
                <tr key={w.name} className="border-t border-[var(--border)] align-top">
                  <td className="p-2.5 font-medium text-[var(--text-strong)]">{w.name}</td>
                  <td className="p-2.5">{w.description}</td>
                  <td className="p-2.5">{w.fit}</td>
                  <td className="p-2.5">{w.risk}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Card tone="warning">
          <h2 className="text-sm font-semibold mb-2">Rủi ro, đọc trước khi giao dịch</h2>
          <ul className="list-disc pl-4 space-y-2 text-xs">
            {RISK_WARNINGS.map((w) => (
              <li key={w.text}>
                {w.text}
                {w.sources && <SourceLinks sources={w.sources} />}
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}

function renderHighlightedSegments(segs: HighlightSegment[], highlightTestId?: string) {
  return segs.map((seg, idx) =>
    seg.match ? (
      <mark
        key={idx}
        data-testid={highlightTestId}
        className="rounded-sm bg-[var(--warning)]/30 text-[var(--text-strong)] px-0.5 font-medium"
      >
        {seg.text}
      </mark>
    ) : (
      <span key={idx}>{seg.text}</span>
    )
  );
}

function LessonCard({
  lesson,
  progress,
  noteText,
  query,
  bookmarked,
  onOpen,
  onToggleBookmark,
}: {
  lesson: Lesson;
  progress?: LessonProgress;
  noteText: string;
  query: string;
  bookmarked: boolean;
  onOpen: () => void;
  onToggleBookmark: () => void;
}) {
  const { t } = useI18n();
  const hasNote = !!noteText.trim();
  const trimmedQuery = query.trim();
  const noteMatch = trimmedQuery && hasNote ? extractHighlightedSnippet(noteText, trimmedQuery, 120) : null;

  return (
    <Card
      padded={false}
      className="relative overflow-hidden transition hover:bg-[var(--surface-2)] hover:border-[var(--accent)]/50 hover:-translate-y-px"
    >
      <button
        type="button"
        data-testid={`lesson-card-${lesson.id}`}
        onClick={onOpen}
        className="w-full p-3 pr-11 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <span className="flex items-start justify-between gap-2">
          <span className="text-sm font-medium text-[var(--text-strong)]">
            {trimmedQuery ? renderHighlightedSegments(highlightTextSegments(lesson.title, trimmedQuery)) : lesson.title}
          </span>
          {progress?.done && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--positive)] shrink-0 whitespace-nowrap">
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              Đã học
            </span>
          )}
        </span>
        <span className="block text-xs text-[var(--muted)] mt-1">
          {trimmedQuery ? renderHighlightedSegments(highlightTextSegments(lesson.objective, trimmedQuery)) : lesson.objective}
        </span>
        {noteMatch?.hasMatch && (
          <span
            data-testid="lesson-card-note-match"
            className="block mt-2 rounded-md border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-2 py-1.5 text-[11px] leading-relaxed text-[var(--text)]"
          >
            <span className="font-semibold text-[var(--text-strong)] mr-1">{t('ac.search.noteMatch')}</span>
            {renderHighlightedSegments(noteMatch.segments, 'note-highlight')}
          </span>
        )}
        {(progress?.best !== undefined || hasNote) && (
          <span className="block text-[11px] text-[var(--muted)] tabular-nums mt-1.5">
            {progress?.best !== undefined && `Điểm cao nhất: ${progress.best}%`}
            {progress?.best !== undefined && hasNote && ' · '}
            {hasNote && t('ac.lesson.hasNote')}
          </span>
        )}
      </button>
      <button
        type="button"
        aria-pressed={bookmarked}
        aria-label={bookmarked ? t('ac.bookmark.remove', { title: lesson.title }) : t('ac.bookmark.add', { title: lesson.title })}
        data-testid={`lesson-bookmark-${lesson.id}`}
        onClick={onToggleBookmark}
        className={`absolute top-2.5 right-2.5 h-7 w-7 inline-flex items-center justify-center rounded-md transition-colors ${
          bookmarked
            ? 'text-[var(--warning)] bg-[var(--warning)]/15 hover:bg-[var(--warning)]/25'
            : 'text-[var(--muted)] hover:text-[var(--text-strong)] hover:bg-[var(--surface-2)]'
        }`}
      >
        <Bookmark className="w-4 h-4" fill={bookmarked ? 'currentColor' : 'none'} aria-hidden="true" />
      </button>
    </Card>
  );
}

export default function LearnView() {
  const { t } = useI18n();
  const { progress, bookmarked, setLessonNote, recordLessonScore, toggleLessonDone, toggleChecklist, toggleBookmark } = useAcademyProgress();
  const [page, setPage] = useState<Page>({ kind: 'home' });
  const [tab, setTab] = useState<AcademyTab>('lessons');
  const [goal, setGoal] = useState<LearnGoal | null>(() => loadGoal());
  const [query, setQuery] = useState('');
  const [bookmarkQuery, setBookmarkQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<LessonStatusFilter>('ALL');
  const [goalOnly, setGoalOnly] = useState(false);
  const [collapsedLevels, setCollapsedLevels] = useState<Set<string>>(new Set());

  const exams = useMemo(() => loadExams(), [page]);

  const allEntries = useMemo(
    () => CURRICULUM.flatMap((lvl) => lvl.lessons.map((lesson) => ({ level: lvl, lesson }))),
    []
  );
  const stats = useMemo(
    () => computeAcademyStats(CURRICULUM, progress, exams, goal),
    [progress, exams, goal]
  );

  const filteredLevels = useMemo(
    () =>
      filterCurriculum(CURRICULUM, progress, {
        query,
        status: statusFilter,
        goal,
        goalOnly: goalOnly && !!goal,
      }),
    [progress, query, statusFilter, goal, goalOnly]
  );

  const bookmarkedLevels = useMemo(
    () =>
      filterCurriculum(CURRICULUM, progress, {
        query: bookmarkQuery,
        bookmarkedOnly: true,
      }),
    [progress, bookmarkQuery]
  );

  const bookmarkedSet = useMemo(() => new Set(bookmarked), [bookmarked]);

  const recommendedLesson = useMemo(
    () => allEntries.find((e) => e.lesson.id === stats.recommendedLessonId)?.lesson ?? null,
    [allEntries, stats.recommendedLessonId]
  );

  const go = (p: Page) => {
    setPage(p);
    window.scrollTo?.({ top: 0 });
  };

  const toggleLevel = (id: string) =>
    setCollapsedLevels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (page.kind === 'exam') return <ExamRunner target={page.target} onExit={() => go({ kind: 'home' })} />;
  if (page.kind === 'lesson') {
    const idx = allEntries.findIndex((e) => e.lesson.id === page.id);
    const entry = allEntries[idx];
    if (entry) {
      const { lesson, level } = entry;
      const lvl = CURRICULUM.find((l) => l.lessons[l.lessons.length - 1]?.id === lesson.id);
      return (
        <LessonPage
          key={lesson.id}
          lesson={lesson}
          levelNumber={level.number}
          progress={progress.lessons[lesson.id]}
          note={progress.notes?.[lesson.id] ?? ''}
          highlightQuery={tab === 'bookmarks' ? bookmarkQuery : query}
          bookmarked={bookmarkedSet.has(lesson.id)}
          onToggleBookmark={() => toggleBookmark(lesson.id)}
          onChangeNote={(text) => setLessonNote(lesson.id, text)}
          onScore={(pct) => recordLessonScore(lesson.id, pct)}
          onToggleDone={() => toggleLessonDone(lesson.id)}
          checklist={progress.checklist}
          onToggleCheck={(key) => toggleChecklist(key)}
          onBack={() => go({ kind: 'home' })}
          onPrev={allEntries[idx - 1] ? () => go({ kind: 'lesson', id: allEntries[idx - 1].lesson.id }) : undefined}
          onNext={allEntries[idx + 1] ? () => go({ kind: 'lesson', id: allEntries[idx + 1].lesson.id }) : undefined}
          footer={
            lvl ? (
              <ExamCard
                target={{ kind: 'level', levelId: lvl.id }}
                doneLessons={lvl.lessons.filter((l) => progress.lessons[l.id]?.done).length}
                totalLessons={lvl.lessons.length}
                onStart={() => go({ kind: 'exam', target: { kind: 'level', levelId: lvl.id } })}
              />
            ) : undefined
          }
        />
      );
    }
  }

  const filterCounts: Record<LessonStatusFilter, number> = {
    ALL: stats.totalLessons,
    TODO: stats.todoLessons,
    DONE: stats.doneLessons,
  };
  const hasActiveFilters = query.trim().length > 0 || statusFilter !== 'ALL' || (goalOnly && !!goal);

  return (
    <div className="space-y-6 max-w-4xl" data-testid="academy-root">
      <SectionHeader
        level={1}
        title={t('ac.title')}
        subtitle={t('ac.subtitle')}
      />

      {/* KPI Strip */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card className="!p-3 flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent-text)]" aria-hidden="true">
            <BookOpen className="w-4 h-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs text-[var(--muted)]">{t('ac.kpi.progress')}</span>
            <span className="block text-base font-semibold font-mono tabular-nums text-[var(--text-strong)]">
              {stats.doneLessons}/{stats.totalLessons} ({stats.completionPct}%)
            </span>
          </span>
        </Card>
        <Card className="!p-3 flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--positive)]/15 text-[var(--positive)]" aria-hidden="true">
            <GraduationCap className="w-4 h-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs text-[var(--muted)]">{t('ac.kpi.quizAvg')}</span>
            <span
              title={stats.averageBestQuizPct === null ? t('ac.kpi.noQuiz') : undefined}
              className="block text-base font-semibold font-mono tabular-nums text-[var(--text-strong)] truncate"
            >
              {stats.averageBestQuizPct !== null ? `${stats.averageBestQuizPct}%` : '—'}
            </span>
          </span>
        </Card>
        <Card className="!p-3 flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--warning)]/15 text-[var(--warning)]" aria-hidden="true">
            <Award className="w-4 h-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs text-[var(--muted)]">{t('ac.kpi.exams')}</span>
            <span className="block text-base font-semibold font-mono tabular-nums text-[var(--text-strong)]">
              {stats.passedExamsCount}/{stats.totalExamsCount}
            </span>
          </span>
        </Card>
        <Card className="!p-3 flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-2)] text-[var(--text)]" aria-hidden="true">
            <FileText className="w-4 h-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs text-[var(--muted)]">{t('ac.kpi.notes')}</span>
            <span className="block text-base font-semibold font-mono tabular-nums text-[var(--text-strong)]" data-testid="academy-notes-count">
              {stats.notedLessonsCount}
            </span>
          </span>
        </Card>
      </div>

      {/* Primary Workspace Mode Tabs */}
      <div
        role="tablist"
        aria-label={t('ac.title')}
        ref={tablistRef}
        onKeyDown={onTablistKeyDown}
        className="flex flex-wrap sm:inline-flex items-center gap-1 p-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] w-full sm:w-auto"
      >
        {ACADEMY_TABS.map((k) => {
          const active = tab === k;
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`academy-tab-${k}`}
              onClick={() => setTab(k)}
              className={segBtn(active)}
            >
              {k === 'bookmarks' && <Bookmark className="inline w-3.5 h-3.5 mr-1.5 -mt-0.5" aria-hidden="true" />}
              {k === 'sandbox' && <Calculator className="inline w-3.5 h-3.5 mr-1.5 -mt-0.5" aria-hidden="true" />}
              {t(`ac.tab.${k}` as TKey)}
              {k === 'bookmarks' && bookmarked.length > 0 && (
                <span className="ml-1 font-mono tabular-nums opacity-80">({bookmarked.length})</span>
              )}
            </button>
          );
        })}
      </div>

      {tab === 'bookmarks' && (
        <div className="space-y-4" data-testid="academy-bookmarks">
          <SectionHeader
            title={t('ac.bookmarks.title')}
            subtitle={t('ac.bookmarks.subtitle', { n: bookmarked.length })}
          />

          {bookmarked.length === 0 ? (
            <Card className="space-y-3 py-6 text-center" data-testid="bookmarks-empty">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--muted)]" aria-hidden="true">
                <Bookmark className="w-5 h-5" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <p className="text-sm font-semibold text-[var(--text-strong)]">{t('ac.bookmarks.emptyTitle')}</p>
                <p className="text-xs text-[var(--muted)] leading-relaxed">{t('ac.bookmarks.emptyDesc')}</p>
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => setTab('lessons')}
                  className="min-h-9 px-3.5 py-1.5 rounded-md bg-[var(--accent)] text-white text-xs font-medium hover:brightness-110"
                >
                  {t('ac.bookmarks.browse')}
                </button>
              </div>
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="relative">
                <Search className="w-4 h-4 text-[var(--muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                <input
                  type="text"
                  role="searchbox"
                  data-testid="bookmarks-search"
                  value={bookmarkQuery}
                  onChange={(e) => setBookmarkQuery(e.target.value)}
                  placeholder={t('ac.bookmarks.searchPlaceholder')}
                  aria-label={t('ac.bookmarks.searchPlaceholder')}
                  className="w-full min-h-10 bg-[var(--surface)] border border-[var(--border)] rounded-lg pl-9 pr-9 py-2 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                />
                {bookmarkQuery && (
                  <button
                    type="button"
                    aria-label={t('ac.search.clear')}
                    data-testid="bookmarks-search-clear"
                    onClick={() => setBookmarkQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center rounded-md text-[var(--muted)] hover:text-[var(--text-strong)] hover:bg-[var(--surface-2)]"
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                )}
              </div>

              {bookmarkedLevels.length === 0 ? (
                <Card className="space-y-2 text-sm text-[var(--muted)]">
                  <p>{t('ac.levels.empty')}</p>
                  <button type="button" onClick={() => setBookmarkQuery('')} className={filterBtn(false)}>
                    {t('ac.levels.resetFilter')}
                  </button>
                </Card>
              ) : (
                bookmarkedLevels.map(({ level, lessons }) => (
                  <section key={level.id} className="space-y-2.5" aria-labelledby={`bm-${level.id}`}>
                    <div className="flex items-center justify-between gap-2">
                      <h2 id={`bm-${level.id}`} className="text-sm font-semibold text-[var(--text-strong)]">
                        {level.title}
                      </h2>
                      <span className="text-xs font-mono tabular-nums text-[var(--muted)]">
                        {lessons.length} bài
                      </span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {lessons.map((l) => (
                        <LessonCard
                          key={l.id}
                          lesson={l}
                          progress={progress.lessons[l.id]}
                          noteText={progress.notes?.[l.id] ?? ''}
                          query={bookmarkQuery}
                          bookmarked={bookmarkedSet.has(l.id)}
                          onOpen={() => go({ kind: 'lesson', id: l.id })}
                          onToggleBookmark={() => toggleBookmark(l.id)}
                        />
                      ))}
                    </div>
                  </section>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'sandbox' && <PracticeSandbox onOpenLesson={(id) => go({ kind: 'lesson', id })} />}

      {tab === 'glossary' && <GlossarySection />}

      {tab === 'exams' && (
        <ExamsAndRiskSection progress={progress} onStartExam={(target) => go({ kind: 'exam', target })} />
      )}

      {tab === 'lessons' && (
        <div className="space-y-6">
          {/* Curriculum Search & Filter Toolbar (above the fold) */}
          <div className="space-y-2.5" data-testid="academy-filter-bar">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[var(--muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                <input
                  type="text"
                  role="searchbox"
                  data-testid="academy-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('ac.search.placeholder')}
                  aria-label={t('ac.search.label')}
                  className="w-full min-h-10 bg-[var(--surface)] border border-[var(--border)] rounded-lg pl-9 pr-9 py-2 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                />
                {query && (
                  <button
                    type="button"
                    aria-label={t('ac.search.clear')}
                    data-testid="academy-search-clear"
                    onClick={() => setQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center rounded-md text-[var(--muted)] hover:text-[var(--text-strong)] hover:bg-[var(--surface-2)]"
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {!hasActiveFilters && (
                  <>
                    <button
                      type="button"
                      onClick={() => setCollapsedLevels(new Set())}
                      className={filterBtn(false)}
                    >
                      {t('ac.levels.expandAll')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCollapsedLevels(new Set(CURRICULUM.map((l) => l.id)))}
                      className={filterBtn(false)}
                    >
                      {t('ac.levels.collapseAll')}
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <div role="group" aria-label={t('ac.title')} className="inline-flex items-center gap-1.5 flex-wrap">
                  {STATUS_FILTERS.map((st) => (
                    <button
                      key={st}
                      type="button"
                      aria-pressed={statusFilter === st}
                      data-testid={`academy-filter-${st}`}
                      onClick={() => setStatusFilter(st)}
                      className={filterBtn(statusFilter === st)}
                    >
                      {t(`ac.filter.${st}` as TKey, { n: filterCounts[st] })}
                    </button>
                  ))}
                </div>
                {goal && (
                  <button
                    type="button"
                    aria-pressed={goalOnly}
                    onClick={() => setGoalOnly((v) => !v)}
                    className={filterBtn(goalOnly)}
                  >
                    {t('ac.filter.goalOnly')}
                  </button>
                )}
              </div>

              {hasActiveFilters && (
                <p className="text-xs text-[var(--muted)] tabular-nums" data-testid="academy-search-summary">
                  {t('ac.search.resultsCount', {
                    lessons: filteredLevels.reduce((s, g) => s + g.lessons.length, 0),
                    levels: filteredLevels.length,
                  })}
                </p>
              )}
            </div>
          </div>

          {!query.trim() && (
            <>
              <AiLessonRecommendations onOpenLesson={(id) => go({ kind: 'lesson', id })} />
              <ReviewCard />
              <LearnGoalCard
                lessons={progress.lessons}
                onOpen={(id) => go({ kind: 'lesson', id })}
                onGoalChange={setGoal}
              />
              <ProgramCard onOpenLesson={(id) => go({ kind: 'lesson', id })} onOpenExam={(target) => go({ kind: 'exam', target })} />

              {/* Quick Resume Banner */}
              <Card tone="accent" className="!p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[var(--accent-text)]">{t('ac.resume.label')}</p>
                  <p className="text-sm font-semibold text-[var(--text-strong)] mt-0.5 truncate">
                    {recommendedLesson ? recommendedLesson.title : t('ac.resume.allDone', { total: stats.totalLessons })}
                  </p>
                </div>
                {recommendedLesson && (
                  <button
                    type="button"
                    data-testid="academy-resume-btn"
                    onClick={() => go({ kind: 'lesson', id: recommendedLesson.id })}
                    className="min-h-9 px-3.5 py-1.5 rounded-md bg-[var(--accent)] text-white text-xs font-medium hover:brightness-110 whitespace-nowrap shrink-0"
                  >
                    {t('ac.resume.cta')}
                  </button>
                )}
              </Card>

              <Card tone="warning">
                <p className="text-xs">{t('ac.disclaimer')}</p>
              </Card>
            </>
          )}

          {/* Curriculum Levels */}
          {filteredLevels.length === 0 ? (
            <Card className="space-y-2 text-sm text-[var(--muted)]">
              <p>{t('ac.levels.empty')}</p>
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setStatusFilter('ALL');
                  setGoalOnly(false);
                }}
                className={filterBtn(false)}
              >
                {t('ac.levels.resetFilter')}
              </button>
            </Card>
          ) : (
            filteredLevels.map(({ level, lessons, doneCount }) => {
              const complete = doneCount === level.lessons.length;
              const examPassed = !!exams[level.id]?.passed;
              const isCollapsed = !hasActiveFilters && collapsedLevels.has(level.id);

              return (
                <section key={level.id} className="space-y-3" aria-labelledby={`h-${level.id}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <button
                      type="button"
                      aria-expanded={!isCollapsed}
                      onClick={() => toggleLevel(level.id)}
                      className="min-w-0 flex-1 text-left flex items-start gap-2 group"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="w-4 h-4 mt-1 shrink-0 text-[var(--muted)] group-hover:text-[var(--accent-text)]" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="w-4 h-4 mt-1 shrink-0 text-[var(--muted)] group-hover:text-[var(--accent-text)]" aria-hidden="true" />
                      )}
                      <span className="min-w-0">
                        <h2 id={`h-${level.id}`} className="text-base font-semibold text-[var(--text-strong)] group-hover:text-[var(--accent-text)] transition-colors">
                          {level.title}
                        </h2>
                        <p className="text-xs text-[var(--muted)] max-w-2xl">{level.goal}</p>
                      </span>
                    </button>
                    <div className="text-xs font-mono tabular-nums text-[var(--muted)] shrink-0 whitespace-nowrap pt-0.5">
                      <span className={complete ? 'text-[var(--positive)] font-semibold' : ''}>
                        {doneCount}/{level.lessons.length} bài
                      </span>
                      {examPassed && (
                        <>
                          <span aria-hidden="true"> · </span>
                          <span className="text-[var(--positive)]">Đạt thi</span>
                        </>
                      )}
                    </div>
                  </div>

                  {!isCollapsed && (
                    <>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {lessons.map((l) => (
                          <LessonCard
                            key={l.id}
                            lesson={l}
                            progress={progress.lessons[l.id]}
                            noteText={progress.notes?.[l.id] ?? ''}
                            query={query}
                            bookmarked={bookmarkedSet.has(l.id)}
                            onOpen={() => go({ kind: 'lesson', id: l.id })}
                            onToggleBookmark={() => toggleBookmark(l.id)}
                          />
                        ))}
                      </div>
                      {!hasActiveFilters && (
                        <ExamCard
                          target={{ kind: 'level', levelId: level.id }}
                          doneLessons={doneCount}
                          totalLessons={level.lessons.length}
                          onStart={() => go({ kind: 'exam', target: { kind: 'level', levelId: level.id } })}
                        />
                      )}
                    </>
                  )}
                </section>
              );
            })
          )}

          {!hasActiveFilters && (
            <ExamCard
              target={{ kind: 'final' }}
              doneLessons={stats.doneLessons}
              totalLessons={stats.totalLessons}
              onStart={() => go({ kind: 'exam', target: { kind: 'final' } })}
            />
          )}
        </div>
      )}
    </div>
  );
}
