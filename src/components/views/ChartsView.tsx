import { useEffect, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  LineSeries,
  type UTCTimestamp,
} from 'lightweight-charts';
import { Upload } from 'lucide-react';
import { useTerminal } from '../../contexts/TerminalContext';
import type { DataQualityStatus, MarketCandle } from '../../shared/types/market';
import { formatTimestampInZone } from '../../shared/utils/time';
import { CsvImportPanel } from '../common/CsvImportPanel';
import { DataStatusBadge } from '../common/DataStatusBadge';
import { InstrumentToolbar } from '../common/InstrumentToolbar';

interface CandleApiResponse {
  status: DataQualityStatus;
  reason?: string;
  candles: MarketCandle[];
  overlays: {
    ema20: Array<number | null>;
    ema50: Array<number | null>;
    ema200: Array<number | null>;
  };
}

export function ChartsView() {
  const { selectedSymbol, timeframe, datasets } = useTerminal();
  const chartContainerRef = useRef<HTMLDivElement | null>(null);

  const [candleData, setCandleData] = useState<CandleApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEma20, setShowEma20] = useState(true);
  const [showEma50, setShowEma50] = useState(true);
  const [showEma200, setShowEma200] = useState(false);
  const [showCsvPanel, setShowCsvPanel] = useState(false);
  const [hoverCandle, setHoverCandle] = useState<MarketCandle | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadCandles() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/market/candles/${encodeURIComponent(selectedSymbol)}?timeframe=${timeframe}`
        );
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.message ?? 'Failed to fetch candle series.');
        }
        if (!cancelled) {
          setCandleData(json);
          const list = json.candles as MarketCandle[];
          setHoverCandle(list.length > 0 ? list[list.length - 1] : null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load candles.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadCandles();
    return () => {
      cancelled = true;
    };
  }, [selectedSymbol, timeframe, datasets.length]);

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container || !candleData || candleData.candles.length === 0) {
      return;
    }

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: '#0B0E14' },
        textColor: '#E5E7EB',
      },
      grid: {
        vertLines: { color: '#172033' },
        horzLines: { color: '#172033' },
      },
      width: container.clientWidth,
      height: 440,
      timeScale: {
        borderColor: '#263244',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#263244',
      },
    });

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22C55E',
      downColor: '#EF4444',
      borderVisible: false,
      wickUpColor: '#22C55E',
      wickDownColor: '#EF4444',
    });

    const candles = candleData.candles;
    const candleByTime = new Map<number, MarketCandle>();
    const formattedCandles = candles.map((c) => {
      const t = Math.floor(new Date(c.timestamp).getTime() / 1000) as UTCTimestamp;
      candleByTime.set(t, c);
      return {
        time: t,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      };
    });
    candlestickSeries.setData(formattedCandles);

    const hasVolume = candles.some((c) => c.volume !== null && c.volume > 0);
    if (hasVolume) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: '',
      });
      volumeSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.82, bottom: 0 },
      });
      volumeSeries.setData(
        candles.map((c) => ({
          time: Math.floor(new Date(c.timestamp).getTime() / 1000) as UTCTimestamp,
          value: c.volume ?? 0,
          color: c.close >= c.open ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)',
        }))
      );
    }

    const addEmaLine = (values: Array<number | null>, color: string, enabled: boolean) => {
      if (!enabled) return;
      const lineData = candles
        .map((c, idx) => {
          const val = values[idx];
          if (val === null || val === undefined) return null;
          return {
            time: Math.floor(new Date(c.timestamp).getTime() / 1000) as UTCTimestamp,
            value: val,
          };
        })
        .filter((pt): pt is { time: UTCTimestamp; value: number } => pt !== null);

      if (lineData.length > 0) {
        const series = chart.addSeries(LineSeries, {
          color,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        series.setData(lineData);
      }
    };

    addEmaLine(candleData.overlays.ema20, '#6366F1', showEma20);
    addEmaLine(candleData.overlays.ema50, '#F59E0B', showEma50);
    addEmaLine(candleData.overlays.ema200, '#E5E7EB', showEma200);

    chart.timeScale().fitContent();

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || typeof param.time !== 'number') {
        setHoverCandle(candles[candles.length - 1] ?? null);
        return;
      }
      const matched = candleByTime.get(param.time);
      if (matched) setHoverCandle(matched);
    });

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: Math.floor(entry.contentRect.width) });
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [candleData, showEma20, showEma50, showEma200]);

  const status = candleData?.status ?? 'UNAVAILABLE';
  const candles = candleData?.candles ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight">
            Multi-Timeframe Chart ({selectedSymbol} · {timeframe})
          </h1>
          <p className="text-sm text-[#E5E7EB]/65 mt-1">
            Interactive Lightweight Charts candlestick renderer with server-computed EMA overlays.
          </p>
        </div>
        <DataStatusBadge status={status} />
      </div>

      <InstrumentToolbar
        rightSlot={
          <>
            <label className="inline-flex items-center gap-1.5 text-xs font-mono text-[#E5E7EB]/80 cursor-pointer">
              <input
                type="checkbox"
                checked={showEma20}
                onChange={(e) => setShowEma20(e.target.checked)}
                className="accent-[#6366F1]"
              />
              <span>EMA 20</span>
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs font-mono text-[#E5E7EB]/80 cursor-pointer">
              <input
                type="checkbox"
                checked={showEma50}
                onChange={(e) => setShowEma50(e.target.checked)}
                className="accent-[#F59E0B]"
              />
              <span>EMA 50</span>
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs font-mono text-[#E5E7EB]/80 cursor-pointer">
              <input
                type="checkbox"
                checked={showEma200}
                onChange={(e) => setShowEma200(e.target.checked)}
                className="accent-[#E5E7EB]"
              />
              <span>EMA 200</span>
            </label>
            <button
              type="button"
              onClick={() => setShowCsvPanel((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#172033] hover:bg-[#6366F1] border border-[#263244] rounded-md text-xs font-medium text-white transition-colors"
            >
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{showCsvPanel ? 'Hide CSV Import' : 'Import CSV'}</span>
            </button>
          </>
        }
      />

      {showCsvPanel && (
        <CsvImportPanel
          defaultSymbol={selectedSymbol}
          defaultTimeframe={timeframe}
          onImported={() => setShowCsvPanel(false)}
        />
      )}

      {error && (
        <div className="bg-[#111622] border border-[#EF4444]/40 rounded-lg p-4 text-xs text-[#EF4444] font-mono">
          {error}
        </div>
      )}

      <section
        aria-label="Candlestick Chart Canvas"
        className="bg-[#111622] border border-[#263244] rounded-lg overflow-hidden"
      >
        <div className="px-4 py-2.5 border-b border-[#263244] flex flex-wrap items-center justify-between gap-3 text-xs font-mono tabular-nums">
          {hoverCandle ? (
            <div className="flex flex-wrap items-center gap-4 text-[#E5E7EB]">
              <span className="text-[#E5E7EB]/60">
                {formatTimestampInZone(hoverCandle.timestamp, 'Asia/Ho_Chi_Minh')}
              </span>
              <span>O: {hoverCandle.open.toFixed(4)}</span>
              <span>H: {hoverCandle.high.toFixed(4)}</span>
              <span>L: {hoverCandle.low.toFixed(4)}</span>
              <span className={hoverCandle.close >= hoverCandle.open ? 'text-[#22C55E]' : 'text-[#EF4444]'}>
                C: {hoverCandle.close.toFixed(4)}
              </span>
              <span>Vol: {hoverCandle.volume !== null ? hoverCandle.volume.toLocaleString() : 'N/A'}</span>
            </div>
          ) : (
            <span className="text-[#F59E0B]">
              DATA_UNAVAILABLE — No verified market data available.
            </span>
          )}
          <span className="text-[#E5E7EB]/55">{candles.length} bar(s)</span>
        </div>

        {loading ? (
          <div className="h-[440px] flex items-center justify-center text-xs font-mono text-[#E5E7EB]/60">
            Loading OHLCV series...
          </div>
        ) : candles.length === 0 ? (
          <div className="h-[440px] flex flex-col items-center justify-center p-6 text-center space-y-3">
            <DataStatusBadge status="UNAVAILABLE" />
            <p className="text-sm font-mono text-white">
              DATA_UNAVAILABLE — No verified OHLCV candles for {selectedSymbol} ({timeframe}).
            </p>
            <p className="text-xs text-[#E5E7EB]/60 max-w-md">
              Live exchange adapters are unconfigured and fail closed. Import a validated CSV OHLCV file to render interactive charts and server-computed overlays.
            </p>
            <button
              type="button"
              onClick={() => setShowCsvPanel(true)}
              className="px-3.5 py-2 bg-[#6366F1] hover:bg-[#6366F1]/90 text-white text-xs font-medium rounded-md"
            >
              Upload Historical OHLCV CSV
            </button>
          </div>
        ) : (
          <div ref={chartContainerRef} className="w-full h-[440px]" data-testid="lightweight-chart-canvas" />
        )}
      </section>
    </div>
  );
}
