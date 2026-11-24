import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';

const TIP_WIDTH = 260;

/**
 * Glossary chip for lesson text. Same look and behaviour as common/Term (dotted underline; hover, focus
 * or tap shows the definition in a fixed, viewport-clamped popover), but the definition comes from the
 * academy glossary (glossary.ts) instead of the i18n GlossaryKey set.
 */
export function GlossaryTip({ term, def, children }: { term: string; def: string; children: ReactNode }) {
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);

  const show = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const width = Math.min(TIP_WIDTH, vw - 16);
    const left = Math.max(8, Math.min(r.left + r.width / 2 - width / 2, vw - width - 8));
    const above = r.bottom + 120 > window.innerHeight && r.top > 140;
    setPos({ left, top: above ? r.top - 6 : r.bottom + 6, above });
  }, []);
  const hide = useCallback(() => setPos(null), []);

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [pos]);

  return (
    <>
      <span
        ref={ref}
        tabIndex={0}
        role="button"
        data-testid="lesson-term"
        aria-describedby={pos ? id : undefined}
        aria-label={`${typeof children === 'string' ? children : term} — xem giải thích thuật ngữ`}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => {
          e.stopPropagation();
          if (pos) hide();
          else show();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') hide();
        }}
        className="underline decoration-dotted decoration-[var(--accent)]/70 underline-offset-[3px] cursor-help focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] rounded-sm"
      >
        {children}
      </span>
      {pos && (
        <span
          id={id}
          role="tooltip"
          style={{
            position: 'fixed',
            left: pos.left,
            top: pos.top,
            width: Math.min(TIP_WIDTH, window.innerWidth - 16),
            transform: pos.above ? 'translateY(-100%)' : undefined,
          }}
          className="z-50 block rounded-md border border-[var(--border)] bg-[var(--surface-3)] px-3 py-2 text-xs font-normal leading-relaxed text-[var(--text)] shadow-lg pointer-events-none"
        >
          <span className="block font-semibold text-[var(--text-strong)] mb-0.5">{term}</span>
          {def}
        </span>
      )}
    </>
  );
}
