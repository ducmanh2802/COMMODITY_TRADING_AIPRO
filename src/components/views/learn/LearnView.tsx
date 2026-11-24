import { onTablistKeyDown } from '../../../shared/hooks/tablistKeys';
import { useMemo, useState } from 'react';
import { Badge } from '../../ui/Badge';
import { Card } from '../../ui/Card';
import { SectionHeader } from '../../ui/SectionHeader';
import { SourceLinks } from './Calculators';
import { CURRICULUM } from './curriculum';
import { ExamCard, ExamRunner, type ExamTarget } from './exam/ExamView';
import { GLOSSARY } from './glossary';
import { filterSlang, SLANG, SLANG_TAGS, type SlangTag } from './glossarySlang';
import { MONEY_WAYS, RISK_WARNINGS } from './learnContent';
import { LearnGoalCard } from './LearnGoalCard';
import { LessonPage } from './LessonPage';
import { loadProgress, saveProgress, type LearnProgress } from './progress';
import { ReviewCard } from './ReviewSession';

type Page = { kind: 'home' } | { kind: 'lesson'; id: string } | { kind: 'glossary' } | { kind: 'extras' } | { kind: 'exam'; target: ExamTarget };

function firstLetter(term: string): string {
  return term.trim().charAt(0).toLocaleUpperCase('vi').normalize('NFD').charAt(0);
}

const chipCls = (active: boolean) =>
  `text-xs px-2.5 py-1 rounded-full border ${active ? 'border-[var(--accent)] text-[var(--accent-text)]' : 'border-[var(--border)] text-[var(--muted)]'} hover:border-[var(--accent)]`;

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
        <button type="button" aria-pressed={tag === null} onClick={() => setTag(null)} className={chipCls(tag === null)}>
          Tất cả
        </button>
        {SLANG_TAGS.map((t) => (
          <button key={t} type="button" aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)} className={chipCls(tag === t)}>
            {t}
          </button>
        ))}
      </div>
      <div className="flex gap-1 flex-wrap" role="group" aria-label="Lọc theo chữ cái A đến Z">
        <button type="button" aria-pressed={letter === null} onClick={() => setLetter(null)} className={chipCls(letter === null)}>
          A–Z
        </button>
        {letters.map((l) => (
          <button key={l} type="button" aria-pressed={letter === l} onClick={() => setLetter(letter === l ? null : l)} className={chipCls(letter === l)}>
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
                  <div id={`slang-${s.id}`} className="mt-2 space-y-1.5 text-xs">
                    <p>
                      <span className="font-semibold text-[var(--text-strong)]">Ví dụ đời thường: </span>
                      {s.example}
                    </p>
                    {s.warning && (
                      <p className="text-amber-600">
                        <span className="font-semibold">Lưu ý: </span>
                        {s.warning}
                      </p>
                    )}
                    <p className="text-[var(--muted)]">Thuật ngữ chính thức: {s.related}</p>
                    <p className="flex gap-1 flex-wrap">
                      {s.tags.map((t) => (
                        <Badge key={t}>{t}</Badge>
                      ))}
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

function Glossary({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<'formal' | 'slang'>('formal');
  const [query, setQuery] = useState('');
  const items = useMemo(() => {
    const n = query.trim().toLowerCase();
    return GLOSSARY.filter((g) => !n || g.term.toLowerCase().includes(n) || g.def.toLowerCase().includes(n)).sort((a, b) => a.term.localeCompare(b.term, 'vi'));
  }, [query]);
  return (
    <div className="space-y-4 max-w-3xl">
      <button type="button" onClick={onBack} className="text-xs text-[var(--accent-text)] hover:underline">
        ← Về Học viện
      </button>
      <SectionHeader level={1} title="Thuật ngữ" subtitle={tab === 'formal' ? `${GLOSSARY.length} thuật ngữ. Gõ để tìm.` : 'Từ lóng & từ dân đầu tư hay dùng'} />
      <div role="tablist" onKeyDown={onTablistKeyDown} className="flex gap-2 flex-wrap">
        <button type="button" role="tab" aria-selected={tab === 'formal'} onClick={() => setTab('formal')} className={chipCls(tab === 'formal')}>
          Thuật ngữ chính thức
        </button>
        <button type="button" role="tab" aria-selected={tab === 'slang'} onClick={() => setTab('slang')} className={chipCls(tab === 'slang')}>
          Từ lóng &amp; từ dân đầu tư hay dùng
        </button>
      </div>
      {tab === 'slang' ? (
        <SlangList />
      ) : (
        <>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm thuật ngữ..."
            aria-label="Tìm thuật ngữ"
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-md px-3 py-2 text-sm"
          />
          {items.length === 0 && <p className="text-sm text-[var(--muted)]">Không có thuật ngữ phù hợp.</p>}
          <dl className="space-y-2">
            {items.map((g) => (
              <Card key={g.term} className="!p-3">
                <dt className="text-sm font-semibold text-[var(--text-strong)]">{g.term}</dt>
                <dd className="text-xs text-[var(--muted)] mt-0.5">{g.def}</dd>
              </Card>
            ))}
          </dl>
        </>
      )}
    </div>
  );
}

function Extras({ onBack }: { onBack: () => void }) {
  return (
    <div className="space-y-4 max-w-4xl">
      <button type="button" onClick={onBack} className="text-xs text-[var(--accent-text)] hover:underline">
        ← Về Học viện
      </button>
      <SectionHeader level={1} title="Các cách kiếm tiền và cảnh báo rủi ro" />
      <div className="overflow-x-auto">
        <table className="w-full text-xs border border-[var(--border)]">
          <thead className="bg-[var(--surface)] text-[var(--muted)]">
            <tr>
              {['Cách', 'Mô tả', 'Phù hợp', 'Rủi ro / lưu ý'].map((h) => (
                <th key={h} className="text-left p-2">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MONEY_WAYS.map((w) => (
              <tr key={w.name} className="border-t border-[var(--border)] align-top">
                <td className="p-2 font-medium">{w.name}</td>
                <td className="p-2">{w.description}</td>
                <td className="p-2">{w.fit}</td>
                <td className="p-2">{w.risk}</td>
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
    </div>
  );
}

export default function LearnView() {
  const [progress, setProgress] = useState<LearnProgress>(() => loadProgress());
  const [page, setPage] = useState<Page>({ kind: 'home' });

  const update = (fn: (p: LearnProgress) => LearnProgress) =>
    setProgress((p) => {
      const next = fn(p);
      saveProgress(next);
      return next;
    });

  const allLessons = useMemo(() => CURRICULUM.flatMap((l) => l.lessons), []);
  const doneCount = allLessons.filter((l) => progress.lessons[l.id]?.done).length;
  const go = (p: Page) => {
    setPage(p);
    window.scrollTo?.({ top: 0 });
  };

  if (page.kind === 'glossary') return <Glossary onBack={() => go({ kind: 'home' })} />;
  if (page.kind === 'extras') return <Extras onBack={() => go({ kind: 'home' })} />;
  if (page.kind === 'exam') return <ExamRunner target={page.target} onExit={() => go({ kind: 'home' })} />;
  if (page.kind === 'lesson') {
    const idx = allLessons.findIndex((l) => l.id === page.id);
    const lesson = allLessons[idx];
    if (lesson) {
      return (
        <LessonPage
          key={lesson.id}
          lesson={lesson}
          progress={progress.lessons[lesson.id]}
          onScore={(pct) =>
            update((p) => {
              const cur = p.lessons[lesson.id] ?? {};
              return { ...p, lessons: { ...p.lessons, [lesson.id]: { ...cur, best: Math.max(cur.best ?? 0, pct), done: cur.done || pct >= 60 } } };
            })
          }
          onToggleDone={() => update((p) => ({ ...p, lessons: { ...p.lessons, [lesson.id]: { ...p.lessons[lesson.id], done: !p.lessons[lesson.id]?.done } } }))}
          checklist={progress.checklist}
          onToggleCheck={(key) => update((p) => ({ ...p, checklist: { ...p.checklist, [key]: !p.checklist[key] } }))}
          onBack={() => go({ kind: 'home' })}
          onNext={allLessons[idx + 1] ? () => go({ kind: 'lesson', id: allLessons[idx + 1].id }) : undefined}
          footer={(() => {
            const lvl = CURRICULUM.find((l) => l.lessons[l.lessons.length - 1]?.id === lesson.id);
            if (!lvl) return undefined;
            return (
              <ExamCard
                target={{ kind: 'level', levelId: lvl.id }}
                doneLessons={lvl.lessons.filter((l) => progress.lessons[l.id]?.done).length}
                totalLessons={lvl.lessons.length}
                onStart={() => go({ kind: 'exam', target: { kind: 'level', levelId: lvl.id } })}
              />
            );
          })()}
        />
      );
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <SectionHeader
        level={1}
        title="Học viện Hàng hoá"
        subtitle="Lộ trình từ người mới đến trung cấp về đầu tư/giao dịch hợp đồng tương lai hàng hoá, tập trung MXV và các sàn liên thông (CME/CBOT/NYMEX/COMEX, ICE, SGX)."
        actions={
          <>
            <button type="button" onClick={() => go({ kind: 'glossary' })} className="text-xs px-3 py-1.5 rounded-md border border-[var(--border)] hover:border-[var(--accent)]">
              Thuật ngữ ({GLOSSARY.length})
            </button>
            <button type="button" onClick={() => go({ kind: 'extras' })} className="text-xs px-3 py-1.5 rounded-md border border-[var(--border)] hover:border-[var(--accent)]">
              Rủi ro và cách kiếm tiền
            </button>
          </>
        }
      />
      <ReviewCard />
      <LearnGoalCard lessons={progress.lessons} onOpen={(id) => go({ kind: 'lesson', id })} />
      <Card tone="warning">
        <p className="text-xs">
          <strong>Tài liệu giáo dục, không phải tư vấn đầu tư.</strong> Giao dịch hợp đồng tương lai có đòn bẩy và có thể mất nhiều hơn số tiền bạn nghĩ. Chỉ giao dịch qua thành viên được MXV cấp phép. Nội dung đánh dấu "cần kiểm tra lại với MXV/công ty môi giới" chưa được xác minh với văn bản chính thức.
        </p>
      </Card>
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 rounded-full overflow-hidden bg-[var(--surface-2)]" aria-hidden="true">
          <div className="h-full bg-[var(--accent)]" style={{ width: `${(doneCount / allLessons.length) * 100}%` }} />
        </div>
        <span className="text-xs font-mono text-[var(--muted)]">
          {doneCount}/{allLessons.length} bài
        </span>
      </div>

      {CURRICULUM.map((level) => {
        const done = level.lessons.filter((l) => progress.lessons[l.id]?.done).length;
        const complete = done === level.lessons.length;
        return (
          <section key={level.id} className="space-y-3" aria-labelledby={`h-${level.id}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 id={`h-${level.id}`} className="text-base font-semibold text-[var(--text-strong)]">
                  {level.title}
                </h2>
                <p className="text-xs text-[var(--muted)] max-w-2xl">{level.goal}</p>
              </div>
              {complete ? (
                <Badge tone="positive" title="Chứng nhận hoàn thành, lưu trên trình duyệt của bạn">
                  Hoàn thành cấp {level.number}
                </Badge>
              ) : (
                <Badge>
                  {done}/{level.lessons.length} bài
                </Badge>
              )}
            </div>
            {complete && (
              <Card tone="accent" className="text-center">
                <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Chứng nhận</p>
                <p className="text-sm font-semibold text-[var(--text-strong)]">Hoàn thành {level.title}</p>
                <p className="text-[11px] text-[var(--muted)]">Học viện Hàng hoá, mục đích giáo dục</p>
              </Card>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              {level.lessons.map((l) => {
                const p = progress.lessons[l.id];
                return (
                  <Card key={l.id} interactive as="button" onClick={() => go({ kind: 'lesson', id: l.id })} className="!p-3 w-full">
                    <span className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium text-[var(--text-strong)]">{l.title}</span>
                      {p?.done && <Badge tone="positive">Đã học</Badge>}
                    </span>
                    <span className="block text-xs text-[var(--muted)] mt-1">{l.objective}</span>
                    {p?.best !== undefined && <span className="block text-[11px] text-[var(--muted)] mt-1">Điểm cao nhất: {p.best}%</span>}
                  </Card>
                );
              })}
            </div>
            <ExamCard
              target={{ kind: 'level', levelId: level.id }}
              doneLessons={done}
              totalLessons={level.lessons.length}
              onStart={() => go({ kind: 'exam', target: { kind: 'level', levelId: level.id } })}
            />
          </section>
        );
      })}
      <ExamCard
        target={{ kind: 'final' }}
        doneLessons={doneCount}
        totalLessons={allLessons.length}
        onStart={() => go({ kind: 'exam', target: { kind: 'final' } })}
      />
    </div>
  );
}
