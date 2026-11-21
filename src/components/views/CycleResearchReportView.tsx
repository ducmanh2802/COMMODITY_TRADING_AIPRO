import { useEffect, useState } from 'react';
import { Bot, CalendarClock, FileText, ShieldAlert } from 'lucide-react';
import { useTerminal } from '../../contexts/TerminalContext';
import { getCommodityVisual } from '../../shared/data/commodityVisuals';
import type { DailyResearchReportPayload } from '../../shared/types/cycle';
import { CyclePhaseBadge, getBottomScoreAccent } from '../common/CyclePhaseBadge';
import { fetchJsonWithRetry, safeReadJson } from '../../shared/utils/http';

export function CycleResearchReportView() {
  const { openInstrumentIn } = useTerminal();
  const [report, setReport] = useState<DailyResearchReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    async function loadBase() {
      setLoading(true);
      setError(null);
      try {
        const json = await fetchJsonWithRetry<DailyResearchReportPayload>('/api/cycle/report', {
          signal: controller.signal,
        });
        if (!cancelled) setReport(json);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Không thể tải báo cáo nghiên cứu.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadBase();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const handleGenerateAiBriefing = async () => {
    setGeneratingAi(true);
    setError(null);
    try {
      const res = await fetch('/api/cycle/report/generate', { method: 'POST' });
      const json = await safeReadJson<DailyResearchReportPayload>(res);
      setReport(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi gọi Gemini Research Report.');
    } finally {
      setGeneratingAi(false);
    }
  };

  if (loading && !report) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-10 text-center text-sm text-[var(--text)]/60">
        Đang tổng hợp báo cáo chu kỳ hàng hóa hàng ngày...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-strong)] tracking-tight flex items-center gap-2">
            <FileText className="w-5 h-5 text-[var(--accent)]" aria-hidden="true" />
            <span>Báo cáo Nghiên cứu Chu kỳ Hàng ngày &amp; AI Briefing</span>
          </h1>
          <p className="text-sm text-[var(--text)]/65 mt-1">
            Top hàng hóa đáng chú ý, ứng viên tạo đáy, rủi ro giảm giá, biến động Cung–Cầu và lịch sự kiện theo giờ Việt Nam (ICT).
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleGenerateAiBriefing()}
          disabled={generatingAi}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[var(--accent)] hover:bg-[var(--accent)]/90 disabled:opacity-50 rounded-md text-xs font-medium text-white whitespace-nowrap self-start sm:self-auto"
        >
          <Bot className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{generatingAi ? 'Đang tổng hợp Gemini...' : 'Tạo Bản tin AI Briefing'}</span>
        </button>
      </div>

      {error && (
        <div className="bg-[var(--surface)] border border-[var(--negative)]/40 rounded-lg p-4 text-xs text-[var(--negative)]">
          {error}
        </div>
      )}

      {/* AI Executive Briefing Block */}
      {report?.aiExecutiveBriefing ? (
        <section className="bg-[var(--surface)] border border-[var(--accent)]/40 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
            <h2 className="text-base font-semibold text-[var(--text-strong)]">{report.aiExecutiveBriefing.headline}</h2>
            <span className="text-xs font-mono text-[var(--accent)]">{report.model ?? 'gemini-4-hydrogen'}</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
            <div className="bg-[var(--bg)] border border-[var(--border)] rounded p-3.5 space-y-1.5">
              <p className="font-semibold text-[var(--text-strong)]">Bức tranh Vĩ mô &amp; Chu kỳ Hàng hóa</p>
              <p className="text-[var(--text)]/85 leading-relaxed">{report.aiExecutiveBriefing.macroRegimeSummary}</p>
            </div>
            <div className="bg-[var(--bg)] border border-[var(--border)] rounded p-3.5 space-y-1.5">
              <p className="font-semibold text-[var(--text-strong)]">Trọng tâm Thị trường Việt Nam (MXV)</p>
              <p className="text-[var(--text)]/85 leading-relaxed">{report.aiExecutiveBriefing.vietnamFocusCommentary}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="bg-[var(--bg)] border border-[var(--border)] rounded p-3.5 space-y-1.5">
              <p className="font-semibold text-[var(--positive)]">Điểm sáng Tích lũy / Tạo đáy</p>
              <ul className="list-disc pl-4 space-y-1 text-[var(--text)]/80">
                {report.aiExecutiveBriefing.bottomWatchHighlights.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
            <div className="bg-[var(--bg)] border border-[var(--border)] rounded p-3.5 space-y-1.5">
              <p className="font-semibold text-[var(--warning)]">Cảnh báo Rủi ro</p>
              <ul className="list-disc pl-4 space-y-1 text-[var(--text)]/80">
                {report.aiExecutiveBriefing.riskWarnings.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
            <div className="bg-[var(--bg)] border border-[var(--border)] rounded p-3.5 space-y-1.5">
              <p className="font-semibold text-[var(--text-strong)]">Checklist Hành động</p>
              <ul className="list-disc pl-4 space-y-1 text-[var(--text)]/80">
                {report.aiExecutiveBriefing.actionableChecklist.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : report?.message ? (
        <div className="bg-[var(--surface)] border border-[var(--warning)]/40 rounded-lg p-4 text-xs text-[var(--warning)] flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{report.message}</span>
        </div>
      ) : null}

      {/* Top 3 Structured Lists */}
      {report && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Top 5 Watch */}
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-3">
            <h2 className="text-sm font-semibold text-[var(--text-strong)]">Top 5 Hàng hóa Đáng chú ý</h2>
            <ul className="divide-y divide-[var(--border)] text-xs">
              {report.topWatch.map((item) => {
                const nameVi = getCommodityVisual(item.instrument.id)?.nameVi ?? item.instrument.productName;
                return (
                  <li key={item.instrument.id} className="py-2.5 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => openInstrumentIn(item.instrument.exchangeSymbol, 'commodity-profile')}
                      className="text-left hover:text-[var(--accent)] transition-colors min-w-0"
                    >
                      <p className="font-medium text-[var(--text-strong)] truncate">{nameVi}</p>
                      <p className="text-[11px] font-mono text-[var(--text)]/50">{item.instrument.id}</p>
                    </button>
                    <CyclePhaseBadge phase={item.cyclePhase} compact />
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Top 5 Bottom Candidates */}
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-3">
            <h2 className="text-sm font-semibold text-[var(--text-strong)]">Ứng viên Tạo đáy Hàng đầu</h2>
            {report.topBottomCandidates.length === 0 ? (
              <p className="text-xs text-[var(--text)]/55 py-4">
                DATA_UNAVAILABLE — Chưa đủ lịch sử nến D1 (&gt;=30 phiên) để xếp hạng Bottom Score.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border)] text-xs">
                {report.topBottomCandidates.map((item) => {
                  const nameVi = getCommodityVisual(item.instrument.id)?.nameVi ?? item.instrument.productName;
                  return (
                    <li key={item.instrument.id} className="py-2.5 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => openInstrumentIn(item.instrument.exchangeSymbol, 'commodity-profile')}
                        className="text-left hover:text-[var(--accent)] min-w-0"
                      >
                        <p className="font-medium text-[var(--text-strong)] truncate">{nameVi}</p>
                        <p className="text-[11px] font-mono text-[var(--text)]/50">{item.instrument.exchangeSymbol}</p>
                      </button>
                      <span className={`font-mono font-semibold tabular-nums ${getBottomScoreAccent(item.bottomClassification)}`}>
                        {item.bottomScore}/100
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Top 5 Downside Risk */}
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-3">
            <h2 className="text-sm font-semibold text-[var(--text-strong)]">Nhóm Rủi ro Phân phối / Vùng cao</h2>
            {report.topDownsideRisk.length === 0 ? (
              <p className="text-xs text-[var(--text)]/55 py-4">
                Không phát hiện hàng hóa nào ở vùng phân phối cao (hoặc dữ liệu lịch sử chưa được nạp).
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border)] text-xs">
                {report.topDownsideRisk.map((item) => {
                  const nameVi = getCommodityVisual(item.instrument.id)?.nameVi ?? item.instrument.productName;
                  return (
                    <li key={item.instrument.id} className="py-2.5 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => openInstrumentIn(item.instrument.exchangeSymbol, 'commodity-profile')}
                        className="text-left hover:text-[var(--accent)] min-w-0"
                      >
                        <p className="font-medium text-[var(--text-strong)] truncate">{nameVi}</p>
                        <p className="text-[11px] font-mono text-[var(--text)]/50">
                          Percentile: {item.percentile10Y !== null ? `${item.percentile10Y.toFixed(0)}%` : '—'}
                        </p>
                      </button>
                      <CyclePhaseBadge phase={item.cyclePhase} compact />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* Vietnam ICT Events + S/D Shifts */}
      {report && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-[var(--accent)]" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-[var(--text-strong)]">Sự kiện Kinh tế &amp; Phiên MXV (Giờ ICT)</h2>
            </div>
            <ul className="divide-y divide-[var(--border)] text-xs">
              {report.vietnamEventsToday.map((ev, idx) => (
                <li key={idx} className="py-2.5 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[var(--accent)]">{ev.timeIct}</span>
                    <span className="font-mono text-[11px] text-[var(--text)]/55">
                      {ev.impact} · {ev.affectedCommodities.join(', ')}
                    </span>
                  </div>
                  <p className="text-[var(--text-strong)]/90">{ev.title}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-3">
            <h2 className="text-sm font-semibold text-[var(--text-strong)]">Biến động Cung – Cầu &amp; Chuyển pha Chu kỳ</h2>
            {report.supplyDemandShifts.length === 0 && report.phaseTransitions.length === 0 ? (
              <p className="text-xs text-[var(--text)]/55 py-4">
                Chưa có bản ghi chuyển pha hoặc cập nhật Cung–Cầu gần đây (hãy đồng bộ FRED / EIA / USDA hoặc nạp OHLCV).
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border)] text-xs">
                {report.phaseTransitions.map((pt) => (
                  <li key={pt.symbol} className="py-2 flex items-center justify-between gap-2">
                    <span className="text-[var(--text-strong)] font-medium">{pt.name} ({pt.symbol})</span>
                    <CyclePhaseBadge phase={pt.phase} compact />
                  </li>
                ))}
                {report.supplyDemandShifts.map((sd, i) => (
                  <li key={i} className="py-2 space-y-0.5">
                    <p className="text-[var(--text-strong)]/90">{sd.summary}</p>
                    <p className="text-[11px] font-mono text-[var(--text)]/50">
                      {sd.source} · {sd.period} · {sd.impact}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
