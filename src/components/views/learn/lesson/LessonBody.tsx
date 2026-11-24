import { useId, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, ChevronDown, Lightbulb, Sigma } from 'lucide-react';
import { highlightTextSegments } from '../academyUtils';
import { GLOSSARY } from '../glossary';
import { LessonFigures } from '../diagrams/Figures';
import { buildTermMatcher, figuresByParagraph, inlineSegments, parseBody, pickTerms, splitLong, type Block, type TermMatcher } from './bodyParse';
import { GlossaryTip } from './GlossaryTip';

const MATCHER: TermMatcher = buildTermMatcher(GLOSSARY);

function Hl({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  return (
    <>
      {highlightTextSegments(text, query).map((seg, i) =>
        seg.match ? (
          <mark key={i} data-testid="note-highlight" className="rounded-sm bg-[var(--warning)]/30 text-[var(--text-strong)] px-0.5 font-medium">
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </>
  );
}

/** Renders text with arithmetic chips, glossary chips (consuming `terms`) and search highlight. */
function inline(text: string, query: string, terms: Set<number> | undefined): ReactNode {
  return inlineSegments(text, MATCHER, terms).map((s, i) => {
    if (s.t === 'math')
      return (
        <span key={i} className="font-mono text-[0.92em] whitespace-nowrap rounded px-1 bg-[var(--accent-soft)] text-[var(--text-strong)]">
          <Hl text={s.s} query={query} />
        </span>
      );
    if (s.t === 'term')
      return (
        <GlossaryTip key={i} term={GLOSSARY[s.term].term} def={GLOSSARY[s.term].def}>
          <Hl text={s.s} query={query} />
        </GlossaryTip>
      );
    return <Hl key={i} text={s.s} query={query} />;
  });
}

const matches = (text: string, query: string) => !!query.trim() && highlightTextSegments(text, query).some((s) => s.match);

/** Long paragraph: first sentence + "Đọc thêm" toggle (auto-open when the search query hits hidden text). */
function LongText({ text, query, terms: shared }: { text: string; query: string; terms: Set<number> | undefined }) {
  // Local copy: consumed by lead then rest within this render only (pure under StrictMode).
  const terms = shared && new Set(shared);
  const split = splitLong(text);
  const id = useId();
  const [open, setOpen] = useState(false);
  if (!split) return <p>{inline(text, query, terms)}</p>;
  const expanded = open || matches(split.rest, query);
  return (
    <p>
      {inline(split.lead, query, terms)}{' '}
      <span id={id} hidden={!expanded}>
        {inline(split.rest, query, terms)}{' '}
      </span>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setOpen(!expanded)}
        className="inline-flex items-center gap-0.5 align-baseline text-xs font-medium text-[var(--accent-text)] hover:underline rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      >
        {expanded ? 'Thu gọn' : 'Đọc thêm'}
        <ChevronDown aria-hidden="true" className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
    </p>
  );
}

function StepsBlock({ b, query, terms }: { b: Extract<Block, { kind: 'steps' }>; query: string; terms: Map<number, Set<number>> }) {
  const local = new Map<number, Set<number>>();
  for (let i = b.from; i <= b.to; i++) {
    const v = terms.get(i);
    if (v) local.set(i, new Set(v));
  }
  const t = (i: number) => local.get(Math.min(b.from + i, b.to));
  return (
    <div>
      {b.intro && <p className="mb-2 font-medium text-[var(--text-strong)]">{inline(b.intro, query, local.get(b.from))}</p>}
      <ol className="relative space-y-2.5 pl-0 list-none" data-testid="lesson-stepper">
        {b.steps.map((s, i) => (
          <li key={i} className="relative flex gap-3">
            {i < b.steps.length - 1 && <span aria-hidden="true" className="absolute left-[13px] top-7 bottom-[-10px] w-px bg-[var(--accent)]/30" />}
            <span aria-hidden="true" className="relative z-[1] shrink-0 w-7 h-7 rounded-full border-2 border-[var(--accent)] bg-[var(--surface)] text-xs font-semibold tabular-nums text-[var(--accent-text)] grid place-items-center">
              {i + 1}
            </span>
            <div className="min-w-0 pt-0.5">
              <span className="sr-only">Bước {i + 1}: </span>
              {s.title && <span className="font-semibold text-[var(--text-strong)]">{inline(s.title, query, undefined)}</span>}
              {s.title && s.text ? <span className="text-[var(--muted)]"> · </span> : null}
              {s.text && <span>{inline(s.text, query, t(i))}</span>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function BlockView({ b, query, terms }: { b: Block; query: string; terms: Map<number, Set<number>> }) {
  const shared = terms.get(b.from);
  const own = shared && new Set(shared);
  switch (b.kind) {
    case 'steps':
      return <StepsBlock b={b} query={query} terms={terms} />;
    case 'formula':
      return (
        <div className="rounded-md border border-[var(--accent)]/40 bg-[var(--surface-2)] p-3" data-testid="lesson-formula">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-text)] mb-1.5">
            <Sigma aria-hidden="true" className="w-3.5 h-3.5" />
            {b.label || 'Công thức'}
          </p>
          <p className="font-mono text-[13px] leading-relaxed text-[var(--text-strong)] break-words">
            <Hl text={b.formula} query={query} />
          </p>
          {b.note && <p className="mt-1.5 text-xs text-[var(--muted)]">{inline(b.note, query, own)}</p>}
        </div>
      );
    case 'fields':
      return (
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
          {b.title && <p className="font-semibold text-[var(--text-strong)] mb-2">{inline(b.title, query, undefined)}</p>}
          <dl className="grid gap-1.5 text-[13px]">
            {b.fields.map((f) => (
              <div key={f.label} className="grid grid-cols-[5.5rem_1fr] gap-2">
                <dt className="text-xs font-semibold text-[var(--accent-text)] pt-0.5">{f.label}</dt>
                <dd className="m-0 min-w-0">{inline(f.text, query, own)}</dd>
              </div>
            ))}
          </dl>
        </div>
      );
    case 'example':
      return (
        <div className="rounded-md border border-[var(--accent)]/40 bg-[var(--accent-soft)] p-3" data-testid="lesson-example">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-text)] mb-1">
            <Lightbulb aria-hidden="true" className="w-3.5 h-3.5" />
            Ví dụ
          </p>
          <div className="text-sm leading-relaxed">
            <LongText text={b.text.replace(/^Ví dụ\s*:?\s*/, '').replace(/^\p{Ll}/u, (c) => c.toUpperCase())} query={query} terms={own} />
          </div>
        </div>
      );
    case 'warning':
      return (
        <div className="rounded-md border border-[var(--warning)]/50 bg-[var(--warning)]/10 p-3" data-testid="lesson-warning">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--warning)] mb-1">
            <AlertTriangle aria-hidden="true" className="w-3.5 h-3.5" />
            {b.title}
          </p>
          <LongText text={b.text.replace(/^\p{Ll}/u, (c) => c.toUpperCase())} query={query} terms={own} />
        </div>
      );
    default:
      return <LongText text={b.text} query={query} terms={own} />;
  }
}

/**
 * Lesson body as visual blocks: steppers, formula cards, example/warning callouts, "Đọc thêm" on long
 * paragraphs, glossary chips, and figures placed after a paragraph via `figureAt` (the remaining
 * figures are rendered by the caller, see figuresByParagraph().rest).
 */
export function LessonBody({ lessonId, body, figures, figureAt, query = '' }: { lessonId: string; body: string[]; figures?: string[]; figureAt?: Record<string, number>; query?: string }) {
  const blocks = useMemo(() => parseBody(body), [body]);
  const placement = useMemo(() => figuresByParagraph(figureAt, figures, body.length), [figureAt, figures, body.length]);
  // Components copy these sets before consuming them, so a term is marked once per paragraph.
  const terms = useMemo(() => pickTerms(body, MATCHER), [body]);
  return (
    <div className="space-y-3 text-sm leading-relaxed" data-lesson={lessonId}>
      {blocks.map((b) => {
          const figs: string[] = [];
          for (let i = b.from; i <= b.to; i++) figs.push(...(placement.at.get(i) ?? []));
          return (
            <div key={`${lessonId}-${b.from}`} className="space-y-3">
              <BlockView b={b} query={query} terms={terms} />
              {figs.length > 0 && <LessonFigures ids={figs} />}
            </div>
          );
        })}
    </div>
  );
}
