import { useEffect, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
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
}

const UP = '#22C55E';
const DOWN = '#EF4444';

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

export function CandleChart({ candles, timeframe, overlays, lowerPane, showVolume }: CandleChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [legend, setLegend] = useState<Legend | null>(null);
  const t = useT();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const intraday = !isSessionDateTimeframe(timeframe);

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#111622' },
        textColor: 'rgba(229, 231, 235, 0.75)',
        fontSize: 11,
        panes: { separatorColor: '#263244', separatorHoverColor: 'rgba(99, 102, 241, 0.3)' },
      },
      grid: {
        vertLines: { color: 'rgba(38, 50, 68, 0.45)' },
        horzLines: { color: 'rgba(38, 50, 68, 0.45)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#263244' },
      timeScale: { borderColor: '#263244', timeVisible: intraday, secondsVisible: false },
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
            color: c.close >= c.open ? 'rgba(34, 197, 94, 0.35)' : 'rgba(239, 68, 68, 0.35)',
          }))
      );
    }

    for (const o of overlays) {
      const s = chart.addSeries(LineSeries, {
        color: o.color,
        lineWidth: o.lineWidth ?? 1,
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
          lineData(h, timeframe).map((p) => ({ ...p, color: p.value >= 0 ? h.positiveColor : h.negativeColor }))
        );
      }
      lowerPane.lines.forEach((ln, idx) => {
        const s = chart.addSeries(
          LineSeries,
          { color: ln.color, lineWidth: ln.lineWidth ?? 1, title: ln.label, priceLineVisible: false },
          1
        );
        s.setData(lineData(ln, timeframe));
        if (idx === 0) {
          for (const lvl of lowerPane.levels) {
            s.createPriceLine({ price: lvl, color: 'rgba(229, 231, 235, 0.35)', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' });
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
    chart.subscribeCrosshairMove((param) => {
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
    });

    return () => {
      chartRef.current = null;
      chart.remove();
    };
  }, [candles, timeframe, overlays, lowerPane, showVolume]);

  return (
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
}

export default CandleChart;
