import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { chartPalette, useThemeKey, withAlpha } from '../../shared/theme/chartColors';
import {
  ArrowLeft,
  BellRing,
  Bot,
  Calendar,
  CircleCheck,
  Clock,
  Compass,
  Crosshair,
  Gem,
  Info,
  Layers,
  RefreshCcw,
  Scale,
  ShieldAlert,
  Target,
  TrendingUp,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import { lwBase } from '../../shared/theme/chartTheme';
import { useTerminal } from '../../contexts/TerminalContext';
import { getCommodityVisual } from '../../shared/data/commodityVisuals';
import type {
  CommodityProfileDossier,
  EightQuestionVerdict,
} from '../../shared/types/cycle';
import type { MarketCandle } from '../../shared/types/market';
import { CommodityHeroImage } from '../common/CommodityHeroImage';
import { CyclePhaseBadge, getBottomScoreAccent } from '../common/CyclePhaseBadge';
import { DataStatusBadge } from '../common/DataStatusBadge';
import { SupplyDemandRow } from '../common/SupplyDemandRow';
import { fetchJsonWithRetry, safeReadJson } from '../../shared/utils/http';
import { tr, useT, type TKey } from '../../i18n';

type ChartHorizon = '1Y' | '3Y' | '5Y' | '10Y' | 'ALL';

const HORIZON_DAYS: Record<ChartHorizon, number> = {
  '1Y': 365,
  '3Y': 365 * 3,
  '5Y': 365 * 5,
  '10Y': 365 * 10,
  ALL: 365 * 50,
};

/** Semicircle gauge 0-100 for the bottom score; the arc colour follows the classification accent (currentColor). */
function ScoreGauge({ score, accent, label }: { score: number | null; accent: string; label: string }) {
  const arc = 'M 10 60 A 50 50 0 0 1 110 60';
  const v = score === null ? 0 : Math.min(100, Math.max(0, score));
  return (
    <svg viewBox="0 0 120 68" className={`w-full max-w-[200px] mx-auto block ${accent}`} role="img" aria-label={label}>
      <path d={arc} fill="none" stroke="var(--border)" strokeWidth="10" strokeLinecap="round" />
      {score !== null && v > 0 && (
        <path d={arc} fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" pathLength={100} strokeDasharray={`${v} 100`} />
      )}
      <text x="60" y="56" textAnchor="middle" className="fill-current font-mono font-bold" fontSize="22">
        {score === null ? '—' : score}
      </text>
      <text x="10" y="67" textAnchor="middle" fontSize="7" fill="var(--faint)">0</text>
      <text x="110" y="67" textAnchor="middle" fontSize="7" fill="var(--faint)">100</text>
    </svg>
  );
}

/** Inline (i) disclosure: compact trigger, explanation expands in flow (no overflow at 390px). */
function InfoToggle({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
        title={label}
        onClick={() => setOpen((v) => !v)}
        className="shrink-0 inline-flex items-center justify-center w-9 h-9 -m-1.5 rounded-full text-[var(--muted)] hover:text-[var(--text-strong)]"
      >
        <Info className="w-4 h-4" aria-hidden="true" />
      </button>
      {open && (
        <p id={id} role="note" className="basis-full text-[11px] leading-relaxed text-[var(--text)] bg-[var(--surface-2)] border border-[var(--border)] rounded-md p-2.5">
          {children}
        </p>
      )}
    </>
  );
}

const VERDICT_CHIPS: Array<{ key: TKey; field: keyof NonNullable<EightQuestionVerdict['answers']>; icon: LucideIcon }> = [
  { key: 'prof.q1', field: 'q1CyclePhase', icon: RefreshCcw },
  { key: 'prof.q2', field: 'q2SupplyDemandState', icon: Scale },
  { key: 'prof.q3', field: 'q3ValuableOrTrap', icon: Gem },
  { key: 'prof.q4', field: 'q4BottomProbabilityAssessment', icon: Target },
  { key: 'prof.q5', field: 'q5KeyDriversAndRisks', icon: Zap },
  { key: 'prof.q6', field: 'q6ShouldActNowOrWait', icon: Clock },
  { key: 'prof.q7', field: 'q7EntryZoneInvalidationTargets', icon: Crosshair },
  { key: 'prof.q8', field: 'q8ConfirmationTriggers', icon: BellRing },
];

export function CommodityProfileView() {
  const t = useT();
  const [eduOpen, setEduOpen] = useState(false);
  const { selectedSymbol, setSelectedSymbol, instruments, setActiveModule, datasets } = useTerminal();
  const [dossier, setDossier] = useState<CommodityProfileDossier | null>(null);
  const [candles, setCandles] = useState<MarketCandle[]>([]);
  const [horizon, setHorizon] = useState<ChartHorizon>('1Y');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [verdict, setVerdict] = useState<EightQuestionVerdict | null>(null);
  const [verdictLoading, setVerdictLoading] = useState(false);

  const chartContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    async function loadProfile() {
      setLoading(true);
      setError(null);
      setVerdict(null);
      try {
        const [profJson, candleJson] = await Promise.all([
          fetchJsonWithRetry<CommodityProfileDossier>(
            `/api/cycle/profile/${encodeURIComponent(selectedSymbol)}`,
            { signal: controller.signal }
          ),
          fetchJsonWithRetry<{ candles?: MarketCandle[] }>(
            `/api/market/candles/${encodeURIComponent(selectedSymbol)}?timeframe=D1`,
            { signal: controller.signal }
          ).catch(() => null),
        ]);
        if (cancelled) return;
        setDossier(profJson);
        setCandles(Array.isArray(candleJson?.candles) ? candleJson.candles : []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : tr('hc.cp.loadFail'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadProfile();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedSymbol, datasets.length]);

  const visibleCandles = useMemo(() => {
    if (candles.length === 0) return [];
    const sorted = [...candles].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    if (horizon === 'ALL') return sorted;
    const latestMs = Date.parse(sorted[sorted.length - 1].timestamp);
    const cutoffMs = latestMs - HORIZON_DAYS[horizon] * 86_400_000;
    return sorted.filter((c) => Date.parse(c.timestamp) >= cutoffMs);
  }, [candles, horizon]);

  const themeKey = useThemeKey();

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container || visibleCandles.length === 0) return;
    const pal = chartPalette();

    const chart = createChart(container, {
      ...lwBase(),
      autoSize: false,
      width: container.clientWidth,
      height: 300,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: pal.up,
      downColor: pal.down,
      borderVisible: false,
      wickUpColor: pal.up,
      wickDownColor: pal.down,
    });

    const dedup = new Map<string, MarketCandle>();
    for (const c of visibleCandles) {
      dedup.set(c.timestamp.slice(0, 10), c);
    }
    series.setData(
      Array.from(dedup.entries()).map(([time, c]) => ({
        time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );
    chart.timeScale().fitContent();

    const observer = new ResizeObserver(() => {
      if (container) {
        chart.applyOptions({ width: container.clientWidth });
      }
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [visibleCandles, themeKey]);

  const handleRunVerdict = async () => {
    setVerdictLoading(true);
    try {
      const res = await fetch('/api/cycle/verdict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: selectedSymbol }),
      });
      const json = await safeReadJson<EightQuestionVerdict>(res);
      setVerdict(json);
    } catch (err) {
      setVerdict({
        symbol: selectedSymbol,
        generatedAt: new Date().toISOString(),
        model: 'Gemini',
        status: 'AI_ERROR',
        message: err instanceof Error ? err.message : tr('hc.cp.verdictFail'),
        answers: null,
      });
    } finally {
      setVerdictLoading(false);
    }
  };

  if (loading && !dossier) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-10 text-center text-sm text-[var(--muted)]">
        {t('hc.cp.loading', { sym: selectedSymbol })}
      </div>
    );
  }

  if (error || !dossier) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--negative)]/40 rounded-[var(--radius-md)] p-6 space-y-3">
        <p className="text-sm text-[var(--negative)]">{error ?? t('hc.cp.notFound')}</p>
        <button
          type="button"
          onClick={() => setActiveModule('commodity-world')}
          className="px-3 py-1.5 bg-[var(--surface-2)] border border-[var(--border)] rounded text-xs text-[var(--text-strong)]"
        >
          {t('hc.cp.back')}
        </button>
      </div>
    );
  }

  const { summary, timeframes, bottomDetection, tradePlans, supplyDemandMatrix, seasonality, cotSnapshot } = dossier;
  const { instrument, quote, returns } = summary;
  const visual = getCommodityVisual(instrument.id);
  const nameVi = visual?.nameVi ?? instrument.commodityProfile?.vietnameseName ?? instrument.productName;

  return (
    <div className="space-y-6">
      {/* Top Action Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setActiveModule('commodity-world')}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text)] hover:text-[var(--text-strong)] self-start"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{t('hc.cp.back')}</span>
        </button>

        <div className="flex items-center gap-2">
          <label htmlFor="profile-symbol-select" className="text-xs text-[var(--muted)] whitespace-nowrap">
            {t('hc.cp.switchSym')}
          </label>
          <select
            id="profile-symbol-select"
            value={instrument.exchangeSymbol}
            onChange={(e) => setSelectedSymbol(e.target.value)}
            className="bg-[var(--surface)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-xs text-[var(--text-strong)] font-mono focus:outline-none focus:border-[var(--accent)]"
          >
            {instruments.map((inst) => (
              <option key={inst.id} value={inst.exchangeSymbol}>
                {inst.exchangeSymbol} — {inst.commodityProfile?.vietnameseName ?? inst.productName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Hero Banner */}
      <section className="relative bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] overflow-hidden">
        <div className="relative h-56 sm:h-64 w-full">
          <CommodityHeroImage
            symbol={instrument.id}
            name={nameVi}
            category={instrument.category}
            className="w-full h-full"
            priority
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)]/70 to-[var(--bg)]/50"
          />

          <div className="absolute inset-0 p-5 sm:p-6 flex flex-col justify-between">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-mono text-[var(--text-strong)]/95 bg-[var(--bg)]/85 backdrop-blur-sm px-2.5 py-1 rounded border border-white/15">
                {instrument.exchange}:{instrument.exchangeSymbol}
                {instrument.mxvMapping?.mxvSymbol ? ` · MXV ${instrument.mxvMapping.mxvSymbol}` : ''}
                {visual?.originTag ? ` · ${visual.originTag}` : ''}
              </span>
              <span className="inline-flex items-center bg-[var(--bg)]/85 backdrop-blur-sm px-2.5 py-1 rounded border border-white/15 shadow-sm">
                <DataStatusBadge status={quote.status} />
              </span>
            </div>

            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl sm:text-3xl font-semibold text-[var(--text-strong)] tracking-tight text-balance">
                  {nameVi} ({instrument.productName})
                </h2>
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  <CyclePhaseBadge phase={summary.cyclePhase} />
                  <span className="text-xs font-mono text-[var(--muted)]">
                    {t('hc.cp.sessions', { v: instrument.commodityProfile?.vietnamTradingSessionsIct ?? t('hc.cp.sessionsDefault') })}
                  </span>
                </div>
              </div>

              <div className="bg-[var(--bg)]/90 border border-[var(--border)] rounded-[var(--radius-md)] px-4 py-3 text-right shrink-0 max-w-xs">
                <span className="block text-[11px] text-[var(--faint)]">{t('hc.cp.refPrice')}</span>
                <span className="block text-2xl font-mono font-semibold text-[var(--text-strong)] tabular-nums">
                  {quote.price !== null ? quote.price.toFixed(2) : 'DATA_UNAVAILABLE'}
                </span>
                {quote.price !== null ? (
                  <span className="block text-[11px] font-mono text-[var(--muted)]">
                    {`${quote.currency} / ${quote.unit} · ${quote.source}`}
                  </span>
                ) : (
                  <div className="mt-1 space-y-1.5">
                    <span className="block text-[11px] text-[var(--warning)]/90 leading-snug">
                      {instrument.exchangeSymbol === 'RC' ||
                      instrument.exchangeSymbol === 'BRN' ||
                      instrument.exchangeSymbol === 'JRU' ||
                      instrument.exchangeSymbol === 'TIO' ||
                      instrument.exchangeSymbol === 'CT'
                        ? t('hc.cp.noFeedFree')
                        : t('hc.cp.feedOff')}
                    </span>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveModule('data-health')}
                        className="text-[11px] font-medium text-[var(--accent)] hover:underline whitespace-nowrap"
                      >
                        API &amp; Sync
                      </button>
                      <span className="text-[var(--text)]/30" aria-hidden="true">·</span>
                      <button
                        type="button"
                        onClick={() => setActiveModule('data-import')}
                        className="text-[11px] font-medium text-[var(--accent-text)] hover:underline whitespace-nowrap"
                      >
                        Import CSV
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Multi-Horizon Return Strip */}
        <div className="grid grid-cols-4 sm:grid-cols-8 divide-x divide-[var(--border)] border-t border-[var(--border)] bg-[var(--surface)]">
          {(
            [
              ['1W', returns.w1],
              ['1M', returns.m1],
              ['3M', returns.m3],
              ['6M', returns.m6],
              ['1Y', returns.y1],
              ['3Y', returns.y3],
              ['5Y', returns.y5],
              ['10Y', returns.y10],
            ] as Array<[string, number | null]>
          ).map(([label, val]) => (
            <div key={label} className="px-3 py-2.5 text-center">
              <span className="block text-[10px] font-mono text-[var(--faint)]">{label}</span>
              <span
                className={`block text-xs font-semibold tabular-nums mt-0.5 ${
                  val === null ? 'text-[var(--text)]/40' : val >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                }`}
              >
                {val !== null ? `${val >= 0 ? '+' : ''}${val.toFixed(1)}%` : '—'}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Historical Chart + 8-Question AI Verdict Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Multi-Horizon Price Chart (2/3) */}
        <section className="xl:col-span-2 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('hc.cp.chartTitle')}</h2>
              <p className="text-xs text-[var(--faint)] tabular-nums">
                {t('hc.cp.candlesAvail', { n: candles.length })}{' '}
                {summary.percentile10Y !== null ? `${summary.percentile10Y.toFixed(1)}%` : 'DATA_UNAVAILABLE'}
              </p>
            </div>
            <div className="flex items-center gap-1 bg-[var(--bg)] border border-[var(--border)] rounded p-1">
              {(['1Y', '3Y', '5Y', '10Y', 'ALL'] as ChartHorizon[]).map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHorizon(h)}
                  className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                    horizon === h ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)] hover:text-[var(--text-strong)]'
                  }`}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>

          {visibleCandles.length === 0 ? (
            <div className="h-[300px] bg-[var(--bg)] border border-[var(--border)] rounded flex flex-col items-center justify-center p-6 text-center space-y-3">
              <p className="text-sm font-mono text-[var(--warning)]">
                {t('hc.cp.noCandles', { sym: instrument.exchangeSymbol })}
              </p>
              <p className="text-xs text-[var(--muted)] max-w-md">
                {t('hc.cp.noCandlesHint')}
              </p>
              <button
                type="button"
                onClick={() => setActiveModule('data-import')}
                className="px-3 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent)]/90 rounded text-xs font-medium text-white"
              >
                {t('hc.cp.openImport')}
              </button>
            </div>
          ) : (
            <div ref={chartContainerRef} className="w-full h-[300px] rounded overflow-hidden" />
          )}
        </section>

        {/* 100-Point Bottom Detection Summary Card (1/3) */}
        <section className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-4 space-y-4 min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('hc.cp.bottomTitle')}</h2>
              <p className="text-xs text-[var(--faint)] mt-0.5">
                {t('hc.cp.observedWeight', { n: bottomDetection.observedWeight })}
              </p>
            </div>
            <InfoToggle id="prof-bottom-method" label={t('prof.method')}>
              {bottomDetection.methodologyNote}
            </InfoToggle>
          </div>

          <div className="bg-[var(--bg)] border border-[var(--border)] rounded p-3 space-y-2" data-testid="bottom-score-gauge">
            <ScoreGauge
              score={bottomDetection.totalScore}
              accent={getBottomScoreAccent(bottomDetection.classification)}
              label={bottomDetection.totalScore !== null ? t('prof.gaugeAria', { v: bottomDetection.totalScore }) : t('prof.gaugeNone')}
            />
            <p className={`text-xs font-medium text-center ${getBottomScoreAccent(bottomDetection.classification)}`}>
              {bottomDetection.classificationLabelVi}
            </p>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-[var(--muted)]">
                <span>{t('prof.confidence')}</span>
                <span className="font-mono tabular-nums">
                  {bottomDetection.modelConfidenceScore !== null ? `${bottomDetection.modelConfidenceScore}/100` : '—'}
                </span>
              </div>
              <div
                className="h-1.5 w-full bg-[var(--surface-2)] rounded overflow-hidden"
                role="img"
                aria-label={`${t('prof.confidence')}: ${bottomDetection.modelConfidenceScore !== null ? `${bottomDetection.modelConfidenceScore}/100` : '—'}`}
              >
                <div
                  className="h-full rounded bg-[var(--accent)]"
                  style={{ width: `${bottomDetection.modelConfidenceScore !== null ? Math.min(100, Math.max(0, bottomDetection.modelConfidenceScore)) : 0}%` }}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {bottomDetection.factors.map((f) => {
              const pct = f.score !== null ? Math.round((f.score / f.weight) * 100) : 0;
              return (
                <div key={f.key} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--text)] truncate pr-2">{f.labelVi}</span>
                    <span className="text-[var(--text)] tabular-nums tabular-nums shrink-0">
                      {f.score !== null ? `${f.score}/${f.weight}` : `—/${f.weight}`}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-[var(--bg)] rounded overflow-hidden">
                    <div
                      className={`h-full rounded ${
                        !f.available
                          ? 'bg-[var(--border)]'
                          : pct >= 70
                            ? 'bg-[var(--positive)]'
                            : pct >= 45
                              ? 'bg-[var(--accent)]'
                              : 'bg-[var(--warning)]'
                      }`}
                      style={{ width: `${f.available ? pct : 0}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* 8-Question AI VERDICT */}
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
          <div className="flex items-center gap-2.5">
            <Bot className="w-4 h-4 text-[var(--accent)]" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-strong)]">
                {t('hc.cp.verdictTitle')}
              </h2>
              <p className="text-xs text-[var(--faint)]">Gemini · server-side</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleRunVerdict()}
            disabled={verdictLoading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[var(--accent)] hover:bg-[var(--accent)]/90 disabled:opacity-50 rounded-md text-xs font-medium text-white whitespace-nowrap self-start sm:self-auto"
          >
            <Bot className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{verdictLoading ? t('hc.cp.verdictRunning') : t('hc.cp.verdictRun')}</span>
          </button>
        </div>

        {!verdict && <p className="text-xs text-[var(--muted)]">{t('prof.verdictHint')}</p>}
        <ul className="grid grid-cols-2 sm:grid-cols-4 gap-2" aria-label={t('prof.chipsAria')} data-testid="verdict-chips">
          {VERDICT_CHIPS.map(({ key, field, icon: Icon }, idx) => {
            const answers = verdict?.status === 'OK' ? verdict.answers : null;
            const answered = !!answers?.[field];
            return (
              <li
                key={key}
                className={`flex items-center gap-1.5 min-w-0 rounded-xl border px-2.5 py-1.5 text-[11px] leading-tight ${
                  answered
                    ? 'border-[var(--accent)]/60 bg-[var(--accent)]/10 text-[var(--text-strong)]'
                    : 'border-[var(--border)] bg-[var(--bg)] text-[var(--muted)]'
                }`}
              >
                {answered ? (
                  <CircleCheck className="w-3.5 h-3.5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
                ) : (
                  <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                )}
                <span className="min-w-0 break-words">
                  {idx + 1}. {t(key)}
                </span>
                <span className="sr-only">— {answered ? t('prof.answered') : t('prof.notAnswered')}</span>
              </li>
            );
          })}
        </ul>
        {!verdict ? null : verdict.status !== 'OK' || !verdict.answers ? (
          <div className="bg-[var(--bg)] border border-[var(--warning)]/40 rounded-md p-3 text-xs text-[var(--warning)] flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{verdict.message ?? `Status: ${verdict.status}`}</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {[
              [t('hc.cp.q1'), verdict.answers.q1CyclePhase],
              [t('hc.cp.q2'), verdict.answers.q2SupplyDemandState],
              [t('hc.cp.q3'), verdict.answers.q3ValuableOrTrap],
              [t('hc.cp.q4'), verdict.answers.q4BottomProbabilityAssessment],
              [t('hc.cp.q5'), verdict.answers.q5KeyDriversAndRisks],
              [t('hc.cp.q6'), verdict.answers.q6ShouldActNowOrWait],
              [t('hc.cp.q7'), verdict.answers.q7EntryZoneInvalidationTargets],
              [t('hc.cp.q8'), verdict.answers.q8ConfirmationTriggers],
            ].map(([q, ans]) => (
              <div key={q} className="bg-[var(--bg)] border border-[var(--border)] rounded-md p-3.5 space-y-1.5">
                <p className="font-semibold text-[var(--text-strong)]">{q}</p>
                <p className="text-[var(--text)] leading-relaxed">{ans}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Multi-Timeframe Cycle Matrix (M/W/D/H4) */}
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[var(--accent)]" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-[var(--text-strong)]">
            {t('hc.cp.mtfTitle')}
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {(['MONTHLY', 'WEEKLY', 'DAILY', 'H4'] as const).map((tfKey) => {
            const tf = timeframes[tfKey];
            return (
              <div key={tfKey} className="bg-[var(--bg)] border border-[var(--border)] rounded-md p-3.5 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-semibold text-[var(--text-strong)]">{tfKey}</span>
                  <span className="font-mono text-[11px] text-[var(--faint)]">{t('hc.cp.candlesCount', { n: tf.candleCount })}</span>
                </div>
                <CyclePhaseBadge phase={tf.phase} compact />
                <p className="text-[var(--muted)] leading-relaxed">{tf.summary}</p>
                {tf.available && (
                  <div className="grid grid-cols-2 gap-1 pt-2 border-t border-[var(--border)] font-mono text-[11px] text-[var(--muted)] tabular-nums">
                    <span>EMA20: {tf.ema20 ?? '—'}</span>
                    <span>EMA50: {tf.ema50 ?? '—'}</span>
                    <span>RSI14: {tf.rsi14 ?? '—'}</span>
                    <span>ATR%: {tf.atrPct !== null ? `${tf.atrPct}%` : '—'}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Dual Trade Setup Plans: A. Long-Term Cycle Investing & B. Swing Trading */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-expanded={eduOpen}
          aria-controls="prof-edu-note"
          onClick={() => setEduOpen((v) => !v)}
          className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border border-[var(--warning)]/60 bg-[var(--warning)]/10 px-3 py-1 text-xs font-medium text-[var(--warning)]"
          data-testid="profile-edu-badge"
        >
          <ShieldAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{t('prof.eduBadge')}</span>
          <Info className="w-3.5 h-3.5 shrink-0 opacity-70" aria-hidden="true" />
          <span className="sr-only">{t('prof.eduMore')}</span>
        </button>
        {eduOpen && (
          <p id="prof-edu-note" role="note" className="basis-full text-xs leading-relaxed text-[var(--text)] bg-[var(--surface-2)] border border-[var(--border)] rounded-md p-3">
            {t('prof.eduFull')}
          </p>
        )}
      </div>
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[tradePlans.longTermCycle, tradePlans.swingTrading].map((plan) => (
          <div key={plan.horizonType} className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-5 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] pb-3">
              <h2 className="text-sm font-semibold text-[var(--text-strong)] min-w-0">{plan.title}</h2>
              <span className="font-mono text-xs px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] whitespace-nowrap">
                {plan.status}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-[var(--bg)] border border-[var(--border)] rounded p-2.5">
                <span className="block text-[11px] text-[var(--faint)]">{t('prof.refZone')}</span>
                <span className="font-mono text-[var(--text-strong)] tabular-nums">
                  {plan.entryZone.low !== null && plan.entryZone.high !== null
                    ? `${plan.entryZone.low} – ${plan.entryZone.high}`
                    : 'DATA_UNAVAILABLE'}
                </span>
              </div>
              <div className="bg-[var(--bg)] border border-[var(--border)] rounded p-2.5">
                <span className="block text-[11px] text-[var(--faint)]">{t('hc.cp.sl')}</span>
                <span className="font-mono text-[var(--negative)] tabular-nums">
                  {plan.stopLoss !== null ? plan.stopLoss : '—'}
                </span>
              </div>
              <div className="bg-[var(--bg)] border border-[var(--border)] rounded p-2.5">
                <span className="block text-[11px] text-[var(--faint)]">{t('hc.cp.tp')}</span>
                <span className="font-mono text-[var(--positive)] tabular-nums">
                  {plan.takeProfits.length > 0 ? plan.takeProfits.join(' / ') : '—'}
                </span>
              </div>
              <div className="bg-[var(--bg)] border border-[var(--border)] rounded p-2.5">
                <span className="block text-[11px] text-[var(--faint)]">{t('hc.cp.rr')}</span>
                <span className="font-mono text-[var(--accent)] font-semibold tabular-nums">
                  {plan.riskRewardRatio !== null ? `1 : ${plan.riskRewardRatio}` : '—'}
                </span>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <p className="text-[var(--text)] leading-relaxed">{plan.positionSizingGuidance}</p>
              <p className="text-[var(--warning)]/90 font-mono">{t('hc.cp.invalidation', { v: plan.invalidationCondition })}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Tailored Supply/Demand Grid + 12-Month Seasonality & COT */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-[var(--accent)]" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-[var(--text-strong)]">
              {t('hc.cp.sdMatrix', { name: nameVi })}
            </h2>
          </div>

          <div className="divide-y divide-[var(--border)] text-xs">
            {supplyDemandMatrix.map((item) => (
              <SupplyDemandRow key={item.id} item={item} />
            ))}
          </div>
        </section>

        <section className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[var(--accent)]" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('hc.cp.seasonTitle')}</h2>
            </div>
            <span className="text-[11px] font-mono text-[var(--faint)]">
              COT Index: {cotSnapshot.cotIndex !== null ? `${cotSnapshot.cotIndex.toFixed(1)}%` : 'UNAVAILABLE'}
            </span>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 text-xs">
            {seasonality.map((m) => (
              <div key={m.month} className="bg-[var(--bg)] border border-[var(--border)] rounded p-2">
                <span className="block text-[11px] text-[var(--faint)]">{m.label}</span>
                <span
                  className={`font-semibold tabular-nums ${
                    m.avgReturnPct === null
                      ? 'text-[var(--text)]/40'
                      : m.avgReturnPct >= 0
                        ? 'text-[var(--positive)]'
                        : 'text-[var(--negative)]'
                  }`}
                >
                  {m.avgReturnPct !== null ? `${m.avgReturnPct >= 0 ? '+' : ''}${m.avgReturnPct}%` : '—'}
                </span>
                <span className="block text-[10px] font-mono text-[var(--faint)]">
                  {m.sampleYears > 0 ? t('hc.cp.seasonSample', { years: m.sampleYears, pct: m.winRatePct }) : t('hc.cp.seasonMissing')}
                </span>
              </div>
            ))}
          </div>

          <div className="bg-[var(--bg)] border border-[var(--border)] rounded p-3 text-xs space-y-1">
            <div className="flex items-center gap-1.5 text-[var(--text-strong)] font-medium">
              <TrendingUp className="w-3.5 h-3.5 text-[var(--accent)]" aria-hidden="true" />
              <span>{t('hc.cp.cotTitle')}</span>
            </div>
            <p className="text-[var(--muted)]">{cotSnapshot.note}</p>
            {instrument.commodityProfile?.vietnamMarketRelevance && (
              <p className="text-[var(--muted)] pt-1">
                {instrument.commodityProfile.vietnamMarketRelevance}
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
