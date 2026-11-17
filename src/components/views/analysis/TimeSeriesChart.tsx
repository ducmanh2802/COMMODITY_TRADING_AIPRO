/**
 * Thin React wrapper around lightweight-charts v5 (`chart.addSeries(LineSeries, …)`).
 *
 * - Points with `value === null` are passed as whitespace data (a visible gap) — never interpolated.
 * - Timestamps are converted to UTC epoch seconds, so daily (00:00Z) and intraday series both work.
 * - The chart is recreated when the series list changes; it is resized with a ResizeObserver.
 */
import { useEffect, useRef } from 'react';
import { ColorType, LineSeries, createChart, type IChartApi, type UTCTimestamp } from 'lightweight-charts';

export interface ChartLine {
  name: string;
  color: string;
  points: { t: string; v: number | null }[];
}

interface Props {
  lines: ChartLine[];
  height?: number;
  /** Formats the price axis / crosshair labels (e.g. percentages). */
  valueFormatter?: (v: number) => string;
  /** Optional horizontal reference line values (e.g. 0, ±2 for a z-score). */
  referenceLines?: number[];
  ariaLabel: string;
}

export const CHART_COLORS = ['#6366F1', '#22C55E', '#F59E0B', '#06B6D4', '#EC4899', '#A3E635', '#EF4444', '#94A3B8'];

function toTime(t: string): UTCTimestamp {
  return Math.floor(Date.parse(t) / 1000) as UTCTimestamp;
}

export function TimeSeriesChart({ lines, height = 260, valueFormatter, referenceLines, ariaLabel }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart: IChartApi = createChart(el, {
      height,
      width: el.clientWidth,
      layout: { background: { type: ColorType.Solid, color: '#111622' }, textColor: '#E5E7EBB3', fontSize: 11 },
      grid: { vertLines: { color: '#26324466' }, horzLines: { color: '#26324466' } },
      rightPriceScale: { borderColor: '#263244' },
      timeScale: { borderColor: '#263244', timeVisible: false },
      localization: valueFormatter ? { priceFormatter: valueFormatter } : undefined,
    });
    lines.forEach((line, idx) => {
      const s = chart.addSeries(LineSeries, {
        color: line.color,
        lineWidth: 2,
        title: line.name,
        priceLineVisible: false,
        lastValueVisible: true,
      });
      // De-duplicate identical epoch seconds defensively (input is already strictly ascending).
      const data = line.points.map((p) => (p.v === null || !Number.isFinite(p.v) ? { time: toTime(p.t) } : { time: toTime(p.t), value: p.v }));
      s.setData(data);
      if (idx === 0 && referenceLines) {
        for (const r of referenceLines) {
          s.createPriceLine({ price: r, color: '#E5E7EB55', lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: '' });
        }
      }
    });
    chart.timeScale().fitContent();
    const ro = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth }));
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [lines, height, valueFormatter, referenceLines]);

  return (
    <div>
      <div ref={containerRef} role="img" aria-label={ariaLabel} className="w-full" style={{ height }} />
      <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-[#E5E7EB]/70">
        {lines.map((l) => (
          <span key={l.name} className="inline-flex items-center gap-1.5">
            <span className="w-3 h-0.5 inline-block" style={{ backgroundColor: l.color }} aria-hidden="true" />
            {l.name}
          </span>
        ))}
      </div>
    </div>
  );
}
