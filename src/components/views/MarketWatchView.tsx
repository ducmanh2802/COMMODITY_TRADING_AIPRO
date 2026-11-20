import { useEffect, useMemo, useState } from 'react';
import { Search, SearchX } from 'lucide-react';
import { SectionHeader } from '../ui/SectionHeader';
import { Card } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';
import { EmptyState } from '../ui/EmptyState';
import { useTerminal } from '../../contexts/TerminalContext';
import type { ProductCategory } from '../../shared/types/instrument';
import type { CommodityCycleSummary, CycleMarketOverview } from '../../shared/types/cycle';
import { formatTimestampInZone } from '../../shared/utils/time';
import { fetchJsonWithRetry } from '../../shared/utils/http';
import { sortCommoditiesByPotential } from '../../shared/utils/commoditySort';
import { DataStatusBadge } from '../common/DataStatusBadge';
import { fmtNum, useT } from '../../i18n';
import { fmtPrice, friendlyQuoteReason, hasPrice, plainUnit } from '../common/quoteFormat';

const CATEGORIES: Array<'ALL' | ProductCategory> = [
  'ALL',
  'AGRICULTURE',
  'SOFT_COMMODITIES',
  'METALS',
  'ENERGY',
];

export function MarketWatchView() {
  const {
    instruments,
    quotesBySymbol,
    datasets,
    marketScope,
    searchQuery,
    setSearchQuery,
    openInstrumentIn,
    loading,
  } = useTerminal();
  const t = useT();
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | ProductCategory>('ALL');
  const [cycleOverview, setCycleOverview] = useState<CycleMarketOverview | null>(null);

  const pricedCount = useMemo(
    () => Object.values(quotesBySymbol).filter((q) => hasPrice(q)).length,
    [quotesBySymbol]
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchJsonWithRetry<CycleMarketOverview>('/api/cycle/overview', { signal: controller.signal })
      .then((json) => {
        if (!controller.signal.aborted) setCycleOverview(json);
      })
      .catch(() => {
        // Fail-soft: table falls back to price-first + MVX sorting when cycle overview is unavailable
      });
    return () => controller.abort();
  }, [datasets.length, pricedCount]);

  const { rankById, summaryById } = useMemo(() => {
    const ranks = new Map<string, number>();
    const summaries = new Map<string, CommodityCycleSummary>();
    const sorted = sortCommoditiesByPotential(cycleOverview?.commodities ?? []);
    sorted.forEach((item, index) => {
      ranks.set(item.instrument.id, index);
      summaries.set(item.instrument.id, item);
    });
    return { rankById: ranks, summaryById: summaries };
  }, [cycleOverview]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = instruments.filter((inst) => {
      if (marketScope === 'MXV' && !inst.isMvxListed) return false;
      if (marketScope === 'INTERNATIONAL' && inst.exchange === 'MXV') return false;
      if (categoryFilter !== 'ALL' && inst.category !== categoryFilter) return false;
      if (q) {
        const hay = `${inst.productName} ${inst.commodityProfile?.vietnameseName ?? ''} ${inst.exchangeSymbol} ${inst.exchange} ${
          inst.mxvMapping?.mxvSymbol ?? ''
        }`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return [...list].sort((a, b) => {
      const ra = rankById.get(a.id);
      const rb = rankById.get(b.id);
      if (ra !== undefined && rb !== undefined && ra !== rb) return ra - rb;
      const pa = hasPrice(quotesBySymbol[a.exchangeSymbol]);
      const pb = hasPrice(quotesBySymbol[b.exchangeSymbol]);
      if (pa !== pb) return pa ? -1 : 1;
      if (a.isMvxListed !== b.isMvxListed) return a.isMvxListed ? -1 : 1;
      return a.exchangeSymbol.localeCompare(b.exchangeSymbol);
    });
  }, [instruments, marketScope, categoryFilter, searchQuery, rankById, quotesBySymbol]);

  return (
    <div className="space-y-5">
      <SectionHeader
        level={1}
        title={t('dash.mw.title')}
        subtitle={t('dash.mw.subtitle')}
        actions={
          <div className="relative w-full md:w-72">
            <label htmlFor="market-watch-search" className="sr-only">
              {t('dash.mw.filterLabel')}
            </label>
            <Search
              className="w-4 h-4 text-[var(--faint)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              id="market-watch-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('dash.mw.filterPlaceholder')}
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-[10px] pl-9 pr-3 h-10 text-sm text-[var(--text)] placeholder:text-[var(--faint)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/25"
            />
          </div>
        }
      />
      {/* Category Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-1 w-fit max-w-full">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategoryFilter(cat)}
            className={`h-8 px-3.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              categoryFilter === cat
                ? 'bg-[var(--accent)] text-white shadow-sm'
                : 'text-[#E5E7EB]/70 hover:text-white hover:bg-[#172033]'
            }`}
          >
            {t(`dash.cat.${cat}`)}
          </button>
        ))}
      </div>

      {/* High-Density Market Watch Data Grid */}
      <Card padded={false} className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[920px]">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]/60 text-xs uppercase tracking-wide text-[var(--muted)]">
                <th className="py-3 px-4 font-medium">{t('dash.mw.colProduct')}</th>
                <th className="py-3 px-3 font-medium">{t('dash.mw.colCategory')}</th>
                <th className="py-3 px-3 font-medium">{t('common.exchange')}</th>
                <th className="py-3 px-3 font-medium">{t('common.symbol')}</th>
                <th className="py-3 px-3 font-medium">{t('dash.mw.colMxv')}</th>
                <th className="py-3 px-3 font-medium">{t('dash.mw.colSpec')}</th>
                <th className="py-3 px-3 font-medium text-right">{t('common.price')}</th>
                <th className="py-3 px-3 font-medium text-right">{t('common.volume')}</th>
                <th className="py-3 px-3 font-medium text-right">{t('term.openInterest')}</th>
                <th className="py-3 px-3 font-medium">{t('fr.mw.colTime')}</th>
                <th className="py-3 px-3 font-medium text-right">{t('fr.mw.colStatus')}</th>
                <th className="py-3 px-4 font-medium text-right">{t('dash.mw.colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]/60 text-xs">
              {loading ? (
                <>
                  {Array.from({ length: 6 }, (_, i) => (
                    <tr key={i}>
                      <td colSpan={12} className="py-3 px-4">
                        <Skeleton className="h-6 w-full" />
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={12} className="sr-only">{t('dash.mw.loading')}</td>
                  </tr>
                </>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={12} className="p-4">
                    <EmptyState title={t('dash.mw.noMatch')} icon={<SearchX className="w-6 h-6" aria-hidden="true" />} />
                  </td>
                </tr>
              ) : (
                filtered.map((inst) => {
                  const quote = quotesBySymbol[inst.exchangeSymbol];
                  const cycleSummary = summaryById.get(inst.id);
                  return (
                    <tr key={inst.id} className="hover:bg-[var(--surface-2)]/50 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-medium text-white">
                          {inst.commodityProfile?.vietnameseName ?? inst.productName}
                        </div>
                        <div className="text-[11px] text-[#E5E7EB]/50">
                          {inst.productName}
                          {cycleSummary?.opportunityScore != null
                            ? ` · Cơ hội ${cycleSummary.opportunityScore}/100`
                            : inst.commodityProfile?.contractMonths
                              ? t('dash.mw.months', { months: inst.commodityProfile.contractMonths.join(',') })
                              : ''}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-[#E5E7EB]/70 whitespace-nowrap">
                        {t(`dash.cat.${inst.category}`)}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[#E5E7EB] whitespace-nowrap">
                        {inst.exchange}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-white whitespace-nowrap">
                        {inst.exchangeSymbol}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {inst.mxvMapping ? (
                          <span className="text-[#E5E7EB]/85">
                            {inst.mxvMapping.mxvSymbol} ·{' '}
                            <span className="text-[#F59E0B]" title={t(`verify.${inst.mxvMapping.mappingStatus}.desc`)}>{t(`verify.${inst.mxvMapping.mappingStatus}`)}</span>
                          </span>
                        ) : (
                          <span className="text-[#E5E7EB]/40">{t('common.none')}</span>
                        )}
                      </td>
                      <td
                        className="py-2.5 px-3 text-[#FBBF24]/90 whitespace-nowrap"
                        title={t(`verify.${inst.specification.verificationStatus}.desc`)}
                      >
                        {t(`verify.${inst.specification.verificationStatus}`)}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap">
                        {hasPrice(quote) ? (
                          <>
                            <div className="text-sm font-semibold text-white">{fmtPrice(quote.price)}</div>
                            <div className="text-[11px] text-[#E5E7EB]/50">{plainUnit(t, quote)}</div>
                          </>
                        ) : (
                          <span className="text-[#E5E7EB]/45" title={`${friendlyQuoteReason(t, quote) ?? t('fr.status.UNAVAILABLE.desc')}${quote?.statusReason ? ` (${quote.statusReason})` : ''}`}>
                            {t('fr.status.UNAVAILABLE')}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-[#E5E7EB]/70 whitespace-nowrap">
                        {quote?.volume !== null && quote?.volume !== undefined
                          ? fmtNum(quote.volume)
                          : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-[#E5E7EB]/70 whitespace-nowrap">
                        {quote?.openInterest !== null && quote?.openInterest !== undefined
                          ? fmtNum(quote.openInterest)
                          : '—'}
                      </td>
                      <td className="py-2.5 px-3 tabular-nums text-[#E5E7EB]/60 whitespace-nowrap">
                        {quote?.kind === 'BENCHMARK' && quote.benchmark
                          ? friendlyQuoteReason(t, quote)
                          : quote?.timestamp
                          ? formatTimestampInZone(quote.timestamp, 'Asia/Ho_Chi_Minh')
                          : t('fr.noTime')}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex justify-end">
                          <DataStatusBadge
                            status={quote?.status ?? 'UNAVAILABLE'}
                            compact
                            sourceQuality={quote?.sourceQuality}
                            delayMinutes={quote?.delayMinutes}
                            kind={quote?.kind}
                          />
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openInstrumentIn(inst.exchangeSymbol, 'charts')}
                            className="px-2 py-1 bg-[#172033] hover:bg-[#6366F1] border border-[#263244] rounded text-[11px] font-medium text-[#E5E7EB] hover:text-white transition-colors"
                          >
                            {t('dash.mw.chart')}
                          </button>
                          <button
                            type="button"
                            onClick={() => openInstrumentIn(inst.exchangeSymbol, 'explorer')}
                            className="px-2 py-1 bg-[#172033] hover:bg-[#172033]/80 border border-[#263244] rounded text-[11px] font-medium text-[#E5E7EB]/80 hover:text-white transition-colors"
                          >
                            {t('dash.mw.spec')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
