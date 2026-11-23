import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTerminal } from '../../contexts/TerminalContext';
import { useTheme } from '../../shared/theme/theme';
import { useT, type TKey } from '../../i18n';
import type { AppModuleId } from '../../shared/types/risk';

export const ONBOARDING_KEY = 'ctap.onboardingDone';
const TOTAL = 5;
const TARGETS: Record<number, AppModuleId> = { 2: 'today-hub', 3: 'learn', 4: 'mine-hub' };

function isDone(): boolean {
  try {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('autostart') === '1') {
      return true;
    }
    return window.localStorage.getItem(ONBOARDING_KEY) === '1';
  } catch {
    return false;
  }
}

/** First-run, skippable 5-step tour. Completion/skip is remembered in localStorage. */
export function OnboardingTour() {
  const t = useT();
  const [theme, setTheme] = useTheme();
  const { setActiveModule } = useTerminal();
  const { user, signInWithGoogle } = useAuth();
  const [open, setOpen] = useState(() => !isDone());
  const [step, setStep] = useState(1);

  if (!open) return null;

  const close = () => {
    try {
      window.localStorage.setItem(ONBOARDING_KEY, '1');
    } catch {
      /* storage unavailable: tour may reappear next visit */
    }
    setOpen(false);
  };
  const next = () => (step >= TOTAL ? close() : setStep(step + 1));
  const target = TARGETS[step];
  const btn = 'px-5 py-3 rounded-xl border text-lg font-semibold min-h-[52px]';
  const k = (s: string) => `ob.s${step}.${s}` as TKey;

  return (
    <div role="dialog" aria-modal="true" aria-label={t(k('title'))} className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-[var(--accent)] bg-[var(--bg)] p-6 text-[var(--text-strong)] shadow-2xl">
        <div className="text-base text-[var(--accent-text)]">{t('ob.step', { n: step, total: TOTAL })}</div>
        <h2 className="mt-2 text-3xl font-bold">{t(k('title'))}</h2>
        <p className="mt-3 text-xl leading-relaxed">{t(k('body'))}</p>

        <div className="mt-5 flex flex-wrap gap-3">
          {step === 1 && (
            <>
              <button type="button" onClick={() => setTheme('dark')} aria-pressed={theme === 'dark'} className={`${btn} ${theme === 'dark' ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--accent-text)]'}`}>
                {t('ob.s1.simple')}
              </button>
              <button type="button" onClick={() => setTheme('light')} aria-pressed={theme === 'light'} className={`${btn} ${theme === 'light' ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--accent-text)]'}`}>
                {t('ob.s1.pro')}
              </button>
            </>
          )}
          {target && (
            <button type="button" onClick={() => setActiveModule(target)} className={`${btn} border-[var(--accent-text)] hover:bg-[var(--accent)]/20`}>
              {t(k('go'))}
            </button>
          )}
          {step === 5 &&
            (user ? (
              <span className="text-lg text-[var(--accent-text)] self-center">{t('ob.s5.signedIn')}</span>
            ) : (
              <button type="button" onClick={() => void signInWithGoogle()} className={`${btn} border-[var(--accent-text)] hover:bg-[var(--accent)]/20`}>
                {t('ob.s5.go')}
              </button>
            ))}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <button type="button" onClick={close} className="text-lg underline text-[var(--muted)] px-2 py-2">
            {t('ob.skip')}
          </button>
          <button type="button" onClick={next} className={`${btn} bg-[var(--accent)] border-[var(--accent)]`}>
            {step >= TOTAL ? t('ob.done') : t('ob.next')}
          </button>
        </div>
      </div>
    </div>
  );
}
