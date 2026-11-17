import { useState } from 'react';
import { Bot, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTerminal } from '../../contexts/TerminalContext';
import type { AiAnalystOutput } from '../../shared/types/analysis';
import { formatTimestampInZone } from '../../shared/utils/time';
import { DataStatusBadge } from '../common/DataStatusBadge';
import { InstrumentToolbar } from '../common/InstrumentToolbar';

export function AiAnalystView() {
  const {
    instruments,
    selectedSymbol,
    timeframe,
    health,
    setActiveModule,
    syncing,
    syncProviderFeeds,
  } = useTerminal();
  const { settings } = useAuth();
  const activeInstrument = instruments.find((i) => i.exchangeSymbol === selectedSymbol) ?? null;

  const [analysis, setAnalysis] = useState<AiAnalystOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: selectedSymbol,
          timeframe,
          riskSettings: {
            accountEquity: settings.accountEquity,
            accountCurrency: settings.accountCurrency,
            riskPercentagePerTrade: settings.riskPercentagePerTrade,
            dailyLossLimitPct: settings.dailyLossLimitPct,
            maxOpenPositions: settings.maxOpenPositions,
            maxPortfolioRiskPct: settings.maxPortfolioRiskPct,
            maxContractsPerInstrument: settings.maxContractsPerInstrument,
            defaultTradingStyle: settings.defaultTradingStyle,
            defaultTimeframe: settings.defaultTimeframe,
            displayTimezone: settings.displayTimezone,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message ?? 'AI Analyst invocation failed.');
      }
      setAnalysis(json.analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run AI Analyst.');
    } finally {
      setLoading(false);
    }
  };

  const trend = (analysis?.trendAnalysis ?? {}) as Record<string, string>;
  const bull = (analysis?.bullishScenario ?? {}) as Record<string, string>;
  const bear = (analysis?.bearishScenario ?? {}) as Record<string, string>;
  const entry = (analysis?.entryZone ?? {}) as {
    low?: number | null;
    high?: number | null;
    basis?: string;
  };
  const stopLoss = (analysis?.stopLoss ?? {}) as { price?: number | null; basis?: string };
  const takeProfits = (analysis?.takeProfits ?? []) as Array<{ level?: string; price?: number }>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight">
            AI Commodity Analyst ({selectedSymbol} · {timeframe})
          </h1>
          <p className="text-sm text-[#E5E7EB]/65 mt-1">
            Server-side Gemini analysis grounded strictly in verified technical indicators, macro releases, and deterministic risk limits.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-[#E5E7EB]/65">
            Gemini Key: {health?.capabilities.geminiServerKeyConfigured ? 'CONFIGURED' : 'NOT SET'}
          </span>
          {analysis && <DataStatusBadge status={analysis.dataQuality.status} />}
        </div>
      </div>

      <InstrumentToolbar
        rightSlot={
          <button
            type="button"
            onClick={() => void handleAnalyze()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-[#6366F1] hover:bg-[#6366F1]/90 text-white text-xs font-medium rounded-md disabled:opacity-50 whitespace-nowrap"
          >
            <Bot className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{loading ? 'Analyzing...' : 'Run Gemini Analysis'}</span>
          </button>
        }
      />

      {error && (
        <div className="bg-[#111622] border border-[#EF4444]/40 rounded-lg p-4 text-xs font-mono text-[#EF4444]">
          {error}
        </div>
      )}

      {activeInstrument?.commodityProfile && (
        <section
          aria-label="Commodity Fundamental Context"
          className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-2.5 text-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">
              {activeInstrument.commodityProfile.vietnameseName} ({activeInstrument.exchange}:
              {activeInstrument.exchangeSymbol}
              {activeInstrument.mxvMapping?.mxvSymbol
                ? ` · MXV ${activeInstrument.mxvMapping.mxvSymbol}`
                : ''}
              )
            </h2>
            <span className="font-mono text-[#6366F1]">
              {activeInstrument.commodityProfile.vietnamTradingSessionsIct}
            </span>
          </div>
          <p className="text-[#E5E7EB]/80 leading-relaxed">
            {activeInstrument.commodityProfile.vietnamMarketRelevance}
          </p>
          <div className="flex flex-wrap gap-4 text-[11px] text-[#E5E7EB]/70">
            <span>Mùa vụ: {activeInstrument.commodityProfile.seasonalPattern}</span>
            <span>Tỷ giá: {activeInstrument.commodityProfile.fxSensitivity}</span>
          </div>
        </section>
      )}

      {!analysis ? (
        <section className="bg-[#111622] border border-[#263244] rounded-lg p-8 text-center space-y-3">
          <Bot className="w-8 h-8 text-[#6366F1] mx-auto" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-white">Ready for Structured Commodity Assessment</h2>
          <p className="text-xs text-[#E5E7EB]/65 max-w-lg mx-auto leading-relaxed">
            Click <span className="text-white font-medium">Run Gemini Analysis</span> to evaluate {selectedSymbol} ({timeframe}). If validated market data is unavailable, the analyst fails closed to <span className="font-mono text-[#F59E0B]">NO_TRADE</span> without fabricating price targets.
          </p>
          <div className="pt-2 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => void syncProviderFeeds({ symbol: selectedSymbol, timeframe })}
              disabled={syncing}
              className="px-4 py-2 bg-[#172033] hover:bg-[#172033]/80 border border-[#263244] text-white text-xs font-medium rounded-md disabled:opacity-50"
            >
              {syncing ? 'Syncing...' : `Sync ${selectedSymbol} API Data`}
            </button>
            <button
              type="button"
              onClick={() => void handleAnalyze()}
              disabled={loading}
              className="px-4 py-2 bg-[#6366F1] hover:bg-[#6366F1]/90 text-white text-xs font-medium rounded-md disabled:opacity-50"
            >
              {loading ? 'Running Analysis...' : 'Run Gemini Analysis'}
            </button>
          </div>
        </section>
      ) : (
        <div className="space-y-5">
          {/* Top Action & Confidence Header */}
          <section className="bg-[#111622] border border-[#263244] rounded-lg p-5 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-[#E5E7EB]/55">Recommended Action</p>
              <p
                className={`text-xl font-mono font-bold mt-1 ${
                  analysis.action === 'BUY' || analysis.action === 'STRONG_BUY'
                    ? 'text-[#22C55E]'
                    : analysis.action === 'SELL'
                      ? 'text-[#EF4444]'
                      : 'text-[#F59E0B]'
                }`}
              >
                {analysis.action}
              </p>
              <p className="text-[11px] font-mono text-[#E5E7EB]/50 mt-0.5">
                Market Status: {analysis.marketStatus}
              </p>
            </div>

            <div>
              <p className="text-xs text-[#E5E7EB]/55">Analytical Confidence</p>
              <p className="text-xl font-mono font-bold text-white tabular-nums mt-1">
                {analysis.confidence}%
              </p>
              <p className="text-[11px] text-[#E5E7EB]/50 mt-0.5">
                Not a statistical win-rate guarantee
              </p>
            </div>

            <div>
              <p className="text-xs text-[#E5E7EB]/55">Deterministic R:R</p>
              <p className="text-xl font-mono font-bold text-white tabular-nums mt-1">
                {analysis.riskReward !== null ? `${analysis.riskReward.toFixed(2)}R` : 'NO_SETUP'}
              </p>
              <p className="text-[11px] font-mono text-[#E5E7EB]/50 mt-0.5">
                Source: {analysis.dataQuality.source}
              </p>
            </div>

            <div>
              <p className="text-xs text-[#E5E7EB]/55">Data Quality & Timestamp</p>
              <div className="mt-1.5">
                <DataStatusBadge status={analysis.dataQuality.status} />
              </div>
              <p className="text-[11px] font-mono text-[#E5E7EB]/50 mt-1">
                {analysis.dataQuality.timestamp
                  ? formatTimestampInZone(analysis.dataQuality.timestamp, 'Asia/Ho_Chi_Minh')
                  : 'NO_MARKET_TS'}
              </p>
            </div>
          </section>

          {analysis.dataQuality.status === 'UNAVAILABLE' && (
            <div className="bg-[#111622] border border-[#F59E0B]/40 rounded-lg p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5 text-xs text-[#E5E7EB]">
                <ShieldAlert className="w-4 h-4 text-[#F59E0B] shrink-0" aria-hidden="true" />
                <span>
                  Analysis failed closed because no validated OHLCV data exists for {selectedSymbol} ({timeframe}).
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveModule('charts')}
                className="px-3 py-1.5 bg-[#6366F1] hover:bg-[#6366F1]/90 text-white text-xs font-medium rounded-md whitespace-nowrap"
              >
                Import CSV Data
              </button>
            </div>
          )}

          {/* Trend Analysis + Deterministic Levels */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-3">
              <h2 className="text-sm font-semibold text-white border-b border-[#263244] pb-2">
                Trend & Regime Assessment
              </h2>
              <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                <div className="bg-[#0B0E14] border border-[#263244] rounded p-2">
                  <span className="text-[#E5E7EB]/50 block text-[11px]">Main</span>
                  <span className="text-white">{trend.mainTrend ?? 'UNCERTAIN'}</span>
                </div>
                <div className="bg-[#0B0E14] border border-[#263244] rounded p-2">
                  <span className="text-[#E5E7EB]/50 block text-[11px]">Short</span>
                  <span className="text-white">{trend.shortTermTrend ?? 'UNCERTAIN'}</span>
                </div>
                <div className="bg-[#0B0E14] border border-[#263244] rounded p-2">
                  <span className="text-[#E5E7EB]/50 block text-[11px]">Regime</span>
                  <span className="text-white">{trend.regime ?? 'N/A'}</span>
                </div>
              </div>
              <p className="text-xs text-[#E5E7EB]/85 leading-relaxed">{trend.summary}</p>
            </section>

            <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-3">
              <h2 className="text-sm font-semibold text-white border-b border-[#263244] pb-2">
                Deterministic Trade Levels (AI-Locked)
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono tabular-nums">
                <div className="bg-[#0B0E14] border border-[#263244] rounded p-3">
                  <span className="text-[#E5E7EB]/50 block">Entry Zone</span>
                  <span className="text-white font-semibold mt-1 block">
                    {entry.low !== null && entry.low !== undefined && entry.high !== null && entry.high !== undefined
                      ? `${entry.low.toFixed(2)} – ${entry.high.toFixed(2)}`
                      : 'NONE'}
                  </span>
                  <span className="text-[11px] text-[#E5E7EB]/50 block mt-0.5">{entry.basis}</span>
                </div>
                <div className="bg-[#0B0E14] border border-[#263244] rounded p-3">
                  <span className="text-[#E5E7EB]/50 block">Stop Loss</span>
                  <span className="text-[#EF4444] font-semibold mt-1 block">
                    {stopLoss.price !== null && stopLoss.price !== undefined
                      ? stopLoss.price.toFixed(2)
                      : 'NONE'}
                  </span>
                  <span className="text-[11px] text-[#E5E7EB]/50 block mt-0.5">{stopLoss.basis}</span>
                </div>
                <div className="bg-[#0B0E14] border border-[#263244] rounded p-3">
                  <span className="text-[#E5E7EB]/50 block">Take Profits</span>
                  {takeProfits.length > 0 ? (
                    <div className="mt-1 space-y-0.5">
                      {takeProfits.map((tp, idx) => (
                        <div key={idx} className="text-[#22C55E]">
                          {tp.level ?? `TP${idx + 1}`}: {typeof tp.price === 'number' ? tp.price.toFixed(2) : 'N/A'}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[#E5E7EB]/55 mt-1 block">NONE</span>
                  )}
                </div>
              </div>
            </section>
          </div>

          {/* Scenarios & Evidence */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-2 text-xs">
              <h2 className="text-sm font-semibold text-[#22C55E]">Bullish Scenario</h2>
              <p><span className="text-[#E5E7EB]/55">Trigger:</span> {bull.trigger}</p>
              <p><span className="text-[#E5E7EB]/55">Target Context:</span> {bull.targetContext}</p>
              <p><span className="text-[#E5E7EB]/55">Invalidation:</span> {bull.invalidation}</p>
            </section>

            <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-2 text-xs">
              <h2 className="text-sm font-semibold text-[#EF4444]">Bearish Scenario</h2>
              <p><span className="text-[#E5E7EB]/55">Trigger:</span> {bear.trigger}</p>
              <p><span className="text-[#E5E7EB]/55">Target Context:</span> {bear.targetContext}</p>
              <p><span className="text-[#E5E7EB]/55">Invalidation:</span> {bear.invalidation}</p>
            </section>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs">
            <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-2">
              <h2 className="text-sm font-semibold text-white">Technical Evidence</h2>
              {analysis.technicalEvidence.length === 0 ? (
                <p className="text-[#E5E7EB]/55 font-mono">NONE</p>
              ) : (
                <ul className="list-disc pl-4 space-y-1 text-[#E5E7EB]/80">
                  {analysis.technicalEvidence.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              )}
            </section>

            <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-2">
              <h2 className="text-sm font-semibold text-white">Fundamental Evidence</h2>
              {analysis.fundamentalEvidence.length === 0 ? (
                <p className="text-[#E5E7EB]/55 font-mono">NO SOURCED MACRO RECORDS</p>
              ) : (
                <ul className="list-disc pl-4 space-y-1 text-[#E5E7EB]/80">
                  {analysis.fundamentalEvidence.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              )}
            </section>

            <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-2">
              <h2 className="text-sm font-semibold text-[#F59E0B]">Invalidation & Risk Warnings</h2>
              <ul className="list-disc pl-4 space-y-1 text-[#E5E7EB]/80">
                {analysis.invalidationConditions.map((c, idx) => (
                  <li key={`inv-${idx}`}>{c}</li>
                ))}
                {analysis.riskWarnings.map((w, idx) => (
                  <li key={`warn-${idx}`} className="text-[#F59E0B]">{w}</li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
