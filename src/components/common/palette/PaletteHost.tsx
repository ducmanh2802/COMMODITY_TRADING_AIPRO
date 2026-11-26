import { lazy, Suspense, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { useT } from '../../../i18n';

const CommandPalette = lazy(() => import('./CommandPalette'));

/** Search button + Ctrl/Cmd+K. The palette chunk loads only on first open. */
export function PaletteHost() {
  const t = useT();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`${t('pal.open')} (Ctrl+K)`}
        aria-haspopup="dialog"
        data-testid="palette-open"
        className="w-10 h-10 grid place-items-center bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border)] rounded-[10px] text-[var(--text)] transition-colors"
      >
        <Search className="w-3.5 h-3.5" aria-hidden="true" />
        <span className="sr-only">{t('pal.open')}</span>
      </button>
      {open && (
        <Suspense fallback={null}>
          <CommandPalette onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
