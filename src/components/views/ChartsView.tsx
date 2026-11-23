import { useEffect, useRef, useState } from 'react';
import { chartPalette, useThemeKey, withAlpha } from '../../shared/theme/chartColors';
import { LINE_WIDTH, lwBase, seriesColor, seriesVar } from '../../shared/theme/chartTheme';
import {
  CandlestickSeries,
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
import { SessionHistoryTable } from '../common/SessionHistoryTable';
import { fmtFixed, fmtNum, useT } from '../../i18n';

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
  const t = useT();
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
          throw new Error(json.message ?? t('chart.err.series'));
        }
        if (!cancelled) {
          setCandleData(json);
          const list = json.candles as MarketCandle[];
          setHoverCandle(list.length > 0 ? list[list.length - 1] : null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t('chart.err.candles'));
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

  const themeKey = useThemeKey();

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container || !candleData || candleData.candles.length === 0) {
      return;
    }

    const pal = chartPalette();
    const chart = createChart(container, {
      ...lwBase({ timeVisible: true }),
      autoSize: false,
      width: container.clientWidth,
      height: 440,
    });

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: pal.up,
      downColor: pal.down,
      borderVisible: false,
      wickUpColor: pal.up,
      wickDownColor: pal.down,
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
          color: withAlpha(c.close >= c.open ? pal.up : pal.down, 0.3),
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
          lineWidth: LINE_WIDTH,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        series.setData(lineData);
      }
    };

    addEmaLine(candleData.overlays.ema20, seriesColor(2), showEma20);
    addEmaLine(candleData.overlays.ema50, seriesColor(3), showEma50);
    addEmaLine(candleData.overlays.ema200, seriesColor(4), showEma200);

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
  }, [candleData, showEma20, showEma50, showEma200, themeKey]);

  const status = candleData?.status ?? 'UNAVAILABLE';
  const candles = candleData?.candles ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-strong)] tracking-tight">
            {t('chart.owner.title', { symbol: selectedSymbol, tf: timeframe })}
          </h1>
          <p className="text-sm text-[var(--text)]/65 mt-1">
            {t('chart.owner.subtitle')}
          </p>
        </div>
        <DataStatusBadge status={status} />
      </div>

      <InstrumentToolbar
        rightSlot={
          <>
            <label className="inline-flex items-center gap-1.5 text-xs font-mono text-[var(--text)]/80 cursor-pointer">
              <input
                type="checkbox"
                checked={showEma20}
                onChange={(e) => setShowEma20(e.target.checked)}
                className="accent-[var(--series-3)]"
              />
              <span aria-hidden="true" className="inline-block h-0.5 w-3 rounded-full" style={{ background: seriesVar(2) }} />
              <span>EMA 20</span>
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs font-mono text-[var(--text)]/80 cursor-pointer">
              <input
                type="checkbox"
                checked={showEma50}
                onChange={(e) => setShowEma50(e.target.checked)}
                className="accent-[var(--series-4)]"
              />
              <span aria-hidden="true" className="inline-block h-0.5 w-3 rounded-full" style={{ background: seriesVar(3) }} />
              <span>EMA 50</span>
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs font-mono text-[var(--text)]/80 cursor-pointer">
              <input
                type="checkbox"
                checked={showEma200}
                onChange={(e) => setShowEma200(e.target.checked)}
                className="accent-[var(--series-5)]"
              />
              <span aria-hidden="true" className="inline-block h-0.5 w-3 rounded-full" style={{ background: seriesVar(4) }} />
              <span>EMA 200</span>
            </label>
            <button
              type="button"
              onClick={() => setShowCsvPanel((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface-2)] hover:bg-[var(--accent)] border border-[var(--border)] rounded-md text-xs font-medium text-white transition-colors"
            >
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{showCsvPanel ? t('chart.owner.hideCsv') : t('chart.owner.importCsv')}</span>
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
        <div className="bg-[var(--surface)] border border-[var(--negative)]/40 rounded-lg p-4 text-xs text-[var(--negative)] font-mono">
          {error}
        </div>
      )}

      <section
        aria-label={t('chart.owner.canvas')}
        className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden"
      >
        <div className="px-4 py-2.5 border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-3 text-xs font-mono tabular-nums">
          {hoverCandle ? (
            <div className="flex flex-wrap items-center gap-4 text-[var(--text)]">
              <span className="text-[var(--text)]/60">
                {formatTimestampInZone(hoverCandle.timestamp, 'Asia/Ho_Chi_Minh')}
              </span>
              <span>O: {fmtFixed(hoverCandle.open, 4)}</span>
              <span>H: {fmtFixed(hoverCandle.high, 4)}</span>
              <span>L: {fmtFixed(hoverCandle.low, 4)}</span>
              <span className={hoverCandle.close >= hoverCandle.open ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}>
                C: {fmtFixed(hoverCandle.close, 4)}
              </span>
              <span>{t('chart.owner.vol')}: {hoverCandle.volume !== null ? fmtNum(hoverCandle.volume) : t('common.na')}</span>
            </div>
          ) : (
            <span className="text-[var(--warning)]">
              {t('chart.owner.noVerified')}
            </span>
          )}
          <span className="text-[var(--text)]/55">{t('chart.bars', { n: candles.length })}</span>
        </div>

        {loading ? (
          <div className="h-[440px] flex items-center justify-center text-xs font-mono text-[var(--text)]/60">
            {t('chart.owner.loading')}
          </div>
        ) : candles.length === 0 ? (
          <div className="h-[440px] flex flex-col items-center justify-center p-6 text-center space-y-3">
            <DataStatusBadge status="UNAVAILABLE" />
            <p className="text-sm font-mono text-[var(--text-strong)]">
              {t('chart.owner.noCandles', { symbol: selectedSymbol, tf: timeframe })}
            </p>
            <p className="text-xs text-[var(--text)]/60 max-w-md">
              {t('chart.owner.noCandlesHint')}
            </p>
            <button
              type="button"
              onClick={() => setShowCsvPanel(true)}
              className="px-3.5 py-2 bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-white text-xs font-medium rounded-md"
            >
              {t('chart.owner.uploadCsv')}
            </button>
          </div>
        ) : (
          <div ref={chartContainerRef} className="w-full h-[440px]" data-testid="lightweight-chart-canvas" />
        )}
      </section>

      {candles.length > 0 && (
        <SessionHistoryTable
          mode="candles"
          candles={candles}
          timeframe={timeframe}
          sourceNote={candles[candles.length - 1]?.source}
        />
      )}
    </div>
  );
}
