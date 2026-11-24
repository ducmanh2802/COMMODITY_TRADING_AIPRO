import { useEffect, useId, useState, type ReactNode } from 'react';
import { ArrowUpRight, ChevronRight, Filter, Info, Radar } from 'lucide-react';
import { useTerminal } from '../../contexts/TerminalContext';
import { useT } from '../../i18n';
import { COMMODITY_GROUP_LABELS_VI, getCommodityVisual } from '../../shared/data/commodityVisuals';
import type { CommodityCycleSummary, CommodityGroupFilter, CyclePhase } from '../../shared/types/cycle';
import { CommodityHeroImage } from '../common/CommodityHeroImage';
import { CyclePhaseBadge, getBottomScoreAccent } from '../common/CyclePhaseBadge';
import { DataStatusBadge } from '../common/DataStatusBadge';
import { Badge } from '../ui/Badge';
import { ScaleLegend } from '../ui/viz/ScaleLegend';
import { fetchJsonWithRetry } from '../../shared/utils/http';
import { sortCommoditiesByPotential } from '../../shared/utils/commoditySort';

/** Rows shown as visual cards; the full ranked table stays in a collapsed <details>. */
const TOP_N = 5;

const PHASES: CyclePhase[] = ['PHASE_1_ACCUMULATION', 'PHASE_2_EARLY_RECOVERY', 'PHASE_3_MARKUP', 'PHASE_4_DISTRIBUTION'];
/** Same tokens as CyclePhaseBadge (palette: no green/red). */
const PHASE_COLOR: Record<string, string> = {
  PHASE_1_ACCUMULATION: 'var(--accent-text)',
  PHASE_2_EARLY_RECOVERY: 'var(--positive)',
  PHASE_3_MARKUP: 'var(--accent)',
  PHASE_4_DISTRIBUTION: 'var(--warning)',
};

/** (i) popover (pattern copied from InstrumentOverview ContextCard). */
function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        className="shrink-0 w-10 h-10 -my-2 flex items-center justify-center text-[var(--muted)] hover:text-[var(--text-strong)]"
      >
        <Info className="w-4 h-4" aria-hidden="true" />
      </button>
      {open && (
        <span id={id} role="tooltip" className="absolute right-0 sm:left-0 sm:right-auto top-full z-50 mt-1 block w-72 max-w-[calc(100vw-32px)] text-xs leading-relaxed text-[var(--text)] bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-2.5 shadow-lg">
          {children}
        </span>
      )}
    </span>
  );
}

/** 4 segments = 4 cycle phases; the current one is filled. Text lives in aria-label / title. */
function PhaseStrip({ phase, label }: { phase: CyclePhase; label: string }) {
  const idx = PHASES.indexOf(phase);
  return (
    <span role="img" aria-label={label} title={label} className="flex gap-0.5 w-16 shrink-0">
      {PHASES.map((p, i) => (
        <span
          key={p}
          className="h-2 flex-1 rounded-sm"
          style={{ background: i === idx ? PHASE_COLOR[p] : 'var(--border)', opacity: idx < 0 ? 0.5 : 1 }}
        />
      ))}
    </span>
  );
}

/** Bottom score 0..100 as a filled bar + number. */
function ScoreMeter({ score, accent }: { score: number | null; accent: string }) {
  return (
    <span className="flex items-center gap-2 min-w-0 flex-1" aria-hidden="true">
      <span className="relative h-2 flex-1 min-w-10 rounded-full bg-[var(--border)] overflow-hidden">
        {score !== null && (
          <span
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${Math.max(0, Math.min(100, score))}%`, background: 'linear-gradient(90deg,var(--seq-2),var(--seq-5))' }}
          />
        )}
      </span>
      <span className={`w-7 text-right font-mono font-semibold tabular-nums text-sm ${accent}`}>{score ?? '—'}</span>
    </span>
  );
}

/** Where price sits in its 10-year range (0% = low, 100% = high): a dot on a track. */
function PercentileDot({ pct, label }: { pct: number | null; label: string }) {
  if (pct === null) return <span className="hidden sm:block w-14 shrink-0" aria-hidden="true" />;
  return (
    <span role="img" aria-label={label} title={label} className="hidden sm:block relative w-14 h-3 shrink-0">
      <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-[var(--border)]" />
      <span
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-[var(--text-strong)] border border-[var(--surface)]"
        style={{ left: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </span>
  );
}

export function CycleScannerView({ embedded = false }: { embedded?: boolean } = {}) {
  const t = useT();
  const { openInstrumentIn } = useTerminal();
  const [category, setCategory] = useState<CommodityGroupFilter>('ALL');
  const [phase, setPhase] = useState<'ALL' | CyclePhase>('ALL');
  const [minScore, setMinScore] = useState<number>(0);
  const [mxvOnly, setMxvOnly] = useState<boolean>(false);
  const [results, setResults] = useState<CommodityCycleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const runScan = async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (category !== 'ALL') qs.set('category', category);
      if (phase !== 'ALL') qs.set('phase', phase);
      if (minScore > 0) qs.set('minBottomScore', String(minScore));
      if (mxvOnly) qs.set('mxvOnly', 'true');

      const json = await fetchJsonWithRetry<{ commodities?: CommodityCycleSummary[] }>(`/api/cycle/scanner?${qs.toString()}`);
      setResults(Array.isArray(json.commodities) ? sortCommoditiesByPotential(json.commodities) : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('cs.error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void runScan();
  }, [category, phase, minScore, mxvOnly]);

  const activeFilters = [category !== 'ALL', phase !== 'ALL', minScore > 0, mxvOnly].filter(Boolean).length;
  const nameOf = (item: CommodityCycleSummary) =>
    getCommodityVisual(item.instrument.id)?.nameVi ?? item.instrument.commodityProfile?.vietnameseName ?? item.instrument.productName;
  const phaseLabel = (p: CyclePhase) => t(`fr.phase.${PHASES.includes(p) ? p : 'DATA_UNAVAILABLE'}` as 'fr.phase.DATA_UNAVAILABLE');
  const pctText = (v: number | null) => (v !== null ? `${v.toFixed(0)}%` : t('cs.noData'));
  const open = (item: CommodityCycleSummary) => openInstrumentIn(item.instrument.exchangeSymbol, 'commodity-profile');
  const selectCls =
    'w-full bg-[var(--bg)] border border-[var(--border)] rounded px-2.5 py-2 text-xs text-[var(--text-strong)] focus:outline-none focus:border-[var(--accent)]';

  return (
    <div className="space-y-4 min-w-0">
      {!embedded && (
        <h2 className="text-xl font-semibold text-[var(--text-strong)] tracking-tight flex items-center gap-2">
          <Radar className="w-5 h-5 text-[var(--accent)]" aria-hidden="true" />
          <span>{t('cs.title')}</span>
        </h2>
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="flex items-center gap-1 text-sm text-[var(--text)]/70">
          <span>{t('cs.lead')}</span>
          <InfoTip label={t('cs.info')}>{t('cs.infoBody')}</InfoTip>
        </p>
        <ScaleLegend kind="sequential" low={t('cs.scoreLegendLow')} high={t('cs.scoreLegendHigh')} />
      </div>

      {/* Filters: collapsed; the summary shows how many are on. */}
      <details className="group bg-[var(--surface)] border border-[var(--border)] rounded-lg">
        <summary className="cursor-pointer list-none flex items-center gap-2 px-4 min-h-11 text-xs text-[var(--text)]/80">
          <Filter className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="font-medium">{t('cs.filters')}</span>
          {activeFilters > 0 && <Badge tone="accent">{t('cs.filtersActive', { n: activeFilters })}</Badge>}
          <ChevronRight className="w-3.5 h-3.5 ml-auto transition-transform group-open:rotate-90" aria-hidden="true" />
        </summary>
        <section aria-label={t('cs.filtersAria')} className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1">
            <label htmlFor="scan-group" className="text-xs text-[var(--text)]/60 block">{t('cs.group')}</label>
            <select id="scan-group" value={category} onChange={(e) => setCategory(e.target.value as CommodityGroupFilter)} className={selectCls}>
              {(['ALL', 'AGRICULTURE', 'SOFT_COMMODITIES', 'METALS', 'ENERGY'] as CommodityGroupFilter[]).map((g) => (
                <option key={g} value={g}>{COMMODITY_GROUP_LABELS_VI[g]}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="scan-phase" className="text-xs text-[var(--text)]/60 block">{t('cs.phase')}</label>
            <select id="scan-phase" value={phase} onChange={(e) => setPhase(e.target.value as 'ALL' | CyclePhase)} className={selectCls}>
              <option value="ALL">{t('cs.phaseAll')}</option>
              {[...PHASES, 'DATA_UNAVAILABLE' as CyclePhase].map((p) => (
                <option key={p} value={p}>{phaseLabel(p)}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="scan-score" className="text-xs text-[var(--text)]/60 block">{t('cs.minScore', { n: minScore })}</label>
            <input id="scan-score" type="range" min={0} max={85} step={5} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => setMxvOnly((p) => !p)}
              aria-pressed={mxvOnly}
              className={`w-full px-3 py-2 rounded border text-xs font-medium transition-colors ${
                mxvOnly ? 'bg-[var(--accent)] border-[var(--accent)] text-white' : 'bg-[var(--bg)] border-[var(--border)] text-[var(--text)]/80 hover:text-[var(--text-strong)]'
              }`}
            >
              {mxvOnly ? t('cs.mxvOn') : t('cs.mxvOff')}
            </button>
          </div>
        </section>
      </details>

      {error && (
        <div role="alert" className="bg-[var(--surface)] border border-[var(--negative)]/40 rounded-lg p-4 text-xs text-[var(--negative)]">
          {error}
        </div>
      )}

      {/* Top N: visual rows (phase strip, score bar, 10-year position dot). */}
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg" aria-busy={loading}>
        <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[var(--text-strong)]">{t('cs.top')}</h3>
          {!loading && <Badge>{t('cs.count', { n: results.length })}</Badge>}
        </div>
        {loading ? (
          <p className="px-4 py-6 text-center text-xs text-[var(--text)]/55">{t('cs.loading')}</p>
        ) : results.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-[var(--text)]/55 space-y-1">
            <p>{t('cs.empty')}</p>
            <p className="text-[11px] text-[var(--text)]/45">{t('cs.emptyHint')}</p>
          </div>
        ) : (
          <ol className="divide-y divide-[var(--border)]/70">
            {results.slice(0, TOP_N).map((item, i) => {
              const name = nameOf(item);
              const ph = phaseLabel(item.cyclePhase);
              const phIdx = PHASES.indexOf(item.cyclePhase);
              return (
                <li key={item.instrument.id}>
                  <button
                    type="button"
                    onClick={() => open(item)}
                    aria-label={t('cs.rowAria', { name, phase: ph, score: item.bottomScore ?? t('cs.noData'), pct: pctText(item.percentile10Y) })}
                    className="w-full flex items-center gap-3 px-4 py-2.5 min-h-11 text-left hover:bg-[var(--surface-2)]/60 transition-colors"
                  >
                    <span className="w-4 text-[11px] font-mono text-[var(--muted)] tabular-nums" aria-hidden="true">{i + 1}</span>
                    <span className="w-28 sm:w-40 min-w-0 shrink-0 text-xs font-medium text-[var(--text-strong)] truncate">{name}</span>
                    <PhaseStrip phase={item.cyclePhase} label={phIdx >= 0 ? t('cs.phaseAria', { n: phIdx + 1, phase: ph }) : ph} />
                    <ScoreMeter score={item.bottomScore} accent={getBottomScoreAccent(item.bottomClassification)} />
                    <PercentileDot pct={item.percentile10Y} label={t('cs.pctAria', { pct: pctText(item.percentile10Y) })} />
                    <ChevronRight className="w-4 h-4 shrink-0 text-[var(--muted)]" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* Expert detail: the full ranked table, collapsed (not removed). */}
      {!loading && results.length > 0 && (
        <details className="group bg-[var(--surface)] border border-[var(--border)] rounded-lg min-w-0">
          <summary className="cursor-pointer list-none flex items-center gap-2 px-4 min-h-11 text-xs font-medium text-[var(--accent-text)]">
            <span>{t('cs.fullTable', { n: results.length })}</span>
            <ChevronRight className="w-3.5 h-3.5 ml-auto transition-transform group-open:rotate-90" aria-hidden="true" />
          </summary>
          <p className="px-4 pb-2 text-[11px] text-[var(--text)]/50">{t('cs.tableHint')}</p>
          <div className="overflow-x-auto" tabIndex={0} aria-label={t('cs.fullTable', { n: results.length })}>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-y border-[var(--border)] text-xs text-[var(--text)]/55">
                  <th className="py-2.5 px-4 font-medium">{t('cs.col.name')}</th>
                  <th className="py-2.5 px-3 font-medium">{t('cs.col.phase')}</th>
                  <th className="py-2.5 px-3 font-medium text-right">{t('cs.col.score')}</th>
                  <th className="py-2.5 px-3 font-medium text-right">{t('cs.col.pct')}</th>
                  <th className="py-2.5 px-3 font-medium text-right">{t('cs.col.price')}</th>
                  <th className="py-2.5 px-3 font-medium">{t('cs.col.status')}</th>
                  <th className="py-2.5 px-4 font-medium text-right">{t('cs.col.open')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]/70 text-xs">
                {results.map((item) => {
                  const name = nameOf(item);
                  return (
                    <tr key={item.instrument.id} onClick={() => open(item)} className="hover:bg-[var(--surface-2)]/60 transition-colors cursor-pointer">
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-3">
                          <CommodityHeroImage symbol={item.instrument.id} name={name} category={item.instrument.category} className="w-16 h-9 rounded shrink-0 border border-[var(--border)]" />
                          <div className="min-w-0">
                            <p className="font-medium text-[var(--text-strong)] truncate">{name}</p>
                            <p className="text-[11px] font-mono text-[var(--text)]/50">
                              {item.instrument.exchange}:{item.instrument.exchangeSymbol}
                              {item.instrument.mxvMapping?.mxvSymbol ? ` · MXV ${item.instrument.mxvMapping.mxvSymbol}` : ''}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3"><CyclePhaseBadge phase={item.cyclePhase} compact /></td>
                      <td className={`py-2.5 px-3 text-right font-mono font-semibold tabular-nums ${getBottomScoreAccent(item.bottomClassification)}`}>
                        {item.bottomScore !== null ? `${item.bottomScore}/100` : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-[var(--text)]/75 tabular-nums">
                        {item.percentile10Y !== null ? `${item.percentile10Y.toFixed(0)}%` : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-[var(--text-strong)] tabular-nums">
                        {item.quote.price !== null ? item.quote.price.toFixed(2) : 'DATA_UNAVAILABLE'}
                      </td>
                      <td className="py-2.5 px-3"><DataStatusBadge status={item.quote.status} compact /></td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            open(item);
                          }}
                          className="inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline whitespace-nowrap"
                        >
                          <span>{t('cs.open')}</span>
                          <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
