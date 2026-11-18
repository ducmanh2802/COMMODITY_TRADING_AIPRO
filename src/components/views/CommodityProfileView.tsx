import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bot,
  Calendar,
  Compass,
  Layers,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import { ColorType, createChart, CandlestickSeries } from 'lightweight-charts';
import { useTerminal } from '../../contexts/TerminalContext';
import { getCommodityVisual } from '../../shared/data/commodityVisuals';
import type {
  CommodityProfileDossier,
  EightQuestionVerdict,
} from '../../shared/types/cycle';
import type { MarketCandle } from '../../shared/types/market';
import { CommodityHeroImage } from '../common/CommodityHeroImage';
import { CyclePhaseBadge, getBottomScoreAccent } from '../common/CyclePhaseBadge';
import { DataStatusBadge } from '../common/DataStatusBadge';
import { safeReadJson } from '../../shared/utils/http';

type ChartHorizon = '1Y' | '3Y' | '5Y' | '10Y' | 'ALL';

const HORIZON_DAYS: Record<ChartHorizon, number> = {
  '1Y': 365,
  '3Y': 365 * 3,
  '5Y': 365 * 5,
  '10Y': 365 * 10,
  ALL: 365 * 50,
};

export function CommodityProfileView() {
  const { selectedSymbol, setSelectedSymbol, instruments, setActiveModule, datasets } = useTerminal();
  const [dossier, setDossier] = useState<CommodityProfileDossier | null>(null);
  const [candles, setCandles] = useState<MarketCandle[]>([]);
  const [horizon, setHorizon] = useState<ChartHorizon>('1Y');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [verdict, setVerdict] = useState<EightQuestionVerdict | null>(null);
  const [verdictLoading, setVerdictLoading] = useState(false);

  const chartContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      setLoading(true);
      setError(null);
      setVerdict(null);
      try {
        const [profRes, candleRes] = await Promise.all([
          fetch(`/api/cycle/profile/${encodeURIComponent(selectedSymbol)}`),
          fetch(`/api/market/candles/${encodeURIComponent(selectedSymbol)}?timeframe=D1`),
        ]);
        if (cancelled) return;
        const profJson = await safeReadJson<CommodityProfileDossier>(profRes);
        setDossier(profJson);

        if (candleRes.ok) {
          const cj = await safeReadJson<{ candles?: MarketCandle[] }>(candleRes);
          setCandles(Array.isArray(cj.candles) ? cj.candles : []);
        } else {
          setCandles([]);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Không thể tải hồ sơ hàng hóa.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [selectedSymbol, datasets.length]);

  const visibleCandles = useMemo(() => {
    if (candles.length === 0) return [];
    const sorted = [...candles].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    if (horizon === 'ALL') return sorted;
    const latestMs = Date.parse(sorted[sorted.length - 1].timestamp);
    const cutoffMs = latestMs - HORIZON_DAYS[horizon] * 86_400_000;
    return sorted.filter((c) => Date.parse(c.timestamp) >= cutoffMs);
  }, [candles, horizon]);

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container || visibleCandles.length === 0) return;

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: '#0B0E14' },
        textColor: '#9CA3AF',
      },
      grid: {
        vertLines: { color: '#172033' },
        horzLines: { color: '#172033' },
      },
      width: container.clientWidth,
      height: 300,
      rightPriceScale: { borderColor: '#263244' },
      timeScale: { borderColor: '#263244' },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#22C55E',
      downColor: '#EF4444',
      borderVisible: false,
      wickUpColor: '#22C55E',
      wickDownColor: '#EF4444',
    });

    const dedup = new Map<string, MarketCandle>();
    for (const c of visibleCandles) {
      dedup.set(c.timestamp.slice(0, 10), c);
    }
    series.setData(
      Array.from(dedup.entries()).map(([time, c]) => ({
        time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );
    chart.timeScale().fitContent();

    const observer = new ResizeObserver(() => {
      if (container) {
        chart.applyOptions({ width: container.clientWidth });
      }
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [visibleCandles]);

  const handleRunVerdict = async () => {
    setVerdictLoading(true);
    try {
      const res = await fetch('/api/cycle/verdict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: selectedSymbol }),
      });
      const json = await safeReadJson<EightQuestionVerdict>(res);
      setVerdict(json);
    } catch (err) {
      setVerdict({
        symbol: selectedSymbol,
        generatedAt: new Date().toISOString(),
        model: 'gemini-4-hydrogen',
        status: 'AI_ERROR',
        message: err instanceof Error ? err.message : 'Lỗi kết nối AI Verdict.',
        answers: null,
      });
    } finally {
      setVerdictLoading(false);
    }
  };

  if (loading && !dossier) {
    return (
      <div className="bg-[#111622] border border-[#263244] rounded-lg p-10 text-center text-sm text-[#E5E7EB]/60">
        Đang tải hồ sơ nghiên cứu chu kỳ hàng hóa ({selectedSymbol})...
      </div>
    );
  }

  if (error || !dossier) {
    return (
      <div className="bg-[#111622] border border-[#EF4444]/40 rounded-lg p-6 space-y-3">
        <p className="text-sm text-[#EF4444]">{error ?? 'Không tìm thấy dữ liệu hồ sơ.'}</p>
        <button
          type="button"
          onClick={() => setActiveModule('commodity-world')}
          className="px-3 py-1.5 bg-[#172033] border border-[#263244] rounded text-xs text-white"
        >
          Quay lại Thế giới Hàng hóa
        </button>
      </div>
    );
  }

  const { summary, timeframes, bottomDetection, tradePlans, supplyDemandMatrix, seasonality, cotSnapshot } = dossier;
  const { instrument, quote, returns } = summary;
  const visual = getCommodityVisual(instrument.id);
  const nameVi = visual?.nameVi ?? instrument.commodityProfile?.vietnameseName ?? instrument.productName;

  return (
    <div className="space-y-6">
      {/* Top Action Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setActiveModule('commodity-world')}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#E5E7EB]/80 hover:text-white self-start"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Quay lại Thế giới Hàng hóa</span>
        </button>

        <div className="flex items-center gap-2">
          <label htmlFor="profile-symbol-select" className="text-xs text-[#E5E7EB]/60 whitespace-nowrap">
            Chuyển mã:
          </label>
          <select
            id="profile-symbol-select"
            value={instrument.exchangeSymbol}
            onChange={(e) => setSelectedSymbol(e.target.value)}
            className="bg-[#111622] border border-[#263244] rounded-md px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#6366F1]"
          >
            {instruments.map((inst) => (
              <option key={inst.id} value={inst.exchangeSymbol}>
                {inst.exchangeSymbol} — {inst.commodityProfile?.vietnameseName ?? inst.productName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Hero Banner */}
      <section className="relative bg-[#111622] border border-[#263244] rounded-lg overflow-hidden">
        <div className="relative h-56 sm:h-64 w-full">
          <CommodityHeroImage
            symbol={instrument.id}
            name={nameVi}
            category={instrument.category}
            className="w-full h-full"
            priority
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-[#0B0E14] via-[#0B0E14]/70 to-[#0B0E14]/50"
          />

          <div className="absolute inset-0 p-5 sm:p-6 flex flex-col justify-between">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-mono text-white/95 bg-[#0B0E14]/85 backdrop-blur-sm px-2.5 py-1 rounded border border-white/15">
                {instrument.exchange}:{instrument.exchangeSymbol}
                {instrument.mxvMapping?.mxvSymbol ? ` · MXV ${instrument.mxvMapping.mxvSymbol}` : ''}
                {visual?.originTag ? ` · ${visual.originTag}` : ''}
              </span>
              <span className="inline-flex items-center bg-[#0B0E14]/85 backdrop-blur-sm px-2.5 py-1 rounded border border-white/15 shadow-sm">
                <DataStatusBadge status={quote.status} />
              </span>
            </div>

            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight text-balance">
                  {nameVi} ({instrument.productName})
                </h1>
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  <CyclePhaseBadge phase={summary.cyclePhase} />
                  <span className="text-xs font-mono text-[#E5E7EB]/75">
                    Phiên ICT: {instrument.commodityProfile?.vietnamTradingSessionsIct ?? 'Theo giờ sàn chuẩn'}
                  </span>
                </div>
              </div>

              <div className="bg-[#0B0E14]/90 border border-[#263244] rounded-lg px-4 py-3 text-right shrink-0 max-w-xs">
                <span className="block text-[11px] text-[#E5E7EB]/55">Giá tham chiếu / Hiện tại</span>
                <span className="block text-2xl font-mono font-semibold text-white tabular-nums">
                  {quote.price !== null ? quote.price.toFixed(2) : 'DATA_UNAVAILABLE'}
                </span>
                {quote.price !== null ? (
                  <span className="block text-[11px] font-mono text-[#E5E7EB]/60">
                    {`${quote.currency} / ${quote.unit} · ${quote.source}`}
                  </span>
                ) : (
                  <div className="mt-1 space-y-1.5">
                    <span className="block text-[11px] text-[#F59E0B]/90 leading-snug">
                      {instrument.exchangeSymbol === 'RC' ||
                      instrument.exchangeSymbol === 'BRN' ||
                      instrument.exchangeSymbol === 'JRU' ||
                      instrument.exchangeSymbol === 'TIO' ||
                      instrument.exchangeSymbol === 'CT'
                        ? 'Chưa có feed API miễn phí cho mã này — cần cấu hình MXV/Commodities API hoặc Import CSV.'
                        : 'Chưa bật feed (YAHOO_ENABLED=true, Twelve Data, FMP) hoặc chưa Import CSV D1.'}
                    </span>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveModule('data-health')}
                        className="text-[11px] font-medium text-[#6366F1] hover:underline whitespace-nowrap"
                      >
                        API &amp; Sync
                      </button>
                      <span className="text-[#E5E7EB]/30" aria-hidden="true">·</span>
                      <button
                        type="button"
                        onClick={() => setActiveModule('data-import')}
                        className="text-[11px] font-medium text-[#38BDF8] hover:underline whitespace-nowrap"
                      >
                        Import CSV
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Multi-Horizon Return Strip */}
        <div className="grid grid-cols-4 sm:grid-cols-8 divide-x divide-[#263244] border-t border-[#263244] bg-[#111622]">
          {(
            [
              ['1W', returns.w1],
              ['1M', returns.m1],
              ['3M', returns.m3],
              ['6M', returns.m6],
              ['1Y', returns.y1],
              ['3Y', returns.y3],
              ['5Y', returns.y5],
              ['10Y', returns.y10],
            ] as Array<[string, number | null]>
          ).map(([label, val]) => (
            <div key={label} className="px-3 py-2.5 text-center">
              <span className="block text-[10px] font-mono text-[#E5E7EB]/50">{label}</span>
              <span
                className={`block text-xs font-mono font-semibold tabular-nums mt-0.5 ${
                  val === null ? 'text-[#E5E7EB]/40' : val >= 0 ? 'text-[#22C55E]' : 'text-[#EF4444]'
                }`}
              >
                {val !== null ? `${val >= 0 ? '+' : ''}${val.toFixed(1)}%` : '—'}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Historical Chart + 8-Question AI Verdict Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Multi-Horizon Price Chart (2/3) */}
        <section className="xl:col-span-2 bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Biểu đồ Chu kỳ Dài hạn (D1 OHLCV)</h2>
              <p className="text-xs text-[#E5E7EB]/55 font-mono tabular-nums">
                {candles.length} nến lịch sử khả dụng · Percentile chu kỳ:{' '}
                {summary.percentile10Y !== null ? `${summary.percentile10Y.toFixed(1)}%` : 'DATA_UNAVAILABLE'}
              </p>
            </div>
            <div className="flex items-center gap-1 bg-[#0B0E14] border border-[#263244] rounded p-1">
              {(['1Y', '3Y', '5Y', '10Y', 'ALL'] as ChartHorizon[]).map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHorizon(h)}
                  className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                    horizon === h ? 'bg-[#6366F1] text-white' : 'text-[#E5E7EB]/70 hover:text-white'
                  }`}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>

          {visibleCandles.length === 0 ? (
            <div className="h-[300px] bg-[#0B0E14] border border-[#263244] rounded flex flex-col items-center justify-center p-6 text-center space-y-3">
              <p className="text-sm font-mono text-[#F59E0B]">
                DATA_UNAVAILABLE — Chưa có chuỗi nến D1 lịch sử cho {instrument.exchangeSymbol}.
              </p>
              <p className="text-xs text-[#E5E7EB]/60 max-w-md">
                Đồng bộ từ Twelve Data / FMP / Yahoo (nếu bật) hoặc import file CSV OHLCV chuẩn để vẽ biểu đồ chu kỳ &amp; kích hoạt chấm điểm Bottom Detection.
              </p>
              <button
                type="button"
                onClick={() => setActiveModule('data-import')}
                className="px-3 py-1.5 bg-[#6366F1] hover:bg-[#6366F1]/90 rounded text-xs font-medium text-white"
              >
                Mở Data Import (CSV)
              </button>
            </div>
          ) : (
            <div ref={chartContainerRef} className="w-full h-[300px] rounded overflow-hidden" />
          )}
        </section>

        {/* 100-Point Bottom Detection Summary Card (1/3) */}
        <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-white">Động cơ Phát hiện Đáy (100 Điểm)</h2>
              <p className="text-xs text-[#E5E7EB]/55 mt-0.5">
                Trọng số quan sát thực tế: {bottomDetection.observedWeight}/100
              </p>
            </div>
            <span
              className={`text-2xl font-mono font-bold tabular-nums ${getBottomScoreAccent(
                bottomDetection.classification
              )}`}
            >
              {bottomDetection.totalScore !== null ? bottomDetection.totalScore : '—'}
            </span>
          </div>

          <div className="bg-[#0B0E14] border border-[#263244] rounded p-3 space-y-1.5">
            <p className={`text-xs font-medium ${getBottomScoreAccent(bottomDetection.classification)}`}>
              {bottomDetection.classificationLabelVi}
            </p>
            <p className="text-xs font-mono text-[#E5E7EB]/75 tabular-nums">
              Model Confidence Score:{' '}
              {bottomDetection.modelConfidenceScore !== null
                ? `${bottomDetection.modelConfidenceScore}/100`
                : 'DATA_UNAVAILABLE'}
            </p>
            <p className="text-[11px] text-[#E5E7EB]/55 leading-relaxed">
              {bottomDetection.methodologyNote}
            </p>
          </div>

          <div className="space-y-2">
            {bottomDetection.factors.map((f) => {
              const pct = f.score !== null ? Math.round((f.score / f.weight) * 100) : 0;
              return (
                <div key={f.key} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#E5E7EB]/85 truncate pr-2">{f.labelVi}</span>
                    <span className="font-mono text-[#E5E7EB]/80 tabular-nums shrink-0">
                      {f.score !== null ? `${f.score}/${f.weight}` : `—/${f.weight}`}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-[#0B0E14] rounded overflow-hidden">
                    <div
                      className={`h-full rounded ${
                        !f.available
                          ? 'bg-[#263244]'
                          : pct >= 70
                            ? 'bg-[#22C55E]'
                            : pct >= 45
                              ? 'bg-[#6366F1]'
                              : 'bg-[#F59E0B]'
                      }`}
                      style={{ width: `${f.available ? pct : 0}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* 8-Question AI VERDICT */}
      <section className="bg-[#111622] border border-[#263244] rounded-lg p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#263244] pb-3">
          <div className="flex items-center gap-2.5">
            <Bot className="w-4 h-4 text-[#6366F1]" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold text-white">
                AI Verdict — 8 Câu hỏi Nghiên cứu Chu kỳ
              </h2>
              <p className="text-xs text-[#E5E7EB]/55">
                Phân tích server-side qua Gemini dựa hoàn toàn trên dữ liệu định lượng và Cung–Cầu đã kiểm chứng.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleRunVerdict()}
            disabled={verdictLoading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#6366F1] hover:bg-[#6366F1]/90 disabled:opacity-50 rounded-md text-xs font-medium text-white whitespace-nowrap self-start sm:self-auto"
          >
            <Bot className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{verdictLoading ? 'Đang phân tích 8 câu hỏi...' : 'Chạy AI Verdict (8 Câu hỏi)'}</span>
          </button>
        </div>

        {!verdict ? (
          <p className="text-xs text-[#E5E7EB]/60">
            Nhấn nút phía trên để AI trả lời toàn diện 8 câu hỏi trọng tâm: Giai đoạn chu kỳ, Trạng thái Cung–Cầu, Định giá hay Bẫy giảm giá, Độ tin cậy tạo đáy, Động lực/Rủi ro, Hành động ngay hay Chờ xác nhận, Vùng mua/Vô hiệu/Mục tiêu và Tín hiệu kích hoạt.
          </p>
        ) : verdict.status !== 'OK' || !verdict.answers ? (
          <div className="bg-[#0B0E14] border border-[#F59E0B]/40 rounded-md p-3 text-xs text-[#F59E0B] flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{verdict.message ?? `Status: ${verdict.status}`}</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {[
              ['1. Hàng hóa đang ở giai đoạn nào của chu kỳ?', verdict.answers.q1CyclePhase],
              ['2. Trạng thái Cung – Cầu hiện tại ra sao?', verdict.answers.q2SupplyDemandState],
              ['3. Giá đã thực sự hấp dẫn hay chỉ là bẫy giảm giá?', verdict.answers.q3ValuableOrTrap],
              ['4. Đánh giá điểm tạo đáy & độ tin cậy mô hình?', verdict.answers.q4BottomProbabilityAssessment],
              ['5. Động lực chính và rủi ro lớn nhất hiện tại?', verdict.answers.q5KeyDriversAndRisks],
              ['6. Nên hành động ngay hay chờ xác nhận thêm?', verdict.answers.q6ShouldActNowOrWait],
              ['7. Vùng mua, điểm vô hiệu kịch bản & mục tiêu?', verdict.answers.q7EntryZoneInvalidationTargets],
              ['8. Tín hiệu kỹ thuật / vĩ mô cần để xác nhận?', verdict.answers.q8ConfirmationTriggers],
            ].map(([q, ans]) => (
              <div key={q} className="bg-[#0B0E14] border border-[#263244] rounded-md p-3.5 space-y-1.5">
                <p className="font-semibold text-white">{q}</p>
                <p className="text-[#E5E7EB]/85 leading-relaxed">{ans}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Multi-Timeframe Cycle Matrix (M/W/D/H4) */}
      <section className="bg-[#111622] border border-[#263244] rounded-lg p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#6366F1]" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-white">
            Ma trận Đa khung Chu kỳ (Thứ tự ưu tiên: Monthly → Weekly → Daily → H4 Timing)
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {(['MONTHLY', 'WEEKLY', 'DAILY', 'H4'] as const).map((tfKey) => {
            const tf = timeframes[tfKey];
            return (
              <div key={tfKey} className="bg-[#0B0E14] border border-[#263244] rounded-md p-3.5 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-semibold text-white">{tfKey}</span>
                  <span className="font-mono text-[11px] text-[#E5E7EB]/50">{tf.candleCount} nến</span>
                </div>
                <CyclePhaseBadge phase={tf.phase} compact />
                <p className="text-[#E5E7EB]/75 leading-relaxed">{tf.summary}</p>
                {tf.available && (
                  <div className="grid grid-cols-2 gap-1 pt-2 border-t border-[#263244] font-mono text-[11px] text-[#E5E7EB]/70 tabular-nums">
                    <span>EMA20: {tf.ema20 ?? '—'}</span>
                    <span>EMA50: {tf.ema50 ?? '—'}</span>
                    <span>RSI14: {tf.rsi14 ?? '—'}</span>
                    <span>ATR%: {tf.atrPct !== null ? `${tf.atrPct}%` : '—'}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Dual Trade Setup Plans: A. Long-Term Cycle Investing & B. Swing Trading */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[tradePlans.longTermCycle, tradePlans.swingTrading].map((plan) => (
          <div key={plan.horizonType} className="bg-[#111622] border border-[#263244] rounded-lg p-5 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-[#263244] pb-3">
              <div>
                <h2 className="text-sm font-semibold text-white">{plan.title}</h2>
                <p className="text-xs font-mono text-[#E5E7EB]/55 mt-0.5">
                  Chế độ: Hỗ trợ ra quyết định (Tự động giao dịch: TẮT)
                </p>
              </div>
              <span className="font-mono text-xs px-2 py-0.5 rounded border border-[#263244] bg-[#0B0E14] text-[#E5E7EB]/85 whitespace-nowrap">
                {plan.status}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-[#0B0E14] border border-[#263244] rounded p-2.5">
                <span className="block text-[11px] text-[#E5E7EB]/50">Vùng mua tối ưu</span>
                <span className="font-mono text-white tabular-nums">
                  {plan.entryZone.low !== null && plan.entryZone.high !== null
                    ? `${plan.entryZone.low} – ${plan.entryZone.high}`
                    : 'DATA_UNAVAILABLE'}
                </span>
              </div>
              <div className="bg-[#0B0E14] border border-[#263244] rounded p-2.5">
                <span className="block text-[11px] text-[#E5E7EB]/50">Cắt lỗ (SL)</span>
                <span className="font-mono text-[#EF4444] tabular-nums">
                  {plan.stopLoss !== null ? plan.stopLoss : '—'}
                </span>
              </div>
              <div className="bg-[#0B0E14] border border-[#263244] rounded p-2.5">
                <span className="block text-[11px] text-[#E5E7EB]/50">Chốt lời (TP1 / TP2)</span>
                <span className="font-mono text-[#22C55E] tabular-nums">
                  {plan.takeProfits.length > 0 ? plan.takeProfits.join(' / ') : '—'}
                </span>
              </div>
              <div className="bg-[#0B0E14] border border-[#263244] rounded p-2.5">
                <span className="block text-[11px] text-[#E5E7EB]/50">Tỷ lệ Risk/Reward</span>
                <span className="font-mono text-[#6366F1] font-semibold tabular-nums">
                  {plan.riskRewardRatio !== null ? `1 : ${plan.riskRewardRatio}` : '—'}
                </span>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <p className="text-[#E5E7EB]/80 leading-relaxed">{plan.positionSizingGuidance}</p>
              <p className="text-[#F59E0B]/90 font-mono">Vô hiệu kịch bản: {plan.invalidationCondition}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Tailored Supply/Demand Grid + 12-Month Seasonality & COT */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="bg-[#111622] border border-[#263244] rounded-lg p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-[#6366F1]" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-white">
              Ma trận Cung – Cầu Chuyên biệt ({nameVi})
            </h2>
          </div>

          <div className="divide-y divide-[#263244] text-xs">
            {supplyDemandMatrix.map((item) => (
              <div key={item.id} className="py-3 space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-white">{item.labelVi}</span>
                  <span className="font-mono text-[#E5E7EB]/85 tabular-nums">
                    {item.latestValue !== null ? `${item.latestValue} ${item.unit}` : 'DATA_UNAVAILABLE'}
                  </span>
                </div>
                <p className="text-[11px] text-[#E5E7EB]/60">{item.notes}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-[#111622] border border-[#263244] rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#6366F1]" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-white">Tính mùa vụ 12 tháng &amp; Vị thế COT</h2>
            </div>
            <span className="text-[11px] font-mono text-[#E5E7EB]/55">
              COT Index: {cotSnapshot.cotIndex !== null ? `${cotSnapshot.cotIndex.toFixed(1)}%` : 'UNAVAILABLE'}
            </span>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 text-xs">
            {seasonality.map((m) => (
              <div key={m.month} className="bg-[#0B0E14] border border-[#263244] rounded p-2">
                <span className="block text-[11px] text-[#E5E7EB]/55">{m.label}</span>
                <span
                  className={`font-mono font-semibold tabular-nums ${
                    m.avgReturnPct === null
                      ? 'text-[#E5E7EB]/40'
                      : m.avgReturnPct >= 0
                        ? 'text-[#22C55E]'
                        : 'text-[#EF4444]'
                  }`}
                >
                  {m.avgReturnPct !== null ? `${m.avgReturnPct >= 0 ? '+' : ''}${m.avgReturnPct}%` : '—'}
                </span>
                <span className="block text-[10px] font-mono text-[#E5E7EB]/45">
                  {m.sampleYears > 0 ? `${m.sampleYears} năm · Win ${m.winRatePct}%` : 'Thiếu dữ liệu'}
                </span>
              </div>
            ))}
          </div>

          <div className="bg-[#0B0E14] border border-[#263244] rounded p-3 text-xs space-y-1">
            <div className="flex items-center gap-1.5 text-white font-medium">
              <TrendingUp className="w-3.5 h-3.5 text-[#6366F1]" aria-hidden="true" />
              <span>Bối cảnh CFTC COT &amp; Liên hệ Việt Nam</span>
            </div>
            <p className="text-[#E5E7EB]/75">{cotSnapshot.note}</p>
            {instrument.commodityProfile?.vietnamMarketRelevance && (
              <p className="text-[#E5E7EB]/65 pt-1">
                {instrument.commodityProfile.vietnamMarketRelevance}
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
