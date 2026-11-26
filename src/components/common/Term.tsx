import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useT } from '../../i18n';

/** Glossary keys with plain-language definitions in src/i18n/dict/friendly.ts ('gl.<k>' / 'gl.<k>.def'). */
export type GlossaryKey =
  | 'futures'
  | 'tick'
  | 'margin'
  | 'expiry'
  | 'contango'
  | 'backwardation'
  | 'cot'
  | 'volatility'
  | 'rsi'
  | 'ma'
  | 'openInterest'
  | 'volume'
  | 'leverage'
  | 'stopLoss'
  | 'frontMonth'
  | 'atr'
  | 'percentile'
  | 'cyclePhase'
  | 'bottomScore';

interface TermProps {
  k: GlossaryKey;
  /** Text to show; defaults to the glossary term name. */
  children?: ReactNode;
}

const TIP_WIDTH = 260;

/**
 * Inline glossary term: dotted underline; hover, focus or tap shows a short plain-language definition.
 * The popover is fixed-positioned and clamped to the viewport so it never causes horizontal scroll.
 */
export function Term({ k, children }: TermProps) {
  const t = useT();
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
        aria-describedby={pos ? id : undefined}
        aria-label={`${typeof children === 'string' || typeof children === 'number' ? children : t(`gl.${k}`)} — ${t('gl.hint')}`}
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
        {children ?? t(`gl.${k}`)}
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
          className="z-50 block rounded-md border border-[#334155] bg-[var(--surface-3)] px-3 py-2 text-xs font-normal leading-relaxed text-[var(--text)] shadow-lg pointer-events-none"
        >
          <span className="block font-semibold text-[var(--text-strong)] mb-0.5">{t(`gl.${k}`)}</span>
          {t(`gl.${k}.def`)}
        </span>
      )}
    </>
  );
}
