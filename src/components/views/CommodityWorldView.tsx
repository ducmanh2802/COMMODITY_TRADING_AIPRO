import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, ChevronDown, RefreshCw, Search } from 'lucide-react';
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
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-[var(--text-strong)] tracking-tight text-balance">
            Giá hàng hóa
          </h2>
          <details className="mt-1 text-xs text-[var(--muted)]">
            <summary className="cursor-pointer select-none text-[var(--accent)]">Xem giải thích</summary>
            <p className="mt-1 max-w-prose">
              Thế giới Hàng hóa Sống (Living Commodity World): danh mục {overview?.commodities.length ?? 21} hàng hóa phái sinh MXV &amp; quốc tế · tự động xếp các hàng hóa tiềm năng (điểm cơ hội &amp; chu kỳ cao) lên đầu danh sách.
            </p>
          </details>
        </div>

        <button
          type="button"
          onClick={() => void fetchWorld()}
          disabled={loading}
          title="Làm mới Chu kỳ"
          aria-label="Làm mới Chu kỳ"
          className="inline-flex items-center px-3 py-2 bg-[var(--surface)] hover:bg-[var(--surface-2)] border border-[var(--border)] rounded-md text-xs font-medium text-[var(--text)] whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
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
            {mxvOnly ? 'Đang lọc MXV' : 'Chỉ MXV'}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
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
  const m1 = returns.m1;
  // Change bar: |1M| capped at 30% fills half the track; blue = up, apricot = down.
  const barPct = m1 === null ? 0 : Math.min(Math.abs(m1) / 30, 1) * 50;
  const fmt = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

  return (
    <div
      onClick={onSelect}
      className="group relative text-left cursor-pointer shadow-[var(--shadow-card)] hover:border-[var(--accent)]/70 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] overflow-hidden transition-colors flex flex-col"
    >
      <div className="relative h-20 w-full overflow-hidden">
        <CommodityHeroImage
          symbol={instrument.id}
          name={nameVi}
          category={instrument.category}
          priority={priority}
          className="w-full h-full"
          imgClassName="transition-transform duration-300 group-hover:scale-[1.04]"
        />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)]/60 to-[var(--bg)]/40" />
        <div className="absolute top-2 right-2">
          <span className="inline-flex items-center bg-[var(--bg)]/85 backdrop-blur-sm px-1.5 py-0.5 rounded border border-white/15">
            <DataStatusBadge status={quote.status} compact />
          </span>
        </div>
        <div className="absolute bottom-2 left-3 right-3 flex items-end justify-between gap-3">
          <h3 className="text-base font-semibold text-[var(--text-strong)] tracking-tight truncate min-w-0">{nameVi}</h3>
          <p
            title={quote.price === null ? 'DATA_UNAVAILABLE' : undefined}
            className={`shrink-0 font-semibold tabular-nums text-right ${quote.price !== null ? 'text-base text-[var(--text-strong)]' : 'text-xs text-[var(--text)]/85'}`}
          >
            {quote.price !== null ? quote.price.toFixed(2) : 'Chưa có giá'}
          </p>
        </div>
      </div>

      <div className="px-3 py-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <CyclePhaseBadge phase={cyclePhase} compact />
          </span>
          <span
            title={`Bottom Score: ${bottomScore !== null ? `${bottomScore}/100` : 'Chưa chấm'}`}
            className={`text-xs font-semibold tabular-nums ${getBottomScoreAccent(bottomClassification)}`}
          >
            {bottomScore !== null ? bottomScore : '—'}
          </span>
        </div>

        <div className="flex items-center gap-2" title="Biến động 1 tháng">
          <div
            className="relative h-1.5 flex-1 rounded-full bg-[var(--surface-3)]"
            role="img"
            aria-label={m1 === null ? 'Biến động 1M: chưa có' : `Biến động 1M ${fmt(m1)}`}
          >
            <span aria-hidden="true" className="absolute -top-0.5 -bottom-0.5 left-1/2 w-px bg-[var(--border)]" />
            {m1 !== null && (
              <span
                aria-hidden="true"
                className={`absolute inset-y-0 rounded-full ${m1 >= 0 ? 'bg-[var(--positive)]' : 'bg-[var(--negative)]'}`}
                style={m1 >= 0 ? { left: '50%', width: `${barPct}%` } : { right: '50%', width: `${barPct}%` }}
              />
            )}
          </div>
          <span className={`text-xs font-semibold tabular-nums w-16 text-right ${m1 === null ? 'text-[var(--muted)]' : m1 >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
            {m1 !== null ? fmt(m1) : '—'}
          </span>
        </div>

        <details onClick={(e) => e.stopPropagation()} className="text-[11px] text-[var(--muted)]">
          <summary
            aria-label={`Chi tiết ${nameVi}`}
            className="cursor-pointer select-none text-[var(--faint)] hover:text-[var(--text)] list-none flex justify-center"
          >
            <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
          </summary>
          <dl className="mt-1.5 space-y-0.5">
            <div><dt className="inline text-[var(--faint)]">Sàn: </dt><dd className="inline font-mono">{instrument.exchange}:{instrument.exchangeSymbol}{mxvCode ? ` · MXV ${mxvCode}` : ''}</dd></div>
            <div><dt className="inline text-[var(--faint)]">Tên: </dt><dd className="inline">{instrument.productName}</dd></div>
            <div><dt className="inline text-[var(--faint)]">Nhóm: </dt><dd className="inline">{visual?.groupVi ?? instrument.category} · {visual?.originTag ?? instrument.exchange}</dd></div>
            <div><dt className="inline text-[var(--faint)]">Đơn vị: </dt><dd className="inline">{quote.price !== null ? quote.unit : 'Chưa có feed'}</dd></div>
            <div><dt className="inline text-[var(--faint)]">Bottom Score: </dt><dd className="inline">{bottomScore !== null ? `${bottomScore}/100` : 'Chưa chấm'}</dd></div>
            <div><dt className="inline text-[var(--faint)]">Biến động 1M: </dt><dd className="inline">{m1 !== null ? fmt(m1) : '—'}</dd></div>
            <div><dt className="inline text-[var(--faint)]">Cung–Cầu: </dt><dd className="inline">{item.supplyDemandBias === 'DATA_UNAVAILABLE' ? '—' : item.supplyDemandBias}</dd></div>
            <div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSelect(); }}
                aria-label={`Hồ sơ chu kỳ: ${nameVi}`}
                className="inline-flex items-center gap-1 pt-1 font-medium text-[var(--accent)]"
              >
                <span aria-hidden="true">Hồ sơ chu kỳ</span> <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
              </button>
            </div>
          </dl>
        </details>
      </div>
    </div>
  );
}
