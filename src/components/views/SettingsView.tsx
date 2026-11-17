import React, { useEffect, useState } from 'react';
import { Check, LogIn, LogOut, Save, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { Timeframe, TradingStyle } from '../../shared/types/instrument';
import type { AccountCurrency, DisplayTimezone } from '../../shared/types/risk';

export function SettingsView() {
  const {
    user,
    firestoreStatus,
    settings,
    authError,
    signInWithGoogle,
    logout,
    saveSettings,
  } = useAuth();

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
      setSaveError('Please enter valid bounded risk parameters before saving.');
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
      setSaveMessage('Settings saved to Cloud Firestore and recorded in auditLogs.');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold text-white tracking-tight">
          Settings & Configuration
        </h1>
        <p className="text-sm text-[#E5E7EB]/65 mt-1">
          Firebase authentication, risk management defaults, and server-side credential policies.
        </p>
      </div>

      {/* Authentication & Firestore Status */}
      <section className="bg-[#111622] border border-[#263244] rounded-lg p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-white">Account & Persistence</h2>
            <p className="text-xs text-[#E5E7EB]/65">
              Firestore Connectivity: <span className="font-mono text-white">{firestoreStatus}</span>
            </p>
            {user ? (
              <p className="text-xs font-mono text-[#22C55E]">
                Signed in as {user.email} · UID: {user.uid}
              </p>
            ) : (
              <p className="text-xs text-[#E5E7EB]/55">
                Sign in with Google to persist risk settings and future trade journals privately in Firestore.
              </p>
            )}
          </div>

          {user ? (
            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#172033] hover:bg-[#EF4444]/15 border border-[#263244] hover:border-[#EF4444]/40 rounded-md text-xs font-medium text-[#E5E7EB] hover:text-[#EF4444] self-start whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Sign Out</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void signInWithGoogle()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#6366F1] hover:bg-[#6366F1]/90 text-white text-xs font-medium rounded-md self-start whitespace-nowrap"
            >
              <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Sign In with Google</span>
            </button>
          )}
        </div>

        {authError && (
          <div className="text-xs text-[#EF4444] bg-[#0B0E14] border border-[#EF4444]/40 rounded p-3">
            {authError}
          </div>
        )}
      </section>

      {/* Risk & Terminal Preferences Form */}
      <form
        onSubmit={handleSubmit}
        className="bg-[#111622] border border-[#263244] rounded-lg p-5 space-y-5"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[#263244] pb-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Risk & Terminal Defaults</h2>
            <p className="text-xs text-[#E5E7EB]/55">
              Enforced deterministically by the Phase 7 Risk Engine; AI cannot override these bounds.
            </p>
          </div>
          <ShieldCheck className="w-5 h-5 text-[#6366F1] shrink-0" aria-hidden="true" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <label className="space-y-1.5 text-xs">
            <span className="block text-[#E5E7EB]/75">Account Equity</span>
            <input
              type="number"
              min={0}
              step="any"
              value={accountEquity}
              onChange={(e) => setAccountEquity(e.target.value)}
              className="w-full bg-[#0B0E14] border border-[#263244] rounded-md px-3 py-2 font-mono text-white focus:outline-none focus:border-[#6366F1]"
            />
          </label>

          <label className="space-y-1.5 text-xs">
            <span className="block text-[#E5E7EB]/75">Account Currency</span>
            <select
              value={accountCurrency}
              onChange={(e) => setAccountCurrency(e.target.value as AccountCurrency)}
              className="w-full bg-[#0B0E14] border border-[#263244] rounded-md px-3 py-2 font-mono text-white focus:outline-none focus:border-[#6366F1]"
            >
              <option value="USD">USD</option>
              <option value="VND">VND</option>
            </select>
          </label>

          <label className="space-y-1.5 text-xs">
            <span className="block text-[#E5E7EB]/75">Risk % Per Trade (0.05–10%)</span>
            <input
              type="number"
              min={0.05}
              max={10}
              step="0.05"
              value={riskPct}
              onChange={(e) => setRiskPct(e.target.value)}
              className="w-full bg-[#0B0E14] border border-[#263244] rounded-md px-3 py-2 font-mono text-white focus:outline-none focus:border-[#6366F1]"
            />
          </label>

          <label className="space-y-1.5 text-xs">
            <span className="block text-[#E5E7EB]/75">Daily Loss Limit % (0.5–25%)</span>
            <input
              type="number"
              min={0.5}
              max={25}
              step="0.1"
              value={dailyLossPct}
              onChange={(e) => setDailyLossPct(e.target.value)}
              className="w-full bg-[#0B0E14] border border-[#263244] rounded-md px-3 py-2 font-mono text-white focus:outline-none focus:border-[#6366F1]"
            />
          </label>

          <label className="space-y-1.5 text-xs">
            <span className="block text-[#E5E7EB]/75">Max Open Positions (1–50)</span>
            <input
              type="number"
              min={1}
              max={50}
              step="1"
              value={maxOpenPositions}
              onChange={(e) => setMaxOpenPositions(e.target.value)}
              className="w-full bg-[#0B0E14] border border-[#263244] rounded-md px-3 py-2 font-mono text-white focus:outline-none focus:border-[#6366F1]"
            />
          </label>

          <label className="space-y-1.5 text-xs">
            <span className="block text-[#E5E7EB]/75">Max Portfolio Risk % (0.5–50%)</span>
            <input
              type="number"
              min={0.5}
              max={50}
              step="0.5"
              value={maxPortfolioRiskPct}
              onChange={(e) => setMaxPortfolioRiskPct(e.target.value)}
              className="w-full bg-[#0B0E14] border border-[#263244] rounded-md px-3 py-2 font-mono text-white focus:outline-none focus:border-[#6366F1]"
            />
          </label>

          <label className="space-y-1.5 text-xs">
            <span className="block text-[#E5E7EB]/75">Max Contracts / Instrument (1–100)</span>
            <input
              type="number"
              min={1}
              max={100}
              step="1"
              value={maxContracts}
              onChange={(e) => setMaxContracts(e.target.value)}
              className="w-full bg-[#0B0E14] border border-[#263244] rounded-md px-3 py-2 font-mono text-white focus:outline-none focus:border-[#6366F1]"
            />
          </label>

          <label className="space-y-1.5 text-xs">
            <span className="block text-[#E5E7EB]/75">Default Trading Style</span>
            <select
              value={tradingStyle}
              onChange={(e) => setTradingStyle(e.target.value as TradingStyle)}
              className="w-full bg-[#0B0E14] border border-[#263244] rounded-md px-3 py-2 font-mono text-white focus:outline-none focus:border-[#6366F1]"
            >
              <option value="SCALPING">SCALPING</option>
              <option value="INTRADAY">INTRADAY</option>
              <option value="SWING">SWING</option>
              <option value="POSITION">POSITION</option>
            </select>
          </label>

          <label className="space-y-1.5 text-xs">
            <span className="block text-[#E5E7EB]/75">Display Timezone</span>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value as DisplayTimezone)}
              className="w-full bg-[#0B0E14] border border-[#263244] rounded-md px-3 py-2 font-mono text-white focus:outline-none focus:border-[#6366F1]"
            >
              <option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh (ICT)</option>
              <option value="UTC">UTC</option>
              <option value="America/Chicago">America/Chicago (CME)</option>
              <option value="Europe/London">Europe/London (ICE)</option>
            </select>
          </label>
        </div>

        {saveError && (
          <div className="text-xs text-[#EF4444] bg-[#0B0E14] border border-[#EF4444]/40 rounded p-3">
            {saveError}
          </div>
        )}

        {saveMessage && (
          <div className="flex items-center gap-2 text-xs text-[#22C55E] bg-[#0B0E14] border border-[#22C55E]/40 rounded p-3">
            <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{saveMessage}</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-4 pt-2">
          <p className="text-xs text-[#E5E7EB]/50">
            Market provider API keys and Gemini keys are managed strictly via server-side secrets.
          </p>
          <button
            type="submit"
            disabled={!user || saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#6366F1] hover:bg-[#6366F1]/90 disabled:opacity-45 text-white text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Save className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{saving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
