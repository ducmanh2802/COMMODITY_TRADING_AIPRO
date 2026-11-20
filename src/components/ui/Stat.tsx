import type { ReactNode } from 'react';

interface StatProps {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'default' | 'positive' | 'negative' | 'warning';
  className?: string;
}

const TONE = {
  default: 'text-[var(--text-strong)]',
  positive: 'text-[var(--positive)]',
  negative: 'text-[var(--negative)]',
  warning: 'text-[var(--warning)]',
};

/** Label + big tabular value (+ optional hint). */
export function Stat({ label, value, hint, tone = 'default', className = '' }: StatProps) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums leading-tight ${TONE[tone]}`}>{value}</p>
      {hint != null && <p className="mt-0.5 text-xs text-[var(--faint)]">{hint}</p>}
    </div>
  );
}
