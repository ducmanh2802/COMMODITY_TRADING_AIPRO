import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center text-center gap-2 py-10 px-4 border border-dashed border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--surface)]/60">
      {icon && <div className="text-[var(--faint)]">{icon}</div>}
      <p className="text-sm font-medium text-[var(--text)]">{title}</p>
      {description && <p className="text-xs text-[var(--muted)] max-w-md">{description}</p>}
      {action}
    </div>
  );
}
