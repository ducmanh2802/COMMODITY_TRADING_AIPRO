import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { SLANG } from '../views/learn/glossarySlang';

const TIP_WIDTH = 280;

interface Props {
  /** id in SLANG (src/components/views/learn/glossarySlang.ts). */
  id: string;
  children?: ReactNode;
}

/** Inline slang term: hover, focus or tap shows a plain-language meaning (and risk note when present). */
export function SlangTerm({ id: termId, children }: Props) {
  const entry = SLANG.find((s) => s.id === termId);
  const uid = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);

  const show = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const width = Math.min(TIP_WIDTH, vw - 16);
    const left = Math.max(8, Math.min(r.left + r.width / 2 - width / 2, vw - width - 8));
    const above = r.bottom + 160 > window.innerHeight && r.top > 180;
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

  if (!entry) return <>{children ?? termId}</>;
  return (
    <>
      <span
        ref={ref}
        tabIndex={0}
        role="button"
        aria-describedby={pos ? uid : undefined}
        aria-label={`${entry.term}: xem nghĩa`}
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
        {children ?? entry.term}
      </span>
      {pos && (
        <span
          id={uid}
          role="tooltip"
          style={{
            position: 'fixed',
            left: pos.left,
            top: pos.top,
            width: Math.min(TIP_WIDTH, window.innerWidth - 16),
            transform: pos.above ? 'translateY(-100%)' : undefined,
          }}
          className="z-50 block rounded-md border border-[#334155] bg-[var(--surface-3)] px-3 py-2 text-xs font-normal leading-relaxed text-[var(--text)] shadow-lg pointer-events-none"
        >
          <span className="block font-semibold text-[var(--text-strong)] mb-0.5">{entry.term}</span>
          {entry.meaning}
          {entry.warning && <span className="block mt-1 text-[var(--warning)]">Lưu ý: {entry.warning}</span>}
        </span>
      )}
    </>
  );
}
