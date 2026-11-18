import { useState } from 'react';
import { Bot, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTerminal } from '../../contexts/TerminalContext';
import type { AiAnalystOutput } from '../../shared/types/analysis';
import { formatTimestampInZone } from '../../shared/utils/time';
import { DataStatusBadge } from '../common/DataStatusBadge';
import { InstrumentToolbar } from '../common/InstrumentToolbar';
import { fmtFixed, useT } from '../../i18n';

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
  const t = useT();
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
        throw new Error(json.message ?? t('ai.err.invoke'));
      }
      setAnalysis(json.analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('ai.err.run'));
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
            {t('ai.title', { symbol: selectedSymbol, tf: timeframe })}
          </h1>
          <p className="text-sm text-[#E5E7EB]/65 mt-1">
            {t('ai.subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-[#E5E7EB]/65">
            {t('ai.geminiKey')}: {health?.capabilities.geminiServerKeyConfigured ? t('ai.keyConfigured') : t('ai.keyNotSet')}
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
            <span>{loading ? t('ai.analyzing') : t('ai.run')}</span>
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
          aria-label={t('ai.fundContext')}
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
            <span>{t('ai.seasonal')}: {activeInstrument.commodityProfile.seasonalPattern}</span>
            <span>{t('ai.fx')}: {activeInstrument.commodityProfile.fxSensitivity}</span>
          </div>
        </section>
      )}

      {!analysis ? (
        <section className="bg-[#111622] border border-[#263244] rounded-lg p-8 text-center space-y-3">
          <Bot className="w-8 h-8 text-[#6366F1] mx-auto" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-white">{t('ai.ready')}</h2>
          <p className="text-xs text-[#E5E7EB]/65 max-w-lg mx-auto leading-relaxed">
            {t('ai.readyHint1')} <span className="text-white font-medium">{t('ai.run')}</span>{' '}
            {t('ai.readyHint2', { symbol: selectedSymbol, tf: timeframe })}{' '}
            <span className="font-mono text-[#F59E0B]">NO_TRADE</span> ({t('ai.noTradeShort')}) {t('ai.readyHint3')}
          </p>
          <div className="pt-2 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => void syncProviderFeeds({ symbol: selectedSymbol, timeframe })}
              disabled={syncing}
              className="px-4 py-2 bg-[#172033] hover:bg-[#172033]/80 border border-[#263244] text-white text-xs font-medium rounded-md disabled:opacity-50"
            >
              {syncing ? t('ai.syncing') : t('ai.sync', { symbol: selectedSymbol })}
            </button>
            <button
              type="button"
              onClick={() => void handleAnalyze()}
              disabled={loading}
              className="px-4 py-2 bg-[#6366F1] hover:bg-[#6366F1]/90 text-white text-xs font-medium rounded-md disabled:opacity-50"
            >
              {loading ? t('ai.running') : t('ai.run')}
            </button>
          </div>
        </section>
      ) : (
        <div className="space-y-5">
          {/* Top Action & Confidence Header */}
          <section className="bg-[#111622] border border-[#263244] rounded-lg p-5 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-[#E5E7EB]/55">{t('ai.recAction')}</p>
              <p
                className={`text-xl font-mono font-bold mt-1 ${
                  analysis.action === 'BUY' || analysis.action === 'STRONG_BUY'
                    ? 'text-[#22C55E]'
                    : analysis.action === 'SELL'
                      ? 'text-[#EF4444]'
                      : 'text-[#F59E0B]'
                }`}
              >
                <span title={analysis.action}>{t(`ai.action.${analysis.action}`)}</span>
              </p>
              <p className="text-[11px] font-mono text-[#E5E7EB]/50 mt-0.5">
                {t('ai.marketStatus')}: {analysis.marketStatus}
              </p>
            </div>

            <div>
              <p className="text-xs text-[#E5E7EB]/55">{t('ai.confidence')}</p>
              <p className="text-xl font-mono font-bold text-white tabular-nums mt-1">
                {analysis.confidence}%
              </p>
              <p className="text-[11px] text-[#E5E7EB]/50 mt-0.5">
                {t('ai.confidenceNote')}
              </p>
            </div>

            <div>
              <p className="text-xs text-[#E5E7EB]/55">{t('ai.rr')}</p>
              <p className="text-xl font-mono font-bold text-white tabular-nums mt-1">
                {analysis.riskReward !== null ? `${fmtFixed(analysis.riskReward, 2)}R` : t('ai.noSetup')}
              </p>
              <p className="text-[11px] font-mono text-[#E5E7EB]/50 mt-0.5">
                {t('common.source')}: {analysis.dataQuality.source}
              </p>
            </div>

            <div>
              <p className="text-xs text-[#E5E7EB]/55">{t('ai.dqTs')}</p>
              <div className="mt-1.5">
                <DataStatusBadge status={analysis.dataQuality.status} />
              </div>
              <p className="text-[11px] font-mono text-[#E5E7EB]/50 mt-1">
                {analysis.dataQuality.timestamp
                  ? formatTimestampInZone(analysis.dataQuality.timestamp, 'Asia/Ho_Chi_Minh')
                  : t('ai.noTs')}
              </p>
            </div>
          </section>

          {analysis.dataQuality.status === 'UNAVAILABLE' && (
            <div className="bg-[#111622] border border-[#F59E0B]/40 rounded-lg p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5 text-xs text-[#E5E7EB]">
                <ShieldAlert className="w-4 h-4 text-[#F59E0B] shrink-0" aria-hidden="true" />
                <span>
                  {t('ai.failedClosed', { symbol: selectedSymbol, tf: timeframe })}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveModule('charts')}
                className="px-3 py-1.5 bg-[#6366F1] hover:bg-[#6366F1]/90 text-white text-xs font-medium rounded-md whitespace-nowrap"
              >
                {t('ai.importCsv')}
              </button>
            </div>
          )}

          {/* Trend Analysis + Deterministic Levels */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-3">
              <h2 className="text-sm font-semibold text-white border-b border-[#263244] pb-2">
                {t('ai.trendRegime')}
              </h2>
              <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                <div className="bg-[#0B0E14] border border-[#263244] rounded p-2">
                  <span className="text-[#E5E7EB]/50 block text-[11px]">{t('ai.main')}</span>
                  <span className="text-white">{trend.mainTrend ?? t('ai.uncertain')}</span>
                </div>
                <div className="bg-[#0B0E14] border border-[#263244] rounded p-2">
                  <span className="text-[#E5E7EB]/50 block text-[11px]">{t('ai.short')}</span>
                  <span className="text-white">{trend.shortTermTrend ?? t('ai.uncertain')}</span>
                </div>
                <div className="bg-[#0B0E14] border border-[#263244] rounded p-2">
                  <span className="text-[#E5E7EB]/50 block text-[11px]">{t('ai.regime')}</span>
                  <span className="text-white">{trend.regime ?? t('common.na')}</span>
                </div>
              </div>
              <p className="text-xs text-[#E5E7EB]/85 leading-relaxed">{trend.summary}</p>
            </section>

            <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-3">
              <h2 className="text-sm font-semibold text-white border-b border-[#263244] pb-2">
                {t('ai.levels')}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono tabular-nums">
                <div className="bg-[#0B0E14] border border-[#263244] rounded p-3">
                  <span className="text-[#E5E7EB]/50 block">{t('sig.entryZone')}</span>
                  <span className="text-white font-semibold mt-1 block">
                    {entry.low !== null && entry.low !== undefined && entry.high !== null && entry.high !== undefined
                      ? `${fmtFixed(entry.low, 2)} – ${fmtFixed(entry.high, 2)}`
                      : t('common.none')}
                  </span>
                  <span className="text-[11px] text-[#E5E7EB]/50 block mt-0.5">{entry.basis}</span>
                </div>
                <div className="bg-[#0B0E14] border border-[#263244] rounded p-3">
                  <span className="text-[#E5E7EB]/50 block">{t('term.stopLoss')}</span>
                  <span className="text-[#EF4444] font-semibold mt-1 block">
                    {stopLoss.price !== null && stopLoss.price !== undefined
                      ? fmtFixed(stopLoss.price, 2)
                      : t('common.none')}
                  </span>
                  <span className="text-[11px] text-[#E5E7EB]/50 block mt-0.5">{stopLoss.basis}</span>
                </div>
                <div className="bg-[#0B0E14] border border-[#263244] rounded p-3">
                  <span className="text-[#E5E7EB]/50 block">{t('ai.takeProfits')}</span>
                  {takeProfits.length > 0 ? (
                    <div className="mt-1 space-y-0.5">
                      {takeProfits.map((tp, idx) => (
                        <div key={idx} className="text-[#22C55E]">
                          {tp.level ?? `TP${idx + 1}`}: {typeof tp.price === 'number' ? fmtFixed(tp.price, 2) : t('common.na')}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[#E5E7EB]/55 mt-1 block">{t('common.none')}</span>
                  )}
                </div>
              </div>
            </section>
          </div>

          {/* Scenarios & Evidence */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-2 text-xs">
              <h2 className="text-sm font-semibold text-[#22C55E]">{t('ai.bull')}</h2>
              <p><span className="text-[#E5E7EB]/55">{t('ai.trigger')}:</span> {bull.trigger}</p>
              <p><span className="text-[#E5E7EB]/55">{t('ai.targetCtx')}:</span> {bull.targetContext}</p>
              <p><span className="text-[#E5E7EB]/55">{t('sig.invalidation')}:</span> {bull.invalidation}</p>
            </section>

            <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-2 text-xs">
              <h2 className="text-sm font-semibold text-[#EF4444]">{t('ai.bear')}</h2>
              <p><span className="text-[#E5E7EB]/55">{t('ai.trigger')}:</span> {bear.trigger}</p>
              <p><span className="text-[#E5E7EB]/55">{t('ai.targetCtx')}:</span> {bear.targetContext}</p>
              <p><span className="text-[#E5E7EB]/55">{t('sig.invalidation')}:</span> {bear.invalidation}</p>
            </section>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs">
            <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-2">
              <h2 className="text-sm font-semibold text-white">{t('ai.techEvidence')}</h2>
              {analysis.technicalEvidence.length === 0 ? (
                <p className="text-[#E5E7EB]/55 font-mono">{t('common.none')}</p>
              ) : (
                <ul className="list-disc pl-4 space-y-1 text-[#E5E7EB]/80">
                  {analysis.technicalEvidence.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              )}
            </section>

            <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-2">
              <h2 className="text-sm font-semibold text-white">{t('ai.fundEvidence')}</h2>
              {analysis.fundamentalEvidence.length === 0 ? (
                <p className="text-[#E5E7EB]/55 font-mono">{t('ai.noMacro')}</p>
              ) : (
                <ul className="list-disc pl-4 space-y-1 text-[#E5E7EB]/80">
                  {analysis.fundamentalEvidence.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              )}
            </section>

            <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-2">
              <h2 className="text-sm font-semibold text-[#F59E0B]">{t('ai.warnings')}</h2>
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
