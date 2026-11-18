import { useState } from 'react';
import { Bot, Info, ShieldAlert } from 'lucide-react';
import { useTerminal } from '../../contexts/TerminalContext';
import type { AiDataInput, AiResearchSummary } from '../../shared/types/analysis';
import type { DataQualityStatus } from '../../shared/types/market';
import { formatTimestampInZone } from '../../shared/utils/time';
import { DataStatusBadge } from '../common/DataStatusBadge';
import { InstrumentToolbar } from '../common/InstrumentToolbar';
import { useI18n, type TFunction } from '../../i18n';

const MARKET_STATUSES: readonly string[] = ['CURRENT', 'DELAYED', 'HISTORICAL', 'STALE', 'UNAVAILABLE', 'INVALID'];

function formatAsOf(ts: string | null, t: TFunction): string {
  if (!ts) return t('air.asOfUnknown');
  // COT report dates are plain YYYY-MM-DD (CFTC position date) — show as-is.
  return /^\d{4}-\d{2}-\d{2}$/.test(ts) ? ts : formatTimestampInZone(ts, 'Asia/Ho_Chi_Minh');
}

function QualityCell({ input, t }: { input: AiDataInput; t: TFunction }) {
  if (MARKET_STATUSES.includes(input.quality)) {
    return (
      <DataStatusBadge
        status={input.quality as DataQualityStatus}
        compact
        sourceQuality={input.sourceQuality ?? undefined}
      />
    );
  }
  const verified = input.quality === 'VERIFIED';
  return (
    <span className={`font-mono text-[11px] ${verified ? 'text-[#22C55E]' : 'text-[#F59E0B]'}`}>
      {t(verified ? 'air.quality.VERIFIED' : 'air.quality.UNVERIFIED')}
    </span>
  );
}

export function AiAnalystView() {
  const { instruments, selectedSymbol, timeframe, health, setActiveModule, syncing, syncProviderFeeds } =
    useTerminal();
  const { t, lang } = useI18n();
  const activeInstrument = instruments.find((i) => i.exchangeSymbol === selectedSymbol) ?? null;

  const [analysis, setAnalysis] = useState<AiResearchSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: selectedSymbol, timeframe, language: lang }),
      });
      if (!res.ok) {
        setError(res.status === 429 ? t('air.err.rateLimited') : t('air.err.request'));
        return;
      }
      const json = (await res.json()) as { analysis: AiResearchSummary };
      setAnalysis(json.analysis);
    } catch {
      setError(t('air.err.request'));
    } finally {
      setLoading(false);
    }
  };

  const keyConfigured = health?.capabilities.geminiServerKeyConfigured ?? false;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight">
            {t('air.title', { symbol: selectedSymbol, tf: timeframe })}
          </h1>
          <p className="text-sm text-[#E5E7EB]/65 mt-1">{t('air.subtitle')}</p>
        </div>
        <span className="font-mono text-xs text-[#E5E7EB]/65">
          {t('air.keyStatus')}: {keyConfigured ? t('air.keyConfigured') : t('air.keyNotSet')}
        </span>
      </div>

      <div
        role="note"
        className="bg-[#111622] border border-[#F59E0B]/40 rounded-lg p-3 flex items-start gap-2.5 text-xs text-[#E5E7EB]"
      >
        <ShieldAlert className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" aria-hidden="true" />
        <span>{t('air.disclaimer')}</span>
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
            <span>{loading ? t('air.running') : t('air.run')}</span>
          </button>
        }
      />

      {error && (
        <div role="alert" className="bg-[#111622] border border-[#EF4444]/40 rounded-lg p-4 text-xs text-[#EF4444]">
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
              {activeInstrument.mxvMapping?.mxvSymbol ? ` · MXV ${activeInstrument.mxvMapping.mxvSymbol}` : ''})
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
          <h2 className="text-sm font-semibold text-white">{t('air.ready')}</h2>
          <p className="text-xs text-[#E5E7EB]/65 max-w-lg mx-auto leading-relaxed">
            {t('air.readyHint', { symbol: selectedSymbol, tf: timeframe })}
          </p>
          <div className="pt-2 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => void syncProviderFeeds({ symbol: selectedSymbol, timeframe })}
              disabled={syncing}
              className="px-4 py-2 bg-[#172033] hover:bg-[#172033]/80 border border-[#263244] text-white text-xs font-medium rounded-md disabled:opacity-50"
            >
              {syncing ? t('air.syncing') : t('air.sync', { symbol: selectedSymbol })}
            </button>
            <button
              type="button"
              onClick={() => void handleAnalyze()}
              disabled={loading}
              className="px-4 py-2 bg-[#6366F1] hover:bg-[#6366F1]/90 text-white text-xs font-medium rounded-md disabled:opacity-50"
            >
              {loading ? t('air.running') : t('air.run')}
            </button>
          </div>
        </section>
      ) : (
        <div className="space-y-5">
          {analysis.status === 'UNAVAILABLE' && analysis.unavailableReason && (
            <div className="bg-[#111622] border border-[#F59E0B]/40 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 text-xs text-[#E5E7EB]">
                <ShieldAlert className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="font-semibold text-[#F59E0B]">{t('air.unavailableTitle')}</p>
                  <p className="mt-0.5">
                    {t(`air.reason.${analysis.unavailableReason}`, {
                      symbol: analysis.instrument,
                      tf: analysis.timeframe,
                    })}
                  </p>
                </div>
              </div>
              {analysis.unavailableReason === 'NO_VERIFIED_DATA' && (
                <button
                  type="button"
                  onClick={() => setActiveModule('charts')}
                  className="px-3 py-1.5 bg-[#6366F1] hover:bg-[#6366F1]/90 text-white text-xs font-medium rounded-md whitespace-nowrap"
                >
                  {t('air.importCsv')}
                </button>
              )}
            </div>
          )}

          {analysis.status === 'OK' && (
            <>
              <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-2">
                <h2 className="text-sm font-semibold text-white">{t('air.summary')}</h2>
                <p className="text-xs text-[#E5E7EB]/85 leading-relaxed">{analysis.summary || t('air.none')}</p>
                <p className="text-[11px] font-mono text-[#E5E7EB]/50">
                  {t('air.generated', {
                    ts: formatTimestampInZone(analysis.generatedAt, 'Asia/Ho_Chi_Minh'),
                    model: analysis.model ?? '—',
                  })}
                </p>
                {analysis.postCheck.flagged && (
                  <p className="flex items-start gap-1.5 text-[11px] text-[#F59E0B]">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                    {t('air.postCheck', {
                      removed: analysis.postCheck.removedSentences,
                      dropped: analysis.postCheck.droppedUnsourcedFacts,
                    })}
                  </p>
                )}
              </section>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs">
                <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-2">
                  <h2 className="text-sm font-semibold text-white">{t('air.keyFacts')}</h2>
                  {analysis.keyFacts.length === 0 ? (
                    <p className="text-[#E5E7EB]/55">{t('air.none')}</p>
                  ) : (
                    <ul className="list-disc pl-4 space-y-1.5 text-[#E5E7EB]/85">
                      {analysis.keyFacts.map((f, idx) => (
                        <li key={idx}>
                          {f.statement}{' '}
                          {f.sourceRefs.map((r) => (
                            <span
                              key={r}
                              title={t(`air.input.${r}`)}
                              className="ml-1 font-mono text-[10px] text-[#6366F1] border border-[#6366F1]/40 rounded px-1"
                            >
                              {r}
                            </span>
                          ))}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-2">
                  <h2 className="text-sm font-semibold text-[#F59E0B]">{t('air.risks')}</h2>
                  {analysis.risks.length === 0 ? (
                    <p className="text-[#E5E7EB]/55">{t('air.none')}</p>
                  ) : (
                    <ul className="list-disc pl-4 space-y-1 text-[#E5E7EB]/85">
                      {analysis.risks.map((r, idx) => (
                        <li key={idx}>{r}</li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-2">
                  <h2 className="text-sm font-semibold text-white">{t('air.dataGaps')}</h2>
                  {analysis.dataGaps.length === 0 ? (
                    <p className="text-[#E5E7EB]/55">{t('air.none')}</p>
                  ) : (
                    <ul className="list-disc pl-4 space-y-1 text-[#E5E7EB]/85">
                      {analysis.dataGaps.map((g, idx) => (
                        <li key={idx}>{g}</li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </>
          )}

          <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-white">{t('air.inputs')}</h2>
              <p className="text-[11px] text-[#E5E7EB]/55 mt-0.5">{t('air.inputsHint')}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="text-[#E5E7EB]/55">
                  <tr className="border-b border-[#263244]">
                    <th className="py-1.5 pr-3 font-medium">{t('air.col.block')}</th>
                    <th className="py-1.5 pr-3 font-medium">{t('air.col.quality')}</th>
                    <th className="py-1.5 pr-3 font-medium">{t('air.col.source')}</th>
                    <th className="py-1.5 pr-3 font-medium">{t('air.col.asOf')}</th>
                    <th className="py-1.5 font-medium">{t('air.col.note')}</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.inputs.map((input) => (
                    <tr key={input.id} className="border-b border-[#263244]/60 align-top">
                      <td className="py-1.5 pr-3 text-white">
                        <span className="font-mono text-[#6366F1] mr-1.5">{input.id}</span>
                        {t(`air.input.${input.id}`)}
                      </td>
                      <td className="py-1.5 pr-3">
                        <QualityCell input={input} t={t} />
                      </td>
                      <td className="py-1.5 pr-3 font-mono text-[#E5E7EB]/75 break-all">{input.source}</td>
                      <td className="py-1.5 pr-3 font-mono text-[#E5E7EB]/75 whitespace-nowrap">
                        {formatAsOf(input.asOf, t)}
                      </td>
                      <td className="py-1.5 text-[#E5E7EB]/65">{input.note ?? ''}</td>
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
