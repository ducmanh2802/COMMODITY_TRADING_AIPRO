import type { ReactNode } from 'react';

export interface LegendItem {
  id: string;
  label: string;
  /** CSS colour (usually var(--series-N)). */
  color: string;
  /** line = 2px stroke key (lines), rect = filled square (bars/areas). */
  shape?: 'line' | 'rect';
  dashed?: boolean;
}

/**
 * Legend for >= 2 series (renders nothing for fewer: a single series is named by the chart title).
 * Text uses text tokens only; identity comes from the key beside it.
 */
export function ChartLegend({ items, className = '', trailing }: { items: LegendItem[]; className?: string; trailing?: ReactNode }) {
  if (items.length < 2 && !trailing) return null;
  return (
    <ul className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--muted)] ${className}`} aria-label="legend">
      {items.length >= 2 &&
        items.map((it) => (
          <li key={it.id} className="inline-flex items-center gap-1.5">
            {it.shape === 'rect' ? (
              <span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-[2px]" style={{ background: it.color }} />
            ) : (
              <svg aria-hidden="true" width="14" height="4" className="shrink-0">
                <line x1="0" x2="14" y1="2" y2="2" stroke={it.color} strokeWidth="2" strokeLinecap="round" strokeDasharray={it.dashed ? '3 2' : undefined} />
              </svg>
            )}
            <span>{it.label}</span>
          </li>
        ))}
      {trailing}
    </ul>
  );
}
