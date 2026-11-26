import { RefreshCw } from 'lucide-react';
import { useT } from '../../i18n';
import type { UserError } from './friendlyError';

interface Props {
  error: UserError;
  /** Replaces the friendly line, e.g. t("brief.error", { msg: error.message }). */
  text?: string;
  onRetry?: () => void;
  className?: string;
}

/** Friendly error line + optional retry + raw detail collapsed under "Technical details". */
export function ErrorNote({ error, text, onRetry, className = '' }: Props) {
  const t = useT();
  return (
    <div role="alert" className={`text-xs ${className.includes("text-") ? "" : "text-[var(--warning)]"} space-y-1 ${className}`}>
      <p>
        {text ?? error.message}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="ml-2 inline-flex items-center gap-1 underline underline-offset-2 hover:no-underline"
          >
            <RefreshCw className="w-3 h-3" aria-hidden="true" />
            {t('err2.retry')}
          </button>
        )}
      </p>
      {error.detail && (
        <details className="text-[var(--muted)]">
          <summary className="cursor-pointer select-none">{t('err2.details')}</summary>
          <p className="mt-1 font-mono break-all">{error.detail}</p>
        </details>
      )}
    </div>
  );
}
