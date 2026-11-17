import { useState } from 'react';
import { Radar } from 'lucide-react';
import { useTerminal } from '../../contexts/TerminalContext';
import type { TradeScannerOpportunity } from '../../shared/types/analysis';
import type { ExchangeCode, ProductCategory, Timeframe, TradingStyle } from '../../shared/types/instrument';
import { DataStatusBadge } from '../common/DataStatusBadge';

interface ScannerApiResponse {
  scannedAt: string;
  tradingStyle: TradingStyle;
  timeframe: Timeframe;
  opportunities: TradeScannerOpportunity[];
  unavailableInstruments: Array<{ symbol: string; exchange: ExchangeCode; reason: string }>;
}

export function ScannerView() {
  const { instruments, timeframe, tradingStyle, openInstrumentIn } = useTerminal();

  const [category, setCategory] = useState<'ALL' | ProductCategory>('ALL');
  const [exchange, setExchange] = useState<'ALL' | ExchangeCode>('ALL');
  const [style, setStyle] = useState<TradingStyle>(tradingStyle);
  const [tf, setTf] = useState<Timeframe>(timeframe);
  const [minRiskReward, setMinRiskReward] = useState('1.5');
  const [minSetupScore, setMinSetupScore] = useState('50');
  const [maxAtrPct, setMaxAtrPct] = useState('');

  const [result, setResult] = useState<ScannerApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        tradingStyle: style,
        timeframe: tf,
        minRiskReward: Number(minRiskReward) || 0,
        minSetupScore: Number(minSetupScore) || 0,
      };
      if (category !== 'ALL') payload.category = category;
      if (exchange !== 'ALL') payload.exchange = exchange;
      if (maxAtrPct.trim() && Number(maxAtrPct) > 0) {
        payload.maxVolatilityAtrPct = Number(maxAtrPct);
      }

      const res = await fetch('/api/scanner/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'Scanner execution failed.');
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run scanner.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white tracking-tight">AI Trade Scanner</h1>
        <p className="text-sm text-[#E5E7EB]/65 mt-1">
          Deterministic multi-market setup scanner across {instruments.length} commodity instruments (MXV &amp; International). Instruments without validated OHLCV data are skipped honestly.
        </p>
      </div>

      {/* Scanner Configuration Bar */}
      <form
        onSubmit={(e) => void handleScan(e)}
        className="bg-[#111622] border border-[#263244] rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3 items-end"
      >
        <div>
          <label htmlFor="scan-category" className="block text-xs text-[#E5E7EB]/65 mb-1">
            Category
          </label>
          <select
            id="scan-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as 'ALL' | ProductCategory)}
            className="w-full bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-2 text-xs font-mono text-white"
          >
            <option value="ALL">All</option>
            <option value="AGRICULTURE">Agriculture</option>
            <option value="SOFT_COMMODITIES">Softs</option>
            <option value="METALS">Metals</option>
            <option value="ENERGY">Energy</option>
          </select>
        </div>

        <div>
          <label htmlFor="scan-exchange" className="block text-xs text-[#E5E7EB]/65 mb-1">
            Exchange
          </label>
          <select
            id="scan-exchange"
            value={exchange}
            onChange={(e) => setExchange(e.target.value as 'ALL' | ExchangeCode)}
            className="w-full bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-2 text-xs font-mono text-white"
          >
            <option value="ALL">All</option>
            <option value="CBOT">CBOT</option>
            <option value="CME">CME</option>
            <option value="COMEX">COMEX</option>
            <option value="NYMEX">NYMEX</option>
            <option value="ICE">ICE</option>
            <option value="MXV">MXV</option>
          </select>
        </div>

        <div>
          <label htmlFor="scan-style" className="block text-xs text-[#E5E7EB]/65 mb-1">
            Trading Style
          </label>
          <select
            id="scan-style"
            value={style}
            onChange={(e) => setStyle(e.target.value as TradingStyle)}
            className="w-full bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-2 text-xs font-mono text-white"
          >
            <option value="SCALPING">SCALPING</option>
            <option value="INTRADAY">INTRADAY</option>
            <option value="SWING">SWING</option>
            <option value="POSITION">POSITION</option>
          </select>
        </div>

        <div>
          <label htmlFor="scan-tf" className="block text-xs text-[#E5E7EB]/65 mb-1">
            Timeframe
          </label>
          <select
            id="scan-tf"
            value={tf}
            onChange={(e) => setTf(e.target.value as Timeframe)}
            className="w-full bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-2 text-xs font-mono text-white"
          >
            {(['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'] as Timeframe[]).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="scan-rr" className="block text-xs text-[#E5E7EB]/65 mb-1">
            Min R:R
          </label>
          <input
            id="scan-rr"
            type="number"
            step="0.1"
            min="0"
            value={minRiskReward}
            onChange={(e) => setMinRiskReward(e.target.value)}
            className="w-full bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-2 text-xs font-mono text-white tabular-nums"
          />
        </div>

        <div>
          <label htmlFor="scan-score" className="block text-xs text-[#E5E7EB]/65 mb-1">
            Min Score (0–100)
          </label>
          <input
            id="scan-score"
            type="number"
            min="0"
            max="100"
            value={minSetupScore}
            onChange={(e) => setMinSetupScore(e.target.value)}
            className="w-full bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-2 text-xs font-mono text-white tabular-nums"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-[#6366F1] hover:bg-[#6366F1]/90 text-white text-xs font-medium rounded-md disabled:opacity-50"
        >
          <Radar className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{loading ? 'Scanning...' : 'Scan Markets'}</span>
        </button>

        <div className="sm:col-span-2 lg:col-span-7 flex items-center gap-3 pt-1">
          <label htmlFor="scan-atr" className="text-xs text-[#E5E7EB]/55">
            Optional Max ATR % Volatility Filter:
          </label>
          <input
            id="scan-atr"
            type="number"
            step="0.1"
            min="0"
            placeholder="e.g. 3.5"
            value={maxAtrPct}
            onChange={(e) => setMaxAtrPct(e.target.value)}
            className="w-28 bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-1 text-xs font-mono text-white tabular-nums"
          />
        </div>
      </form>

      {error && (
        <div className="bg-[#111622] border border-[#EF4444]/40 rounded-lg p-4 text-xs font-mono text-[#EF4444]">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-6">
          <section className="bg-[#111622] border border-[#263244] rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-[#263244] flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">
                Ranked Opportunities ({result.opportunities.length})
              </h2>
              <span className="font-mono text-xs text-[#E5E7EB]/55">
                {result.tradingStyle} · {result.timeframe}
              </span>
            </div>

            {result.opportunities.length === 0 ? (
              <div className="p-6 text-xs font-mono text-[#E5E7EB]/65">
                NO_CONFIRMED_SETUPS — Zero setups satisfied filters with verified market data.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[880px]">
                  <thead>
                    <tr className="border-b border-[#263244] bg-[#172033]/50 text-xs text-[#E5E7EB]/65">
                      <th className="py-2.5 px-4 font-medium">Instrument</th>
                      <th className="py-2.5 px-3 font-medium">Strategy</th>
                      <th className="py-2.5 px-3 font-medium">Dir</th>
                      <th className="py-2.5 px-3 font-medium text-right">Score</th>
                      <th className="py-2.5 px-3 font-medium text-right">Entry Zone</th>
                      <th className="py-2.5 px-3 font-medium text-right">Stop Loss</th>
                      <th className="py-2.5 px-3 font-medium text-right">R:R</th>
                      <th className="py-2.5 px-3 font-medium">Quality</th>
                      <th className="py-2.5 px-4 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#263244]/70 text-xs font-mono tabular-nums">
                    {result.opportunities.map((opp, idx) => (
                      <tr key={`${opp.instrument}-${opp.strategy}-${idx}`} className="hover:bg-[#172033]/40">
                        <td className="py-2.5 px-4 text-white">
                          {opp.instrument} <span className="text-[#E5E7EB]/50">({opp.exchange})</span>
                        </td>
                        <td className="py-2.5 px-3 text-[#E5E7EB]">{opp.strategy}</td>
                        <td
                          className={`py-2.5 px-3 font-semibold ${
                            opp.direction === 'LONG' ? 'text-[#22C55E]' : 'text-[#EF4444]'
                          }`}
                        >
                          {opp.direction}
                        </td>
                        <td className="py-2.5 px-3 text-right text-white">{opp.setupQualityScore}</td>
                        <td className="py-2.5 px-3 text-right text-[#E5E7EB]">
                          {opp.entryZone
                            ? `${opp.entryZone[0].toFixed(2)}–${opp.entryZone[1].toFixed(2)}`
                            : 'N/A'}
                        </td>
                        <td className="py-2.5 px-3 text-right text-[#EF4444]">
                          {opp.stopLoss !== null ? opp.stopLoss.toFixed(2) : 'N/A'}
                        </td>
                        <td className="py-2.5 px-3 text-right text-[#22C55E]">
                          {opp.riskReward !== null ? `${opp.riskReward.toFixed(2)}R` : 'N/A'}
                        </td>
                        <td className="py-2.5 px-3">
                          <DataStatusBadge status={opp.dataQuality} compact />
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => openInstrumentIn(opp.instrument, 'charts')}
                            className="px-2.5 py-1 bg-[#172033] hover:bg-[#6366F1] border border-[#263244] rounded text-[11px] text-white"
                          >
                            Chart
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-2">
            <h2 className="text-sm font-semibold text-white">
              Skipped / Unavailable Instruments ({result.unavailableInstruments.length})
            </h2>
            <p className="text-xs text-[#E5E7EB]/60">
              Fail-closed transparency: instruments without validated historical or authorized live data are never fabricated.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
              {result.unavailableInstruments.map((u) => (
                <div
                  key={`${u.exchange}-${u.symbol}`}
                  className="bg-[#0B0E14] border border-[#263244] rounded px-3 py-2 text-xs font-mono"
                >
                  <span className="text-white">{u.exchange}:{u.symbol}</span>
                  <span className="block text-[11px] text-[#F59E0B] truncate">{u.reason}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
