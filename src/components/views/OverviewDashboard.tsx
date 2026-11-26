import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ArrowUpRight, Compass, Database, FileText, Lightbulb, Radar, RefreshCw, SearchX, Upload } from 'lucide-react';
import { SectionHeader } from '../ui/SectionHeader';
import { UpdatedAgo } from '../common/UpdatedAgo';
import { SkeletonCards } from '../ui/Skeleton';
import { EmptyState } from '../ui/EmptyState';
import { useTerminal } from '../../contexts/TerminalContext';
import { getCommodityVisual } from '../../shared/data/commodityVisuals';
import type { InstrumentDefinition, ProductCategory } from '../../shared/types/instrument';
import type { MarketQuote } from '../../shared/types/market';
import type { CycleMarketOverview, PerformanceHorizonReturns } from '../../shared/types/cycle';
import { formatTimestampInZone } from '../../shared/utils/time';
import { CommodityHeroImage } from '../common/CommodityHeroImage';
import { CyclePhaseBadge, getBottomScoreAccent } from '../common/CyclePhaseBadge';
import { DataStatusBadge } from '../common/DataStatusBadge';
import { Term } from '../common/Term';
import { fmtClock, fmtPrice, friendlyQuoteReason, hasPrice, plainUnit } from '../common/quoteFormat';
import { fmtFixed, fmtNum, hasKey, useT } from '../../i18n';
import { fetchJsonWithRetry } from '../../shared/utils/http';
import { sortCommoditiesByPotential } from '../../shared/utils/commoditySort';

interface OverviewTechSummary {
  status: string;
  mainTrend: string;
  marketRegime: string;
  atr14: number | null;
  rsi14: number | null;
}

type HeatmapHorizon = 'w1' | 'm1' | 'm3' | 'm6' | 'y1';
const HEATMAP_HORIZONS: HeatmapHorizon[] = ['w1', 'm1', 'm3', 'm6', 'y1'];

const CATEGORY_ORDER: ProductCategory[] = ['AGRICULTURE', 'SOFT_COMMODITIES', 'METALS', 'ENERGY'];

function getHeatmapTone(val: number | null): string {
  if (val === null) return 'bg-[var(--bg)] border-[var(--border)] text-[var(--text)]/45';
  if (val >= 5) return 'bg-[var(--positive)]/20 border-[var(--positive)]/40 text-[var(--positive)]';
  if (val > 0) return 'bg-[var(--positive)]/10 border-[var(--positive)]/25 text-[var(--positive)]';
  if (val <= -5) return 'bg-[var(--negative)]/20 border-[var(--negative)]/40 text-[var(--negative)]';
  if (val < 0) return 'bg-[var(--negative)]/10 border-[var(--negative)]/25 text-[var(--negative)]';
  return 'bg-[var(--bg)] border-[var(--border)] text-[var(--text)]/75';
}

function fmtPct(val: number): string {
  return `${val > 0 ? '+' : ''}${fmtFixed(val, 2)}%`;
}

function PriceCard({ inst, quote, onOpen }: { inst: InstrumentDefinition; quote: MarketQuote | undefined; onOpen: () => void }) {
  const t = useT();
  const name = getCommodityVisual(inst.id)?.nameVi ?? inst.commodityProfile?.vietnameseName ?? inst.productName;
  const priced = hasPrice(quote);
  const clock = priced ? fmtClock(quote.timestamp) : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t('fr.ov.openChart', { name })}
      className="text-left bg-[var(--surface)] hover:bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--accent)]/50 shadow-[var(--shadow-card)] hover:-translate-y-px rounded-[var(--radius-md)] p-4 flex flex-col gap-3 transition min-w-0"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[var(--text-strong)] leading-snug">{name}</p>
        <p className="text-[11px] text-[var(--faint)] mt-0.5 font-mono">
          {inst.exchange} · {inst.exchangeSymbol}
        </p>
      </div>
      {/* Price change (▲▼ green/red) is intentionally not shown: MarketQuote carries no real change data yet. */}
      {priced ? (
        <div>
          <p className="text-[28px] font-semibold text-[var(--text-strong)] tabular-nums leading-none tracking-tight">{fmtPrice(quote.price)}</p>
          <p className="text-xs text-[var(--muted)] mt-1.5">{plainUnit(t, quote)}</p>
        </div>
      ) : (
        <div>
          <p className="text-[28px] font-semibold text-[var(--faint)] leading-none">—</p>
          <p className="text-xs text-[var(--muted)] mt-1.5" title={quote?.statusReason}>
            {friendlyQuoteReason(t, quote) ?? t('fr.ov.noPrice')}
          </p>
        </div>
      )}
      <div className="mt-auto pt-3 border-t border-[var(--border)]/70 flex flex-col gap-1">
        <DataStatusBadge
          status={quote?.status ?? 'UNAVAILABLE'}
          compact
          sourceQuality={quote?.sourceQuality}
          delayMinutes={quote?.delayMinutes}
          kind={quote?.kind}
        />
        {priced && quote.kind === 'BENCHMARK' && (
          <p className="text-[11px] text-[var(--faint)]" title={quote.statusReason}>
            {friendlyQuoteReason(t, quote)}
          </p>
        )}
        {priced && quote.kind !== 'BENCHMARK' && (
          <p className="text-[11px] text-[var(--faint)]">{clock ? t('fr.updatedAt', { time: clock }) : t('fr.noTime')}</p>
        )}
      </div>
    </button>
  );
}

export function OverviewDashboard() {
  const {
    instruments,
    quotesBySymbol,
    providers,
    datasets,
    marketScope,
    timeframe,
    selectedSymbol,
    health,
    searchQuery,
    setActiveModule,
    openInstrumentIn,
    syncProviderFeeds,
    lastSyncSummary,
    syncing,
    loading,
    loadError,
  } = useTerminal();

  const t = useT();
  const [techSummary, setTechSummary] = useState<OverviewTechSummary | null>(null);
  const [cycleOverview, setCycleOverview] = useState<CycleMarketOverview | null>(null);
  const [heatmapHorizon, setHeatmapHorizon] = useState<HeatmapHorizon>('m1');
  const [macroCount, setMacroCount] = useState(0);
  const [newsCount, setNewsCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    async function loadSecondary() {
      try {
        const [tj, fj, cj] = await Promise.all([
          fetchJsonWithRetry<{ snapshot?: { status?: string; marketStructure?: { mainTrend?: string; marketRegime?: string }; atr14?: number | null; rsi14?: number | null } }>(
            `/api/technical/${encodeURIComponent(selectedSymbol)}?timeframe=${timeframe}`,
            { signal: controller.signal }
          ).catch(() => null),
          fetchJsonWithRetry<{ records?: unknown[]; news?: unknown[] }>('/api/fundamental/records', {
            signal: controller.signal,
          }).catch(() => null),
          fetchJsonWithRetry<CycleMarketOverview>('/api/cycle/overview', {
            signal: controller.signal,
          }).catch(() => null),
        ]);
        if (cancelled) return;
        if (tj) {
          const snap = tj.snapshot;
          setTechSummary({
            status: snap?.status ?? 'UNAVAILABLE',
            mainTrend: snap?.marketStructure?.mainTrend ?? 'UNCERTAIN',
            marketRegime: snap?.marketStructure?.marketRegime ?? 'INSUFFICIENT_DATA',
            atr14: snap?.atr14 ?? null,
            rsi14: snap?.rsi14 ?? null,
          });
        }
        if (fj) {
          setMacroCount(Array.isArray(fj.records) ? fj.records.length : 0);
          setNewsCount(Array.isArray(fj.news) ? fj.news.length : 0);
        }
        if (cj) {
          setCycleOverview(cj);
        }
      } catch {
        // Ignore transient background fetch error on overview summary
      }
    }
    void loadSecondary();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedSymbol, timeframe, datasets.length, Object.keys(quotesBySymbol).filter((k) => quotesBySymbol[k]?.price !== null).length]);

  const filteredInstruments = useMemo(
    () =>
      instruments.filter((inst) => {
        if (marketScope === 'MXV' && !inst.isMvxListed) return false;
        if (marketScope === 'INTERNATIONAL' && inst.exchange === 'MXV') return false;
        if (searchQuery.trim()) {
          const q = searchQuery.trim().toLowerCase();
          return (
            inst.productName.toLowerCase().includes(q) ||
            (inst.commodityProfile?.vietnameseName.toLowerCase().includes(q) ?? false) ||
            inst.exchangeSymbol.toLowerCase().includes(q) ||
            (inst.mxvMapping?.mxvSymbol?.toLowerCase().includes(q) ?? false)
          );
        }
        return true;
      }),
    [instruments, marketScope, searchQuery]
  );

  const sortedCycleCommodities = useMemo(
    () => sortCommoditiesByPotential(cycleOverview?.commodities ?? []),
    [cycleOverview]
  );

  const potentialRankById = useMemo(() => {
    const map = new Map<string, number>();
    sortedCycleCommodities.forEach((item, index) => {
      map.set(item.instrument.id, index);
    });
    return map;
  }, [sortedCycleCommodities]);

  const groups = useMemo(
    () =>
      CATEGORY_ORDER.map((cat) => {
        const items = filteredInstruments
          .filter((i) => i.category === cat)
          .sort((a, b) => {
            const ra = potentialRankById.get(a.id);
            const rb = potentialRankById.get(b.id);
            if (ra !== undefined && rb !== undefined && ra !== rb) return ra - rb;
            const pa = hasPrice(quotesBySymbol[a.exchangeSymbol]);
            const pb = hasPrice(quotesBySymbol[b.exchangeSymbol]);
            if (pa !== pb) return pa ? -1 : 1;
            if (a.isMvxListed !== b.isMvxListed) return a.isMvxListed ? -1 : 1;
            return a.exchangeSymbol.localeCompare(b.exchangeSymbol);
          });
        return { cat, items };
      }).filter((g) => g.items.length > 0),
    [filteredInstruments, potentialRankById, quotesBySymbol]
  );

  const activeInstrument =
    instruments.find((i) => i.exchangeSymbol === selectedSymbol) ?? filteredInstruments[0] ?? null;
  const activeName = activeInstrument?.commodityProfile?.vietnameseName ?? selectedSymbol;

  const pricedCount = filteredInstruments.filter((i) => hasPrice(quotesBySymbol[i.exchangeSymbol])).length;
  const anyPriceAtAll = Object.values(quotesBySymbol).some((q) => hasPrice(q));
  const connectedProviderCount = providers.filter((p) => p.connectionState === 'CONNECTED').length;
  const overallStatus = health?.capabilities.marketDataOverallStatus ?? 'UNAVAILABLE';
  const worldCount = cycleOverview?.commodities.length ?? instruments.length;

  const spotlightCommodities = useMemo(
    () => sortedCycleCommodities.slice(0, 6),
    [sortedCycleCommodities]
  );

  const breadth = cycleOverview?.marketBreadth;

  const label = (prefix: string, v: string) => {
    const k = `${prefix}${v}`;
    return hasKey(k) ? t(k) : v;
  };

  const linkBtn = 'text-xs font-medium text-[var(--accent-text)] hover:text-[var(--accent-text)] hover:underline whitespace-nowrap';
  const card = 'bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-[var(--shadow-card)] p-4';
  const statCard = `${card} space-y-1 min-w-0`;

  return (
    <div className="space-y-6">
      {/* Friendly header (owner's slogan kept as kicker) */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-[var(--accent-text)]">{t('fr.ov2.kicker')}</p>
          <h2 className="text-2xl sm:text-3xl font-semibold text-[var(--text-strong)] tracking-tight mt-0.5 text-balance">
            {t('fr.ov.hello')}
          </h2>
          <p className="text-sm text-[var(--text)]/65 mt-1">{t('fr.ov.sub')}</p>
          <p className="text-xs text-[var(--text)]/45 mt-1">
            {t('fr.ov2.context', {
              name: activeName,
              symbol: selectedSymbol,
              tf: timeframe,
              scope: t(`topbar.scope.${marketScope}`),
            })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <DataStatusBadge status={overallStatus} />
          <button
            type="button"
            onClick={() => setActiveModule('commodity-world')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border)] rounded-md text-xs font-medium text-[var(--text-strong)] whitespace-nowrap"
          >
            <Compass className="w-3.5 h-3.5 text-[var(--accent-text)]" aria-hidden="true" />
            <span>{t('fr.ov2.world', { n: worldCount })}</span>
          </button>
          <button
            type="button"
            onClick={() => void syncProviderFeeds({ timeframe })}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent)]/90 rounded-md text-xs font-medium text-white disabled:opacity-50 whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>{syncing ? t('fr.ov.refreshing') : t('fr.ov.refresh')}</span>
          </button>
        </div>
      </div>

      {loadError && (
        <div className="bg-[var(--surface)] border border-[var(--negative)]/40 rounded-xl p-4 text-sm text-[var(--negative)] space-y-1">
          <p>{t('fr.ov.loadError')}</p>
          <details className="text-xs text-[var(--text)]/50">
            <summary className="cursor-pointer">{t('fr.ov.loadErrorDetail')}</summary>
            <p className="mt-1 break-words">{loadError}</p>
          </details>
        </div>
      )}

      {lastSyncSummary && (
        <section className="bg-[var(--surface)] border border-[var(--accent)]/40 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
          <div className="space-y-1 min-w-0">
            <p className="font-semibold text-[var(--text-strong)]">
              {t('fr.ov2.syncTitle', {
                candles: lastSyncSummary.totalCandlesDatasetsAdded,
                macro: lastSyncSummary.totalMacroAdded,
              })}
            </p>
            <p className="text-[var(--text)]/70 break-words">
              {lastSyncSummary.totalCandlesDatasetsAdded === 0 && lastSyncSummary.totalMacroAdded === 0
                ? t('fr.ov2.syncNone')
                : lastSyncSummary.outcomes
                    .filter((o) => o.status === 'CONNECTED')
                    .map((o) => `${o.providerId}: ${o.message}`)
                    .join(' · ') || t('fr.ov2.syncDone')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setActiveModule('data-health')}
              className="px-3 py-1.5 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border)] rounded text-xs font-medium text-[var(--text-strong)] whitespace-nowrap"
            >
              {t('fr.ov2.syncHealth')}
            </button>
            <button
              type="button"
              onClick={() => setActiveModule('data-import')}
              className="px-3 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent)]/90 rounded text-xs font-medium text-white whitespace-nowrap"
            >
              {t('fr.ov2.syncImport')}
            </button>
          </div>
        </section>
      )}

      {/* Compact status line (provider details live in Data Health) */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--text)]/70">
        {!loading && <span>{t('fr.ov.pricesCount', { n: pricedCount, total: filteredInstruments.length })}</span>}
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <Database className="w-3.5 h-3.5 text-[var(--text)]/45" aria-hidden="true" />
          {t('fr.ov.sources', { n: connectedProviderCount, total: providers.length })}
          <button
            type="button"
            onClick={() => setActiveModule('data-health')}
            className={`${linkBtn} inline-flex items-center gap-1`}
          >
            {t('fr.ov.sourcesLink')}
            <ArrowRight className="w-3 h-3" aria-hidden="true" />
          </button>
        </span>
        <button type="button" onClick={() => setActiveModule('markets')} className={`${linkBtn} sm:ml-auto`}>
          {t('fr.ov.allMarkets')} →
        </button>
      </div>

      {/* Gentle empty state or active warm-up notice when no prices have landed yet */}
      {!loading && !anyPriceAtAll && (
        providers.some((p) => p.providerId === 'YAHOO_UNOFFICIAL' && p.connectionState === 'CONNECTED') ? (
          <section className={`${card} border-[var(--accent)]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-[var(--text-strong)] inline-flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-[var(--accent-text)] animate-spin" aria-hidden="true" />
                <span>Đang đồng bộ giá hàng hóa thực tế (Yahoo Finance 15m delayed)...</span>
              </h2>
              <p className="text-xs text-[var(--text)]/65">
                Hệ thống đang nạp 15 hàng hóa hỗ trợ theo tốc độ an toàn (~15 giây sau khi khởi động). Bạn cũng có thể bấm &quot;Cập nhật giá&quot; bất kỳ lúc nào.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveModule('data-health')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border)] rounded-md text-xs font-medium text-[var(--text)] whitespace-nowrap self-start sm:self-auto"
            >
              <Database className="w-3.5 h-3.5" aria-hidden="true" />
              {t('fr.ov.empty.health')}
            </button>
          </section>
        ) : (
          <section className={`${card} border-[var(--accent)]/40 space-y-3`}>
            <h2 className="text-base font-semibold text-[var(--text-strong)]">{t('fr.ov.empty.title')}</h2>
            <p className="text-sm text-[var(--text)]/75 leading-relaxed">{t('fr.ov.empty.body')}</p>
            <ol className="list-decimal pl-5 space-y-1 text-sm text-[var(--text)]/75">
              <li>{t('fr.ov.empty.step1')}</li>
              <li>{t('fr.ov.empty.step2')}</li>
            </ol>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => setActiveModule('data-import')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent)]/90 rounded-md text-xs font-medium text-white"
              >
                <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                {t('fr.ov.empty.import')}
              </button>
              <button
                type="button"
                onClick={() => setActiveModule('data-health')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border)] rounded-md text-xs font-medium text-[var(--text)]"
              >
                <Database className="w-3.5 h-3.5" aria-hidden="true" />
                {t('fr.ov.empty.health')}
              </button>
            </div>
          </section>
        )
      )}

      {/* A. Market breadth by cycle */}
      <section aria-label={t('fr.ov2.breadthAria')} className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        <div className={statCard}>
          <p className="text-xs text-[var(--text)]/60">{t('fr.ov2.upDown')}</p>
          <p className="text-xl font-semibold text-[var(--text-strong)] tabular-nums">
            {breadth ? (
              <>
                <span className="text-[var(--positive)]">▲ {breadth.risingCount}</span>{' '}
                <span className="text-[var(--text)]/40">/</span>{' '}
                <span className="text-[var(--negative)]">▼ {breadth.fallingCount}</span>
              </>
            ) : (
              '—'
            )}
          </p>
          <p className="text-[11px] text-[var(--text)]/50">
            {breadth ? t('fr.ov2.withPrice', { n: breadth.withPriceData, total: breadth.totalTracked }) : '—'}
          </p>
        </div>
        <div className={statCard}>
          <p className="text-xs text-[var(--text)]/60">{t('fr.ov2.accum')}</p>
          <p className="text-xl font-semibold text-[var(--accent-text)] tabular-nums">{breadth ? breadth.accumulationCount : '—'}</p>
          <p className="text-[11px] text-[var(--text)]/50">
            <Term k="cyclePhase">{t('fr.ov2.phase1')}</Term>
          </p>
        </div>
        <div className={statCard}>
          <p className="text-xs text-[var(--text)]/60">
            <Term k="bottomScore">{t('fr.ov2.bottomCand')}</Term>
          </p>
          <p className="text-xl font-semibold text-[var(--positive)] tabular-nums">{breadth ? breadth.bottomCandidateCount : '—'}</p>
          <button type="button" onClick={() => setActiveModule('cycle-hunter')} className="text-[11px] text-[var(--accent-text)] hover:underline text-left">
            {t('fr.ov2.openCycle')}
          </button>
        </div>
        <div className={statCard}>
          <p className="text-xs text-[var(--text)]/60">{t('fr.ov2.markup')}</p>
          <p className="text-xl font-semibold text-[var(--accent-text)] tabular-nums">{breadth ? breadth.markupCount : '—'}</p>
          <p className="text-[11px] text-[var(--text)]/50">{t('fr.ov2.phase3')}</p>
        </div>
        <div className={`${statCard} col-span-2 sm:col-span-1`}>
          <p className="text-xs text-[var(--text)]/60">{t('fr.ov2.distrib')}</p>
          <p className="text-xl font-semibold text-[var(--warning)] tabular-nums">{breadth ? breadth.distributionCount : '—'}</p>
          <p className="text-[11px] text-[var(--text)]/50">
            {breadth ? t('fr.ov2.missingHist', { n: breadth.unavailableCount }) : '—'}
          </p>
        </div>
      </section>

      {/* Commodity spotlight with images */}
      <section aria-label={t('fr.ov2.spotTitle')} className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[var(--text-strong)]">{t('fr.ov2.spotTitle')}</h2>
            <p className="text-xs text-[var(--text)]/55">{t('fr.ov2.spotSub')}</p>
          </div>
          <button
            type="button"
            onClick={() => setActiveModule('commodity-world')}
            className={`${linkBtn} inline-flex items-center gap-1 self-start sm:self-auto`}
          >
            <span>{t('fr.ov2.spotAll', { n: worldCount })}</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {spotlightCommodities.map((item) => {
            const visual = getCommodityVisual(item.instrument.id);
            const nameVi = visual?.nameVi ?? item.instrument.commodityProfile?.vietnameseName ?? item.instrument.productName;
            const priced = hasPrice(item.quote);
            return (
              <button
                key={item.instrument.id}
                type="button"
                onClick={() => openInstrumentIn(item.instrument.exchangeSymbol, 'commodity-profile')}
                className="group text-left bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)]/70 rounded-xl overflow-hidden transition-all duration-200 focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              >
                <div className="relative aspect-video w-full overflow-hidden">
                  <CommodityHeroImage
                    symbol={item.instrument.id}
                    name={nameVi}
                    category={item.instrument.category}
                    className="w-full h-full"
                    imgClassName="transition-transform duration-300 group-hover:scale-[1.04]"
                  />
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)]/60 to-[var(--bg)]/50"
                  />
                  <div className="absolute top-2.5 left-2.5 right-2.5 flex items-start justify-between gap-2">
                    <span className="text-[11px] text-[var(--text-strong)]/95 bg-[var(--bg)]/85 backdrop-blur-sm px-2 py-0.5 rounded border border-white/15 whitespace-nowrap">
                      {item.instrument.exchangeSymbol}
                      {item.instrument.mxvMapping?.mxvSymbol ? ` · MXV ${item.instrument.mxvMapping.mxvSymbol}` : ''}
                    </span>
                    <span className="inline-flex items-center bg-[var(--bg)]/85 backdrop-blur-sm px-2 py-0.5 rounded border border-white/15 shadow-sm">
                      <DataStatusBadge
                        status={item.quote.status}
                        compact
                        sourceQuality={item.quote.sourceQuality}
                        delayMinutes={item.quote.delayMinutes}
                        kind={item.quote.kind}
                      />
                    </span>
                  </div>
                  <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-end justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] text-[var(--text)]/75 truncate">
                        {visual?.groupVi ?? t(`dash.cat.${item.instrument.category}`)}
                      </p>
                      <h3 className="text-base font-semibold text-[var(--text-strong)] truncate">{nameVi}</h3>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-base font-semibold text-[var(--text-strong)] tabular-nums">
                        {priced ? fmtPrice(item.quote.price as number) : t('fr.ov.noPrice')}
                      </p>
                      <p className="text-[10px] text-[var(--text)]/65">
                        {item.bottomScore !== null ? t('fr.ov2.bottomScore', { n: item.bottomScore }) : t('fr.ov2.notScored')}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
                  <CyclePhaseBadge phase={item.cyclePhase} compact />
                  <span className="inline-flex items-center gap-1 text-[var(--accent-text)] font-medium whitespace-nowrap">
                    <span>{t('fr.ov2.analyze')}</span>
                    <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Prices grouped by category */}
      <section aria-label={t('fr.ov2.pricesTitle')} className="space-y-4">
        <SectionHeader
          title={t('fr.ov2.pricesTitle')}
          actions={<UpdatedAgo className="text-xs text-[var(--muted)] tabular-nums" />}
        />
        {loading ? (
          <SkeletonCards count={8} />
        ) : groups.length === 0 ? (
          <EmptyState title={t('fr.ov.noMatch')} icon={<SearchX className="w-6 h-6" aria-hidden="true" />} />
        ) : (
          groups.map((g) => (
            <div key={g.cat} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--faint)]">{t(`dash.cat.${g.cat}`)}</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                {g.items.map((inst) => (
                  <PriceCard
                    key={inst.id}
                    inst={inst}
                    quote={quotesBySymbol[inst.exchangeSymbol]}
                    onOpen={() => openInstrumentIn(inst.exchangeSymbol, 'commodity-profile')}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      {/* Beginner tips */}
      <section className={`${card} space-y-2`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--text-strong)] inline-flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-[var(--warning)]" aria-hidden="true" />
            {t('fr.ov.tipsTitle')}
          </h2>
          <button type="button" onClick={() => setActiveModule('learn')} className={linkBtn}>
            {t('fr.ov.learnMore')} →
          </button>
        </div>
        <ul className="space-y-1.5 text-sm text-[var(--text)]/80 leading-relaxed list-disc pl-5">
          <li>
            {t('fr.ov.tip1a')} <Term k="futures" /> {t('fr.ov.tip1b')}
          </li>
          <li>
            {t('fr.ov.tip2a')} <Term k="margin" /> {t('fr.ov.tip2b')} <Term k="stopLoss" /> {t('fr.ov.tip2c')}
          </li>
          <li>
            {t('fr.ov.tip3a')} <Term k="frontMonth">{t('fr.ov.tip3term')}</Term>
            {t('fr.ov.tip3b')}
          </li>
        </ul>
      </section>

      {/* B. Opportunity radar & D. Economic cycle tracker */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section
          aria-label={t('fr.ov2.radarTitle')}
          className="xl:col-span-2 bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden flex flex-col"
        >
          <div className="px-4 py-3 border-b border-[var(--border)] flex items-start justify-between gap-3">
            <div className="flex items-start gap-2 min-w-0">
              <Radar className="w-4 h-4 text-[var(--accent-text)] mt-0.5 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('fr.ov2.radarTitle')}</h2>
                <p className="text-xs text-[var(--text)]/55">{t('fr.ov2.radarSub')}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveModule('research-report')}
              className={`${linkBtn} inline-flex items-center gap-1`}
            >
              <FileText className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('fr.ov2.report')}</span>
            </button>
          </div>

          <div className="overflow-x-auto" tabIndex={0}>
            <table className="w-full text-left border-collapse min-w-[560px]">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs text-[var(--text)]/55">
                  <th className="py-2.5 px-4 font-medium">{t('fr.ov2.colName')}</th>
                  <th className="py-2.5 px-3 font-medium">
                    <Term k="cyclePhase">{t('fr.ov2.colPhase')}</Term>
                  </th>
                  <th className="py-2.5 px-3 font-medium text-right">
                    <Term k="bottomScore">{t('fr.ov2.colBottom')}</Term>
                  </th>
                  <th className="py-2.5 px-3 font-medium text-right">
                    <Term k="percentile">{t('fr.ov2.colPct')}</Term>
                  </th>
                  <th className="py-2.5 px-4 font-medium text-right">{t('fr.ov2.colPrice')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]/70 text-xs">
                {(cycleOverview?.opportunityRadar ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 px-4 text-center text-[var(--text)]/55">
                      {t('fr.ov2.radarEmpty')}
                    </td>
                  </tr>
                ) : (
                  (cycleOverview?.opportunityRadar ?? []).map((item) => {
                    const nameVi = getCommodityVisual(item.instrument.id)?.nameVi ?? item.instrument.productName;
                    return (
                      <tr
                        key={item.instrument.id}
                        onClick={() => openInstrumentIn(item.instrument.exchangeSymbol, 'commodity-profile')}
                        className="hover:bg-[var(--surface-2)]/50 transition-colors cursor-pointer"
                      >
                        <td className="py-2.5 px-4">
                          <div className="font-medium text-[var(--text-strong)]">{nameVi}</div>
                          <div className="text-[11px] text-[var(--text)]/50">
                            {item.instrument.exchange} · {item.instrument.exchangeSymbol}
                            {item.instrument.mxvMapping?.mxvSymbol ? ` · MXV ${item.instrument.mxvMapping.mxvSymbol}` : ''}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <CyclePhaseBadge phase={item.cyclePhase} compact />
                        </td>
                        <td className={`py-2.5 px-3 text-right font-semibold tabular-nums ${getBottomScoreAccent(item.bottomClassification)}`}>
                          {item.bottomScore !== null ? `${item.bottomScore}/100` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right text-[var(--text)]/75 tabular-nums">
                          {item.percentile10Y !== null ? `${fmtFixed(item.percentile10Y, 0)}%` : '—'}
                        </td>
                        <td className="py-2.5 px-4 text-right tabular-nums">
                          {hasPrice(item.quote) ? (
                            <span className="text-[var(--text)]/90">{fmtPrice(item.quote.price)}</span>
                          ) : (
                            <span className="text-[var(--text)]/45">{t('fr.ov.noPrice')}</span>
                          )}
                          <div className="mt-0.5 inline-flex justify-end w-full">
                            <DataStatusBadge
                              status={item.quote.status}
                              compact
                              sourceQuality={item.quote.sourceQuality}
                              delayMinutes={item.quote.delayMinutes}
                              kind={item.quote.kind}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-label={t('fr.ov2.macroTitle')} className={`${card} space-y-3`}>
          <div className="flex items-start justify-between gap-2 border-b border-[var(--border)] pb-2.5">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('fr.ov2.macroTitle')}</h2>
              <p className="text-xs text-[var(--text)]/55">{t('fr.ov2.macroSub')}</p>
            </div>
            <button type="button" onClick={() => setActiveModule('data-health')} className={linkBtn}>
              {t('fr.ov2.macroLink')}
            </button>
          </div>
          {(cycleOverview?.macroTracker ?? []).length === 0 ? (
            <p className="text-xs text-[var(--text)]/55">{t('fr.ov2.macroEmpty')}</p>
          ) : (
            <ul className="divide-y divide-[var(--border)]/70 text-xs">
              {(cycleOverview?.macroTracker ?? []).map((m) => (
                <li key={m.id} className="py-2.5 space-y-0.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-[var(--text-strong)]">{m.labelVi}</span>
                    <span className="text-[var(--text)] tabular-nums text-right">
                      {m.value === null ? (
                        <span className="text-[var(--text)]/45">{t('fr.ov2.noValue')}</span>
                      ) : typeof m.value === 'number' ? (
                        `${fmtNum(m.value, { maximumFractionDigits: 2 })} ${m.unit}`
                      ) : (
                        `${m.value} ${m.unit}`
                      )}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text)]/55" title={m.cycleImplication}>
                    {m.cycleImplication.replace(/^DATA_UNAVAILABLE\s*[—-]\s*/, '')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* C. Performance heatmap */}
      <section aria-label={t('fr.ov2.heatTitle')} className={`${card} space-y-4`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('fr.ov2.heatTitle')}</h2>
            <p className="text-xs text-[var(--text)]/55">{t('fr.ov2.heatSub')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1 p-1 bg-[var(--bg)] border border-[var(--border)] rounded-md self-start sm:self-auto">
            {HEATMAP_HORIZONS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setHeatmapHorizon(h)}
                className={`px-2.5 py-1 rounded text-xs transition-colors whitespace-nowrap ${
                  heatmapHorizon === h ? 'bg-[var(--accent)] text-white' : 'text-[var(--text)]/70 hover:text-[var(--text-strong)]'
                }`}
              >
                {t(`fr.ov2.h.${h}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2.5">
          {(cycleOverview?.commodities ?? []).map((item) => {
            const val = item.returns[heatmapHorizon as keyof PerformanceHorizonReturns];
            const nameVi = getCommodityVisual(item.instrument.id)?.nameVi ?? item.instrument.productName;
            return (
              <button
                key={item.instrument.id}
                type="button"
                onClick={() => openInstrumentIn(item.instrument.exchangeSymbol, 'commodity-profile')}
                className={`text-left border rounded-md p-3 transition-colors hover:border-[var(--accent)] min-w-0 ${getHeatmapTone(val)}`}
              >
                <div className="flex items-center justify-between gap-1 min-w-0">
                  <span className="text-xs font-semibold text-[var(--text-strong)] truncate">{nameVi}</span>
                  <span className="text-[10px] text-[var(--text)]/60 shrink-0">{item.instrument.exchangeSymbol}</span>
                </div>
                <p className="text-base font-semibold tabular-nums mt-1">
                  {val !== null ? `${val > 0 ? '▲' : val < 0 ? '▼' : ''} ${fmtPct(val)}` : '—'}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Trend for the selected commodity + calendar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className={`${card} space-y-2`}>
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--text-strong)]">
              {(() => {
                // '{term}' is left unreplaced on purpose so the glossary tooltip can be inserted there.
                const [before, after] = t('fr.ov.trendTitle', { name: activeName }).split('{term}');
                return (
                  <>
                    {before}
                    <Term k="volatility">{t('gl.volatility').toLowerCase()}</Term>
                    {after}
                  </>
                );
              })()}
            </h2>
            <button type="button" onClick={() => setActiveModule('technical')} className={linkBtn}>
              {t('fr.ov.open')}
            </button>
          </div>
          {techSummary && techSummary.status !== 'UNAVAILABLE' ? (
            <div className="text-xs text-[var(--text)]/80 space-y-1 tabular-nums">
              <DataStatusBadge status={techSummary.status as 'HISTORICAL'} compact />
              <p>
                {t('fr.ov.trendLine', {
                  trend: label('fr.ov.trend.', techSummary.mainTrend),
                  regime: label('fr.ov.regime.', techSummary.marketRegime),
                })}
              </p>
              <p>
                <Term k="rsi" /> (14): {techSummary.rsi14 !== null ? fmtFixed(techSummary.rsi14, 1) : t('common.na')}
              </p>
              <p>
                <Term k="atr" /> (14):{' '}
                {techSummary.atr14 !== null ? fmtNum(techSummary.atr14, { maximumFractionDigits: 4 }) : t('common.na')}
              </p>
            </div>
          ) : (
            <p className="text-xs text-[var(--text)]/65 leading-relaxed">{t('fr.ov.trendNeed', { name: activeName })}</p>
          )}
        </section>

        <section className={`${card} space-y-2`}>
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('fr.ov2.calTitle')}</h2>
            <button type="button" onClick={() => setActiveModule('news')} className={linkBtn}>
              {t('fr.ov.open')}
            </button>
          </div>
          <p className="text-xs text-[var(--text)]/65 leading-relaxed">
            {macroCount + newsCount > 0 ? t('fr.ov2.calHas', { macro: macroCount, news: newsCount }) : t('fr.ov.calDesc')}
          </p>
          {datasets[0] && (
            <p className="text-[11px] text-[var(--text)]/50">
              {t('fr.ov2.lastSync', { time: formatTimestampInZone(datasets[0].importedAt, 'Asia/Ho_Chi_Minh') })}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
