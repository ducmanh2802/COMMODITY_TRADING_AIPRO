import { useEffect, useState } from 'react';
import { useTerminal } from '../../contexts/TerminalContext';
import type { StrategyDefinition } from '../../shared/types/analysis';
import type { DataQualityStatus } from '../../shared/types/market';
import { DataStatusBadge } from '../common/DataStatusBadge';
import { InstrumentToolbar } from '../common/InstrumentToolbar';
import { fmtFixed, useT } from '../../i18n';

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
  const [error, setError] = useState<string | null>(null);

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
        if (!cancelled) setError(err instanceof Error ? err.message : t('sig.err.load'));
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
          <h1 className="text-xl font-semibold text-white tracking-tight">
            {t('sig.title', { symbol: selectedSymbol, tf: timeframe })}
          </h1>
          <p className="text-sm text-[#E5E7EB]/65 mt-1">
            {t('sig.subtitle')}
          </p>
        </div>
        <DataStatusBadge status={dataStatus} />
      </div>

      <InstrumentToolbar />

      {error && (
        <div className="bg-[#111622] border border-[#EF4444]/40 rounded-lg p-4 text-xs font-mono text-[#EF4444]">
          {error}
        </div>
      )}

      {/* Deterministic Strategy Signals */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white">{t('sig.evaluated')}</h2>
        {loading ? (
          <div className="bg-[#111622] border border-[#263244] rounded-lg p-8 text-center text-xs font-mono text-[#E5E7EB]/60">
            {t('sig.evaluating')}
          </div>
        ) : signals.length === 0 ? (
          <div className="bg-[#111622] border border-[#263244] rounded-lg p-6 text-center text-xs font-mono text-[#E5E7EB]/60">
            {t('sig.none')}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {signals.map((sig) => {
              const statusColor =
                sig.confirmationStatus === 'CONFIRMED'
                  ? sig.direction === 'LONG'
                    ? 'text-[#22C55E] border-[#22C55E]/40'
                    : 'text-[#EF4444] border-[#EF4444]/40'
                  : sig.confirmationStatus === 'UNAVAILABLE'
                    ? 'text-[#F59E0B] border-[#263244]'
                    : 'text-[#E5E7EB]/70 border-[#263244]';

              return (
                <div
                  key={sig.strategyId}
                  className={`bg-[#111622] border rounded-lg p-4 space-y-3 ${statusColor}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-white">{sig.strategyName}</h3>
                      <p className="text-[11px] font-mono text-[#E5E7EB]/50">{sig.strategyId}</p>
                    </div>
                    <div className="text-right font-mono text-xs shrink-0">
                      <span className="block font-semibold" title={sig.confirmationStatus}>
                        {t(`sig.cs.${sig.confirmationStatus}`)}{' '}
                        {sig.direction === 'LONG' ? `· ${t('term.long')}` : sig.direction === 'SHORT' ? `· ${t('term.short')}` : ''}
                      </span>
                      {sig.setupQualityScore !== null && (
                        <span className="text-[#E5E7EB]/65">{t('sig.score')}: {sig.setupQualityScore}/100</span>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-[#E5E7EB]/80 leading-relaxed">{sig.rationale}</p>

                  {sig.entryZone && sig.stopLoss !== null && (
                    <div className="bg-[#0B0E14] border border-[#263244] rounded p-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono tabular-nums">
                      <div>
                        <span className="text-[#E5E7EB]/50 block text-[11px]">{t('sig.entryZone')}</span>
                        <span className="text-white">
                          {fmtFixed(sig.entryZone[0], 2)}–{fmtFixed(sig.entryZone[1], 2)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#E5E7EB]/50 block text-[11px]">{t('term.stopLoss')}</span>
                        <span className="text-[#EF4444]">{fmtFixed(sig.stopLoss, 2)}</span>
                      </div>
                      <div>
                        <span className="text-[#E5E7EB]/50 block text-[11px]">{t('sig.targets')}</span>
                        <span className="text-[#22C55E]">
                          {sig.takeProfits.map((tp) => fmtFixed(tp, 2)).join(' / ')}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#E5E7EB]/50 block text-[11px]">R:R</span>
                        <span className="text-white">
                          {sig.riskReward !== null ? `${fmtFixed(sig.riskReward, 2)}R` : t('common.na')}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="text-[11px] text-[#E5E7EB]/55 font-mono">
                    {t('sig.invalidation')}: {sig.invalidationCondition}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {dataStatus === 'UNAVAILABLE' && (
        <div className="bg-[#111622] border border-[#263244] rounded-lg p-4 flex items-center justify-between gap-4">
          <span className="text-xs text-[#E5E7EB]/70">
            {t('sig.importHint')}
          </span>
          <button
            type="button"
            onClick={() => setActiveModule('charts')}
            className="px-3 py-1.5 bg-[#6366F1] hover:bg-[#6366F1]/90 text-white text-xs font-medium rounded-md whitespace-nowrap"
          >
            {t('sig.goImport')}
          </button>
        </div>
      )}

      {/* Strategy Specification Catalog */}
      <section className="bg-[#111622] border border-[#263244] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#263244]">
          <h2 className="text-sm font-semibold text-white">{t('sig.rulebook')}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[780px]">
            <thead>
              <tr className="border-b border-[#263244] bg-[#172033]/50 text-xs text-[#E5E7EB]/65">
                <th className="py-2.5 px-4 font-medium">{t('sig.col.strategy')}</th>
                <th className="py-2.5 px-3 font-medium">{t('sig.col.minBars')}</th>
                <th className="py-2.5 px-3 font-medium">{t('sig.col.indicators')}</th>
                <th className="py-2.5 px-4 font-medium">{t('sig.col.logic')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#263244]/70 text-xs">
              {strategies.map((s) => (
                <tr key={s.id}>
                  <td className="py-3 px-4 font-medium text-white whitespace-nowrap">{s.name}</td>
                  <td className="py-3 px-3 font-mono tabular-nums text-[#E5E7EB]">
                    {s.minCandlesRequired}
                  </td>
                  <td className="py-3 px-3 font-mono text-[#E5E7EB]/75">
                    {s.requiredIndicators.join(', ')}
                  </td>
                  <td className="py-3 px-4 text-[#E5E7EB]/75">
                    <div>{s.entryConditions}</div>
                    <div className="text-[11px] font-mono text-[#E5E7EB]/50 mt-0.5">
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
