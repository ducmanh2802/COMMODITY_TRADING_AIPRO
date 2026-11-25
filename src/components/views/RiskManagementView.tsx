import { useState } from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTerminal } from '../../contexts/TerminalContext';
import type { AccountCurrency } from '../../shared/types/risk';
import { fmtFixed, fmtInt, fmtNum, useT } from '../../i18n';
import { fieldErrorProps } from '../common/fieldErrors';
import { Fold } from './pulse/tileBits';

interface RiskCalculationResponse {
  valid: boolean;
  rejectionReasons: string[];
  instrumentId: string;
  contractCurrency: string;
  accountCurrency: AccountCurrency;
  fxRateApplied: number | null;
  riskBudget: number | null;
  ticksAtRisk: number | null;
  grossRiskPerContract: number | null;
  estimatedCostsPerContract: number | null;
  riskPerContractInAccountCurrency: number | null;
  recommendedContracts: number | null;
  cappedByLimits: boolean;
  contractNotionalValue: number | null;
  maxLossEstimate: number | null;
  riskRewardRatio: number | null;
  projectedPortfolioRiskPct: number | null;
  marginStatus: 'VERIFIED' | 'UNAVAILABLE';
  marginRequirementPerContract: number | null;
}

function RiskTile({ label, value, tone = 'text-[var(--text-strong)]' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2.5 min-w-0">
      <p className="text-[11px] text-[var(--text)]/60">{label}</p>
      <p className={`text-sm font-semibold break-words ${tone}`}>{value}</p>
    </div>
  );
}

function RiskRow({ label, value, tone = 'text-[var(--text-strong)]' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-[var(--text)]/60">{label}</span>
      <span className={tone}>{value}</span>
    </div>
  );
}

export function RiskManagementView() {
  const { instruments, selectedSymbol, setSelectedSymbol } = useTerminal();
  const { settings } = useAuth();
  const t = useT();

  const [accountEquity, setAccountEquity] = useState(String(settings.accountEquity));
  const [accountCurrency, setAccountCurrency] = useState<AccountCurrency>(settings.accountCurrency);
  const [riskPct, setRiskPct] = useState(String(settings.riskPercentagePerTrade));
  const [dailyLossLimitPct, setDailyLossLimitPct] = useState(String(settings.dailyLossLimitPct));
  const [maxOpenPositions, setMaxOpenPositions] = useState(String(settings.maxOpenPositions));
  const [currentOpenPositions, setCurrentOpenPositions] = useState('0');
  const [maxPortfolioRiskPct, setMaxPortfolioRiskPct] = useState(String(settings.maxPortfolioRiskPct));
  const [currentOpenRiskPct, setCurrentOpenRiskPct] = useState('0');
  const [maxContractsPerInstrument, setMaxContractsPerInstrument] = useState(
    String(settings.maxContractsPerInstrument)
  );

  // No pre-filled prices or fees (fail-closed): the user enters every number (0 is a valid explicit fee).
  const [entryPrice, setEntryPrice] = useState('');
  const [stopLossPrice, setStopLossPrice] = useState('');
  const [takeProfitPrice, setTakeProfitPrice] = useState('');
  const [commission, setCommission] = useState('');
  const [exchangeFee, setExchangeFee] = useState('');
  const [brokerageFee, setBrokerageFee] = useState('');
  const [slippageTicks, setSlippageTicks] = useState('');
  const [fxRate, setFxRate] = useState('');

  const [output, setOutput] = useState<RiskCalculationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalidIds, setInvalidIds] = useState<string[]>([]);
  const [fxFetching, setFxFetching] = useState(false);
  const [fxNotice, setFxNotice] = useState<string | null>(null);
  const [advOpen, setAdvOpen] = useState(false);

  const activeInstrument = instruments.find((i) => i.exchangeSymbol === selectedSymbol);
  const needsFx =
    activeInstrument && activeInstrument.specification.tradingCurrency !== accountCurrency;

  const handleFetchUsdVnd = async () => {
    setFxFetching(true);
    setFxNotice(null);
    try {
      const res = await fetch('/api/market/fx/usdvnd');
      const json = (await res.json()) as {
        status?: string;
        rate?: number | null;
        source?: string;
        reason?: string;
      };
      if (res.ok && json.status === 'CURRENT' && typeof json.rate === 'number') {
        setFxRate(String(Math.round(json.rate)));
        setFxNotice(t('risk.fxVerified', { source: json.source ?? '', rate: fmtInt(json.rate) }));
      } else {
        setFxNotice(
          json.reason ?? t('risk.fxUnavailable')
        );
      }
    } catch {
      setFxNotice(t('risk.fxFailed'));
    } finally {
      setFxFetching(false);
    }
  };

  const handleCalculate = async (e: React.FormEvent) => {
    e.preventDefault();
    const bad = [
      [entryPrice, t('risk.f.entry'), 'risk-entry'],
      [stopLossPrice, t('risk.f.stop'), 'risk-sl'],
      [commission, t('risk.f.commission'), 'risk-comm'],
      [exchangeFee, t('risk.f.exchangeFee'), 'risk-exfee'],
      [brokerageFee, t('risk.f.brokerFee'), 'risk-brkfee'],
      [slippageTicks, t('risk.f.slippage'), 'risk-slip'],
    ].filter(([v]) => v.trim() === '' || !Number.isFinite(Number(v)));
    const missing = bad.map(([, label]) => label);
    setInvalidIds(bad.map(([, , id]) => id));
    if (bad.some(([, , id]) => id !== 'risk-entry' && id !== 'risk-sl')) setAdvOpen(true);
    if (missing.length > 0) {
      setOutput(null);
      setError(t('risk.missing', { fields: missing.join(', ') }));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        symbol: selectedSymbol,
        accountEquity: Number(accountEquity),
        accountCurrency,
        riskPercentagePerTrade: Number(riskPct),
        dailyLossLimitPct: Number(dailyLossLimitPct),
        maxOpenPositions: Math.trunc(Number(maxOpenPositions)),
        currentOpenPositions: Math.trunc(Number(currentOpenPositions)),
        maxPortfolioRiskPct: Number(maxPortfolioRiskPct),
        currentOpenRiskPct: Number(currentOpenRiskPct),
        maxContractsPerInstrument: Math.trunc(Number(maxContractsPerInstrument)),
        entryPrice: Number(entryPrice),
        stopLossPrice: Number(stopLossPrice),
        commissionPerContract: Number(commission),
        exchangeFeePerContract: Number(exchangeFee),
        brokerageFeePerContract: Number(brokerageFee),
        slippageTicks: Number(slippageTicks),
      };
      if (takeProfitPrice.trim() && Number(takeProfitPrice) > 0) {
        payload.takeProfitPrice = Number(takeProfitPrice);
      }
      if (fxRate.trim() && Number(fxRate) > 0) {
        payload.fxRateContractToAccount = Number(fxRate);
      }

      const res = await fetch('/api/risk/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message ?? t('risk.failedValidation'));
      }
      setOutput(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('risk.failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[var(--text-strong)] tracking-tight">
          {t('risk.title')}
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-[var(--text)]/65">{t('c4.risk.one')}</p>
        <Fold summary={t('n2.tdv.info')}>
          <p>{t('risk.subtitle')}</p>
          <p>{t('c4.risk.legend')}</p>
        </Fold>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <form
          onSubmit={(e) => void handleCalculate(e)}
          className="xl:col-span-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="risk-symbol" className="block text-xs text-[var(--text)]/65 mb-1">
                {t('risk.contract')}
              </label>
              <select
                id="risk-symbol"
                value={selectedSymbol}
                onChange={(e) => setSelectedSymbol(e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] aria-[invalid=true]:border-[var(--negative)] rounded-md px-3 py-2 text-xs font-mono text-[var(--text-strong)]"
              >
                {instruments.map((inst) => (
                  <option key={inst.id} value={inst.exchangeSymbol}>
                    {inst.exchange}:{inst.exchangeSymbol} {inst.productName}
                    {inst.specification.verificationStatus === 'VERIFIED' ? '' : ` (${inst.specification.verificationStatus === 'UNVERIFIED' ? t('verify.UNVERIFIED') : inst.specification.verificationStatus})`}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="risk-currency" className="block text-xs text-[var(--text)]/65 mb-1">
                {t('risk.accountCurrency')}
              </label>
              <select
                id="risk-currency"
                value={accountCurrency}
                onChange={(e) => setAccountCurrency(e.target.value as AccountCurrency)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] aria-[invalid=true]:border-[var(--negative)] rounded-md px-3 py-2 text-xs font-mono text-[var(--text-strong)]"
              >
                <option value="USD">USD</option>
                <option value="VND">VND</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="risk-equity" className="block text-xs text-[var(--text)]/65 mb-1">
                {t('risk.equity', { cur: accountCurrency })}
              </label>
              <input
                id="risk-equity"
                type="number"
                step="any"
                value={accountEquity}
                onChange={(e) => setAccountEquity(e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] aria-[invalid=true]:border-[var(--negative)] rounded-md px-3 py-2 text-xs font-mono text-[var(--text-strong)] tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="risk-pct" className="block text-xs text-[var(--text)]/65 mb-1">
                {t('risk.riskPct')}
              </label>
              <input
                id="risk-pct"
                type="number"
                step="0.05"
                value={riskPct}
                onChange={(e) => setRiskPct(e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] aria-[invalid=true]:border-[var(--negative)] rounded-md px-3 py-2 text-xs font-mono text-[var(--text-strong)] tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="risk-max-contracts" className="block text-xs text-[var(--text)]/65 mb-1">
                {t('risk.maxContracts')}
              </label>
              <input
                id="risk-max-contracts"
                type="number"
                min="1"
                value={maxContractsPerInstrument}
                onChange={(e) => setMaxContractsPerInstrument(e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] aria-[invalid=true]:border-[var(--negative)] rounded-md px-3 py-2 text-xs font-mono text-[var(--text-strong)] tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="risk-entry" className="block text-xs text-[var(--text)]/65 mb-1">
                {t('risk.entry')}
              </label>
              <input
                id="risk-entry"
                {...fieldErrorProps(!!error && invalidIds.includes('risk-entry'), 'risk-form-err')}
                type="number"
                step="any"
                placeholder={t('risk.entryPh')}
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] aria-[invalid=true]:border-[var(--negative)] rounded-md px-3 py-2 text-xs font-mono text-[var(--text-strong)] tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="risk-sl" className="block text-xs text-[var(--text)]/65 mb-1">
                {t('risk.stop')}
              </label>
              <input
                id="risk-sl"
                {...fieldErrorProps(!!error && invalidIds.includes('risk-sl'), 'risk-form-err')}
                type="number"
                step="any"
                placeholder={t('risk.stopPh')}
                value={stopLossPrice}
                onChange={(e) => setStopLossPrice(e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] aria-[invalid=true]:border-[var(--negative)] rounded-md px-3 py-2 text-xs font-mono text-[var(--text-strong)] tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="risk-tp" className="block text-xs text-[var(--text)]/65 mb-1">
                {t('risk.tp')}
              </label>
              <input
                id="risk-tp"
                type="number"
                step="any"
                placeholder={t('risk.optional')}
                value={takeProfitPrice}
                onChange={(e) => setTakeProfitPrice(e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] aria-[invalid=true]:border-[var(--negative)] rounded-md px-3 py-2 text-xs font-mono text-[var(--text-strong)] tabular-nums"
              />
            </div>
          </div>

          <details open={advOpen || !!needsFx} onToggle={(e) => setAdvOpen(e.currentTarget.open)} className="rounded-md border border-[var(--border)] p-3">
            <summary className="cursor-pointer min-h-10 inline-flex items-center text-xs font-medium text-[var(--text)]">{t('c4.risk.adv')}</summary>
            <div className="mt-3 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label htmlFor="risk-comm" className="block text-xs text-[var(--text)]/65 mb-1">
                {t('risk.commission')}
              </label>
              <input
                id="risk-comm"
                {...fieldErrorProps(!!error && invalidIds.includes('risk-comm'), 'risk-form-err')}
                type="number"
                step="any"
                placeholder={t('risk.commissionPh')}
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] aria-[invalid=true]:border-[var(--negative)] rounded-md px-3 py-2 text-xs font-mono text-[var(--text-strong)] tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="risk-exfee" className="block text-xs text-[var(--text)]/65 mb-1">
                {t('risk.exFee')}
              </label>
              <input
                id="risk-exfee"
                {...fieldErrorProps(!!error && invalidIds.includes('risk-exfee'), 'risk-form-err')}
                type="number"
                step="any"
                placeholder={t('risk.exFeePh')}
                value={exchangeFee}
                onChange={(e) => setExchangeFee(e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] aria-[invalid=true]:border-[var(--negative)] rounded-md px-3 py-2 text-xs font-mono text-[var(--text-strong)] tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="risk-brkfee" className="block text-xs text-[var(--text)]/65 mb-1">
                {t('risk.brkFee')}
              </label>
              <input
                id="risk-brkfee"
                {...fieldErrorProps(!!error && invalidIds.includes('risk-brkfee'), 'risk-form-err')}
                type="number"
                step="any"
                placeholder={t('risk.brkFeePh')}
                value={brokerageFee}
                onChange={(e) => setBrokerageFee(e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] aria-[invalid=true]:border-[var(--negative)] rounded-md px-3 py-2 text-xs font-mono text-[var(--text-strong)] tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="risk-slip" className="block text-xs text-[var(--text)]/65 mb-1">
                {t('risk.slippage')}
              </label>
              <input
                id="risk-slip"
                {...fieldErrorProps(!!error && invalidIds.includes('risk-slip'), 'risk-form-err')}
                type="number"
                step="0.5"
                placeholder={t('risk.slippagePh')}
                value={slippageTicks}
                onChange={(e) => setSlippageTicks(e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] aria-[invalid=true]:border-[var(--negative)] rounded-md px-3 py-2 text-xs font-mono text-[var(--text-strong)] tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-[var(--border)]">
            <div>
              <label htmlFor="risk-open-pos" className="block text-xs text-[var(--text)]/65 mb-1">
                {t('risk.openPos')}
              </label>
              <div className="flex gap-1.5">
                <input
                  id="risk-open-pos"
                  type="number"
                  min="0"
                  value={currentOpenPositions}
                  onChange={(e) => setCurrentOpenPositions(e.target.value)}
                  className="w-1/2 bg-[var(--bg)] border border-[var(--border)] aria-[invalid=true]:border-[var(--negative)] rounded-md px-2 py-1.5 text-xs font-mono text-[var(--text-strong)]"
                />
                <input
                  aria-label={t('risk.maxOpenPos')}
                  type="number"
                  min="1"
                  value={maxOpenPositions}
                  onChange={(e) => setMaxOpenPositions(e.target.value)}
                  className="w-1/2 bg-[var(--bg)] border border-[var(--border)] aria-[invalid=true]:border-[var(--negative)] rounded-md px-2 py-1.5 text-xs font-mono text-[var(--text-strong)]"
                />
              </div>
            </div>

            <div>
              <label htmlFor="risk-port-pct" className="block text-xs text-[var(--text)]/65 mb-1">
                {t('risk.openRisk')}
              </label>
              <div className="flex gap-1.5">
                <input
                  id="risk-port-pct"
                  type="number"
                  step="0.1"
                  value={currentOpenRiskPct}
                  onChange={(e) => setCurrentOpenRiskPct(e.target.value)}
                  className="w-1/2 bg-[var(--bg)] border border-[var(--border)] aria-[invalid=true]:border-[var(--negative)] rounded-md px-2 py-1.5 text-xs font-mono text-[var(--text-strong)]"
                />
                <input
                  aria-label={t('risk.maxPortRisk')}
                  type="number"
                  step="0.5"
                  value={maxPortfolioRiskPct}
                  onChange={(e) => setMaxPortfolioRiskPct(e.target.value)}
                  className="w-1/2 bg-[var(--bg)] border border-[var(--border)] aria-[invalid=true]:border-[var(--negative)] rounded-md px-2 py-1.5 text-xs font-mono text-[var(--text-strong)]"
                />
              </div>
            </div>

            <div>
              <label htmlFor="risk-daily-lim" className="block text-xs text-[var(--text)]/65 mb-1">
                {t('risk.dailyLimit')}
              </label>
              <input
                id="risk-daily-lim"
                type="number"
                step="0.5"
                value={dailyLossLimitPct}
                onChange={(e) => setDailyLossLimitPct(e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] aria-[invalid=true]:border-[var(--negative)] rounded-md px-2.5 py-1.5 text-xs font-mono text-[var(--text-strong)]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label htmlFor="risk-fx" className="block text-xs text-[var(--text)]/65">
                  {t('risk.fxRate', { from: activeInstrument?.specification.tradingCurrency ?? 'USD', to: accountCurrency })}
                </label>
                {accountCurrency === 'VND' && (
                  <button
                    type="button"
                    onClick={() => void handleFetchUsdVnd()}
                    disabled={fxFetching}
                    className="text-[11px] font-mono text-[var(--accent)] hover:underline disabled:opacity-50"
                  >
                    {fxFetching ? t('risk.fetching') : t('risk.fetchFx')}
                  </button>
                )}
              </div>
              <input
                id="risk-fx"
                type="number"
                step="any"
                placeholder={needsFx ? t('risk.required') : '1.0'}
                value={fxRate}
                onChange={(e) => setFxRate(e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] aria-[invalid=true]:border-[var(--negative)] rounded-md px-2.5 py-1.5 text-xs font-mono text-[var(--text-strong)]"
              />
            </div>
          </div>
            </div>
          </details>

          {fxNotice && (
            <p className="text-xs font-mono text-[var(--warning)]">{fxNotice}</p>
          )}

          {error && <p id="risk-form-err" role="alert" className="text-xs font-mono text-[var(--negative)]">{error}</p>}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-white text-xs font-medium rounded-md disabled:opacity-50"
            >
              <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{loading ? t('risk.calculating') : t('risk.calculate')}</span>
            </button>
          </div>
        </form>

        {/* Risk Engine Output */}
        <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-[var(--text-strong)] border-b border-[var(--border)] pb-2">
            {t('risk.result')}
          </h2>

          {!output ? (
            <p className="text-xs text-[var(--text)]/60" title={t('risk.emptyHint')}>
              {t('c4.risk.empty')}
            </p>
          ) : (
            <div className="space-y-3 text-xs tabular-nums">
              {!output.valid && (
                <div className="bg-[var(--bg)] border border-[var(--negative)]/40 rounded-md p-4 space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-[var(--negative)]">
                    <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{t('risk.rejected')}</span>
                  </div>
                  <ul className="list-disc pl-4 space-y-1 text-[var(--text)]/85 font-sans">
                    {output.rejectionReasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              {output.riskBudget !== null && (
                <>
                  {output.valid && (
                    <div className="bg-[var(--bg)] border border-[var(--accent)]/40 rounded-md p-3">
                      <span className="text-[var(--text)]/60 block">{t('risk.recommended')}</span>
                      <span className="text-3xl font-bold text-[var(--accent-text)]">
                        {output.recommendedContracts}
                      </span>
                      {output.cappedByLimits && (
                        <span className="block text-[11px] text-[var(--warning)] mt-0.5">
                          {t('risk.capped')}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <RiskTile label={t('risk.budget')} value={`${fmtNum(output.riskBudget)} ${output.accountCurrency}`} />
                    <RiskTile label={t('risk.maxLoss')} value={`${fmtNum(output.maxLossEstimate)} ${output.accountCurrency}`} tone="text-[var(--negative)]" />
                    <RiskTile
                      label={t('risk.rr')}
                      value={output.riskRewardRatio !== null ? `${fmtFixed(output.riskRewardRatio, 2)}R` : t('common.na')}
                      tone="text-[var(--positive)]"
                    />
                    <RiskTile label={t('risk.projected')} value={`${fmtFixed(output.projectedPortfolioRiskPct, 2)}%`} />
                  </div>

                  <Fold summary={t('c4.risk.detail')}>
                    <div className="space-y-2">
                      <RiskRow label={t('risk.ticksAtRisk')} value={fmtFixed(output.ticksAtRisk, 2)} />
                      <RiskRow label={t('risk.grossRisk')} value={`${fmtFixed(output.grossRiskPerContract, 2)} ${output.contractCurrency}`} />
                      <RiskRow label={t('risk.costs')} value={`${fmtFixed(output.estimatedCostsPerContract, 2)} ${output.contractCurrency}`} />
                      <RiskRow label={t('risk.riskPerCtr', { cur: output.accountCurrency })} value={`${fmtNum(output.riskPerContractInAccountCurrency)} ${output.accountCurrency}`} />
                      <RiskRow label={t('risk.marginStatus')} value={t(`risk.margin.${output.marginStatus}`)} tone="text-[var(--warning)]" />
                    </div>
                  </Fold>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
