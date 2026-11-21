/**
 * Thin React wrapper around lightweight-charts v5 (`chart.addSeries(LineSeries, …)`).
 *
 * - Points with `value === null` are passed as whitespace data (a visible gap) — never interpolated.
 * - Timestamps are converted to UTC epoch seconds, so daily (00:00Z) and intraday series both work.
 * - The chart is recreated when the series list changes; it is resized with a ResizeObserver.
 */
import { useEffect, useRef } from 'react';
import { LineSeries, createChart, type IChartApi, type UTCTimestamp } from 'lightweight-charts';
import { useThemeKey } from '../../../shared/theme/chartColors';
import { LINE_WIDTH, lwBase, resolveColor } from '../../../shared/theme/chartTheme';
import { ChartLegend } from '../../ui/viz/ChartLegend';
import { ChartTable } from '../../ui/viz/ChartTable';

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

/** Categorical slots as theme tokens (fixed order, never cycled). Resolved to concrete colours when the chart is built. */
export const CHART_COLORS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)', 'var(--series-6)'];

function cssVarAxis(): string {
  return resolveColor('var(--chart-crosshair)');
}

function toTime(t: string): UTCTimestamp {
  return Math.floor(Date.parse(t) / 1000) as UTCTimestamp;
}

export function TimeSeriesChart({ lines, height = 260, valueFormatter, referenceLines, ariaLabel }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const themeKey = useThemeKey();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart: IChartApi = createChart(el, {
      ...lwBase(),
      autoSize: false,
      height,
      width: el.clientWidth,
      localization: valueFormatter ? { priceFormatter: valueFormatter } : undefined,
    });
    lines.forEach((line, idx) => {
      const s = chart.addSeries(LineSeries, {
        color: resolveColor(line.color),
        lineWidth: LINE_WIDTH,
        title: line.name,
        priceLineVisible: false,
        lastValueVisible: true,
      });
      // De-duplicate identical epoch seconds defensively (input is already strictly ascending).
      const data = line.points.map((p) => (p.v === null || !Number.isFinite(p.v) ? { time: toTime(p.t) } : { time: toTime(p.t), value: p.v }));
      s.setData(data);
      if (idx === 0 && referenceLines) {
        for (const r of referenceLines) {
          s.createPriceLine({ price: r, color: cssVarAxis(), lineWidth: 1, lineStyle: 0, axisLabelVisible: false, title: '' });
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
  }, [lines, height, valueFormatter, referenceLines, themeKey]);

  return (
    <div>
      <div ref={containerRef} role="img" aria-label={ariaLabel} className="w-full" style={{ height }} />
      <ChartLegend className="mt-2" items={lines.map((l) => ({ id: l.name, label: l.name, color: l.color }))} />
      <ChartTable
        columns={['', ...lines.map((l) => l.name)]}
        rows={(lines[0]?.points ?? []).map((p, i) => [
          p.t.slice(0, 10),
          ...lines.map((l) => {
            const v = l.points[i]?.v;
            return v === null || v === undefined ? '—' : valueFormatter ? valueFormatter(v) : String(Math.round(v * 1e4) / 1e4);
          }),
        ])}
      />
    </div>
  );
}
