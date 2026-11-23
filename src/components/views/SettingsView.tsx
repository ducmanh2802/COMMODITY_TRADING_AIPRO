import React, { useEffect, useState } from 'react';
import { Check, LogIn, LogOut, Save, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { Timeframe, TradingStyle } from '../../shared/types/instrument';
import type { AccountCurrency, DisplayTimezone } from '../../shared/types/risk';
import { useT } from '../../i18n';
import { LanguageSwitch } from '../common/LanguageSwitch';
import { ThemeSwitch } from '../common/ThemeSwitch';
import { useUiMode } from '../../contexts/UiModeContext';
import { BackupCard } from './BackupCard';

export function SettingsView() {
  const {
    user,
    firestoreStatus,
    settings,
    authError,
    settingsError,
    signInWithGoogle,
    logout,
    saveSettings,
  } = useAuth();
  const t = useT();
  const { mode: uiMode } = useUiMode();

  const [accountEquity, setAccountEquity] = useState(String(settings.accountEquity));
  const [accountCurrency, setAccountCurrency] = useState<AccountCurrency>(settings.accountCurrency);
  const [riskPct, setRiskPct] = useState(String(settings.riskPercentagePerTrade));
  const [dailyLossPct, setDailyLossPct] = useState(String(settings.dailyLossLimitPct));
  const [maxOpenPositions, setMaxOpenPositions] = useState(String(settings.maxOpenPositions));
  const [maxPortfolioRiskPct, setMaxPortfolioRiskPct] = useState(
    String(settings.maxPortfolioRiskPct)
  );
  const [maxContracts, setMaxContracts] = useState(String(settings.maxContractsPerInstrument));
  const [tradingStyle, setTradingStyle] = useState<TradingStyle>(settings.defaultTradingStyle);
  const [timeframe, setTimeframe] = useState<Timeframe>(settings.defaultTimeframe);
  const [timezone, setTimezone] = useState<DisplayTimezone>(settings.displayTimezone);

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setAccountEquity(String(settings.accountEquity));
    setAccountCurrency(settings.accountCurrency);
    setRiskPct(String(settings.riskPercentagePerTrade));
    setDailyLossPct(String(settings.dailyLossLimitPct));
    setMaxOpenPositions(String(settings.maxOpenPositions));
    setMaxPortfolioRiskPct(String(settings.maxPortfolioRiskPct));
    setMaxContracts(String(settings.maxContractsPerInstrument));
    setTradingStyle(settings.defaultTradingStyle);
    setTimeframe(settings.defaultTimeframe);
    setTimezone(settings.displayTimezone);
  }, [settings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveMessage(null);
    setSaveError(null);

    const parsedEquity = Number(accountEquity);
    const parsedRisk = Number(riskPct);
    const parsedDaily = Number(dailyLossPct);
    const parsedMaxOpen = Number(maxOpenPositions);
    const parsedMaxPort = Number(maxPortfolioRiskPct);
    const parsedMaxContracts = Number(maxContracts);

    if (
      !Number.isFinite(parsedEquity) ||
      parsedEquity < 0 ||
      !Number.isFinite(parsedRisk) ||
      parsedRisk < 0.05 ||
      parsedRisk > 10 ||
      !Number.isFinite(parsedDaily) ||
      parsedDaily < 0.5 ||
      parsedDaily > 25 ||
      !Number.isInteger(parsedMaxOpen) ||
      parsedMaxOpen < 1 ||
      parsedMaxOpen > 50 ||
      !Number.isFinite(parsedMaxPort) ||
      parsedMaxPort < 0.5 ||
      parsedMaxPort > 50 ||
      !Number.isInteger(parsedMaxContracts) ||
      parsedMaxContracts < 1 ||
      parsedMaxContracts > 100
    ) {
      setSaveError(t('dash.st.invalid'));
      return;
    }

    setSaving(true);
    try {
      await saveSettings({
        accountEquity: parsedEquity,
        accountCurrency,
        riskPercentagePerTrade: parsedRisk,
        dailyLossLimitPct: parsedDaily,
        maxOpenPositions: parsedMaxOpen,
        maxPortfolioRiskPct: parsedMaxPort,
        maxContractsPerInstrument: parsedMaxContracts,
        defaultTradingStyle: tradingStyle,
        defaultTimeframe: timeframe,
        displayTimezone: timezone,
      });
      setSaveMessage(t('dash.st.saved'));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('dash.st.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text-strong)] tracking-tight">
          {t('dash.st.title')}
        </h1>
        <p className="text-sm text-[var(--text)]/65 mt-1">
          {t('dash.st.subtitle')}
        </p>
      </div>

      {/* Theme: dark (default) / light */}
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('theme.label')}</h2>
          <ThemeSwitch large />
        </div>
        <p className="text-xs text-[var(--text)]/65 leading-relaxed">{t('theme.hint')}</p>
      </section>

      {/* Interface language */}
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('dash.st.langTitle')}</h2>
          <LanguageSwitch showLabel />
        </div>
        <p className="text-xs text-[var(--text)]/65 leading-relaxed">{t('lang.hint')}</p>
      </section>

      {/* Authentication & Firestore Status */}
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('dash.st.account')}</h2>
            <p className="text-xs text-[var(--text)]/65">
              {t('dash.st.firestore')} <span className="font-mono text-[var(--text-strong)]">{firestoreStatus === 'SIGNED_OUT' ? t('fs.signedOut') : firestoreStatus}</span>
            </p>
            {user ? (
              <p className="text-xs font-mono text-[var(--positive)]">
                {t('dash.st.signedIn', { email: user.email, uid: user.uid })}
              </p>
            ) : (
              <p className="text-xs text-[var(--text)]/55">
                {t('dash.st.signInHint')}
              </p>
            )}
          </div>

          {user ? (
            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--surface-2)] hover:bg-[var(--negative)]/15 border border-[var(--border)] hover:border-[var(--negative)]/40 rounded-md text-xs font-medium text-[var(--text)] hover:text-[var(--negative)] self-start whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('dash.st.signOut')}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void signInWithGoogle()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-white text-xs font-medium rounded-md self-start whitespace-nowrap"
            >
              <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('dash.st.signIn')}</span>
            </button>
          )}
        </div>

        {authError && (
          <div className="text-xs text-[var(--negative)] bg-[var(--bg)] border border-[var(--negative)]/40 rounded p-3">
            {authError}
          </div>
        )}

        {settingsError && (
          <div className="text-xs text-[var(--negative)] bg-[var(--bg)] border border-[var(--negative)]/40 rounded p-3">
            {settingsError}
          </div>
        )}
      </section>

      {/* Risk & Terminal Preferences Form */}
      <form
        onSubmit={handleSubmit}
        className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 space-y-5"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('dash.st.riskTitle')}</h2>
            <p className="text-xs text-[var(--text)]/55">
              {t('dash.st.riskSub')}
            </p>
          </div>
          <ShieldCheck className="w-5 h-5 text-[var(--accent)] shrink-0" aria-hidden="true" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <label className="space-y-1.5 text-xs">
            <span className="block text-[var(--text)]/75">{t('dash.st.equity')}</span>
            <input
              type="number"
              min={0}
              step="any"
              value={accountEquity}
              onChange={(e) => setAccountEquity(e.target.value)}
              className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-2 font-mono text-[var(--text-strong)] focus:outline-none focus:border-[var(--accent)]"
            />
          </label>

          <label className="space-y-1.5 text-xs">
            <span className="block text-[var(--text)]/75">{t('dash.st.currency')}</span>
            <select
              value={accountCurrency}
              onChange={(e) => setAccountCurrency(e.target.value as AccountCurrency)}
              className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-2 font-mono text-[var(--text-strong)] focus:outline-none focus:border-[var(--accent)]"
            >
              <option value="USD">USD</option>
              <option value="VND">VND</option>
            </select>
          </label>

          <label className="space-y-1.5 text-xs">
            <span className="block text-[var(--text)]/75">{t('dash.st.riskPct')}</span>
            <input
              type="number"
              min={0.05}
              max={10}
              step="0.05"
              value={riskPct}
              onChange={(e) => setRiskPct(e.target.value)}
              className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-2 font-mono text-[var(--text-strong)] focus:outline-none focus:border-[var(--accent)]"
            />
          </label>

          <label className="space-y-1.5 text-xs">
            <span className="block text-[var(--text)]/75">{t('dash.st.dailyLoss')}</span>
            <input
              type="number"
              min={0.5}
              max={25}
              step="0.1"
              value={dailyLossPct}
              onChange={(e) => setDailyLossPct(e.target.value)}
              className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-2 font-mono text-[var(--text-strong)] focus:outline-none focus:border-[var(--accent)]"
            />
          </label>

          <label className="space-y-1.5 text-xs">
            <span className="block text-[var(--text)]/75">{t('dash.st.maxOpen')}</span>
            <input
              type="number"
              min={1}
              max={50}
              step="1"
              value={maxOpenPositions}
              onChange={(e) => setMaxOpenPositions(e.target.value)}
              className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-2 font-mono text-[var(--text-strong)] focus:outline-none focus:border-[var(--accent)]"
            />
          </label>

          <label className="space-y-1.5 text-xs">
            <span className="block text-[var(--text)]/75">{t('dash.st.maxPortRisk')}</span>
            <input
              type="number"
              min={0.5}
              max={50}
              step="0.5"
              value={maxPortfolioRiskPct}
              onChange={(e) => setMaxPortfolioRiskPct(e.target.value)}
              className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-2 font-mono text-[var(--text-strong)] focus:outline-none focus:border-[var(--accent)]"
            />
          </label>

          <label className="space-y-1.5 text-xs">
            <span className="block text-[var(--text)]/75">{t('dash.st.maxContracts')}</span>
            <input
              type="number"
              min={1}
              max={100}
              step="1"
              value={maxContracts}
              onChange={(e) => setMaxContracts(e.target.value)}
              className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-2 font-mono text-[var(--text-strong)] focus:outline-none focus:border-[var(--accent)]"
            />
          </label>

          <label className="space-y-1.5 text-xs">
            <span className="block text-[var(--text)]/75">{t('dash.st.style')}</span>
            <select
              value={tradingStyle}
              onChange={(e) => setTradingStyle(e.target.value as TradingStyle)}
              className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-2 font-mono text-[var(--text-strong)] focus:outline-none focus:border-[var(--accent)]"
            >
              <option value="SCALPING">{t('dash.st.style.SCALPING')}</option>
              <option value="INTRADAY">{t('dash.st.style.INTRADAY')}</option>
              <option value="SWING">{t('dash.st.style.SWING')}</option>
              <option value="POSITION">{t('dash.st.style.POSITION')}</option>
            </select>
          </label>

          <label className="space-y-1.5 text-xs">
            <span className="block text-[var(--text)]/75">{t('dash.st.timezone')}</span>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value as DisplayTimezone)}
              className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-2 font-mono text-[var(--text-strong)] focus:outline-none focus:border-[var(--accent)]"
            >
              <option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh (ICT)</option>
              <option value="UTC">UTC</option>
              <option value="America/Chicago">America/Chicago (CME)</option>
              <option value="Europe/London">Europe/London (ICE)</option>
            </select>
          </label>
        </div>

        {saveError && (
          <div className="text-xs text-[var(--negative)] bg-[var(--bg)] border border-[var(--negative)]/40 rounded p-3">
            {saveError}
          </div>
        )}

        {saveMessage && (
          <div className="flex items-center gap-2 text-xs text-[var(--positive)] bg-[var(--bg)] border border-[var(--positive)]/40 rounded p-3">
            <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{saveMessage}</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-4 pt-2">
          <p className="text-xs text-[var(--text)]/50">
            {t('dash.st.keysNote')}
          </p>
          <button
            type="submit"
            disabled={!user || saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent)]/90 disabled:opacity-45 text-white text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Save className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{saving ? t('dash.st.saving') : t('dash.st.save')}</span>
          </button>
        </div>
      </form>

      <BackupCard />
    </div>
  );
}
