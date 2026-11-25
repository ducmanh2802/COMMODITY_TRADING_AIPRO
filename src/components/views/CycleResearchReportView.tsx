import { useEffect, useState } from 'react';
import { Bot, CalendarClock, FileText, ShieldAlert } from 'lucide-react';
import { useI18n } from '../../i18n';
import { useTerminal } from '../../contexts/TerminalContext';
import { getCommodityVisual } from '../../shared/data/commodityVisuals';
import type { DailyResearchReportPayload } from '../../shared/types/cycle';
import { CyclePhaseBadge } from '../common/CyclePhaseBadge';
import { fetchJsonWithRetry, safeReadJson } from '../../shared/utils/http';

export function CycleResearchReportView() {
  const { t } = useI18n();
  const { openInstrumentIn } = useTerminal();
  const [report, setReport] = useState<DailyResearchReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    async function loadBase() {
      setLoading(true);
      setError(null);
      try {
        const json = await fetchJsonWithRetry<DailyResearchReportPayload>('/api/cycle/report', {
          signal: controller.signal,
        });
        if (!cancelled) setReport(json);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Không thể tải báo cáo nghiên cứu.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadBase();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const handleGenerateAiBriefing = async () => {
    setGeneratingAi(true);
    setError(null);
    try {
      const res = await fetch('/api/cycle/report/generate', { method: 'POST' });
      const json = await safeReadJson<DailyResearchReportPayload>(res);
      setReport(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi gọi Gemini Research Report.');
    } finally {
      setGeneratingAi(false);
    }
  };

  if (loading && !report) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-10 text-center text-sm text-[var(--muted)]">
        {t('sc2.rep.loading')}
      </div>
    );
  }

  const nameOf = (id: string, fallback: string) => getCommodityVisual(id)?.nameVi ?? fallback;
  const card = 'bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-2';
  const h = 'text-sm font-semibold text-[var(--text-strong)]';
  const sum = 'cursor-pointer select-none text-xs text-[var(--accent-text)]';
  const bullets = (title: string, lines: string[], color: string) => (
    <details className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 text-xs">
      <summary className="cursor-pointer select-none font-semibold flex items-center gap-2" style={{ color }}>
        {title}
        <span className="rounded-full bg-[var(--surface-3)] px-2 py-0.5 text-[11px] text-[var(--muted)]">{lines.length}</span>
      </summary>
      <ul className="list-disc pl-4 mt-2 space-y-1 text-[var(--text)]/80">
        {lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </details>
  );
  const scoreBar = (v: number, label: string) => (
    <span role="img" aria-label={label} title={label} className="relative block h-2 w-16 rounded-full bg-[var(--surface-3)] overflow-hidden shrink-0">
      <span className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(0, Math.min(100, v))}%` }} />
    </span>
  );
  const renderEvent = (ev: NonNullable<typeof report>['vietnamEventsToday'][number], idx: number) => (
    <li key={idx} className="py-2 flex items-center gap-2" title={`${ev.impact} · ${ev.affectedCommodities.join(', ')}`}>
      <span className="font-mono text-[var(--accent-text)] shrink-0">{ev.timeIct}</span>
      <span className="text-[var(--text-strong)]/90 min-w-0 truncate">{ev.title}</span>
    </li>
  );
  const nameBtn = (symbol: string, name: string, sub?: string) => (
    <button type="button" onClick={() => openInstrumentIn(symbol, 'commodity-profile')} className="text-left hover:text-[var(--accent)] min-w-0" title={sub}>
      <p className="font-medium text-[var(--text-strong)] truncate">{name}</p>
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[var(--text-strong)] tracking-tight flex items-center gap-2">
            <FileText className="w-5 h-5 text-[var(--accent)]" aria-hidden="true" />
            <span>{t('sc2.rep.title')}</span>
          </h2>
          <p className="text-sm text-[var(--muted)] mt-1">{t('sc2.rep.intro')}</p>
          <details className="mt-1">
            <summary className={sum}>{t('sc2.explain')}</summary>
            <p className="text-xs text-[var(--muted)] mt-1">{t('sc2.rep.introFull')}</p>
          </details>
        </div>

        <button
          type="button"
          onClick={() => void handleGenerateAiBriefing()}
          disabled={generatingAi}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-10 sm:min-h-0 bg-[var(--accent)] hover:bg-[var(--accent)]/90 disabled:opacity-50 rounded-md text-xs font-medium text-[var(--on-accent)] whitespace-nowrap self-start sm:self-auto"
        >
          <Bot className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{generatingAi ? t('sc2.rep.generating') : t('sc2.rep.generate')}</span>
        </button>
      </div>

      {error && (
        <div className="bg-[var(--surface)] border border-[var(--negative)]/40 rounded-lg p-4 text-xs text-[var(--negative)]">
          {error}
        </div>
      )}

      {report?.aiExecutiveBriefing ? (
        <section className="bg-[var(--surface)] border border-[var(--accent)]/40 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-[var(--text-strong)]">{report.aiExecutiveBriefing.headline}</h2>
            <span className="text-xs font-mono text-[var(--accent-text)]">{report.model ?? 'Gemini'}</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            <details className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 text-xs">
              <summary className="cursor-pointer select-none font-semibold text-[var(--text-strong)]">{t('sc2.rep.macro')}</summary>
              <p className="mt-2 text-[var(--text)]/85 leading-relaxed">{report.aiExecutiveBriefing.macroRegimeSummary}</p>
            </details>
            <details className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 text-xs">
              <summary className="cursor-pointer select-none font-semibold text-[var(--text-strong)]">{t('sc2.rep.vn')}</summary>
              <p className="mt-2 text-[var(--text)]/85 leading-relaxed">{report.aiExecutiveBriefing.vietnamFocusCommentary}</p>
            </details>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {bullets(t('sc2.rep.bottom'), report.aiExecutiveBriefing.bottomWatchHighlights, 'var(--positive)')}
            {bullets(t('sc2.rep.risk'), report.aiExecutiveBriefing.riskWarnings, 'var(--warning)')}
            {bullets(t('sc2.rep.check'), report.aiExecutiveBriefing.actionableChecklist, 'var(--text-strong)')}
          </div>
        </section>
      ) : report?.message ? (
        <div className="bg-[var(--surface)] border border-[var(--warning)]/40 rounded-lg p-3 text-xs text-[var(--warning)] flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <details>
            <summary className="cursor-pointer select-none">{t('sc2.rep.more')}</summary>
            <p className="mt-1">{report.message}</p>
          </details>
        </div>
      ) : null}

      {report && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <section className={card}>
            <h2 className={h}>{t('sc2.rep.watch')}</h2>
            <ul className="divide-y divide-[var(--border)] text-xs">
              {report.topWatch.map((item) => (
                <li key={item.instrument.id} className="py-2 flex items-center justify-between gap-2">
                  {nameBtn(item.instrument.exchangeSymbol, nameOf(item.instrument.id, item.instrument.productName), item.instrument.id)}
                  <CyclePhaseBadge phase={item.cyclePhase} compact />
                </li>
              ))}
            </ul>
          </section>

          <section className={card}>
            <h2 className={h}>{t('sc2.rep.bottomList')}</h2>
            {report.topBottomCandidates.length === 0 ? (
              <p className="text-xs text-[var(--muted)] py-2">{t('sc2.rep.noBottom')}</p>
            ) : (
              <ul className="divide-y divide-[var(--border)] text-xs">
                {report.topBottomCandidates.map((item) => (
                  <li key={item.instrument.id} className="py-2 flex items-center justify-between gap-2">
                    {nameBtn(item.instrument.exchangeSymbol, nameOf(item.instrument.id, item.instrument.productName), item.instrument.exchangeSymbol)}
                    {item.bottomScore !== null ? scoreBar(item.bottomScore, `${item.bottomScore}/100`) : <span className="text-[var(--faint)]">—</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={card}>
            <h2 className={h}>{t('sc2.rep.downside')}</h2>
            {report.topDownsideRisk.length === 0 ? (
              <p className="text-xs text-[var(--muted)] py-2">{t('sc2.rep.noDown')}</p>
            ) : (
              <ul className="divide-y divide-[var(--border)] text-xs">
                {report.topDownsideRisk.map((item) => {
                  const pct = item.percentile10Y !== null ? `${item.percentile10Y.toFixed(0)}%` : '—';
                  return (
                    <li key={item.instrument.id} className="py-2 flex items-center justify-between gap-2">
                      {nameBtn(item.instrument.exchangeSymbol, nameOf(item.instrument.id, item.instrument.productName), `Percentile: ${pct}`)}
                      <span className="flex items-center gap-2">
                        {item.percentile10Y !== null && scoreBar(item.percentile10Y, `Percentile: ${pct}`)}
                        <CyclePhaseBadge phase={item.cyclePhase} compact />
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      {report && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <section className={card}>
            <div className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-[var(--accent)]" aria-hidden="true" />
              <h2 className={h}>{t('sc2.rep.events')}</h2>
            </div>
            <ul className="divide-y divide-[var(--border)] text-xs">
              {report.vietnamEventsToday.slice(0, 3).map(renderEvent)}
            </ul>
            {report.vietnamEventsToday.length > 3 && (
              <details>
                <summary className={sum}>{t('sc2.rep.more')} ({report.vietnamEventsToday.length - 3})</summary>
                <ul className="divide-y divide-[var(--border)] text-xs">
                  {report.vietnamEventsToday.slice(3).map(renderEvent)}
                </ul>
              </details>
            )}
          </section>

          <section className={card}>
            <details>
            <summary className={`${h} cursor-pointer select-none`}>{t('sc2.rep.shifts')} ({report.phaseTransitions.length + report.supplyDemandShifts.length})</summary>
            {report.supplyDemandShifts.length === 0 && report.phaseTransitions.length === 0 ? (
              <p className="text-xs text-[var(--muted)] py-2">{t('sc2.rep.noShift')}</p>
            ) : (
              <ul className="divide-y divide-[var(--border)] text-xs">
                {report.phaseTransitions.map((pt) => (
                  <li key={pt.symbol} className="py-2 flex items-center justify-between gap-2" title={`${pt.name} (${pt.symbol})`}>
                    <span className="text-[var(--text-strong)] font-medium truncate">{pt.name}</span>
                    <CyclePhaseBadge phase={pt.phase} compact />
                  </li>
                ))}
                {report.supplyDemandShifts.map((sd, i) => (
                  <li key={i} className="py-2">
                    <details>
                      <summary className="cursor-pointer select-none text-[var(--text-strong)]/90">{sd.summary.length > 60 ? `${sd.summary.slice(0, 60)}…` : sd.summary}</summary>
                      <p className="mt-1 text-[var(--text-strong)]/90">{sd.summary}</p>
                      <p className="text-[11px] font-mono text-[var(--muted)]">{sd.source} · {sd.period} · {sd.impact}</p>
                    </details>
                  </li>
                ))}
              </ul>
            )}
            </details>
          </section>
        </div>
      )}

      <p className="text-[11px] text-[var(--faint)]">{t('sc2.rep.disclaimer')}</p>
    </div>
  );
}
