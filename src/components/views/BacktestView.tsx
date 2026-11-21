import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { useTerminal } from '../../contexts/TerminalContext';
import type { StrategyDefinition, StrategyId } from '../../shared/types/analysis';
import type { Timeframe } from '../../shared/types/instrument';
import { formatTimestampInZone } from '../../shared/utils/time';
import { fmtFixed, fmtNum, hasKey, tr, useT, type TKey } from '../../i18n';
import { EquityChart } from '../ui/viz/EquityChart';

interface BacktestResponse {
  valid: boolean;
  error?: string;
  instrumentId: string;
  strategyId: StrategyId;
  timeframe: Timeframe;
  metrics: {
    netProfit: number;
    grossProfit: number;
    grossLoss: number;
    winRatePct: number;
    profitFactor: number | null;
    maxDrawdown: number;
    maxDrawdownPct: number;
    averageR: number;
    expectancy: number;
    sharpeRatio: number | null;
    tradeCount: number;
    finalEquity: number;
  };
  assumptions: {
    lookAheadPrevention: string;
    intrabarFillOrder: string;
    commissionPerContract: number;
    slippageTicks: number;
    tickSize: number;
    tickValue: number;
    rolloverIntervalBars: number | null;
    disclaimer: string;
  };
  equityCurve: Array<{ timestamp: string; equity: number; drawdownPct: number }>;
  trades: Array<{
    tradeNumber: number;
    direction: 'LONG' | 'SHORT';
    entryTimestamp: string;
    entryPrice: number;
    exitTimestamp: string;
    exitPrice: number;
    exitReason: string;
    contracts: number;
    grossPnl: number;
    costs: number;
    netPnl: number;
    rMultiple: number;
  }>;
}

function EquityCurveSvg({ points }: { points: Array<{ equity: number }> }) {
  if (points.length < 2) return null;
  return (
    <div className="bg-[var(--bg)] border border-[var(--border)] rounded-md p-2">
      <EquityChart
        points={points.map((p, i) => ({ label: `#${i + 1}`, v: p.equity }))}
        baseline={points[0].equity}
        ariaLabel={tr('bt.equityAria')}
        format={(v) => fmtNum(v, { maximumFractionDigits: 0 })}
        className="h-44"
      />
    </div>
  );
}

export function BacktestView() {
  const { instruments, selectedSymbol, setSelectedSymbol, timeframe, setTimeframe, setActiveModule } =
    useTerminal();
  const t = useT();

  const [strategies, setStrategies] = useState<StrategyDefinition[]>([]);
  const [strategyId, setStrategyId] = useState<StrategyId>('TREND_FOLLOWING');
  const [initialEquity, setInitialEquity] = useState('10000');
  const [contractsPerTrade, setContractsPerTrade] = useState('1');
  const [commission, setCommission] = useState('2.5');
  const [slippageTicks, setSlippageTicks] = useState('1');
  const [rolloverBars, setRolloverBars] = useState('');

  const [result, setResult] = useState<BacktestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch('/api/strategies')
      .then((r) => r.json())
      .then((j) => setStrategies(j.strategies ?? []))
      .catch(() => {});
  }, []);

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        symbol: selectedSymbol,
        strategyId,
        timeframe,
        initialEquity: Number(initialEquity),
        contractsPerTrade: Math.trunc(Number(contractsPerTrade)),
        commissionPerContract: Number(commission) || 0,
        slippageTicks: Number(slippageTicks) || 0,
      };
      if (rolloverBars.trim() && Number(rolloverBars) >= 5) {
        payload.rolloverIntervalBars = Math.trunc(Number(rolloverBars));
      }

      const res = await fetch('/api/backtest/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? t('bt.failed'));
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('bt.execError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text-strong)] tracking-tight">
          {t('bt.title')}
        </h1>
        <p className="text-sm text-[var(--text)]/65 mt-1">
          {t('bt.subtitle')}
        </p>
      </div>

      <form
        onSubmit={(e) => void handleRun(e)}
        className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end"
      >
        <div>
          <label htmlFor="bt-symbol" className="block text-xs text-[var(--text)]/65 mb-1">
            {t('bt.instrument')}
          </label>
          <select
            id="bt-symbol"
            value={selectedSymbol}
            onChange={(e) => setSelectedSymbol(e.target.value)}
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-2 text-xs font-mono text-[var(--text-strong)]"
          >
            {instruments.map((inst) => (
              <option key={inst.id} value={inst.exchangeSymbol}>
                {inst.exchange}:{inst.exchangeSymbol} · {inst.productName}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="bt-strategy" className="block text-xs text-[var(--text)]/65 mb-1">
            {t('bt.strategy')}
          </label>
          <select
            id="bt-strategy"
            value={strategyId}
            onChange={(e) => setStrategyId(e.target.value as StrategyId)}
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-2 text-xs font-mono text-[var(--text-strong)]"
          >
            {(strategies.length > 0
              ? strategies
              : ([{ id: 'TREND_FOLLOWING', name: 'Trend Following' }] as StrategyDefinition[])
            ).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="bt-tf" className="block text-xs text-[var(--text)]/65 mb-1">
            {t('bt.timeframe')}
          </label>
          <select
            id="bt-tf"
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value as Timeframe)}
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-2 text-xs font-mono text-[var(--text-strong)]"
          >
            {(['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'] as Timeframe[]).map((tf) => (
              <option key={tf} value={tf}>
                {tf}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="bt-equity" className="block text-xs text-[var(--text)]/65 mb-1">
            {t('bt.equity')}
          </label>
          <input
            id="bt-equity"
            type="number"
            min="100"
            value={initialEquity}
            onChange={(e) => setInitialEquity(e.target.value)}
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-2 text-xs font-mono text-[var(--text-strong)]"
          />
        </div>

        <div>
          <label htmlFor="bt-contracts" className="block text-xs text-[var(--text)]/65 mb-1">
            {t('bt.contracts')}
          </label>
          <input
            id="bt-contracts"
            type="number"
            min="1"
            value={contractsPerTrade}
            onChange={(e) => setContractsPerTrade(e.target.value)}
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-2 text-xs font-mono text-[var(--text-strong)]"
          />
        </div>

        <div>
          <label htmlFor="bt-comm" className="block text-xs text-[var(--text)]/65 mb-1">
            {t('bt.commission')}
          </label>
          <input
            id="bt-comm"
            type="number"
            step="0.5"
            min="0"
            value={commission}
            onChange={(e) => setCommission(e.target.value)}
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-2 text-xs font-mono text-[var(--text-strong)]"
          />
        </div>

        <div>
          <label htmlFor="bt-slip" className="block text-xs text-[var(--text)]/65 mb-1">
            {t('bt.slipRoll')}
          </label>
          <div className="flex gap-2">
            <input
              id="bt-slip"
              type="number"
              min="0"
              value={slippageTicks}
              onChange={(e) => setSlippageTicks(e.target.value)}
              className="w-1/2 bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-2 text-xs font-mono text-[var(--text-strong)]"
            />
            <input
              aria-label={t('bt.rollAria')}
              type="number"
              min="5"
              placeholder={t('bt.rollPh')}
              value={rolloverBars}
              onChange={(e) => setRolloverBars(e.target.value)}
              className="w-1/2 bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-2 text-xs font-mono text-[var(--text-strong)]"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-white text-xs font-medium rounded-md disabled:opacity-50"
        >
          <History className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{loading ? t('bt.simulating') : t('bt.run')}</span>
        </button>
      </form>

      {error && (
        <div className="bg-[var(--surface)] border border-[var(--negative)]/40 rounded-lg p-4 text-xs font-mono text-[var(--negative)]">
          {error}
        </div>
      )}

      {result && !result.valid && (
        <div className="bg-[var(--surface)] border border-[var(--warning)]/40 rounded-lg p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-mono font-semibold text-[var(--warning)]">{t('bt.unavailable')}</p>
            <p className="text-xs text-[var(--text)]/80">{result.error}</p>
          </div>
          <button
            type="button"
            onClick={() => setActiveModule('charts')}
            className="px-3 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-white text-xs font-medium rounded-md whitespace-nowrap"
          >
            {t('bt.importCsv')}
          </button>
        </div>
      )}

      {result && result.valid && (
        <div className="space-y-6">
          <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 text-xs font-mono tabular-nums">
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3">
              <span className="text-[var(--text)]/55 font-sans block">{t('bt.netProfit')}</span>
              <span className={`text-base font-bold ${result.metrics.netProfit >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
                ${fmtFixed(result.metrics.netProfit, 2)}
              </span>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3">
              <span className="text-[var(--text)]/55 font-sans block">{t('bt.winRate')}</span>
              <span className="text-base font-bold text-[var(--text-strong)]">{fmtFixed(result.metrics.winRatePct, 1)}%</span>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3">
              <span className="text-[var(--text)]/55 font-sans block">{t('bt.profitFactor')}</span>
              <span className="text-base font-bold text-[var(--text-strong)]">
                {result.metrics.profitFactor !== null ? fmtFixed(result.metrics.profitFactor, 2) : '∞'}
              </span>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3">
              <span className="text-[var(--text)]/55 font-sans block">{t('bt.maxDd')}</span>
              <span className="text-base font-bold text-[var(--negative)]">
                {fmtFixed(result.metrics.maxDrawdownPct, 2)}%
              </span>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3">
              <span className="text-[var(--text)]/55 font-sans block">{t('bt.expectancy')}</span>
              <span className="text-base font-bold text-[var(--text-strong)]">
                ${fmtFixed(result.metrics.expectancy, 2)} ({fmtFixed(result.metrics.averageR, 2)}R)
              </span>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3">
              <span className="text-[var(--text)]/55 font-sans block">{t('bt.tradesSharpe')}</span>
              <span className="text-base font-bold text-[var(--text-strong)]">
                {result.metrics.tradeCount} / {result.metrics.sharpeRatio !== null ? fmtFixed(result.metrics.sharpeRatio, 2) : t('common.na')}
              </span>
            </div>
          </section>

          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('bt.equityCurve')}</h2>
              <span className="font-mono text-xs text-[var(--text)]/65">
                {t('bt.finalEquity', { v: fmtFixed(result.metrics.finalEquity, 2) })}
              </span>
            </div>
            <EquityCurveSvg points={result.equityCurve} />
            <p className="text-[11px] text-[var(--text)]/60 leading-relaxed">
              {result.assumptions.disclaimer}{' '}
              {t('bt.assumptions', { look: result.assumptions.lookAheadPrevention, fill: result.assumptions.intrabarFillOrder })}
            </p>
          </section>

          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border)]">
              <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('bt.ledger', { n: result.trades.length })}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[780px]">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]/50 text-xs text-[var(--text)]/65">
                    <th className="py-2 px-4">#</th>
                    <th className="py-2 px-3">{t('bt.col.dir')}</th>
                    <th className="py-2 px-3">{t('bt.col.entryTime')}</th>
                    <th className="py-2 px-3 text-right">{t('bt.col.entryPrice')}</th>
                    <th className="py-2 px-3 text-right">{t('bt.col.exitPrice')}</th>
                    <th className="py-2 px-3">{t('bt.col.reason')}</th>
                    <th className="py-2 px-3 text-right">R</th>
                    <th className="py-2 px-4 text-right">{t('bt.col.netPnl')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]/70 text-xs font-mono tabular-nums">
                  {result.trades.map((trade) => (
                    <tr key={trade.tradeNumber}>
                      <td className="py-2 px-4 text-[var(--text)]/60">{trade.tradeNumber}</td>
                      <td className={`py-2 px-3 ${trade.direction === 'LONG' ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
                        {t(`bt.dir.${trade.direction}`)}
                      </td>
                      <td className="py-2 px-3 text-[var(--text)]/70">
                        {formatTimestampInZone(trade.entryTimestamp, 'Asia/Ho_Chi_Minh')}
                      </td>
                      <td className="py-2 px-3 text-right text-[var(--text-strong)]">{fmtFixed(trade.entryPrice, 2)}</td>
                      <td className="py-2 px-3 text-right text-[var(--text-strong)]">{fmtFixed(trade.exitPrice, 2)}</td>
                      <td className="py-2 px-3 text-[var(--text)]/75" title={trade.exitReason}>
                        {hasKey(`bt.reason.${trade.exitReason}`) ? t(`bt.reason.${trade.exitReason}` as TKey) : trade.exitReason}
                      </td>
                      <td className="py-2 px-3 text-right text-[var(--text-strong)]">{fmtFixed(trade.rMultiple, 2)}R</td>
                      <td className={`py-2 px-4 text-right ${trade.netPnl >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
                        ${fmtFixed(trade.netPnl, 2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
