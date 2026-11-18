import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, CloudDownload, Compass, FileText, Radar, ShieldAlert } from 'lucide-react';
import { useTerminal } from '../../contexts/TerminalContext';
import { getCommodityVisual } from '../../shared/data/commodityVisuals';
import type { CycleMarketOverview, PerformanceHorizonReturns } from '../../shared/types/cycle';
import { formatTimestampInZone } from '../../shared/utils/time';
import { CommodityHeroImage } from '../common/CommodityHeroImage';
import { CyclePhaseBadge, getBottomScoreAccent } from '../common/CyclePhaseBadge';
import { DataStatusBadge } from '../common/DataStatusBadge';
import { safeReadJson } from '../../shared/utils/http';

interface OverviewTechSummary {
  status: string;
  mainTrend: string;
  marketRegime: string;
  atr14: number | null;
  rsi14: number | null;
}

type HeatmapHorizon = 'w1' | 'm1' | 'm3' | 'm6' | 'y1';

const HEATMAP_LABELS: Record<HeatmapHorizon, string> = {
  w1: '1W',
  m1: '1M',
  m3: '3M',
  m6: '6M',
  y1: '1Y',
};

const SPOTLIGHT_PRIORITY_IDS = [
  'ICE:RC',
  'MXV:JRU',
  'CBOT:ZC',
  'CBOT:ZS',
  'NYMEX:CL',
  'COMEX:GC',
];

function getHeatmapTone(val: number | null): string {
  if (val === null) return 'bg-[#0B0E14] border-[#263244] text-[#E5E7EB]/45';
  if (val >= 5) return 'bg-[#22C55E]/20 border-[#22C55E]/40 text-[#22C55E]';
  if (val > 0) return 'bg-[#22C55E]/10 border-[#22C55E]/25 text-[#22C55E]';
  if (val <= -5) return 'bg-[#EF4444]/20 border-[#EF4444]/40 text-[#EF4444]';
  if (val < 0) return 'bg-[#EF4444]/10 border-[#EF4444]/25 text-[#EF4444]';
  return 'bg-[#0B0E14] border-[#263244] text-[#E5E7EB]/75';
}

export function OverviewDashboard() {
  const {
    instruments,
    quotesBySymbol,
    providers,
    datasets,
    marketScope,
    timeframe,
    tradingStyle,
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

  const [techSummary, setTechSummary] = useState<OverviewTechSummary | null>(null);
  const [cycleOverview, setCycleOverview] = useState<CycleMarketOverview | null>(null);
  const [heatmapHorizon, setHeatmapHorizon] = useState<HeatmapHorizon>('m1');
  const [macroCount, setMacroCount] = useState(0);
  const [newsCount, setNewsCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function loadSecondary() {
      try {
        const [techRes, fundRes, cycleRes] = await Promise.all([
          fetch(`/api/technical/${encodeURIComponent(selectedSymbol)}?timeframe=${timeframe}`),
          fetch('/api/fundamental/records'),
          fetch('/api/cycle/overview'),
        ]);
        if (cancelled) return;
        if (techRes.ok) {
          const tj = await safeReadJson<{ snapshot?: { status?: string; marketStructure?: { mainTrend?: string; marketRegime?: string }; atr14?: number | null; rsi14?: number | null } }>(techRes);
          const snap = tj.snapshot;
          setTechSummary({
            status: snap?.status ?? 'UNAVAILABLE',
            mainTrend: snap?.marketStructure?.mainTrend ?? 'UNCERTAIN',
            marketRegime: snap?.marketStructure?.marketRegime ?? 'INSUFFICIENT_DATA',
            atr14: snap?.atr14 ?? null,
            rsi14: snap?.rsi14 ?? null,
          });
        }
        if (fundRes.ok) {
          const fj = await safeReadJson<{ records?: unknown[]; news?: unknown[] }>(fundRes);
          setMacroCount(Array.isArray(fj.records) ? fj.records.length : 0);
          setNewsCount(Array.isArray(fj.news) ? fj.news.length : 0);
        }
        if (cycleRes.ok) {
          const cj = await safeReadJson<CycleMarketOverview>(cycleRes);
          setCycleOverview(cj);
        }
      } catch {
        // Ignore transient background fetch error on overview summary
      }
    }
    void loadSecondary();
    return () => {
      cancelled = true;
    };
  }, [selectedSymbol, timeframe, datasets.length]);

  const filteredInstruments = instruments.filter((inst) => {
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
  });

  const activeInstrument =
    instruments.find((i) => i.exchangeSymbol === selectedSymbol) ?? filteredInstruments[0] ?? null;

  const watchlistPreview = filteredInstruments.slice(0, 10);
  const connectedProviderCount = providers.filter(
    (p) => p.connectionState === 'CONNECTED'
  ).length;
  const overallStatus = health?.capabilities.marketDataOverallStatus ?? 'UNAVAILABLE';

  const spotlightCommodities = (() => {
    const list = cycleOverview?.commodities ?? [];
    const prioritized = SPOTLIGHT_PRIORITY_IDS.map((id) =>
      list.find((c) => c.instrument.id === id)
    ).filter((c): c is NonNullable<typeof c> => Boolean(c));
    return prioritized.length > 0 ? prioritized : list.slice(0, 6);
  })();

  const breadth = cycleOverview?.marketBreadth;

  return (
    <div className="space-y-6">
      {/* Header & Slogan */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-mono text-[#6366F1]">
            COMMODITY TRADING AI PRO · CYCLE HUNTER
          </p>
          <h1 className="text-xl sm:text-2xl font-semibold text-white tracking-tight mt-0.5 text-balance">
            Understand the Cycle. Catch the Opportunity.
          </h1>
          <p className="text-xs text-[#E5E7EB]/65 mt-1">
            Scope: {marketScope} · Active: {activeInstrument?.commodityProfile?.vietnameseName ?? selectedSymbol} ({selectedSymbol}) · TF: {timeframe} · {tradingStyle}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setActiveModule('commodity-world')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#172033] hover:bg-[#172033]/80 border border-[#263244] rounded-md text-xs font-medium text-white whitespace-nowrap"
          >
            <Compass className="w-3.5 h-3.5 text-[#6366F1]" aria-hidden="true" />
            <span>Thế giới Hàng hóa (20)</span>
          </button>
          <button
            type="button"
            onClick={() => void syncProviderFeeds({ timeframe })}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#6366F1] hover:bg-[#6366F1]/90 rounded-md text-xs font-medium text-white disabled:opacity-50 whitespace-nowrap"
          >
            <CloudDownload className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{syncing ? 'Syncing...' : 'Sync API Feeds'}</span>
          </button>
          <DataStatusBadge status={overallStatus} />
        </div>
      </div>

      {loadError && (
        <div className="bg-[#111622] border border-[#EF4444]/40 rounded-lg p-4 text-sm text-[#EF4444]">
          Backend synchronization error: {loadError}
        </div>
      )}

      {lastSyncSummary && (
        <section
          aria-label="Provider Sync Summary"
          className="bg-[#111622] border border-[#6366F1]/40 rounded-lg p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs"
        >
          <div className="space-y-1">
            <p className="font-mono font-semibold text-white">
              Sync Feeds: +{lastSyncSummary.totalCandlesDatasetsAdded} chuỗi OHLCV · +{lastSyncSummary.totalMacroAdded} bản ghi vĩ mô
            </p>
            <p className="text-[#E5E7EB]/70">
              {lastSyncSummary.totalCandlesDatasetsAdded === 0 && lastSyncSummary.totalMacroAdded === 0
                ? 'Chưa có API key hoặc YAHOO_ENABLED=true được cấu hình trên server Secrets nên chưa thể kéo giá tự động. Bạn có thể cấu hình Secrets hoặc import CSV lịch sử.'
                : lastSyncSummary.outcomes
                    .filter((o) => o.status === 'CONNECTED')
                    .map((o) => `${o.providerId}: ${o.message}`)
                    .join(' · ') || 'Đã hoàn tất đồng bộ các nguồn đã bật.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setActiveModule('data-health')}
              className="px-3 py-1.5 bg-[#172033] hover:bg-[#172033]/80 border border-[#263244] rounded text-xs font-medium text-white whitespace-nowrap"
            >
              Mở Data Health &amp; Secrets
            </button>
            <button
              type="button"
              onClick={() => setActiveModule('data-import')}
              className="px-3 py-1.5 bg-[#6366F1] hover:bg-[#6366F1]/90 rounded text-xs font-medium text-white whitespace-nowrap"
            >
              Import CSV D1
            </button>
          </div>
        </section>
      )}

      {/* A. Market Overview Breadth Strip */}
      <section aria-label="A. Market Overview Cycle Breadth" className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
        <div className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-1">
          <p className="text-xs text-[#E5E7EB]/60">Tăng / Giảm (1W)</p>
          <p className="text-xl font-mono font-semibold text-white tabular-nums">
            {breadth ? `${breadth.risingCount} ↑ / ${breadth.fallingCount} ↓` : '—'}
          </p>
          <p className="text-[11px] text-[#E5E7EB]/50">
            Có dữ liệu giá: {breadth?.withPriceData ?? 0}/{breadth?.totalTracked ?? 20}
          </p>
        </div>

        <div className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-1">
          <p className="text-xs text-[#E5E7EB]/60">Vùng Tích lũy Đáy</p>
          <p className="text-xl font-mono font-semibold text-[#38BDF8] tabular-nums">
            {breadth ? breadth.accumulationCount : '—'}
          </p>
          <p className="text-[11px] text-[#E5E7EB]/50">Phase 1 · Accumulation</p>
        </div>

        <div className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-1">
          <p className="text-xs text-[#E5E7EB]/60">Ứng viên Tạo đáy (&gt;=70)</p>
          <p className="text-xl font-mono font-semibold text-[#22C55E] tabular-nums">
            {breadth ? breadth.bottomCandidateCount : '—'}
          </p>
          <button
            type="button"
            onClick={() => setActiveModule('cycle-hunter')}
            className="text-[11px] text-[#6366F1] hover:underline"
          >
            Mở Cycle Hunter Scanner →
          </button>
        </div>

        <div className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-1">
          <p className="text-xs text-[#E5E7EB]/60">Xu hướng Tăng (Markup)</p>
          <p className="text-xl font-mono font-semibold text-[#6366F1] tabular-nums">
            {breadth ? breadth.markupCount : '—'}
          </p>
          <p className="text-[11px] text-[#E5E7EB]/50">Phase 3 · Uptrend</p>
        </div>

        <div className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-1 col-span-2 sm:col-span-1">
          <p className="text-xs text-[#E5E7EB]/60">Vùng Phân phối / Rủi ro</p>
          <p className="text-xl font-mono font-semibold text-[#F59E0B] tabular-nums">
            {breadth ? breadth.distributionCount : '—'}
          </p>
          <p className="text-[11px] text-[#E5E7EB]/50">
            Thiếu lịch sử: {breadth?.unavailableCount ?? 20}
          </p>
        </div>
      </section>

      {/* Living Commodity World Spotlight Cards */}
      <section aria-label="Living Commodity World Spotlight" className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-white">
              Thế giới Hàng hóa Sống — Tâm điểm Việt Nam &amp; Toàn cầu
            </h2>
            <p className="text-xs text-[#E5E7EB]/55">
              Nhấp vào từng hàng hóa để mở Hồ sơ Chu kỳ, 8 Câu hỏi AI Verdict và Kế hoạch Giao dịch.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveModule('commodity-world')}
            className="inline-flex items-center gap-1 text-xs font-medium text-[#6366F1] hover:underline whitespace-nowrap self-start sm:self-auto"
          >
            <span>Xem toàn bộ 20 Hàng hóa</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {spotlightCommodities.map((item) => {
            const visual = getCommodityVisual(item.instrument.id);
            const nameVi = visual?.nameVi ?? item.instrument.commodityProfile?.vietnameseName ?? item.instrument.productName;
            return (
              <button
                key={item.instrument.id}
                type="button"
                onClick={() => openInstrumentIn(item.instrument.exchangeSymbol, 'commodity-profile')}
                className="group text-left bg-[#111622] border border-[#263244] hover:border-[#6366F1]/70 rounded-lg overflow-hidden transition-all duration-200 focus-visible:outline-2 focus-visible:outline-[#6366F1]"
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
                    className="absolute inset-0 bg-gradient-to-t from-[#0B0E14] via-[#0B0E14]/60 to-[#0B0E14]/50"
                  />
                  <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono text-white/95 bg-[#0B0E14]/85 backdrop-blur-sm px-2 py-0.5 rounded border border-white/15">
                      {item.instrument.exchangeSymbol}
                      {item.instrument.mxvMapping?.mxvSymbol ? ` · MXV ${item.instrument.mxvMapping.mxvSymbol}` : ''}
                    </span>
                    <span className="inline-flex items-center bg-[#0B0E14]/85 backdrop-blur-sm px-2 py-0.5 rounded border border-white/15 shadow-sm">
                      <DataStatusBadge status={item.quote.status} compact />
                    </span>
                  </div>
                  <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-end justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] text-[#E5E7EB]/75 truncate">{visual?.groupVi ?? item.instrument.category}</p>
                      <h3 className="text-base font-semibold text-white truncate">{nameVi}</h3>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-mono font-semibold text-white tabular-nums">
                        {item.quote.price !== null ? item.quote.price.toFixed(2) : 'DATA_UNAVAILABLE'}
                      </p>
                      <p className="text-[10px] font-mono text-[#E5E7EB]/65">
                        {item.bottomScore !== null ? `Bottom ${item.bottomScore}/100` : 'Chưa chấm điểm'}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
                  <CyclePhaseBadge phase={item.cyclePhase} compact />
                  <span className="inline-flex items-center gap-1 text-[#6366F1] font-medium whitespace-nowrap">
                    <span>Phân tích</span>
                    <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* B. AI Opportunity Radar (Top 10) & D. Economic Cycle Tracker */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section
          aria-label="B. AI Opportunity Radar Top 10"
          className="xl:col-span-2 bg-[#111622] border border-[#263244] rounded-lg overflow-hidden flex flex-col"
        >
          <div className="px-4 py-3 border-b border-[#263244] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Radar className="w-4 h-4 text-[#6366F1]" aria-hidden="true" />
              <div>
                <h2 className="text-sm font-semibold text-white">B. AI Opportunity Radar (Top 10)</h2>
                <p className="text-xs text-[#E5E7EB]/55">
                  Xếp hạng đa nhân tố: Định giá, Giai đoạn Chu kỳ, Điểm Đáy, Cung–Cầu &amp; Vị thế COT.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveModule('research-report')}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#6366F1] hover:underline whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Báo cáo Ngày</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#263244] text-xs text-[#E5E7EB]/55">
                  <th className="py-2.5 px-4 font-medium">Hàng hóa</th>
                  <th className="py-2.5 px-3 font-medium">Giai đoạn Chu kỳ</th>
                  <th className="py-2.5 px-3 font-medium text-right">Bottom Score</th>
                  <th className="py-2.5 px-3 font-medium text-right">Percentile</th>
                  <th className="py-2.5 px-4 font-medium text-right">Giá / Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#263244]/70 text-xs">
                {(cycleOverview?.opportunityRadar ?? []).map((item) => {
                  const nameVi = getCommodityVisual(item.instrument.id)?.nameVi ?? item.instrument.productName;
                  return (
                    <tr
                      key={item.instrument.id}
                      onClick={() => openInstrumentIn(item.instrument.exchangeSymbol, 'commodity-profile')}
                      className="hover:bg-[#172033]/50 transition-colors cursor-pointer"
                    >
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-white">{nameVi}</div>
                        <div className="text-[11px] font-mono text-[#E5E7EB]/50">
                          {item.instrument.exchange}:{item.instrument.exchangeSymbol}
                          {item.instrument.mxvMapping?.mxvSymbol ? ` · MXV ${item.instrument.mxvMapping.mxvSymbol}` : ''}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <CyclePhaseBadge phase={item.cyclePhase} compact />
                      </td>
                      <td className={`py-2.5 px-3 text-right font-mono font-semibold tabular-nums ${getBottomScoreAccent(item.bottomClassification)}`}>
                        {item.bottomScore !== null ? `${item.bottomScore}/100` : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-[#E5E7EB]/75 tabular-nums">
                        {item.percentile10Y !== null ? `${item.percentile10Y.toFixed(0)}%` : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-[#E5E7EB]/85 tabular-nums">
                        {item.quote.price !== null ? `${item.quote.price.toFixed(2)} ${item.quote.currency}` : 'DATA_UNAVAILABLE'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* D. Economic Cycle Tracker */}
        <section
          aria-label="D. Economic Cycle Tracker"
          className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-3"
        >
          <div className="flex items-center justify-between gap-2 border-b border-[#263244] pb-2.5">
            <div>
              <h2 className="text-sm font-semibold text-white">D. Economic Cycle Tracker</h2>
              <p className="text-xs text-[#E5E7EB]/55">DXY, Fed Funds, 10Y Yield, CPI &amp; Hàng hóa chuẩn</p>
            </div>
            <button
              type="button"
              onClick={() => setActiveModule('data-health')}
              className="text-xs text-[#6366F1] hover:underline whitespace-nowrap"
            >
              FRED / API
            </button>
          </div>

          <ul className="divide-y divide-[#263244]/70 text-xs">
            {(cycleOverview?.macroTracker ?? []).map((m) => (
              <li key={m.id} className="py-2.5 space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-white">{m.labelVi}</span>
                  <span className="font-mono text-[#E5E7EB] tabular-nums">
                    {m.value !== null ? `${m.value} ${m.unit}` : 'DATA_UNAVAILABLE'}
                  </span>
                </div>
                <p className="text-[11px] text-[#E5E7EB]/55">{m.cycleImplication}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* C. Commodity Performance Heatmap */}
      <section aria-label="C. Commodity Performance Heatmap" className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">C. Commodity Performance Heatmap (Hiệu suất Chu kỳ)</h2>
            <p className="text-xs text-[#E5E7EB]/55">
              Hiển thị phần trăm biến động thực từ dữ liệu D1 đã nạp (hiển thị — khi chưa đủ lịch sử khung thời gian).
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#0B0E14] border border-[#263244] rounded-md self-start sm:self-auto">
            {(Object.keys(HEATMAP_LABELS) as HeatmapHorizon[]).map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setHeatmapHorizon(h)}
                className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                  heatmapHorizon === h ? 'bg-[#6366F1] text-white' : 'text-[#E5E7EB]/70 hover:text-white'
                }`}
              >
                {HEATMAP_LABELS[h]}
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
                className={`text-left border rounded-md p-3 transition-colors hover:border-[#6366F1] ${getHeatmapTone(val)}`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-semibold text-white truncate">{nameVi}</span>
                  <span className="text-[10px] font-mono text-[#E5E7EB]/60">{item.instrument.exchangeSymbol}</span>
                </div>
                <p className="text-base font-mono font-semibold tabular-nums mt-1">
                  {val !== null ? `${val >= 0 ? '+' : ''}${val.toFixed(2)}%` : '—'}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Fail-Closed Market Data Integrity Banner */}
      <section
        aria-label="Market Data Integrity Notice"
        className="bg-[#111622] border border-[#263244] rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div className="flex items-start gap-3">
          <ShieldAlert
            className={`w-5 h-5 shrink-0 mt-0.5 ${
              overallStatus === 'UNAVAILABLE' ? 'text-[#F59E0B]' : 'text-[#6366F1]'
            }`}
            aria-hidden="true"
          />
          <div className="space-y-1">
            <p className="text-sm font-medium text-white font-mono">
              {overallStatus === 'UNAVAILABLE'
                ? 'DATA_UNAVAILABLE — No verified market data available.'
                : overallStatus === 'CURRENT'
                  ? `LIVE_FEED_ACTIVE — ${connectedProviderCount} provider adapter(s) connected & ${datasets.length} OHLCV series loaded.`
                  : overallStatus === 'DELAYED'
                    ? `DELAYED_FEED_ACTIVE — ${connectedProviderCount} provider adapter(s) connected (delayed quotes) & ${datasets.length} OHLCV series loaded.`
                    : `HISTORICAL_MODE — ${datasets.length} validated OHLCV series loaded (not live tick quotes).`}
            </p>
            <p className="text-xs text-[#E5E7EB]/65 leading-relaxed">
              {overallStatus === 'UNAVAILABLE'
                ? 'Configure TWELVEDATA_API_KEY, FMP_API_KEY, COMMODITIES_API_KEY, ALPHAVANTAGE_API_KEY, EIA_API_KEY, FRED_API_KEY, or MXV_API_KEY in AI Studio Settings > Secrets, or import historical CSV datasets.'
                : 'Cycle Engine, Bottom Detection Engine, deterministic strategy signals, and AI Verdict operate strictly on verified API/CSV feeds.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveModule('data-health')}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#172033] hover:bg-[#172033]/80 border border-[#263244] rounded-md text-xs font-medium text-[#E5E7EB] whitespace-nowrap"
          >
            <span>API Secrets &amp; CSV</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </section>

      {/* Primary Two-Column Terminal Grid: Watchlist + Data Health */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section
          aria-label="Watchlist Preview"
          className="xl:col-span-2 bg-[#111622] border border-[#263244] rounded-lg flex flex-col"
        >
          <div className="px-4 py-3 border-b border-[#263244] flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">
                {marketScope === 'MXV' ? 'Vietnam MXV Commodities Watchlist' : 'Watchlist'}
              </h2>
              <p className="text-xs text-[#E5E7EB]/55">
                Robusta, Arabica, Cao su RSS3, Nông sản, Kim loại &amp; Năng lượng liên thông MXV
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveModule('markets')}
              className="text-xs font-medium text-[#6366F1] hover:text-[#6366F1]/80 whitespace-nowrap"
            >
              Open Full Market Watch
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#263244] text-xs text-[#E5E7EB]/55">
                  <th className="py-2.5 px-4 font-medium">Commodity</th>
                  <th className="py-2.5 px-3 font-medium">Exchange</th>
                  <th className="py-2.5 px-3 font-medium">MXV Code</th>
                  <th className="py-2.5 px-3 font-medium text-right">Last Price</th>
                  <th className="py-2.5 px-4 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#263244]/70 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-8 px-4 text-center text-[#E5E7EB]/55">
                      Loading instrument master...
                    </td>
                  </tr>
                ) : watchlistPreview.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 px-4 text-center text-[#E5E7EB]/55">
                      No instruments match the current filter.
                    </td>
                  </tr>
                ) : (
                  watchlistPreview.map((inst) => {
                    const quote = quotesBySymbol[inst.exchangeSymbol];
                    return (
                      <tr
                        key={inst.id}
                        onClick={() => openInstrumentIn(inst.exchangeSymbol, 'commodity-profile')}
                        className="hover:bg-[#172033]/50 transition-colors cursor-pointer"
                      >
                        <td className="py-2.5 px-4">
                          <div className="font-medium text-white">
                            {inst.commodityProfile?.vietnameseName ?? inst.productName}
                          </div>
                          <div className="text-[11px] text-[#E5E7EB]/50 font-mono">
                            {inst.exchangeSymbol} · {inst.productName}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[#E5E7EB]/85">
                          {inst.exchange}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[#E5E7EB]/70">
                          {inst.mxvMapping?.mxvSymbol ?? '—'}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-right tabular-nums text-[#E5E7EB]/60">
                          {quote?.price !== null && quote?.price !== undefined
                            ? `${quote.price.toFixed(2)} ${quote.currency}`
                            : 'DATA_UNAVAILABLE'}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <div className="inline-flex justify-end">
                            <DataStatusBadge status={quote?.status ?? 'UNAVAILABLE'} compact />
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

        <div className="space-y-6">
          <section
            aria-label="Data Source Health Summary"
            className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-white">Data Source Health</h2>
              <button
                type="button"
                onClick={() => setActiveModule('data-health')}
                className="text-xs text-[#6366F1] hover:text-[#6366F1]/80 whitespace-nowrap"
              >
                API Keys &amp; Details
              </button>
            </div>
            <ul className="divide-y divide-[#263244]/70 text-xs">
              {providers.slice(0, 7).map((provider) => (
                <li
                  key={provider.providerId}
                  className="py-2 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-[#E5E7EB] truncate">{provider.name}</p>
                    <p className="text-[11px] font-mono text-[#E5E7EB]/45">
                      {provider.exchanges.join(', ')}
                    </p>
                  </div>
                  <DataStatusBadge status={provider.dataStatus} compact />
                </li>
              ))}
            </ul>
          </section>

          <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Vietnam Session Calendar &amp; Macro</h2>
              <button
                type="button"
                onClick={() => setActiveModule('news')}
                className="text-xs text-[#6366F1] hover:underline"
              >
                Open Calendar
              </button>
            </div>
            <DataStatusBadge status={macroCount > 0 || newsCount > 0 ? 'HISTORICAL' : 'UNAVAILABLE'} />
            <p className="text-xs text-[#E5E7EB]/65 leading-relaxed">
              {macroCount + newsCount > 0
                ? `${macroCount} sourced macro record(s) and ${newsCount} news record(s) available alongside live Vietnam ICT sessions & holidays.`
                : 'Live Vietnam ICT trading sessions & 2026–2027 MXV/US/UK holiday calendar ready; sync EIA/USDA/FRED for macro actuals.'}
            </p>
            {datasets[0] && (
              <p className="text-[11px] font-mono text-[#E5E7EB]/50">
                Latest sync: {formatTimestampInZone(datasets[0].importedAt, 'Asia/Ho_Chi_Minh')}
              </p>
            )}
            {techSummary && techSummary.status !== 'UNAVAILABLE' && (
              <p className="text-[11px] font-mono text-[#E5E7EB]/70">
                {selectedSymbol}: {techSummary.mainTrend} · {techSummary.marketRegime}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
