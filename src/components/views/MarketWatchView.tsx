import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useTerminal } from '../../contexts/TerminalContext';
import type { ProductCategory } from '../../shared/types/instrument';
import { formatTimestampInZone } from '../../shared/utils/time';
import { DataStatusBadge } from '../common/DataStatusBadge';

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
          <h1 className="text-xl font-semibold text-white tracking-tight">Market Watch</h1>
          <p className="text-sm text-[#E5E7EB]/65 mt-1">
            Instrument registry and live quote integrity across Vietnam MXV and international futures exchanges.
          </p>
        </div>

        <div className="relative w-full md:w-72">
          <label htmlFor="market-watch-search" className="sr-only">
            Filter instruments
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
            placeholder="Filter by symbol, VN name, or MXV code..."
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
            {cat === 'ALL' ? 'All Categories' : cat.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* High-Density Market Watch Data Grid */}
      <div className="bg-[#111622] border border-[#263244] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[920px]">
            <thead>
              <tr className="border-b border-[#263244] bg-[#172033]/50 text-xs text-[#E5E7EB]/65">
                <th className="py-3 px-4 font-medium">Product</th>
                <th className="py-3 px-3 font-medium">Category</th>
                <th className="py-3 px-3 font-medium">Exchange</th>
                <th className="py-3 px-3 font-medium">Symbol</th>
                <th className="py-3 px-3 font-medium">MXV Mapping</th>
                <th className="py-3 px-3 font-medium">Spec Status</th>
                <th className="py-3 px-3 font-medium text-right">Price</th>
                <th className="py-3 px-3 font-medium text-right">Volume</th>
                <th className="py-3 px-3 font-medium text-right">Open Interest</th>
                <th className="py-3 px-3 font-medium">Timestamp (ICT)</th>
                <th className="py-3 px-3 font-medium text-right">Quality</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#263244]/70 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={12} className="py-10 px-4 text-center text-[#E5E7EB]/55">
                    Loading market watch records...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-10 px-4 text-center text-[#E5E7EB]/55">
                    No instruments match the selected filters.
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
                        <div className="text-[11px] font-mono text-[#E5E7EB]/50">
                          {inst.productName}
                          {inst.commodityProfile?.contractMonths
                            ? ` · Tháng: ${inst.commodityProfile.contractMonths}`
                            : ''}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-[#E5E7EB]/70 whitespace-nowrap">
                        {inst.category}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[#E5E7EB] whitespace-nowrap">
                        {inst.exchange}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-white whitespace-nowrap">
                        {inst.exchangeSymbol}
                      </td>
                      <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                        {inst.mxvMapping ? (
                          <span className="text-[#E5E7EB]/85">
                            {inst.mxvMapping.mxvSymbol} ·{' '}
                            <span className="text-[#F59E0B]">{inst.mxvMapping.mappingStatus}</span>
                          </span>
                        ) : (
                          <span className="text-[#E5E7EB]/40">NONE</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[#F59E0B] whitespace-nowrap">
                        {inst.specification.verificationStatus}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-right tabular-nums text-[#E5E7EB]/60 whitespace-nowrap">
                        {quote?.price !== null && quote?.price !== undefined
                          ? `${quote.price.toFixed(2)} ${quote.currency}`
                          : 'DATA_UNAVAILABLE'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-right tabular-nums text-[#E5E7EB]/55 whitespace-nowrap">
                        {quote?.volume !== null && quote?.volume !== undefined
                          ? quote.volume.toLocaleString()
                          : 'UNAVAILABLE'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-right tabular-nums text-[#E5E7EB]/55 whitespace-nowrap">
                        {quote?.openInterest !== null && quote?.openInterest !== undefined
                          ? quote.openInterest.toLocaleString()
                          : 'UNAVAILABLE'}
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-[#E5E7EB]/55 whitespace-nowrap">
                        {quote?.timestamp
                          ? formatTimestampInZone(quote.timestamp, 'Asia/Ho_Chi_Minh')
                          : 'NO_MARKET_TS'}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex justify-end">
                          <DataStatusBadge status={quote?.status ?? 'UNAVAILABLE'} compact />
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openInstrumentIn(inst.exchangeSymbol, 'charts')}
                            className="px-2 py-1 bg-[#172033] hover:bg-[#6366F1] border border-[#263244] rounded text-[11px] font-medium text-[#E5E7EB] hover:text-white transition-colors"
                          >
                            Chart
                          </button>
                          <button
                            type="button"
                            onClick={() => openInstrumentIn(inst.exchangeSymbol, 'explorer')}
                            className="px-2 py-1 bg-[#172033] hover:bg-[#172033]/80 border border-[#263244] rounded text-[11px] font-medium text-[#E5E7EB]/80 hover:text-white transition-colors"
                          >
                            Spec
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
