import type { ReactNode } from 'react';

interface SectionHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Page-level title (h1) vs. section (h2). */
  level?: 1 | 2;
  className?: string;
}

export function SectionHeader({ title, subtitle, actions, level = 2, className = '' }: SectionHeaderProps) {
  const H = level === 1 ? 'h1' : 'h2';
  return (
    <div className={`flex flex-col sm:flex-row sm:items-end justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        <H
          className={
            level === 1
              ? 'text-2xl font-semibold tracking-tight text-[var(--text-strong)]'
              : 'text-base font-semibold text-[var(--text-strong)]'
          }
        >
          {title}
        </H>
        {subtitle && <p className="mt-1 text-sm text-[var(--muted)] max-w-3xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
