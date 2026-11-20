import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Layers, ListChecks, RefreshCw } from 'lucide-react';
import { useTerminal } from '../../../contexts/TerminalContext';
import { fmtDate, fmtDateTime, useI18n } from '../../../i18n';
import type { AnalysisBrief } from '../../../shared/types/brief';
import { safeReadJson } from '../../../shared/utils/http';
import { BriefSectionCard } from './BriefSectionCard';
import { BriefSparkline } from './BriefSparkline';
import { SectionHeader } from '../../ui/SectionHeader';
import { Card } from '../../ui/Card';
import { Skeleton } from '../../ui/Skeleton';
import { EmptyState } from '../../ui/EmptyState';

function decimalsForTick(tick: number | null | undefined): number {
  if (!tick || tick <= 0) return 2;
  const s = String(tick);
  const dot = s.indexOf('.');
  return Math.max(2, dot < 0 ? 0 : s.length - dot - 1);
}

/**
 * "Phân tích chi tiết": plain-language brief of one commodity (GET /api/analysis/brief/:id).
 * Complements the owner's "Hồ sơ hàng hoá" (multi-year cycle dossier) with the current state.
 */
export function BriefView() {
  const { selectedSymbol, setSelectedSymbol, instruments, setActiveModule } = useTerminal();
  const { t, lang } = useI18n();
  const [brief, setBrief] = useState<AnalysisBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (symbol: string, signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analysis/brief/${encodeURIComponent(symbol)}`, { signal });
      const data = await safeReadJson<AnalysisBrief>(res);
      setBrief(data);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError(err instanceof Error ? err.message : String(err));
      setBrief(null);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    void load(selectedSymbol, ctrl.signal);
    return () => ctrl.abort();
  }, [selectedSymbol, load]);

  const inst = instruments.find((i) => i.exchangeSymbol === selectedSymbol);
  const decimals = decimalsForTick(inst?.specification.minimumTickSize);
  const isCurrent = brief && brief.exchangeSymbol === selectedSymbol;

  return (
    <div className="space-y-4 max-w-6xl">
      <SectionHeader
        level={1}
        title={t('brief.title')}
        subtitle={t('brief.subtitle')}
        actions={
          isCurrent && (
            <span className="text-sm text-[var(--muted)]">
              · {brief.exchangeSymbol} — {lang === 'vi' && brief.vietnameseName ? brief.vietnameseName : brief.productName}
            </span>
          )
        }
      />

      <Card tone="warning" className="space-y-1">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            <strong className="font-semibold">{t('brief.disclaimer')}</strong> <span className="text-[var(--warning)]/80">{t('brief.disclaimerDetail')}</span>
          </span>
        </div>
      </Card>

      <Card className="space-y-3" padded={false}>
        <div className="p-3 flex flex-wrap items-center justify-between gap-3">
          <label htmlFor="toolbar-symbol-select" className="sr-only">
            {t('brief.pickInstrument')}
          </label>
          <select
            id="toolbar-symbol-select"
            value={selectedSymbol}
            onChange={(e) => setSelectedSymbol(e.target.value)}
            className="w-full sm:w-auto min-w-0 max-w-full bg-[var(--surface)] border border-[var(--border)] rounded-md px-3 py-1.5 text-xs font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
          >
            {instruments.map((i) => (
              <option key={i.id} value={i.exchangeSymbol}>
                {i.exchangeSymbol} ({i.exchange}) · {lang === 'vi' && i.commodityProfile?.vietnameseName ? i.commodityProfile.vietnameseName : i.productName}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveModule('commodity-profile')}
              title={t('brief.profileHint')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-[var(--border)] text-[var(--muted)] hover:text-white hover:border-[var(--accent)]"
            >
              <Layers className="w-3.5 h-3.5" aria-hidden="true" />
              {t('brief.openProfile')}
            </button>
            <button
              type="button"
              onClick={() => void load(selectedSymbol)}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-[var(--accent)] text-white disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
              {t('brief.refresh')}
            </button>
          </div>
        </div>
      </Card>

      {loading && !isCurrent && (
        <Skeleton className="h-8" />
      )}

      {error && (
        <Card tone="warning" className="flex flex-wrap items-center justify-between gap-2">
          <span>{t('brief.error', { msg: error })}</span>
          <button type="button" onClick={() => void load(selectedSymbol)} className="text-xs underline">
            {t('brief.retry')}
          </button>
        </Card>
      )}

      {isCurrent && (
        <>
          <Card tone="accent" className="space-y-3" aria-labelledby="brief-summary">
            <h3 id="brief-summary" className="flex items-center gap-2 text-sm font-semibold text-[var(--text-strong)]">
              <ListChecks className="w-4 h-4 text-[var(--accent)]" aria-hidden="true" />
              {t('brief.summaryTitle')}
            </h3>
            <ul className="space-y-2">
              {brief.summary.map((s, i) => (
                <li key={i} className="flex gap-2 text-sm leading-relaxed text-[var(--text)]">
                  <span className="mt-2 w-1.5 h-1.5 rounded-full bg-[var(--accent)] shrink-0" aria-hidden="true" />
                  <span className="min-w-0">{s[lang]}</span>
                </li>
              ))}
            </ul>
            {brief.chart && <BriefSparkline points={brief.chart.points} unit={brief.chart.unit} decimals={decimals} />}
            <p className="text-[11px] text-[var(--faint)] break-words">
              {brief.history.bars > 0
                ? t('brief.history', {
                    n: brief.history.bars,
                    from: fmtDate(brief.history.firstDate),
                    to: fmtDate(brief.history.lastDate),
                    src: brief.history.source ?? '—',
                  })
                : t('brief.historyNone')}
              {' · '}
              {t('brief.generatedAt', { v: fmtDateTime(brief.generatedAt) })}
            </p>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {brief.sections.map((s) => (
              <BriefSectionCard key={s.id} section={s} />
            ))}
          </div>

          <p className="text-xs text-[var(--faint)]">{brief.disclaimer[lang]}</p>
        </>
      )}

      {!isCurrent && !loading && !error && (
        <EmptyState
          title={t('brief.noData')}
          description={t('brief.noDataDesc')}
        />
      )}
    </div>
  );
}
