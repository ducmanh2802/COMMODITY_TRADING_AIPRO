import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useTerminal } from '../../contexts/TerminalContext';
import type { ProductCategory } from '../../shared/types/instrument';
import { formatTimestampInZone } from '../../shared/utils/time';
import { DataStatusBadge } from '../common/DataStatusBadge';
import { fmtNum, useT } from '../../i18n';
import { fmtPrice, hasPrice, plainUnit } from '../common/quoteFormat';

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
    marketScope,
    searchQuery,
    setSearchQuery,
    openInstrumentIn,
    loading,
  } = useTerminal();
  const t = useT();
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | ProductCategory>('ALL');

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return instruments.filter((inst) => {
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
  }, [instruments, marketScope, categoryFilter, searchQuery]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight">{t('dash.mw.title')}</h1>
          <p className="text-sm text-[#E5E7EB]/65 mt-1">
            {t('dash.mw.subtitle')}
          </p>
        </div>

        <div className="relative w-full md:w-72">
          <label htmlFor="market-watch-search" className="sr-only">
            {t('dash.mw.filterLabel')}
          </label>
          <Search
            className="w-4 h-4 text-[#E5E7EB]/45 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            id="market-watch-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('dash.mw.filterPlaceholder')}
            className="w-full bg-[#111622] border border-[#263244] rounded-md pl-9 pr-3 py-2 text-xs text-[#E5E7EB] placeholder:text-[#E5E7EB]/40 focus:outline-none focus:border-[#6366F1]"
          />
        </div>
      </div>

      {/* Category Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 bg-[#111622] border border-[#263244] rounded-lg p-1.5 w-fit">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategoryFilter(cat)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              categoryFilter === cat
                ? 'bg-[#6366F1] text-white'
                : 'text-[#E5E7EB]/70 hover:text-white hover:bg-[#172033]'
            }`}
          >
            {t(`dash.cat.${cat}`)}
          </button>
        ))}
      </div>

      {/* High-Density Market Watch Data Grid */}
      <div className="bg-[#111622] border border-[#263244] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[920px]">
            <thead>
              <tr className="border-b border-[#263244] bg-[#172033]/50 text-xs text-[#E5E7EB]/65">
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
            <tbody className="divide-y divide-[#263244]/70 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={12} className="py-10 px-4 text-center text-[#E5E7EB]/55">
                    {t('dash.mw.loading')}
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-10 px-4 text-center text-[#E5E7EB]/55">
                    {t('dash.mw.noMatch')}
                  </td>
                </tr>
              ) : (
                filtered.map((inst) => {
                  const quote = quotesBySymbol[inst.exchangeSymbol];
                  return (
                    <tr key={inst.id} className="hover:bg-[#172033]/40 transition-colors">
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <div className="font-medium text-white">
                          {inst.commodityProfile?.vietnameseName ?? inst.productName}
                        </div>
                        <div className="text-[11px] text-[#E5E7EB]/50">
                          {inst.productName}
                          {inst.commodityProfile?.contractMonths
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
                          <span className="text-[#E5E7EB]/45" title={t('fr.status.UNAVAILABLE.desc')}>
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
                        {quote?.timestamp
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
      </div>
    </div>
  );
}
