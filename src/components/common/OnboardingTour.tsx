import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTerminal } from '../../contexts/TerminalContext';
import { useUiMode } from '../../contexts/UiModeContext';
import { useT, type TKey } from '../../i18n';
import type { AppModuleId } from '../../shared/types/risk';

export const ONBOARDING_KEY = 'ctap.onboardingDone';
const TOTAL = 5;
const TARGETS: Record<number, AppModuleId> = { 2: 'market-hub', 3: 'learn', 4: 'mine-hub' };

function isDone(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDING_KEY) === '1';
  } catch {
    return false;
  }
}

/** First-run, skippable 5-step tour. Completion/skip is remembered in localStorage. */
export function OnboardingTour() {
  const t = useT();
  const { mode, setMode } = useUiMode();
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
      <div className="w-full max-w-lg rounded-2xl border border-[#6366F1] bg-[#0B0E14] p-6 text-white shadow-2xl">
        <div className="text-base text-[#A5B4FC]">{t('ob.step', { n: step, total: TOTAL })}</div>
        <h2 className="mt-2 text-3xl font-bold">{t(k('title'))}</h2>
        <p className="mt-3 text-xl leading-relaxed">{t(k('body'))}</p>

        <div className="mt-5 flex flex-wrap gap-3">
          {step === 1 && (
            <>
              <button type="button" onClick={() => setMode('simple')} aria-pressed={mode === 'simple'} className={`${btn} ${mode === 'simple' ? 'bg-[#6366F1] border-[#6366F1]' : 'border-[#A5B4FC]'}`}>
                {t('ob.s1.simple')}
              </button>
              <button type="button" onClick={() => setMode('pro')} aria-pressed={mode === 'pro'} className={`${btn} ${mode === 'pro' ? 'bg-[#6366F1] border-[#6366F1]' : 'border-[#A5B4FC]'}`}>
                {t('ob.s1.pro')}
              </button>
            </>
          )}
          {target && (
            <button type="button" onClick={() => setActiveModule(target)} className={`${btn} border-[#A5B4FC] hover:bg-[#6366F1]/20`}>
              {t(k('go'))}
            </button>
          )}
          {step === 5 &&
            (user ? (
              <span className="text-lg text-emerald-300 self-center">{t('ob.s5.signedIn')}</span>
            ) : (
              <button type="button" onClick={() => void signInWithGoogle()} className={`${btn} border-[#A5B4FC] hover:bg-[#6366F1]/20`}>
                {t('ob.s5.go')}
              </button>
            ))}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <button type="button" onClick={close} className="text-lg underline text-[#9CA3AF] px-2 py-2">
            {t('ob.skip')}
          </button>
          <button type="button" onClick={next} className={`${btn} bg-[#6366F1] border-[#6366F1]`}>
            {step >= TOTAL ? t('ob.done') : t('ob.next')}
          </button>
        </div>
      </div>
    </div>
  );
}
