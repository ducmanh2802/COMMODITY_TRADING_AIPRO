import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarClock, ChevronRight, Minus, Sparkles, TrendingDown, TrendingUp, Zap } from 'lucide-react';
import { useTerminal } from '../../../contexts/TerminalContext';
import { useI18n } from '../../../i18n';
import type { CycleMarketOverview } from '../../../shared/types/cycle';
import type { Scorecard, ScorecardListResponse } from '../../../shared/types/scorecard';
import type { TodayResponse } from '../../../shared/types/today';
import { fetchJsonWithRetry } from '../../../shared/utils/http';
import { clearTodayCache, readTodayCache, writeTodayCache } from '../../../shared/utils/todayCache';
import { buildVietnamEconomicCalendar } from '../../../shared/utils/vietnamCalendar';
import { fmtDateTime } from '../../../i18n';
import { LazySection } from '../../common/LazySection';
import { DataStatusBadge } from '../../common/DataStatusBadge';
import { Card } from '../../ui/Card';
import { EmptyState } from '../../ui/EmptyState';
import { SectionHeader } from '../../ui/SectionHeader';
import { Skeleton } from '../../ui/Skeleton';
import { FundamentalNewsFeed } from './FundamentalNewsFeed';
import { TodayWeekCard } from '../program/TodayWeekCard';

const FLAT = 0.002; // |change| below 0.2% counts as "flat"

function pctText(v: number): string {
  const s = (v * 100).toFixed(2);
  return `${v > 0 ? '+' : ''}${s}%`;
}

/** Trend direction from the scorecard's trend dimension: 1 up, -1 down, 0 sideways/unknown. */
function trendDir(c: Scorecard): -1 | 0 | 1 {
  const d = c.dimensions.find((x) => x.id === 'trend');
  const lvl = String((d as { level?: string } | undefined)?.level ?? '');
  if (lvl.includes('UP')) return 1;
  if (lvl.includes('DOWN')) return -1;
  return 0;
}

/** "Hôm nay nên chú ý gì": visual, neutral pointers built only from existing endpoints. */
export function TodayPanel() {
  const { t, lang } = useI18n();
  const { openInstrumentIn, health, lastHealthUpdatedAt, setActiveModule } = useTerminal();
  // Returning users: render the last snapshot (<= 30 min) immediately; the fetch below refreshes it.
  const [cached] = useState(readTodayCache);
  const [score, setScore] = useState<ScorecardListResponse | null>(cached?.scorecard ?? null);
  const [cycle, setCycle] = useState<CycleMarketOverview | null>(cached?.cycle ?? null);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    const ctrl = new AbortController();
    void fetchJsonWithRetry<TodayResponse>('/api/today', { signal: ctrl.signal })
      .then((r) => {
        if (ctrl.signal.aborted) return;
        setScore(r.scorecard);
        setCycle(r.cycle);
        writeTodayCache(r);
      })
      .catch(() => {
        if (ctrl.signal.aborted) return;
        // Refresh failed: do not keep showing a cached snapshot as if it were current.
        clearTodayCache();
        setScore(null);
        setCycle(null);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, []);

  const view = useMemo(() => {
    const cards = score?.scorecards ?? [];
    const nameOf = (c: Scorecard) => (lang === 'vi' && c.vietnameseName) || c.productName;
    const nameBySym = new Map(cards.map((c) => [c.exchangeSymbol, nameOf(c)]));

    const priced = cards.filter((c) => c.price.changePct !== null);
    const up = priced.filter((c) => (c.price.changePct ?? 0) > FLAT).length;
    const down = priced.filter((c) => (c.price.changePct ?? 0) < -FLAT).length;
    const flat = priced.length - up - down;

    const moves = [...priced]
      .sort((a, b) => Math.abs(b.price.changePct ?? 0) - Math.abs(a.price.changePct ?? 0))
      .slice(0, 8)
      .map((c) => ({ sym: c.exchangeSymbol, name: nameOf(c), pct: c.price.changePct ?? 0 }));
    const maxAbs = Math.max(0.005, ...moves.map((m) => Math.abs(m.pct)));

    const trends = cards
      .filter((c) => c.overall.trendClarity.score !== null)
      .sort((a, b) => (b.overall.trendClarity.score ?? 0) - (a.overall.trendClarity.score ?? 0))
      .slice(0, 6)
      .map((c) => ({
        sym: c.exchangeSymbol,
        name: nameOf(c),
        clarity: c.overall.trendClarity.score ?? 0,
        dir: trendDir(c),
        dirLabel: (c.dimensions.find((x) => x.id === 'trend') as { label?: { vi: string; en: string } } | undefined)?.label?.[lang] ?? '',
        volHigh: c.overall.volatilityRisk.level === 'HIGH',
      }));

    const phases: { sym: string; name: string; phase: 2 | 4 }[] = [];
    const seen = new Set<string>();
    for (const c of cycle?.commodities ?? []) {
      const sym = c.instrument.exchangeSymbol;
      if (seen.has(sym)) continue;
      const phase = c.cyclePhase === 'PHASE_2_EARLY_RECOVERY' ? 2 : c.cyclePhase === 'PHASE_4_DISTRIBUTION' ? 4 : null;
      if (!phase) continue;
      seen.add(sym);
      phases.push({ sym, name: nameBySym.get(sym) ?? c.instrument.productName, phase });
    }

    const now = new Date();
    const today0 = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const events = buildVietnamEconomicCalendar(now, 7)
      .filter((e) => e.type === 'MACRO_RELEASE')
      .sort((a, b) => a.ictIsoTimestamp.localeCompare(b.ictIsoTimestamp))
      .slice(0, 6)
      .map((e) => ({
        id: e.id,
        sym: e.relatedSymbols[0] ?? null,
        day: e.dateIso.slice(8, 10),
        month: e.dateIso.slice(5, 7),
        time: e.ictTimeLabel,
        title: lang === 'vi' ? e.titleVi : e.titleEn,
        inDays: Math.max(0, Math.round((Date.parse(`${e.dateIso}T00:00:00Z`) - today0) / 86_400_000)),
      }));

    const quality = new Map<string, { sym: string; text: string }>();
    for (const c of cards) {
      const bad = c.price.status === 'STALE' ? 'n2.td.stale' : c.price.status === 'UNAVAILABLE' || c.price.value === null ? 'n2.td.noPrice' : null;
      if (bad) quality.set(c.exchangeSymbol, { sym: c.exchangeSymbol, text: t(bad, { name: nameOf(c) }) });
    }

    return { up, down, flat, total: priced.length, moves, maxAbs, trends, phases: phases.slice(0, 6), events, quality: [...quality.values()] };
  }, [score, cycle, lang, t]);

  const open = (sym: string | null) => sym && openInstrumentIn(sym, 'instrument');

  let body: ReactNode;
  if (loading) {
    body = (
      <div className="space-y-3" role="status" aria-busy="true" aria-label={t('n2.td.loading')}>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  } else if (view.total === 0 && view.events.length === 0) {
    body = <EmptyState icon={<Sparkles className="w-5 h-5" aria-hidden="true" />} title={t('n2.td.empty')} />;
  } else {
    const top = view.moves[0];
    const next = view.events[0];
    body = (
      <div className="space-y-4">
        {/* KPI strip */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Kpi icon={<ArrowUpRight className="w-5 h-5" />} tone="up" label={t('n2.td.kpi.up')} value={String(view.up)} sub={t('n2.td.kpi.of', { n: view.total })} />
          <Kpi icon={<ArrowDownRight className="w-5 h-5" />} tone="down" label={t('n2.td.kpi.down')} value={String(view.down)} sub={t('n2.td.kpi.flat', { n: view.flat })} />
          <Kpi
            icon={<Zap className="w-5 h-5" />}
            tone={top && top.pct >= 0 ? 'up' : 'down'}
            label={t('n2.td.kpi.top')}
            value={top ? pctText(top.pct) : '—'}
            sub={top?.name ?? ''}
            onClick={top ? () => open(top.sym) : undefined}
          />
          <Kpi
            icon={<CalendarClock className="w-5 h-5" />}
            tone="info"
            label={t('n2.td.kpi.next')}
            value={next ? (next.inDays === 0 ? t('n2.td.kpi.today') : t('n2.td.kpi.inDays', { n: next.inDays })) : '—'}
            sub={next ? `${next.day}/${next.month} · ${next.time}` : ''}
          />
        </div>

        {/* Market breadth bar */}
        {view.total > 0 && (
          <Card>
            <div className="flex items-center justify-between text-xs text-[var(--muted)] mb-2">
              <span>{t('n2.td.breadth')}</span>
              <span>
                <span className="text-[var(--positive)]">{view.up}↑</span> · <span>{view.flat}→</span> · <span className="text-[var(--negative)]">{view.down}↓</span>
              </span>
            </div>
            <div className="flex h-2 w-full gap-0.5" role="img" aria-label={`${t('n2.td.breadth')}: ${view.up} ↑ · ${view.flat} → · ${view.down} ↓`}>
              <div className="rounded-[4px] bg-[var(--positive)] hover:brightness-110" title={`${view.up} ↑`} style={{ width: `${(view.up / view.total) * 100}%` }} />
              <div className="rounded-[4px] bg-[var(--div-mid)]" title={`${view.flat} →`} style={{ width: `${(view.flat / view.total) * 100}%` }} />
              <div className="rounded-[4px] bg-[var(--negative)] hover:brightness-110" title={`${view.down} ↓`} style={{ width: `${(view.down / view.total) * 100}%` }} />
            </div>
          </Card>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Biggest moves: diverging bars */}
          {view.moves.length > 0 && (
            <Card as="section" aria-label={t('n2.td.sec.moves')}>
              <CardTitle title={t('n2.td.sec.moves')} hint={t('n2.td.movesHint')} />
              <ul className="space-y-1.5">
                {view.moves.map((m) => {
                  const w = (Math.abs(m.pct) / view.maxAbs) * 50;
                  const isUp = m.pct >= 0;
                  return (
                    <li key={m.sym}>
                      <button
                        type="button"
                        onClick={() => open(m.sym)}
                        title={t('n2.td.open')}
                        className="w-full grid grid-cols-[7.5rem_1fr_4.5rem] items-center gap-2 rounded-md px-1.5 py-1 hover:bg-[var(--surface-2)] text-left"
                      >
                        <span className="truncate text-sm text-[var(--text)]">{m.name}</span>
                        <span className="relative h-4">
                          <span className="absolute left-1/2 top-0 bottom-0 w-px bg-[var(--chart-axis)]" />
                          <span
                            className={`absolute top-1 bottom-1 max-w-[50%] ${isUp ? 'rounded-r-[4px]' : 'rounded-l-[4px]'} ${isUp ? 'bg-[var(--positive)]' : 'bg-[var(--negative)]'}`}
                            style={isUp ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }}
                          />
                        </span>
                        <span className="text-right text-sm font-semibold tabular-nums text-[var(--text-strong)]">{pctText(m.pct)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          {/* Reports timeline */}
          {view.events.length > 0 && (
            <Card as="section" aria-label={t('n2.td.sec.reports')}>
              <CardTitle title={t('n2.td.sec.reports')} hint={t('n2.td.reportsHint')} />
              <ol className="space-y-2">
                {view.events.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      disabled={!e.sym}
                      onClick={() => open(e.sym)}
                      className="w-full flex items-center gap-3 rounded-lg px-1.5 py-1.5 text-left hover:bg-[var(--surface-2)] disabled:hover:bg-transparent"
                    >
                      <span className={`flex w-12 shrink-0 flex-col items-center rounded-lg border py-1 ${e.inDays <= 1 ? 'border-[var(--warning)] text-[var(--warning)]' : 'border-[var(--border)] text-[var(--text-strong)]'}`}>
                        <span className="text-lg font-bold leading-none">{e.day}</span>
                        <span className="text-[10px]">{t('n2.td.month', { m: e.month })}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-[var(--text)] leading-snug">{e.title}</span>
                        <span className="text-xs text-[var(--muted)]">
                          {e.time} · {e.inDays === 0 ? t('n2.td.kpi.today') : t('n2.td.kpi.inDays', { n: e.inDays })}
                        </span>
                      </span>
                      {e.sym && <ChevronRight className="w-4 h-4 shrink-0 text-[var(--faint)]" aria-hidden="true" />}
                    </button>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>

        {/* Trend clarity cards */}
        {view.trends.length > 0 && (
          <LazySection minHeight={220}>
          <section aria-label={t('n2.td.sec.trend')}>
            <CardTitle title={t('n2.td.sec.trend')} hint={t('n2.td.trendHint')} />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {view.trends.map((x) => (
                <button
                  key={x.sym}
                  type="button"
                  onClick={() => open(x.sym)}
                  className="text-left rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 hover:border-[var(--accent)] transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[var(--text-strong)] truncate">{x.name}</span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                        x.dir > 0 ? 'bg-[var(--positive)]/15 text-[var(--positive)]' : x.dir < 0 ? 'bg-[var(--negative)]/15 text-[var(--negative)]' : 'bg-[var(--surface-2)] text-[var(--muted)]'
                      }`}
                    >
                      {x.dir > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : x.dir < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                      {x.dirLabel || '—'}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-[var(--muted)]">
                    <span>{t('n2.td.clarity')}</span>
                    <span className="font-semibold text-[var(--text)] tabular-nums">{x.clarity}/100</span>
                  </div>
                  <div className="mt-1 h-2 w-full rounded-full bg-[var(--surface-2)]">
                    <div
                      className={`h-full rounded-r-[4px] ${x.clarity >= 70 ? 'bg-[var(--seq-5)]' : x.clarity >= 40 ? 'bg-[var(--seq-3)]' : 'bg-[var(--seq-1)]'}`}
                      style={{ width: `${Math.min(100, Math.max(0, x.clarity))}%` }}
                    />
                  </div>
                  {x.volHigh && (
                    <span className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--warning)]">
                      <AlertTriangle className="w-3.5 h-3.5" /> {t('n2.td.volHighShort')}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>
          </LazySection>
        )}

        {/* Cycle phases */}
        {view.phases.length > 0 && (
          <LazySection minHeight={120}>
          <Card as="section" aria-label={t('n2.td.sec.cycle')}>
            <CardTitle title={t('n2.td.sec.cycle')} hint={t('n2.td.cycleHint')} />
            <div className="flex flex-wrap gap-2">
              {view.phases.map((p) => (
                <button
                  key={p.sym}
                  type="button"
                  onClick={() => open(p.sym)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm hover:bg-[var(--surface-2)] ${
                    p.phase === 2 ? 'border-[var(--positive)]/50' : 'border-[var(--warning)]/50'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${p.phase === 2 ? 'bg-[var(--positive)]' : 'bg-[var(--warning)]'}`} />
                  <span className="text-[var(--text)]">{p.name}</span>
                  <span className="text-xs text-[var(--muted)]">{t(p.phase === 2 ? 'n2.td.phase2Short' : 'n2.td.phase4Short')}</span>
                </button>
              ))}
            </div>
          </Card>
          </LazySection>
        )}

        {/* Data quality (collapsed) */}
        {view.quality.length > 0 && (
          <details className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm">
            <summary className="cursor-pointer text-[var(--muted)]">
              <AlertTriangle className="inline w-4 h-4 mr-1 text-[var(--warning)]" aria-hidden="true" />
              {t('n2.td.qualityCount', { n: view.quality.length })}
            </summary>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {view.quality.map((q) => (
                <li key={q.sym}>
                  <button type="button" onClick={() => open(q.sym)} className="text-left text-[var(--text)] hover:underline">
                    {q.text}
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    );
  }

  const overallDataStatus = health?.capabilities.marketDataOverallStatus ?? 'UNAVAILABLE';
  const healthCheckedLabel = lastHealthUpdatedAt ? fmtDateTime(lastHealthUpdatedAt) : '—';
  const healthLabel = t('n2.td.healthAction', {
    connected: health?.capabilities.marketDataProvidersConnected ?? 0,
    total: health?.capabilities.marketDataProvidersTotal ?? 0,
    time: healthCheckedLabel,
  });

  return (
    <div className="space-y-4">
      <SectionHeader
        title={t('n2.td.title')}
        actions={
          <button
            type="button"
            data-testid="dashboard-data-health-status"
            data-health-status={overallDataStatus}
            onClick={() => setActiveModule('data-health')}
            title={healthLabel}
            className="inline-flex items-center rounded-full hover:opacity-85 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <DataStatusBadge status={overallDataStatus} />
            <span className="sr-only">{healthLabel}</span>
          </button>
        }
      />
      <TodayWeekCard />
      {body}
      <FundamentalNewsFeed />
    </div>
  );
}

function CardTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-base font-semibold text-[var(--text-strong)]">{title}</h3>
      {hint && <p className="text-xs text-[var(--muted)] mt-0.5">{hint}</p>}
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
  tone,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone: 'up' | 'down' | 'info';
  onClick?: () => void;
}) {
  const color = tone === 'up' ? 'text-[var(--positive)] bg-[var(--positive)]/12' : tone === 'down' ? 'text-[var(--negative)] bg-[var(--negative)]/12' : 'text-[var(--accent-text)] bg-[var(--accent-text)]/12';
  const inner = (
    <>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${color}`} aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-xs text-[var(--muted)]">{label}</span>
        <span className="block text-xl font-bold text-[var(--text-strong)] tabular-nums leading-tight">{value}</span>
        {sub && <span className="block truncate text-xs text-[var(--muted)]">{sub}</span>}
      </span>
    </>
  );
  const cls = 'flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left';
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} hover:border-[var(--accent)]`}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
