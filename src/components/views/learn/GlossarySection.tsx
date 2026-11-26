import { useMemo, useState } from 'react';
import { useI18n } from '../../../i18n';
import { onTablistKeyDown, tablistRef } from '../../../shared/hooks/tablistKeys';
import { Card } from '../../ui/Card';
import { SectionHeader } from '../../ui/SectionHeader';
import { FlashcardDeck } from './FlashcardDeck';
import { GLOSSARY } from './glossary';
import { filterSlang, SLANG, SLANG_TAGS, type SlangTag } from './glossarySlang';

const segBtn = (active: boolean) =>
  `min-h-9 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
    active ? 'bg-[var(--accent-soft)] text-[var(--text-strong)]' : 'text-[var(--muted)] hover:text-[var(--text-strong)]'
  }`;

const filterBtn = (active: boolean) =>
  `min-h-8 px-2.5 py-1 rounded-md border text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
    active ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-strong)]' : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text-strong)]'
  }`;

function firstLetter(term: string): string {
  return term.trim().charAt(0).toLocaleUpperCase('vi').normalize('NFD').charAt(0);
}

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

export default function GlossarySection() {
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
