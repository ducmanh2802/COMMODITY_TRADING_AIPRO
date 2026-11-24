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
import { fetchJsonWithRetry } from '../../shared/utils/http';
import { sortCommoditiesByPotential } from '../../shared/utils/commoditySort';

const GROUP_FILTERS: CommodityGroupFilter[] = [
  'ALL',
  'AGRICULTURE',
  'SOFT_COMMODITIES',
  'METALS',
  'ENERGY',
];

export function CommodityWorldView() {
  const { openInstrumentIn, datasets, quotesBySymbol } = useTerminal();
  const pricedQuotesCount = useMemo(
    () => Object.values(quotesBySymbol).filter((q) => q?.price !== null).length,
    [quotesBySymbol]
  );
  const [overview, setOverview] = useState<CycleMarketOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<CommodityGroupFilter>('ALL');
  const [mxvOnly, setMxvOnly] = useState(false);
  const [query, setQuery] = useState('');

  const fetchWorld = async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const json = await fetchJsonWithRetry<CycleMarketOverview>('/api/cycle/overview', { signal });
      setOverview(json);
    } catch (err) {
      if (signal?.aborted) return;
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu Living Commodity World.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void fetchWorld(controller.signal);
    return () => controller.abort();
  }, [datasets.length, pricedQuotesCount]);

  const filteredItems = useMemo(() => {
    const items = overview?.commodities ?? [];
    const q = query.trim().toLowerCase();
    const filtered = items.filter((item) => {
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
    return sortCommoditiesByPotential(filtered);
  }, [overview, groupFilter, mxvOnly, query]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-[var(--text-strong)] tracking-tight text-balance">
            Thế giới Hàng hóa Sống (Living Commodity World)
          </h2>
          <p className="text-sm text-[var(--muted)] mt-1">
            Danh mục {overview?.commodities.length ?? 21} hàng hóa phái sinh MXV &amp; quốc tế · tự động xếp các hàng hóa tiềm năng (điểm cơ hội &amp; chu kỳ cao) lên đầu danh sách.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void fetchWorld()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-[var(--surface)] hover:bg-[var(--surface-2)] border border-[var(--border)] rounded-md text-xs font-medium text-[var(--text)] whitespace-nowrap self-start lg:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          <span>Làm mới Chu kỳ</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <section
        aria-label="Bộ lọc Thế giới Hàng hóa"
        className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4"
      >
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[var(--bg)] border border-[var(--border)] rounded-md">
          {GROUP_FILTERS.map((group) => {
            const active = groupFilter === group;
            return (
              <button
                key={group}
                type="button"
                onClick={() => setGroupFilter(group)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--muted)] hover:text-[var(--text-strong)] hover:bg-[var(--surface-2)]'
                }`}
              >
                {group === 'ALL' ? `Tất cả (${overview?.commodities.length ?? 21})` : COMMODITY_GROUP_LABELS_VI[group]}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[var(--faint)] absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm Ngô, Robusta, ZC, LRC..."
              aria-label="Tìm kiếm hàng hóa"
              className="w-full sm:w-64 pl-8 pr-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded-md text-xs text-[var(--text-strong)] placeholder:text-[var(--faint)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          <button
            type="button"
            onClick={() => setMxvOnly((prev) => !prev)}
            aria-pressed={mxvOnly}
            className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              mxvOnly
                ? 'bg-[var(--accent)]/20 border-[var(--accent)] text-[var(--text-strong)]'
                : 'bg-[var(--bg)] border-[var(--border)] text-[var(--muted)] hover:text-[var(--text-strong)]'
            }`}
          >
            {mxvOnly ? 'Đang lọc: Liên thông MXV' : 'Chỉ hiện hàng hóa MXV'}
          </button>
        </div>
      </section>

      {error && (
        <div className="bg-[var(--surface)] border border-[var(--negative)]/40 rounded-[var(--radius-md)] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[var(--negative)]">
          <span>Không thể tải dữ liệu Thế giới Hàng hóa: {error}</span>
          <button
            type="button"
            onClick={() => void fetchWorld()}
            className="px-3 py-1.5 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border)] rounded text-xs font-medium text-[var(--text-strong)] whitespace-nowrap self-start sm:self-auto"
          >
            Thử lại ngay
          </button>
        </div>
      )}

      {/* Hero Cards Grid */}
      {loading && !overview ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="h-72 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] animate-pulse"
            />
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-8 text-center text-sm text-[var(--muted)]">
          Không tìm thấy hàng hóa nào khớp bộ lọc hiện tại.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredItems.map((item, idx) => (
            <CommodityWorldCard
              key={item.instrument.id}
              item={item}
              priority={idx < 6}
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
  priority,
  onSelect,
}: {
  item: CommodityCycleSummary;
  priority: boolean;
  onSelect: () => void;
}) {
  const { instrument, quote, cyclePhase, bottomScore, bottomClassification, returns } = item;
  const visual = getCommodityVisual(instrument.id);
  const nameVi = visual?.nameVi ?? instrument.commodityProfile?.vietnameseName ?? instrument.productName;
  const mxvCode = instrument.mxvMapping?.mxvSymbol;

  return (
    <div
      onClick={onSelect}
      className="group relative text-left cursor-pointer shadow-[var(--shadow-card)] hover:-translate-y-0.5 bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)]/70 rounded-[var(--radius-md)] overflow-hidden transition-all duration-200 focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] flex flex-col"
    >
      {/* Photographic 16:9 Canvas with measured contrast scrim */}
      <div className="relative aspect-video w-full overflow-hidden">
        <CommodityHeroImage
          symbol={instrument.id}
          name={nameVi}
          category={instrument.category}
          priority={priority}
          className="w-full h-full"
          imgClassName="transition-transform duration-300 group-hover:scale-[1.04]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)]/60 to-[var(--bg)]/50"
        />

        {/* Top overlay row: exchange/MXV + status */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
          <span className="text-[11px] font-mono text-[var(--text-strong)]/95 bg-[var(--bg)]/85 backdrop-blur-sm px-2 py-0.5 rounded border border-white/15 truncate">
            {instrument.exchange}:{instrument.exchangeSymbol}
            {mxvCode ? ` · MXV ${mxvCode}` : ''}
          </span>
          <span className="inline-flex items-center shrink-0 bg-[var(--bg)]/85 backdrop-blur-sm px-2 py-0.5 rounded border border-white/15 shadow-sm">
            <DataStatusBadge status={quote.status} compact />
          </span>
        </div>

        {/* Bottom overlay row inside image: Title & Live Price */}
        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-[var(--text)] truncate">
              {visual?.groupVi ?? instrument.category} · {visual?.originTag ?? instrument.exchange}
            </p>
            <h2 className="text-lg font-semibold text-[var(--text-strong)] tracking-tight truncate">
              {nameVi} <span className="text-xs font-normal text-[var(--muted)]">({instrument.productName})</span>
            </h2>
          </div>

          <div className="text-right shrink-0">
            <p
              title={quote.price === null ? 'DATA_UNAVAILABLE' : undefined}
              className={`font-semibold tabular-nums ${
                quote.price !== null ? 'text-sm sm:text-base text-[var(--text-strong)]' : 'text-xs sm:text-sm text-[var(--text)]/85'
              }`}
            >
              {quote.price !== null ? quote.price.toFixed(2) : 'Chưa có giá'}
            </p>
            <p className="text-[11px] font-mono text-[var(--muted)]">
              {quote.price !== null ? quote.unit : 'Chưa có feed'}
            </p>
          </div>
        </div>
      </div>

      {/* Crisp Cycle & Bottom Detection Telemetry Footer */}
      <div className="p-4 space-y-3 flex-1 flex flex-col justify-between bg-[var(--surface)]">
        <div className="flex items-center justify-between gap-2">
          <span
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <CyclePhaseBadge phase={cyclePhase} compact />
          </span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
            aria-label={`Hồ sơ chu kỳ: ${nameVi}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] group-hover:translate-x-0.5 transition-transform whitespace-nowrap shrink-0 rounded focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            <span aria-hidden="true">Hồ sơ chu kỳ</span>
            <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 pt-2.5 border-t border-[var(--border)] text-xs">
          <div className="min-w-0">
            <span className="block text-[11px] text-[var(--faint)] truncate">Bottom Score</span>
            <span className={`block font-semibold tabular-nums truncate ${getBottomScoreAccent(bottomClassification)}`}>
              {bottomScore !== null ? `${bottomScore}/100` : 'Chưa chấm'}
            </span>
          </div>
          <div className="min-w-0 text-center">
            <span className="block text-[11px] text-[var(--faint)] truncate">Biến động 1M</span>
            <span
              className={`block font-semibold tabular-nums truncate ${
                returns.m1 === null
                  ? 'text-[var(--text)]/45'
                  : returns.m1 >= 0
                    ? 'text-[var(--positive)]'
                    : 'text-[var(--negative)]'
              }`}
            >
              {returns.m1 !== null ? `${returns.m1 >= 0 ? '+' : ''}${returns.m1.toFixed(2)}%` : '—'}
            </span>
          </div>
          <div className="min-w-0 text-right">
            <span className="block text-[11px] text-[var(--faint)] truncate">Cung–Cầu</span>
            <span className="block text-[var(--text)] tabular-nums truncate">
              {item.supplyDemandBias === 'DATA_UNAVAILABLE' ? '—' : item.supplyDemandBias}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
