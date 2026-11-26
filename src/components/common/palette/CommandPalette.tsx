import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';
import { useTerminal } from '../../../contexts/TerminalContext';
import { useT, type TKey } from '../../../i18n';
import { useFocusTrap } from '../../../shared/hooks/useFocusTrap';
import type { AppModuleId } from '../../../shared/types/risk';
import { ALL_LESSON_META } from '../../views/learn/curriculum/meta';
import { moveIndex, rankEntries, type PaletteEntry } from './paletteMatch';
import { sendAcademyIntent } from './paletteBridge';

type Kind = 'page' | 'lesson' | 'term';
interface Item extends PaletteEntry {
  kind: Kind;
  hint?: string;
  module?: AppModuleId;
  lessonId?: string;
}

/** Nav targets: ids resolve through navMap (hub + tab), so one id opens the right tab. */
const NAV: { id: AppModuleId; key: TKey }[] = [
  { id: 'today-hub', key: 'n2.sec.today' },
  { id: 'overview', key: 'n2.td.overview' },
  { id: 'radar', key: 'n2.td.highlights' },
  { id: 'market-hub', key: 'n2.sec.markets' },
  { id: 'commodity-world', key: 'n2.mk.prices' },
  { id: 'news-hub', key: 'n2.sec.news' },
  { id: 'news', key: 'n2.nw.news' },
  { id: 'fundamental', key: 'n2.nw.macro' },
  { id: 'analysis-hub', key: 'n2.sec.analysis' },
  { id: 'scorecard', key: 'n2.an.scorecard' },
  { id: 'research-report', key: 'n2.an.report' },
  { id: 'charts', key: 'n2.in.charts' },
  { id: 'cot', key: 'n2.in.cot' },
  { id: 'learn', key: 'n2.sec.academy' },
  { id: 'mine-hub', key: 'n2.sec.mine' },
  { id: 'journal', key: 'n2.me.journal' },
  { id: 'risk', key: 'n2.me.risk' },
  { id: 'hedge', key: 'hd.tab' },
  { id: 'settings-hub', key: 'n2.sec.settings' },
  { id: 'settings', key: 'n2.set.prefs' },
  { id: 'data-health', key: 'n2.item.data-health' },
  { id: 'data-import', key: 'n2.item.data-import' },
  { id: 'term-structure', key: 'n2.item.term-structure' },
  { id: 'explorer', key: 'n2.item.explorer' },
  { id: 'analysis', key: 'n2.item.analysis' },
  { id: 'scanner', key: 'n2.item.scanner' },
  { id: 'signals', key: 'n2.item.signals' },
  { id: 'technical', key: 'n2.item.technical' },
  { id: 'backtest', key: 'n2.item.backtest' },
];

const PER_GROUP = 8;

export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { setActiveModule } = useTerminal();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [glossary, setGlossary] = useState<{ term: string; def: string }[] | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const uid = useId();
  const listId = `${uid}-list`;

  useFocusTrap(boxRef, true, { onEscape: onClose });

  // Glossary is only fetched once the palette opens.
  useEffect(() => {
    let alive = true;
    void import('../../views/learn/glossary')
      .then((m) => alive && setGlossary(m.GLOSSARY))
      .catch(() => alive && setGlossary([]));
    return () => {
      alive = false;
    };
  }, []);

  const pages = useMemo<Item[]>(
    () => NAV.map((n) => ({ id: `p:${n.id}`, kind: 'page', label: t(n.key), module: n.id })),
    [t]
  );
  const lessons = useMemo<Item[]>(
    () =>
      ALL_LESSON_META.map(({ level, lesson }) => ({
        id: `l:${lesson.id}`,
        kind: 'lesson',
        label: lesson.title,
        keywords: lesson.objective,
        hint: t('ac.lesson.levelTag', { n: level.number }),
        lessonId: lesson.id,
      })),
    [t]
  );
  const terms = useMemo<Item[]>(
    () => (glossary ?? []).map((g, i) => ({ id: `g:${i}`, kind: 'term', label: g.term, keywords: g.def, hint: g.def })),
    [glossary]
  );

  const results = useMemo<Item[]>(() => {
    if (!query.trim()) return rankEntries(pages, '', 12);
    return [...rankEntries(pages, query, PER_GROUP), ...rankEntries(lessons, query, PER_GROUP), ...rankEntries(terms, query, PER_GROUP)];
  }, [query, pages, lessons, terms]);

  const activeIdx = results.length === 0 ? -1 : Math.min(active, results.length - 1);

  useEffect(() => {
    if (activeIdx < 0) return;
    listRef.current?.querySelector(`[data-idx="${activeIdx}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIdx]);

  const choose = (item: Item) => {
    onClose();
    if (item.kind === 'page' && item.module) setActiveModule(item.module);
    else if (item.kind === 'lesson' && item.lessonId) {
      setActiveModule('learn');
      sendAcademyIntent({ lessonId: item.lessonId });
    } else if (item.kind === 'term') {
      setActiveModule('learn');
      sendAcademyIntent({ tab: 'glossary', term: item.label });
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(moveIndex(activeIdx, e.key === 'ArrowDown' ? 1 : -1, results.length));
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      setActive(e.key === 'Home' ? 0 : results.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = results[activeIdx];
      if (item) choose(item);
    }
  };

  const groupLabel = (k: Kind) => t(`pal.${k}` as TKey);

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center px-3 pt-[10vh] bg-[var(--bg)]/70 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('pal.open')}
        data-testid="palette"
        className="w-full max-w-xl min-w-0 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center gap-2 px-3 border-b border-[var(--border)]">
          <Search className="w-4 h-4 text-[var(--muted)] shrink-0" aria-hidden="true" />
          <input
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeIdx >= 0 ? `${uid}-opt-${activeIdx}` : undefined}
            aria-label={t('pal.placeholder')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder={t('pal.placeholder')}
            autoComplete="off"
            spellCheck={false}
            className="flex-1 min-w-0 h-12 bg-transparent text-sm text-[var(--text-strong)] placeholder:text-[var(--faint)] focus:outline-none"
          />
        </div>
        <ul id={listId} ref={listRef} role="listbox" aria-label={t('pal.open')} className="max-h-[50vh] overflow-y-auto p-1">
          {results.map((item, i) => (
            <li
              key={item.id}
              id={`${uid}-opt-${i}`}
              role="option"
              aria-selected={i === activeIdx}
              data-idx={i}
              data-kind={item.kind}
              onMouseMove={() => i !== activeIdx && setActive(i)}
              onClick={() => choose(item)}
              className={`flex items-center gap-2 min-h-10 px-3 py-1.5 rounded-lg cursor-pointer text-sm ${
                i === activeIdx ? 'bg-[var(--accent-soft)] text-[var(--text-strong)]' : 'text-[var(--text)]'
              }`}
            >
              <span className="shrink-0 w-16 text-[10px] uppercase tracking-wide text-[var(--muted)]">{groupLabel(item.kind)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{item.label}</span>
                {item.hint && <span className="block truncate text-xs text-[var(--muted)]">{item.hint}</span>}
              </span>
            </li>
          ))}
        </ul>
        <div className="px-3 py-2 border-t border-[var(--border)] text-xs text-[var(--muted)] flex items-center justify-between gap-2" role="status">
          <span className="min-w-0 truncate">
            {results.length === 0 ? t('pal.empty') : ''}
          </span>
          <span className="hidden sm:inline shrink-0">{t('pal.help')}</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
