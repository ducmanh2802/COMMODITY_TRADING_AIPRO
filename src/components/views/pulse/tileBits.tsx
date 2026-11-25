import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';

export const toneCls = (v: number | null): string =>
  v === null || v === 0 ? 'text-[var(--muted)]' : v > 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]';

/** Arrow + signed text, tinted by direction (soft palette: blue up, apricot down). */
export function Delta({ v, text, label }: { v: number | null; text: string; label?: string }) {
  const Icon = v === null || v === 0 ? Minus : v > 0 ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-0.5 tabular-nums ${toneCls(v)}`}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {text}
      {label && <span className="ml-1 text-[var(--faint)]">{label}</span>}
    </span>
  );
}

/** Thin bar showing where `value` sits between the min and max of `values` (e.g. a sparkline window). */
export function RangeBar({ value, values, ariaLabel }: { value: number | null; values: number[]; ariaLabel: string }) {
  if (value === null || values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pct = max === min ? 50 : Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  return (
    <div role="img" aria-label={`${ariaLabel}: ${Math.round(pct)}%`} title={`${Math.round(pct)}%`} className="relative h-1.5 rounded-full bg-[var(--surface-3)]">
      <div className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)]/30" style={{ width: `${pct}%` }} />
      <div className="absolute top-1/2 h-3 w-1.5 -translate-y-1/2 rounded-full bg-[var(--accent)]" style={{ left: `calc(${pct}% - 3px)` }} />
    </div>
  );
}

/** Collapsed <details> holding explanations / sources; nothing is removed, only folded. */
export function Fold({ summary, children, className = '' }: { summary: ReactNode; children: ReactNode; className?: string }) {
  return (
    <details className={className}>
      <summary className="inline-flex min-h-10 cursor-pointer items-center text-[11px] text-[var(--muted)] hover:text-[var(--text)]">{summary}</summary>
      <div className="mt-1 space-y-1 text-[11px] text-[var(--muted)] break-words">{children}</div>
    </details>
  );
}
