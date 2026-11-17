import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { useTerminal } from '../../contexts/TerminalContext';
import type { StrategyDefinition, StrategyId } from '../../shared/types/analysis';
import type { Timeframe } from '../../shared/types/instrument';
import { formatTimestampInZone } from '../../shared/utils/time';

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
  const width = 760;
  const height = 180;
  const pad = 12;
  const values = points.map((p) => p.equity);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const span = maxVal - minVal || 1;

  const polyPoints = values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (width - pad * 2);
      const y = height - pad - ((v - minVal) / span) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-44 bg-[#0B0E14] border border-[#263244] rounded-md"
      role="img"
      aria-label="Backtest Equity Curve"
    >
      <polyline fill="none" stroke="#6366F1" strokeWidth="2.2" points={polyPoints} />
    </svg>
  );
}

export function BacktestView() {
  const { instruments, selectedSymbol, setSelectedSymbol, timeframe, setTimeframe, setActiveModule } =
    useTerminal();

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
      if (!res.ok) throw new Error(json.message ?? 'Backtest failed.');
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backtest execution error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white tracking-tight">
          Historical Backtesting Engine
        </h1>
        <p className="text-sm text-[#E5E7EB]/65 mt-1">
          No look-ahead bias (bar[i] signal → bar[i+1] open fill), conservative stop-loss-first intrabar checks, commissions, and slippage.
        </p>
      </div>

      <form
        onSubmit={(e) => void handleRun(e)}
        className="bg-[#111622] border border-[#263244] rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end"
      >
        <div>
          <label htmlFor="bt-symbol" className="block text-xs text-[#E5E7EB]/65 mb-1">
            Instrument
          </label>
          <select
            id="bt-symbol"
            value={selectedSymbol}
            onChange={(e) => setSelectedSymbol(e.target.value)}
            className="w-full bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-2 text-xs font-mono text-white"
          >
            {instruments.map((inst) => (
              <option key={inst.id} value={inst.exchangeSymbol}>
                {inst.exchange}:{inst.exchangeSymbol} · {inst.productName}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="bt-strategy" className="block text-xs text-[#E5E7EB]/65 mb-1">
            Strategy
          </label>
          <select
            id="bt-strategy"
            value={strategyId}
            onChange={(e) => setStrategyId(e.target.value as StrategyId)}
            className="w-full bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-2 text-xs font-mono text-white"
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
          <label htmlFor="bt-tf" className="block text-xs text-[#E5E7EB]/65 mb-1">
            Timeframe
          </label>
          <select
            id="bt-tf"
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value as Timeframe)}
            className="w-full bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-2 text-xs font-mono text-white"
          >
            {(['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'] as Timeframe[]).map((tf) => (
              <option key={tf} value={tf}>
                {tf}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="bt-equity" className="block text-xs text-[#E5E7EB]/65 mb-1">
            Initial Equity (USD)
          </label>
          <input
            id="bt-equity"
            type="number"
            min="100"
            value={initialEquity}
            onChange={(e) => setInitialEquity(e.target.value)}
            className="w-full bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-2 text-xs font-mono text-white"
          />
        </div>

        <div>
          <label htmlFor="bt-contracts" className="block text-xs text-[#E5E7EB]/65 mb-1">
            Contracts / Trade
          </label>
          <input
            id="bt-contracts"
            type="number"
            min="1"
            value={contractsPerTrade}
            onChange={(e) => setContractsPerTrade(e.target.value)}
            className="w-full bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-2 text-xs font-mono text-white"
          />
        </div>

        <div>
          <label htmlFor="bt-comm" className="block text-xs text-[#E5E7EB]/65 mb-1">
            Commission / Side ($)
          </label>
          <input
            id="bt-comm"
            type="number"
            step="0.5"
            min="0"
            value={commission}
            onChange={(e) => setCommission(e.target.value)}
            className="w-full bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-2 text-xs font-mono text-white"
          />
        </div>

        <div>
          <label htmlFor="bt-slip" className="block text-xs text-[#E5E7EB]/65 mb-1">
            Slippage (Ticks) / Rollover Bars
          </label>
          <div className="flex gap-2">
            <input
              id="bt-slip"
              type="number"
              min="0"
              value={slippageTicks}
              onChange={(e) => setSlippageTicks(e.target.value)}
              className="w-1/2 bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-2 text-xs font-mono text-white"
            />
            <input
              aria-label="Rollover interval bars"
              type="number"
              min="5"
              placeholder="Roll bars"
              value={rolloverBars}
              onChange={(e) => setRolloverBars(e.target.value)}
              className="w-1/2 bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-2 text-xs font-mono text-white"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-[#6366F1] hover:bg-[#6366F1]/90 text-white text-xs font-medium rounded-md disabled:opacity-50"
        >
          <History className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{loading ? 'Simulating...' : 'Run Backtest'}</span>
        </button>
      </form>

      {error && (
        <div className="bg-[#111622] border border-[#EF4444]/40 rounded-lg p-4 text-xs font-mono text-[#EF4444]">
          {error}
        </div>
      )}

      {result && !result.valid && (
        <div className="bg-[#111622] border border-[#F59E0B]/40 rounded-lg p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-mono font-semibold text-[#F59E0B]">BACKTEST UNAVAILABLE</p>
            <p className="text-xs text-[#E5E7EB]/80">{result.error}</p>
          </div>
          <button
            type="button"
            onClick={() => setActiveModule('charts')}
            className="px-3 py-1.5 bg-[#6366F1] hover:bg-[#6366F1]/90 text-white text-xs font-medium rounded-md whitespace-nowrap"
          >
            Import Historical CSV
          </button>
        </div>
      )}

      {result && result.valid && (
        <div className="space-y-6">
          <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 text-xs font-mono tabular-nums">
            <div className="bg-[#111622] border border-[#263244] rounded-lg p-3">
              <span className="text-[#E5E7EB]/55 font-sans block">Net Profit</span>
              <span className={`text-base font-bold ${result.metrics.netProfit >= 0 ? 'text-[#22C55E]' : 'text-[#EF4444]'}`}>
                ${result.metrics.netProfit.toFixed(2)}
              </span>
            </div>
            <div className="bg-[#111622] border border-[#263244] rounded-lg p-3">
              <span className="text-[#E5E7EB]/55 font-sans block">Win Rate</span>
              <span className="text-base font-bold text-white">{result.metrics.winRatePct.toFixed(1)}%</span>
            </div>
            <div className="bg-[#111622] border border-[#263244] rounded-lg p-3">
              <span className="text-[#E5E7EB]/55 font-sans block">Profit Factor</span>
              <span className="text-base font-bold text-white">
                {result.metrics.profitFactor !== null ? result.metrics.profitFactor.toFixed(2) : '∞'}
              </span>
            </div>
            <div className="bg-[#111622] border border-[#263244] rounded-lg p-3">
              <span className="text-[#E5E7EB]/55 font-sans block">Max Drawdown</span>
              <span className="text-base font-bold text-[#EF4444]">
                {result.metrics.maxDrawdownPct.toFixed(2)}%
              </span>
            </div>
            <div className="bg-[#111622] border border-[#263244] rounded-lg p-3">
              <span className="text-[#E5E7EB]/55 font-sans block">Expectancy / R</span>
              <span className="text-base font-bold text-white">
                ${result.metrics.expectancy.toFixed(2)} ({result.metrics.averageR.toFixed(2)}R)
              </span>
            </div>
            <div className="bg-[#111622] border border-[#263244] rounded-lg p-3">
              <span className="text-[#E5E7EB]/55 font-sans block">Trades / Sharpe</span>
              <span className="text-base font-bold text-white">
                {result.metrics.tradeCount} / {result.metrics.sharpeRatio !== null ? result.metrics.sharpeRatio.toFixed(2) : 'N/A'}
              </span>
            </div>
          </section>

          <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Equity Curve</h2>
              <span className="font-mono text-xs text-[#E5E7EB]/65">
                Final Equity: ${result.metrics.finalEquity.toFixed(2)}
              </span>
            </div>
            <EquityCurveSvg points={result.equityCurve} />
            <p className="text-[11px] text-[#E5E7EB]/60 leading-relaxed">
              {result.assumptions.disclaimer} Look-ahead: {result.assumptions.lookAheadPrevention}. Intrabar fill: {result.assumptions.intrabarFillOrder}.
            </p>
          </section>

          <section className="bg-[#111622] border border-[#263244] rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-[#263244]">
              <h2 className="text-sm font-semibold text-white">Simulated Trade Ledger ({result.trades.length})</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[780px]">
                <thead>
                  <tr className="border-b border-[#263244] bg-[#172033]/50 text-xs text-[#E5E7EB]/65">
                    <th className="py-2 px-4">#</th>
                    <th className="py-2 px-3">Dir</th>
                    <th className="py-2 px-3">Entry (ICT)</th>
                    <th className="py-2 px-3 text-right">Entry Price</th>
                    <th className="py-2 px-3 text-right">Exit Price</th>
                    <th className="py-2 px-3">Reason</th>
                    <th className="py-2 px-3 text-right">R</th>
                    <th className="py-2 px-4 text-right">Net PnL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#263244]/70 text-xs font-mono tabular-nums">
                  {result.trades.map((t) => (
                    <tr key={t.tradeNumber}>
                      <td className="py-2 px-4 text-[#E5E7EB]/60">{t.tradeNumber}</td>
                      <td className={`py-2 px-3 ${t.direction === 'LONG' ? 'text-[#22C55E]' : 'text-[#EF4444]'}`}>
                        {t.direction}
                      </td>
                      <td className="py-2 px-3 text-[#E5E7EB]/70">
                        {formatTimestampInZone(t.entryTimestamp, 'Asia/Ho_Chi_Minh')}
                      </td>
                      <td className="py-2 px-3 text-right text-white">{t.entryPrice.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right text-white">{t.exitPrice.toFixed(2)}</td>
                      <td className="py-2 px-3 text-[#E5E7EB]/75">{t.exitReason}</td>
                      <td className="py-2 px-3 text-right text-white">{t.rMultiple.toFixed(2)}R</td>
                      <td className={`py-2 px-4 text-right ${t.netPnl >= 0 ? 'text-[#22C55E]' : 'text-[#EF4444]'}`}>
                        ${t.netPnl.toFixed(2)}
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
