import type { ReactNode } from 'react';
import type { DataQualityStatus } from '../../shared/types/market';
import { DataStatusBadge } from '../common/DataStatusBadge';

interface BadgeProps {
  tone?: 'neutral' | 'accent' | 'positive' | 'negative' | 'warning';
  children: ReactNode;
  title?: string;
  className?: string;
}

const TONES = {
  neutral: 'bg-[var(--surface-2)] text-[var(--muted)] border-[var(--border)]',
  accent: 'bg-[var(--accent-soft)] text-[var(--accent-text)] border-[var(--accent)]/30',
  positive: 'bg-[var(--positive)]/10 text-[var(--positive)] border-[var(--positive)]/30',
  negative: 'bg-[var(--negative)]/10 text-[var(--negative)] border-[var(--negative)]/30',
  warning: 'bg-[var(--warning)]/10 text-[var(--warning)] border-[var(--warning)]/30',
};

/** Small pill label. */
export function Badge({ tone = 'neutral', children, title, className = '' }: BadgeProps) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium whitespace-nowrap ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** Data-quality status: thin wrapper over DataStatusBadge (same meaning, labels and tooltips). */
export function StatusBadge(props: {
  status: DataQualityStatus;
  sourceQuality?: string;
  delayMinutes?: number | null;
  compact?: boolean;
}) {
  return <DataStatusBadge {...props} />;
}
