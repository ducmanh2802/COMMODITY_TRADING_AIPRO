import { useId, useState, type ReactNode } from 'react';
import { useT } from '../../i18n';

interface SourceChipProps {
  sources: string[];
  className?: string;
  children?: ReactNode;
}

const URL_RE = /^https?:\/\//;

/**
 * Compact "Source" chip; the full attribution lines open in a small popover.
 * Phrasing content only (span/button/a) so it is valid inside <p>.
 */
export function SourceChip({ sources, className, children }: SourceChipProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const popId = useId();
  const items = sources.filter(Boolean);
  if (items.length === 0) return null;

  return (
    <span
      className={`relative inline-block align-middle text-xs ${className ?? ''}`}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={popId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-9 items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 font-medium text-[var(--muted)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
      >
        {children ?? t('common.source')}
        {items.length > 1 && <span aria-hidden="true">({items.length})</span>}
      </button>
      {open && (
        <span
          id={popId}
          role="group"
          className="absolute left-0 top-full z-50 mt-1 block w-max min-w-[200px] max-w-[320px] rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-1.5 text-[var(--text)] shadow-lg"
        >
          {items.map((src, i) => (
            <span key={i} className="block break-all rounded-sm px-2 py-1 hover:bg-[var(--surface-3)]">
              {URL_RE.test(src) ? (
                <a href={src} target="_blank" rel="noreferrer" className="underline decoration-dotted">
                  {src.replace(URL_RE, '')}
                </a>
              ) : (
                src
              )}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
