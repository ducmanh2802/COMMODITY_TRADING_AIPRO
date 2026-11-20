import type { ElementType, HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  /** Adds hover affordance for clickable cards. */
  interactive?: boolean;
  tone?: 'default' | 'accent' | 'warning';
  padded?: boolean;
  children?: ReactNode;
}

const TONES = {
  default: 'border-[var(--border)]',
  accent: 'border-[var(--accent)]/40',
  warning: 'border-[#F59E0B]/40',
};

/** Layered surface with subtle border, radius and shadow. */
export function Card({ as, interactive = false, tone = 'default', padded = true, className = '', children, ...rest }: CardProps) {
  const Tag = (as ?? 'div') as ElementType;
  return (
    <Tag
      className={`bg-[var(--surface)] border ${TONES[tone]} rounded-[var(--radius-md)] shadow-[var(--shadow-card)] min-w-0 ${
        padded ? 'p-4' : ''
      } ${
        interactive
          ? 'transition hover:bg-[var(--surface-2)] hover:border-[var(--accent)]/50 hover:-translate-y-px cursor-pointer text-left'
          : ''
      } ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}
