import { useEffect, useMemo, useRef, useState } from 'react';
import { chartPalette, useThemeKey, withAlpha } from '../../../shared/theme/chartColors';
import { LINE_WIDTH, lwBase, resolveColor } from '../../../shared/theme/chartTheme';
import {
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { MarketCandle } from '../../../shared/types/market';
import { isSessionDateTimeframe } from '../../../api/dataApi';
import { fmtNum, useT } from '../../../i18n';
import { ChartAnnotations, type ChartApiPair } from './ChartAnnotations';

/** A drawable line: values index-aligned to `timestamps` (null = gap / warm-up). */
export interface LineSpec {
  id: string;
  label: string;
  color: string;
  timestamps: string[];
  values: (number | null)[];
  lineWidth?: 1 | 2 | 3;
}

export interface HistogramSpec {
  id: string;
  label: string;
  timestamps: string[];
  values: (number | null)[];
  positiveColor: string;
  negativeColor: string;
}

export interface LowerPaneSpec {
  title: string;
  lines: LineSpec[];
  histograms: HistogramSpec[];
  /** Horizontal reference levels (e.g. RSI 30/70). */
  levels: number[];
}

interface CandleChartProps {
  candles: MarketCandle[];
  timeframe: string;
  overlays: LineSpec[];
  lowerPane: LowerPaneSpec | null;
  showVolume: boolean;
  /** Drawing toolbar + auto pattern / S-R aids (default on). */
  annotations?: boolean;
}


/**
 * D1/W1 bars are stored at 00:00Z of the session date: pass the date as a business-day string so the
 * chart never shifts it into another timezone. Intraday bars are passed as UTC epoch seconds (the chart
 * renders them in UTC).
 */
export function toChartTime(ts: string, timeframe: string): Time {
  if (isSessionDateTimeframe(timeframe)) return ts.slice(0, 10);
  return Math.floor(Date.parse(ts) / 1000) as UTCTimestamp;
}

function lineData(spec: { timestamps: string[]; values: (number | null)[] }, timeframe: string) {
  const out: { time: Time; value: number }[] = [];
  for (let i = 0; i < spec.timestamps.length; i++) {
    const v = spec.values[i];
    if (v !== null && Number.isFinite(v)) out.push({ time: toChartTime(spec.timestamps[i], timeframe), value: v });
  }
  return out;
}

interface Legend {
  time: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number | null;
}

export function CandleChart({ candles, timeframe, overlays, lowerPane, showVolume, annotations = true }: CandleChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [legend, setLegend] = useState<Legend | null>(null);
  const [api, setApi] = useState<ChartApiPair | null>(null);
  const times = useMemo(() => candles.map((c) => toChartTime(c.timestamp, timeframe)), [candles, timeframe]);
  const t = useT();
  const themeKey = useThemeKey();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const intraday = !isSessionDateTimeframe(timeframe);
    const pal = chartPalette();
    const UP = pal.up;
    const DOWN = pal.down;

    const chart = createChart(el, {
      ...lwBase({ timeVisible: intraday }),
      localization: intraday
        ? {
            timeFormatter: (t: Time) =>
              typeof t === 'number' ? `${new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC` : String(t),
          }
        : undefined,
    });
    chartRef.current = chart;

    const byTime = new Map<string, Legend>();
    const candleData = candles.map((c) => {
      const time = toChartTime(c.timestamp, timeframe);
      byTime.set(String(time), {
        time: intraday ? `${c.timestamp.slice(0, 16).replace('T', ' ')} UTC` : c.timestamp.slice(0, 10),
        o: c.open,
        h: c.high,
        l: c.low,
        c: c.close,
        v: c.volume,
      });
      return { time, open: c.open, high: c.high, low: c.low, close: c.close };
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
    });
    candleSeries.setData(candleData);
    setApi({ chart, series: candleSeries });

    if (showVolume) {
      const vol = chart.addSeries(HistogramSeries, {
        priceScaleId: 'volume',
        priceFormat: { type: 'volume' },
        lastValueVisible: false,
        priceLineVisible: false,
      });
      vol.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
      vol.setData(
        candles
          .filter((c) => c.volume !== null)
          .map((c) => ({
            time: toChartTime(c.timestamp, timeframe),
            value: c.volume as number,
            color: withAlpha(c.close >= c.open ? UP : DOWN, 0.35),
          }))
      );
    }

    for (const o of overlays) {
      const s = chart.addSeries(LineSeries, {
        color: resolveColor(o.color),
        lineWidth: o.lineWidth ?? LINE_WIDTH,
        title: o.label,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      s.setData(lineData(o, timeframe));
    }

    if (lowerPane && (lowerPane.lines.length > 0 || lowerPane.histograms.length > 0)) {
      for (const h of lowerPane.histograms) {
        const s = chart.addSeries(
          HistogramSeries,
          { title: h.label, priceLineVisible: false, lastValueVisible: false },
          1
        );
        s.setData(
          lineData(h, timeframe).map((p) => ({ ...p, color: withAlpha(resolveColor(p.value >= 0 ? h.positiveColor : h.negativeColor), 0.55) }))
        );
      }
      lowerPane.lines.forEach((ln, idx) => {
        const s = chart.addSeries(
          LineSeries,
          { color: resolveColor(ln.color), lineWidth: ln.lineWidth ?? LINE_WIDTH, title: ln.label, priceLineVisible: false },
          1
        );
        s.setData(lineData(ln, timeframe));
        if (idx === 0) {
          for (const lvl of lowerPane.levels) {
            s.createPriceLine({ price: lvl, color: withAlpha(pal.text, 0.35), lineWidth: 1, lineStyle: 0, axisLabelVisible: true, title: '' });
          }
        }
      });
      const panes = chart.panes();
      if (panes.length > 1) {
        panes[0].setStretchFactor(3);
        panes[1].setStretchFactor(1);
      }
    }

    chart.timeScale().fitContent();

    const last = candleData.length > 0 ? byTime.get(String(candleData[candleData.length - 1].time)) ?? null : null;
    setLegend(last);
    let disposed = false;
    const onCrosshairMove = (param: Parameters<Parameters<IChartApi['subscribeCrosshairMove']>[0]>[0]) => {
      if (disposed) return;
      if (param.time === undefined) {
        setLegend(last);
        return;
      }
      const t = param.time;
      const key =
        typeof t === 'object'
          ? `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`
          : String(t);
      setLegend(byTime.get(key) ?? last);
    };
    chart.subscribeCrosshairMove(onCrosshairMove);

    return () => {
      disposed = true;
      chart.unsubscribeCrosshairMove(onCrosshairMove);
      chartRef.current = null;
      setApi(null);
      chart.remove();
    };
  }, [candles, timeframe, overlays, lowerPane, showVolume, themeKey]);

  const chartBody = (
    <div className="relative">
      {legend && (
        <div className="absolute left-3 top-2 z-10 pointer-events-none font-mono text-[11px] tabular-nums text-[var(--text)]/80 bg-[var(--surface)]/80 rounded px-1.5 py-0.5">
          <span className="text-[var(--text-strong)]">{legend.time}</span>{' '}
          O <span className="text-[var(--text-strong)]">{legend.o}</span> H <span className="text-[var(--text-strong)]">{legend.h}</span> L{' '}
          <span className="text-[var(--text-strong)]">{legend.l}</span> C{' '}
          <span className={legend.c >= legend.o ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}>{legend.c}</span>
          {legend.v !== null && (
            <>
              {' '}
              V <span className="text-[var(--text-strong)]">{fmtNum(legend.v)}</span>
            </>
          )}
        </div>
      )}
      <div
        ref={containerRef}
        data-testid="candle-chart"
        className={lowerPane ? 'h-[560px]' : 'h-[460px]'}
        role="img"
        aria-label={t('chart.candle.aria', { n: candles.length })}
      />
    </div>
  );

  if (!annotations) return chartBody;
  return (
    <ChartAnnotations api={api} candles={candles} times={times} timeframe={timeframe}>
      {chartBody}
    </ChartAnnotations>
  );
}

export default CandleChart;
