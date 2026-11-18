import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, RefreshCw, Search } from 'lucide-react';
import { useTerminal } from '../../contexts/TerminalContext';
import {
  COMMODITY_GROUP_LABELS_VI,
  getCommodityVisual,
} from '../../shared/data/commodityVisuals';
import type {
  CommodityCycleSummary,
  CommodityGroupFilter,
  CycleMarketOverview,
} from '../../shared/types/cycle';
import { CommodityHeroImage } from '../common/CommodityHeroImage';
import { CyclePhaseBadge, getBottomScoreAccent } from '../common/CyclePhaseBadge';
import { DataStatusBadge } from '../common/DataStatusBadge';
import { safeReadJson } from '../../shared/utils/http';

const GROUP_FILTERS: CommodityGroupFilter[] = [
  'ALL',
  'AGRICULTURE',
  'SOFT_COMMODITIES',
  'METALS',
  'ENERGY',
];

export function CommodityWorldView() {
  const { openInstrumentIn, datasets } = useTerminal();
  const [overview, setOverview] = useState<CycleMarketOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<CommodityGroupFilter>('ALL');
  const [mxvOnly, setMxvOnly] = useState(false);
  const [query, setQuery] = useState('');

  const fetchWorld = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/cycle/overview');
      const json = await safeReadJson<CycleMarketOverview>(res);
      setOverview(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu Living Commodity World.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchWorld();
  }, [datasets.length]);

  const filteredItems = useMemo(() => {
    const items = overview?.commodities ?? [];
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (groupFilter !== 'ALL' && item.instrument.category !== groupFilter) return false;
      if (mxvOnly && !item.instrument.isMvxListed) return false;
      if (q) {
        const hay = [
          item.instrument.id,
          item.instrument.exchangeSymbol,
          item.instrument.productName,
          item.instrument.commodityProfile?.vietnameseName ?? '',
          item.instrument.mxvMapping?.mxvSymbol ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [overview, groupFilter, mxvOnly, query]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight text-balance">
            Thế giới Hàng hóa Sống (Living Commodity World)
          </h1>
          <p className="text-sm text-[#E5E7EB]/65 mt-1">
            Danh mục 20 hàng hóa phái sinh MXV &amp; quốc tế với hình ảnh thực tế riêng biệt, định vị chu kỳ giá và điểm tìm đáy.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void fetchWorld()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#111622] hover:bg-[#172033] border border-[#263244] rounded-md text-xs font-medium text-[#E5E7EB] whitespace-nowrap self-start lg:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          <span>Làm mới Chu kỳ</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <section
        aria-label="Bộ lọc Thế giới Hàng hóa"
        className="bg-[#111622] border border-[#263244] rounded-lg p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4"
      >
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#0B0E14] border border-[#263244] rounded-md">
          {GROUP_FILTERS.map((group) => {
            const active = groupFilter === group;
            return (
              <button
                key={group}
                type="button"
                onClick={() => setGroupFilter(group)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-[#6366F1] text-white'
                    : 'text-[#E5E7EB]/70 hover:text-white hover:bg-[#172033]'
                }`}
              >
                {COMMODITY_GROUP_LABELS_VI[group]}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#E5E7EB]/45 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm Ngô, Robusta, ZC, LRC..."
              aria-label="Tìm kiếm hàng hóa"
              className="w-full sm:w-64 pl-8 pr-3 py-1.5 bg-[#0B0E14] border border-[#263244] rounded-md text-xs text-white placeholder:text-[#E5E7EB]/40 focus:outline-none focus:border-[#6366F1]"
            />
          </div>

          <button
            type="button"
            onClick={() => setMxvOnly((prev) => !prev)}
            aria-pressed={mxvOnly}
            className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              mxvOnly
                ? 'bg-[#6366F1]/20 border-[#6366F1] text-white'
                : 'bg-[#0B0E14] border-[#263244] text-[#E5E7EB]/75 hover:text-white'
            }`}
          >
            {mxvOnly ? 'Đang lọc: Liên thông MXV' : 'Chỉ hiện hàng hóa MXV'}
          </button>
        </div>
      </section>

      {error && (
        <div className="bg-[#111622] border border-[#EF4444]/40 rounded-lg p-4 text-xs text-[#EF4444]">
          Không thể tải dữ liệu Thế giới Hàng hóa: {error}
        </div>
      )}

      {/* Hero Cards Grid */}
      {loading && !overview ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="h-72 bg-[#111622] border border-[#263244] rounded-lg animate-pulse"
            />
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-[#111622] border border-[#263244] rounded-lg p-8 text-center text-sm text-[#E5E7EB]/60">
          Không tìm thấy hàng hóa nào khớp bộ lọc hiện tại.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredItems.map((item) => (
            <CommodityWorldCard
              key={item.instrument.id}
              item={item}
              onSelect={() => openInstrumentIn(item.instrument.exchangeSymbol, 'commodity-profile')}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CommodityWorldCard({
  item,
  onSelect,
}: {
  item: CommodityCycleSummary;
  onSelect: () => void;
}) {
  const { instrument, quote, cyclePhase, bottomScore, bottomClassification, returns } = item;
  const visual = getCommodityVisual(instrument.id);
  const nameVi = visual?.nameVi ?? instrument.commodityProfile?.vietnameseName ?? instrument.productName;
  const mxvCode = instrument.mxvMapping?.mxvSymbol;

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group relative text-left bg-[#111622] border border-[#263244] hover:border-[#6366F1]/70 rounded-lg overflow-hidden transition-all duration-200 focus-visible:outline-2 focus-visible:outline-[#6366F1] flex flex-col"
    >
      {/* Photographic 16:9 Canvas with measured contrast scrim */}
      <div className="relative aspect-video w-full overflow-hidden">
        <CommodityHeroImage
          symbol={instrument.id}
          name={nameVi}
          category={instrument.category}
          className="w-full h-full"
          imgClassName="transition-transform duration-300 group-hover:scale-[1.04]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-[#0B0E14] via-[#0B0E14]/60 to-[#0B0E14]/50"
        />

        {/* Top overlay row: exchange/MXV + status */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
          <span className="text-[11px] font-mono text-white/95 bg-[#0B0E14]/85 backdrop-blur-sm px-2 py-0.5 rounded border border-white/15 truncate">
            {instrument.exchange}:{instrument.exchangeSymbol}
            {mxvCode ? ` · MXV ${mxvCode}` : ''}
          </span>
          <span className="inline-flex items-center shrink-0 bg-[#0B0E14]/85 backdrop-blur-sm px-2 py-0.5 rounded border border-white/15 shadow-sm">
            <DataStatusBadge status={quote.status} compact />
          </span>
        </div>

        {/* Bottom overlay row inside image: Title & Live Price */}
        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-[#E5E7EB]/80 truncate">
              {visual?.groupVi ?? instrument.category} · {visual?.originTag ?? instrument.exchange}
            </p>
            <h2 className="text-lg font-semibold text-white tracking-tight truncate">
              {nameVi} <span className="text-xs font-normal text-[#E5E7EB]/70">({instrument.productName})</span>
            </h2>
          </div>

          <div className="text-right shrink-0">
            <p className="text-sm sm:text-base font-mono font-semibold text-white tabular-nums">
              {quote.price !== null ? quote.price.toFixed(2) : 'DATA_UNAVAILABLE'}
            </p>
            <p className="text-[11px] font-mono text-[#E5E7EB]/75">
              {quote.price !== null ? quote.unit : 'Chưa có feed'}
            </p>
          </div>
        </div>
      </div>

      {/* Crisp Cycle & Bottom Detection Telemetry Footer */}
      <div className="p-4 space-y-3 flex-1 flex flex-col justify-between bg-[#111622]">
        <div className="flex items-center justify-between gap-2">
          <CyclePhaseBadge phase={cyclePhase} compact />
          <span className="inline-flex items-center gap-1 text-xs font-medium text-[#6366F1] group-hover:translate-x-0.5 transition-transform whitespace-nowrap shrink-0">
            <span>Hồ sơ chu kỳ</span>
            <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3 pt-2.5 border-t border-[#263244] text-xs">
          <div className="min-w-0">
            <span className="block text-[11px] text-[#E5E7EB]/55 truncate">Bottom Score</span>
            <span className={`block font-mono font-semibold tabular-nums truncate ${getBottomScoreAccent(bottomClassification)}`}>
              {bottomScore !== null ? `${bottomScore}/100` : 'Chưa chấm'}
            </span>
          </div>
          <div className="min-w-0 text-center">
            <span className="block text-[11px] text-[#E5E7EB]/55 truncate">Biến động 1M</span>
            <span
              className={`block font-mono font-semibold tabular-nums truncate ${
                returns.m1 === null
                  ? 'text-[#E5E7EB]/45'
                  : returns.m1 >= 0
                    ? 'text-[#22C55E]'
                    : 'text-[#EF4444]'
              }`}
            >
              {returns.m1 !== null ? `${returns.m1 >= 0 ? '+' : ''}${returns.m1.toFixed(2)}%` : '—'}
            </span>
          </div>
          <div className="min-w-0 text-right">
            <span className="block text-[11px] text-[#E5E7EB]/55 truncate">Cung–Cầu</span>
            <span className="block font-mono text-[#E5E7EB]/85 truncate">
              {item.supplyDemandBias === 'DATA_UNAVAILABLE' ? '—' : item.supplyDemandBias}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}
