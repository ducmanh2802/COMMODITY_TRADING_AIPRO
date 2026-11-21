import { Languages } from 'lucide-react';
import { LANGS, useI18n } from '../../i18n';

/** Compact VI / EN toggle. Persists the choice (localStorage, guarded). */
export function LanguageSwitch({ showLabel = false }: { showLabel?: boolean }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={t('lang.label')}>
      {showLabel && (
        <span className="inline-flex items-center gap-1 text-xs text-[var(--text)]/70">
          <Languages className="w-3.5 h-3.5" aria-hidden="true" />
          {t('lang.label')}
        </span>
      )}
      <div className="flex items-center gap-0.5 h-9 bg-[var(--bg)] border border-[var(--border)] rounded-[10px] p-0.5">
        {LANGS.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLang(l)}
            aria-pressed={lang === l}
            title={t(l === 'vi' ? 'lang.vi' : 'lang.en')}
            className={`h-full px-2.5 text-[11px] font-semibold rounded-lg transition-colors ${
              lang === l ? 'bg-[var(--accent)] text-white' : 'text-[var(--text)]/70 hover:text-white'
            }`}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}
