import { useUiMode, type UiMode } from '../../../contexts/UiModeContext';
import { useT } from '../../../i18n';

/** Two-option switch Dễ dùng / Chuyên sâu (used in the TopBar, the simple header and Settings). */
export function ModeSwitch({ large = false }: { large?: boolean }) {
  const { mode, setMode } = useUiMode();
  const t = useT();
  const opts: UiMode[] = ['simple', 'pro'];
  return (
    <div
      role="group"
      aria-label={t('sm.mode.label')}
      className={`inline-flex items-center gap-0.5 bg-[var(--bg)] border border-[var(--border)] rounded-[10px] p-0.5 ${large ? 'h-12' : 'h-9'}`}
    >
      {opts.map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          onClick={() => setMode(m)}
          className={`h-full px-3 ${large ? 'min-w-[96px] text-base' : 'text-[11px]'} font-semibold rounded-lg whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${
            mode === m ? 'bg-[var(--accent)] text-white' : 'text-[var(--text)]/80 hover:text-[var(--text-strong)]'
          }`}
        >
          {t(m === 'simple' ? 'sm.mode.simple' : 'sm.mode.pro')}
        </button>
      ))}
    </div>
  );
}
