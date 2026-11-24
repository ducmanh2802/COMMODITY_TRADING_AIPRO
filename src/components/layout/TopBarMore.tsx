import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useT } from '../../i18n';
import { LanguageSwitch } from '../common/LanguageSwitch';
import { ThemeSwitch } from '../common/ThemeSwitch';
import { ReadabilitySwitch } from '../common/ReadabilitySwitch';

/** Overflow menu (theme + language) used below the xl breakpoint where the TopBar would not fit. */
export function TopBarMore() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        box.current?.querySelector('button')?.focus();
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative xl:hidden" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t('topbar.more')}
        title={t('topbar.more')}
        aria-haspopup="true"
        aria-expanded={open}
        className="w-10 h-10 grid place-items-center bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border)] rounded-[10px] text-[var(--text)] transition-colors"
      >
        <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
      </button>
      {open && (
        <div
          role="region"
          aria-label={t('topbar.moreTitle')}
          className="absolute right-0 mt-2 z-40 flex flex-col gap-2 p-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl"
        >
          <ThemeSwitch />
          <LanguageSwitch />
          <ReadabilitySwitch />
        </div>
      )}
    </div>
  );
}
