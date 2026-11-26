import { useEffect, useState } from 'react';
import { useTerminal } from '../../contexts/TerminalContext';
import type { StrategyDefinition } from '../../shared/types/analysis';
import type { DataQualityStatus } from '../../shared/types/market';
import { DataStatusBadge } from '../common/DataStatusBadge';
import { InstrumentToolbar } from '../common/InstrumentToolbar';
import { fmtFixed, useT } from '../../i18n';
import { toUserError, type UserError } from '../common/friendlyError';
import { ErrorNote } from '../common/ErrorNote';

interface DeterministicSignalPayload {
  strategyId: string;
  strategyName: string;
  direction: 'LONG' | 'SHORT' | 'NONE';
  confirmationStatus: 'CONFIRMED' | 'PENDING' | 'INVALIDATED' | 'UNAVAILABLE';
  setupQualityScore: number | null;
  scoreBreakdown: string[];
  entryZone: [number, number] | null;
  stopLoss: number | null;
  takeProfits: number[];
  riskReward: number | null;
  invalidationCondition: string;
  rationale: string;
  dataStatus: DataQualityStatus;
}

export function SignalsView() {
  const { selectedSymbol, timeframe, datasets, setActiveModule } = useTerminal();
  const t = useT();
  const [strategies, setStrategies] = useState<Array<StrategyDefinition & { minCandlesRequired: number }>>([]);
  const [signals, setSignals] = useState<DeterministicSignalPayload[]>([]);
  const [dataStatus, setDataStatus] = useState<DataQualityStatus>('UNAVAILABLE');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<UserError | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [stratRes, sigRes] = await Promise.all([
          fetch('/api/strategies'),
          fetch(`/api/signals/${encodeURIComponent(selectedSymbol)}?timeframe=${timeframe}`),
        ]);
        const stratJson = await stratRes.json();
        const sigJson = await sigRes.json();
        if (!stratRes.ok || !sigRes.ok) {
          throw new Error(sigJson.message ?? t('sig.err.evaluate'));
        }
        if (!cancelled) {
          setStrategies(stratJson.strategies ?? []);
          setSignals(sigJson.signals ?? []);
          setDataStatus(sigJson.dataStatus ?? 'UNAVAILABLE');
        }
      } catch (err) {
        if (!cancelled) setError(toUserError(err, t('sig.err.load')));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedSymbol, timeframe, datasets.length]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[var(--text-strong)] tracking-tight">
            {t('sig.title', { symbol: selectedSymbol, tf: timeframe })}
          </h2>
          <p className="text-sm text-[var(--text)]/65 mt-1">
            {t('sig.subtitle')}
          </p>
        </div>
        <DataStatusBadge status={dataStatus} />
      </div>

      <InstrumentToolbar />

      {error && (
        <div className="bg-[var(--surface)] border border-[var(--negative)]/40 rounded-lg p-4 text-xs font-mono text-[var(--negative)]">
          <ErrorNote error={error} />
        </div>
      )}

      {/* Deterministic Strategy Signals */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('sig.evaluated')}</h2>
        {loading ? (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-8 text-center text-xs font-mono text-[var(--text)]/60">
            {t('sig.evaluating')}
          </div>
        ) : signals.length === 0 ? (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 text-center text-xs font-mono text-[var(--text)]/60">
            {t('sig.none')}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {signals.map((sig) => {
              const statusColor =
                sig.confirmationStatus === 'CONFIRMED'
                  ? sig.direction === 'LONG'
                    ? 'text-[var(--positive)] border-[var(--positive)]/40'
                    : 'text-[var(--negative)] border-[var(--negative)]/40'
                  : sig.confirmationStatus === 'UNAVAILABLE'
                    ? 'text-[var(--warning)] border-[var(--border)]'
                    : 'text-[var(--text)]/70 border-[var(--border)]';

              return (
                <div
                  key={sig.strategyId}
                  className={`bg-[var(--surface)] border rounded-lg p-4 space-y-3 ${statusColor}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--text-strong)]">{sig.strategyName}</h3>
                      <p className="text-[11px] font-mono text-[var(--text)]/50">{sig.strategyId}</p>
                    </div>
                    <div className="text-right font-mono text-xs shrink-0">
                      <span className="block font-semibold" title={sig.confirmationStatus}>
                        {t(`sig.cs.${sig.confirmationStatus}`)}{' '}
                        {sig.direction === 'LONG' ? `· ${t('term.long')}` : sig.direction === 'SHORT' ? `· ${t('term.short')}` : ''}
                      </span>
                      {sig.setupQualityScore !== null && (
                        <span className="text-[var(--text)]/65">{t('sig.score')}: {sig.setupQualityScore}/100</span>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-[var(--text)]/80 leading-relaxed">{sig.rationale}</p>

                  {sig.entryZone && sig.stopLoss !== null && (
                    <div className="bg-[var(--bg)] border border-[var(--border)] rounded p-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono tabular-nums">
                      <div>
                        <span className="text-[var(--text)]/50 block text-[11px]">{t('sig.entryZone')}</span>
                        <span className="text-[var(--text-strong)]">
                          {fmtFixed(sig.entryZone[0], 2)}–{fmtFixed(sig.entryZone[1], 2)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[var(--text)]/50 block text-[11px]">{t('term.stopLoss')}</span>
                        <span className="text-[var(--negative)]">{fmtFixed(sig.stopLoss, 2)}</span>
                      </div>
                      <div>
                        <span className="text-[var(--text)]/50 block text-[11px]">{t('sig.targets')}</span>
                        <span className="text-[var(--positive)]">
                          {sig.takeProfits.map((tp) => fmtFixed(tp, 2)).join(' / ')}
                        </span>
                      </div>
                      <div>
                        <span className="text-[var(--text)]/50 block text-[11px]">R:R</span>
                        <span className="text-[var(--text-strong)]">
                          {sig.riskReward !== null ? `${fmtFixed(sig.riskReward, 2)}R` : t('common.na')}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="text-[11px] text-[var(--text)]/55 font-mono">
                    {t('sig.invalidation')}: {sig.invalidationCondition}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {dataStatus === 'UNAVAILABLE' && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center justify-between gap-4">
          <span className="text-xs text-[var(--text)]/70">
            {t('sig.importHint')}
          </span>
          <button
            type="button"
            onClick={() => setActiveModule('charts')}
            className="px-3 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-white text-xs font-medium rounded-md whitespace-nowrap"
          >
            {t('sig.goImport')}
          </button>
        </div>
      )}

      {/* Strategy Specification Catalog */}
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('sig.rulebook')}</h2>
        </div>
        <div className="overflow-x-auto" tabIndex={0}>
          <table className="w-full text-left border-collapse min-w-[780px]">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]/50 text-xs text-[var(--text)]/65">
                <th className="py-2.5 px-4 font-medium">{t('sig.col.strategy')}</th>
                <th className="py-2.5 px-3 font-medium">{t('sig.col.minBars')}</th>
                <th className="py-2.5 px-3 font-medium">{t('sig.col.indicators')}</th>
                <th className="py-2.5 px-4 font-medium">{t('sig.col.logic')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]/70 text-xs">
              {strategies.map((s) => (
                <tr key={s.id}>
                  <td className="py-3 px-4 font-medium text-[var(--text-strong)] whitespace-nowrap">{s.name}</td>
                  <td className="py-3 px-3 font-mono tabular-nums text-[var(--text)]">
                    {s.minCandlesRequired}
                  </td>
                  <td className="py-3 px-3 font-mono text-[var(--text)]/75">
                    {s.requiredIndicators.join(', ')}
                  </td>
                  <td className="py-3 px-4 text-[var(--text)]/75">
                    <div>{s.entryConditions}</div>
                    <div className="text-[11px] font-mono text-[var(--text)]/50 mt-0.5">
                      {t('term.stopLoss')}: {s.stopLossLogic} · {t('term.takeProfit')}: {s.takeProfitLogic}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
