import { Moon, Sun } from 'lucide-react';
import { useT } from '../../i18n';
import { useTheme, type Theme } from '../../shared/theme/theme';

/** Two-option switch: dark (default) / light. */
export function ThemeSwitch({ large = false }: { large?: boolean }) {
  const [theme, setTheme] = useTheme();
  const t = useT();
  const opts: { id: Theme; icon: typeof Sun; label: string }[] = [
    { id: 'dark', icon: Moon, label: t('theme.dark') },
    { id: 'light', icon: Sun, label: t('theme.light') },
  ];
  return (
    <div
      role="group"
      aria-label={t('theme.label')}
      className={`inline-flex items-center gap-0.5 bg-[var(--bg)] border border-[var(--border)] rounded-[10px] p-0.5 ${large ? 'h-12' : 'h-9'}`}
    >
      {opts.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          type="button"
          aria-pressed={theme === id}
          title={label}
          onClick={() => setTheme(id)}
          className={`h-full inline-flex items-center gap-1.5 px-2.5 ${large ? 'text-base px-4' : 'text-xs'} font-semibold rounded-lg whitespace-nowrap transition-colors ${
            theme === id ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)] hover:text-[var(--text-strong)]'
          }`}
        >
          <Icon className={large ? 'w-5 h-5' : 'w-4 h-4'} aria-hidden="true" />
          <span className={large ? '' : 'hidden lg:inline'}>{label}</span>
        </button>
      ))}
    </div>
  );
}
