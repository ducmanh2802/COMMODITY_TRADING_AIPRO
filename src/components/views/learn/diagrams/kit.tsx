import type { ReactNode } from 'react';

/*
 * Shared building blocks for lesson figures (inline SVG, theme tokens only).
 * Blue (--positive) = up / gain, apricot (--negative) = down / loss, --warning = caution,
 * --accent = neutral highlight. Never hex colours, never green/red.
 */
export const T = { fontSize: 11, fill: 'var(--text)' } as const;
export const M = { fontSize: 10, fill: 'var(--muted)' } as const;
export const S = { fontSize: 12, fill: 'var(--text-strong)', fontWeight: 600 } as const;

export function Figure({ title, desc, w = 360, h = 220, children }: { title: string; desc: string; w?: number; h?: number; children: ReactNode }) {
  return (
    <figure className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2 m-0">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" className="w-full h-auto" style={{ maxHeight: 380 }} fontFamily="inherit">
        <title>{title}</title>
        <desc>{desc}</desc>
        {children}
      </svg>
      <figcaption className="text-[11px] text-[var(--muted)] px-1 pt-1">{title}</figcaption>
    </figure>
  );
}

export type FigureMap = Record<string, () => ReactNode>;
