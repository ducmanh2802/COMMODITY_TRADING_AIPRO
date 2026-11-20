import { useEffect, useState } from 'react';
import { ArrowUpRight, Filter, Radar } from 'lucide-react';
import { useTerminal } from '../../contexts/TerminalContext';
import { COMMODITY_GROUP_LABELS_VI, getCommodityVisual } from '../../shared/data/commodityVisuals';
import type {
  CommodityCycleSummary,
  CommodityGroupFilter,
  CyclePhase,
} from '../../shared/types/cycle';
import { CommodityHeroImage } from '../common/CommodityHeroImage';
import { CyclePhaseBadge, getBottomScoreAccent } from '../common/CyclePhaseBadge';
import { DataStatusBadge } from '../common/DataStatusBadge';
import { fetchJsonWithRetry } from '../../shared/utils/http';
import { sortCommoditiesByPotential } from '../../shared/utils/commoditySort';

export function CycleScannerView() {
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

      const json = await fetchJsonWithRetry<{ commodities?: CommodityCycleSummary[] }>(
        `/api/cycle/scanner?${qs.toString()}`
      );
      setResults(
        Array.isArray(json.commodities) ? sortCommoditiesByPotential(json.commodities) : []
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi quét Cycle Hunter.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void runScan();
  }, [category, phase, minScore, mxvOnly]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight flex items-center gap-2">
            <Radar className="w-5 h-5 text-[#6366F1]" aria-hidden="true" />
            <span>Bộ lọc Săn Chu kỳ &amp; Vùng Đáy (Cycle Hunter Scanner)</span>
          </h1>
          <p className="text-sm text-[#E5E7EB]/65 mt-1">
            Tự động xếp các hàng hóa tiềm năng nhất (điểm cơ hội &amp; tạo đáy 0–100) lên đầu danh sách.
          </p>
        </div>
      </div>

      {/* Filter Controls */}
      <section
        aria-label="Bộ lọc Cycle Scanner"
        className="bg-[#111622] border border-[#263244] rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <div className="space-y-1">
          <label htmlFor="scan-group" className="text-xs text-[#E5E7EB]/60 flex items-center gap-1">
            <Filter className="w-3 h-3" aria-hidden="true" />
            <span>Nhóm hàng hóa</span>
          </label>
          <select
            id="scan-group"
            value={category}
            onChange={(e) => setCategory(e.target.value as CommodityGroupFilter)}
            className="w-full bg-[#0B0E14] border border-[#263244] rounded px-2.5 py-2 text-xs text-white focus:outline-none focus:border-[#6366F1]"
          >
            {(['ALL', 'AGRICULTURE', 'SOFT_COMMODITIES', 'METALS', 'ENERGY'] as CommodityGroupFilter[]).map((g) => (
              <option key={g} value={g}>
                {COMMODITY_GROUP_LABELS_VI[g]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="scan-phase" className="text-xs text-[#E5E7EB]/60 block">
            Giai đoạn Chu kỳ
          </label>
          <select
            id="scan-phase"
            value={phase}
            onChange={(e) => setPhase(e.target.value as 'ALL' | CyclePhase)}
            className="w-full bg-[#0B0E14] border border-[#263244] rounded px-2.5 py-2 text-xs text-white focus:outline-none focus:border-[#6366F1]"
          >
            <option value="ALL">Tất cả giai đoạn</option>
            <option value="PHASE_1_ACCUMULATION">Giai đoạn 1 · Tích lũy đáy</option>
            <option value="PHASE_2_EARLY_RECOVERY">Giai đoạn 2 · Phục hồi sớm</option>
            <option value="PHASE_3_MARKUP">Giai đoạn 3 · Tăng trưởng</option>
            <option value="PHASE_4_DISTRIBUTION">Giai đoạn 4 · Phân phối</option>
            <option value="DATA_UNAVAILABLE">Chưa có dữ liệu (DATA_UNAVAILABLE)</option>
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="scan-score" className="text-xs text-[#E5E7EB]/60 block">
            Bottom Score tối thiểu ({minScore})
          </label>
          <input
            id="scan-score"
            type="range"
            min={0}
            max={85}
            step={5}
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            className="w-full accent-[#6366F1]"
          />
        </div>

        <div className="flex items-end">
          <button
            type="button"
            onClick={() => setMxvOnly((p) => !p)}
            aria-pressed={mxvOnly}
            className={`w-full px-3 py-2 rounded border text-xs font-medium transition-colors whitespace-nowrap ${
              mxvOnly
                ? 'bg-[#6366F1] border-[#6366F1] text-white'
                : 'bg-[#0B0E14] border-[#263244] text-[#E5E7EB]/80 hover:text-white'
            }`}
          >
            {mxvOnly ? 'Đang lọc: Liên thông MXV' : 'Bao gồm cả MXV & Quốc tế'}
          </button>
        </div>
      </section>

      {error && (
        <div className="bg-[#111622] border border-[#EF4444]/40 rounded-lg p-4 text-xs text-[#EF4444]">
          {error}
        </div>
      )}

      {/* Scanner Results Table */}
      <section className="bg-[#111622] border border-[#263244] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#263244] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">
            Kết quả Xếp hạng Cơ hội Chu kỳ ({results.length})
          </h2>
          <span className="text-[11px] font-mono text-[#E5E7EB]/50">
            Nhấp bất kỳ hàng hóa để mở Hồ sơ Chu kỳ &amp; AI Verdict
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#263244] text-xs text-[#E5E7EB]/55">
                <th className="py-2.5 px-4 font-medium">Hàng hóa</th>
                <th className="py-2.5 px-3 font-medium">Giai đoạn Chu kỳ</th>
                <th className="py-2.5 px-3 font-medium text-right">Bottom Score</th>
                <th className="py-2.5 px-3 font-medium text-right">Percentile</th>
                <th className="py-2.5 px-3 font-medium text-right">Giá hiện tại</th>
                <th className="py-2.5 px-3 font-medium">Trạng thái</th>
                <th className="py-2.5 px-4 font-medium text-right">Chi tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#263244]/70 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[#E5E7EB]/55">
                    Đang tính toán ma trận chu kỳ 20 hàng hóa...
                  </td>
                </tr>
              ) : results.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[#E5E7EB]/55">
                    Không có hàng hóa nào thỏa mãn điều kiện lọc (Lưu ý: các mã thiếu lịch sử OHLCV có Bottom Score = null và sẽ ẩn khi chọn Bottom Score &gt; 0).
                  </td>
                </tr>
              ) : (
                results.map((item) => {
                  const visual = getCommodityVisual(item.instrument.id);
                  const nameVi = visual?.nameVi ?? item.instrument.commodityProfile?.vietnameseName ?? item.instrument.productName;
                  return (
                    <tr
                      key={item.instrument.id}
                      onClick={() => openInstrumentIn(item.instrument.exchangeSymbol, 'commodity-profile')}
                      className="hover:bg-[#172033]/60 transition-colors cursor-pointer"
                    >
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-3">
                          <CommodityHeroImage
                            symbol={item.instrument.id}
                            name={nameVi}
                            category={item.instrument.category}
                            className="w-16 h-9 rounded shrink-0 border border-[#263244]"
                          />
                          <div className="min-w-0">
                            <p className="font-medium text-white truncate">{nameVi}</p>
                            <p className="text-[11px] font-mono text-[#E5E7EB]/50">
                              {item.instrument.exchange}:{item.instrument.exchangeSymbol}
                              {item.instrument.mxvMapping?.mxvSymbol
                                ? ` · MXV ${item.instrument.mxvMapping.mxvSymbol}`
                                : ''}
                            </p>
                          </div>
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
                      <td className="py-2.5 px-3 text-right font-mono text-white tabular-nums">
                        {item.quote.price !== null ? item.quote.price.toFixed(2) : 'DATA_UNAVAILABLE'}
                      </td>
                      <td className="py-2.5 px-3">
                        <DataStatusBadge status={item.quote.status} compact />
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openInstrumentIn(item.instrument.exchangeSymbol, 'commodity-profile');
                          }}
                          className="inline-flex items-center gap-1 text-xs text-[#6366F1] hover:underline whitespace-nowrap"
                        >
                          <span>Mở</span>
                          <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
