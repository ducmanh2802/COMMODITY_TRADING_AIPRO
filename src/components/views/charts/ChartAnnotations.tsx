import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
} from 'lightweight-charts';
import { BookOpen, Eraser, Minus, MousePointer2, Ruler, Square, Trash2, TrendingUp, Type, X } from 'lucide-react';
import type { MarketCandle } from '../../../shared/types/market';
import { useT } from '../../../i18n';
import { useTerminal } from '../../../contexts/TerminalContext';
import { detectCandlePatterns, detectSrZones, type DetectedPattern, type PatternKind } from './candlePatterns';
import {
  TOOL_POINT_COUNT,
  fibLevels,
  loadDrawings,
  newDrawingId,
  saveDrawings,
  type Drawing,
  type DrawingPoint,
  type DrawingTool,
} from './drawings';

export interface ChartApiPair {
  chart: IChartApi;
  series: ISeriesApi<'Candlestick'>;
  /** False once the owning CandleChart has called chart.remove(); teardown must skip chart calls then. */
  alive: boolean;
}

interface Props {
  api: ChartApiPair | null;
  candles: MarketCandle[];
  /** Chart times index-aligned to `candles`. */
  times: Time[];
  timeframe: string;
  children: ReactNode;
}

const TOOL_ICONS: { tool: DrawingTool; Icon: typeof Minus }[] = [
  { tool: 'hline', Icon: Minus },
  { tool: 'trend', Icon: TrendingUp },
  { tool: 'zone', Icon: Square },
  { tool: 'fib', Icon: Ruler },
  { tool: 'text', Icon: Type },
];

function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function timeKey(t: Time): string {
  return typeof t === 'object'
    ? `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`
    : String(t);
}

function fmtPrice(p: number): string {
  return String(Number(p.toPrecision(6)));
}

const btn =
  'inline-flex items-center justify-center h-8 min-w-8 px-2 rounded border text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
const btnIdle = 'border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-2)]';
const btnOn = 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]';

export function ChartAnnotations({ api, candles, times, timeframe, children }: Props) {
  const t = useT();
  const { setActiveModule } = useTerminal();
  const symbol = candles[0]?.symbol ?? '';
  const bucket = `${symbol}|${timeframe}`;
  const isD1 = timeframe === 'D1';

  const [store, setStore] = useState<{ key: string; list: Drawing[] }>(() => ({ key: bucket, list: loadDrawings(symbol, timeframe) }));
  if (store.key !== bucket) setStore({ key: bucket, list: loadDrawings(symbol, timeframe) });
  const drawings = store.key === bucket ? store.list : [];

  const [tool, setTool] = useState<DrawingTool | null>(null);
  const [pending, setPending] = useState<DrawingPoint[]>([]);
  const [hover, setHover] = useState<DrawingPoint | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [showPatterns, setShowPatterns] = useState(false);
  const [showZones, setShowZones] = useState(false);
  const [info, setInfo] = useState<{ index: number; kinds: PatternKind[] } | null>(null);
  const [, setRev] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const commit = useCallback(
    (list: Drawing[]) => {
      setStore({ key: bucket, list });
      saveDrawings(symbol, timeframe, list);
    },
    [bucket, symbol, timeframe]
  );

  const indexByTs = useMemo(() => new Map(candles.map((c, i) => [c.timestamp, i])), [candles]);
  const indexByTime = useMemo(() => new Map(times.map((tm, i) => [timeKey(tm), i])), [times]);

  const bars = useMemo(() => candles.map((c) => ({ open: c.open, high: c.high, low: c.low, close: c.close })), [candles]);
  const patterns: DetectedPattern[] = useMemo(() => (isD1 && showPatterns ? detectCandlePatterns(bars) : []), [isD1, showPatterns, bars]);
  const zones = useMemo(() => (isD1 && showZones ? detectSrZones(bars) : []), [isD1, showZones, bars]);
  const patternsRef = useRef(patterns);
  patternsRef.current = patterns;

  // Reset transient state when the dataset changes.
  useEffect(() => {
    setTool(null);
    setPending([]);
    setHover(null);
    setSelected(null);
    setInfo(null);
  }, [bucket]);

  // Re-render when the visible range / price scale / size changes (cheap signature poll).
  useEffect(() => {
    if (!api) return;
    let raf = 0;
    let sig = '';
    const loop = () => {
      try {
        const r = api.chart.timeScale().getVisibleLogicalRange();
        const last = candles[candles.length - 1]?.close ?? 0;
        const s = `${r?.from}|${r?.to}|${api.series.priceToCoordinate(last)}|${api.series.priceToCoordinate(last * 1.01 + 1)}|${wrapRef.current?.clientWidth}|${wrapRef.current?.clientHeight}`;
        if (s !== sig) {
          sig = s;
          setRev((n) => n + 1);
        }
      } catch {
        /* chart disposed */
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [api, candles]);

  // Pattern markers.
  useEffect(() => {
    if (!api) return;
    const byIdx = new Map<number, DetectedPattern[]>();
    for (const p of patterns) byIdx.set(p.index, [...(byIdx.get(p.index) ?? []), p]);
    const markers: SeriesMarker<Time>[] = [...byIdx.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([idx, ps]) => {
        const dir = ps.find((p) => p.direction !== 'neutral')?.direction ?? 'neutral';
        return {
          time: times[idx],
          position: dir === 'bullish' ? 'belowBar' : 'aboveBar',
          shape: dir === 'bullish' ? 'arrowUp' : dir === 'bearish' ? 'arrowDown' : 'circle',
          color: cssVar(dir === 'bullish' ? '--positive' : dir === 'bearish' ? '--negative' : '--warning', '#888888'),
          text: ps.map((p) => t(`dw.p.${p.kind}.short`)).join('/'),
        } as SeriesMarker<Time>;
      });
    let plugin: ISeriesMarkersPluginApi<Time> | null = null;
    try {
      plugin = createSeriesMarkers(api.series, markers);
    } catch {
      plugin = null;
    }
    if (markers.length === 0) setInfo(null);
    return () => {
      // React runs the parent's cleanup (chart.remove()) first; detach() on a removed chart
      // schedules a repaint that throws "Object is disposed" asynchronously, outside this try.
      if (!api.alive) return;
      try {
        plugin?.detach();
      } catch {
        /* series already removed */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, patterns, times]);

  // Click on a marked candle opens the explanation.
  useEffect(() => {
    if (!api) return;
    const handler = (param: { time?: Time }) => {
      if (param.time === undefined) return;
      const idx = indexByTime.get(timeKey(param.time));
      if (idx === undefined) return;
      const ps = patternsRef.current.filter((p) => p.index === idx);
      setInfo(ps.length > 0 ? { index: idx, kinds: ps.map((p) => p.kind) } : null);
    };
    api.chart.subscribeClick(handler);
    return () => {
      if (!api.alive) return;
      try {
        api.chart.unsubscribeClick(handler);
      } catch {
        /* chart disposed */
      }
    };
  }, [api, indexByTime]);

  // Delete key removes the selected drawing.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const el = e.target as HTMLElement | null;
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
        commit(drawings.filter((d) => d.id !== selected));
        setSelected(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, drawings, commit]);

  // ---- coordinate helpers ----
  const xOf = (ts: string): number | null => {
    const idx = indexByTs.get(ts);
    if (!api || idx === undefined) return null;
    try {
      return api.chart.timeScale().timeToCoordinate(times[idx]);
    } catch {
      return null; // chart disposed during re-create
    }
  };
  const yOf = (p: number): number | null => {
    if (!api) return null;
    try {
      return api.series.priceToCoordinate(p);
    } catch {
      return null; // chart disposed during re-create
    }
  };

  const pointFromEvent = (e: React.PointerEvent): DrawingPoint | null => {
    if (!api || candles.length === 0) return null;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const logical = api.chart.timeScale().coordinateToLogical(e.clientX - rect.left);
    const price = api.series.coordinateToPrice(e.clientY - rect.top);
    if (logical === null || price === null) return null;
    const idx = Math.min(candles.length - 1, Math.max(0, Math.round(logical)));
    return { ts: candles[idx].timestamp, price: Number(price) };
  };

  const onOverlayDown = (e: React.PointerEvent) => {
    if (!tool) return;
    const p = pointFromEvent(e);
    if (!p) return;
    e.preventDefault();
    const need = TOOL_POINT_COUNT[tool];
    const pts = [...pending, p];
    if (pts.length < need) {
      setPending(pts);
      return;
    }
    let text: string | undefined;
    if (tool === 'text') {
      const v = typeof window !== 'undefined' ? window.prompt(t('dw.text.prompt'), '') : null;
      if (!v || !v.trim()) {
        setPending([]);
        return;
      }
      text = v.trim().slice(0, 120);
    }
    const d: Drawing = { id: newDrawingId(), tool, points: pts, text };
    commit([...drawings, d]);
    setPending([]);
    setHover(null);
    setTool(null);
    setSelected(d.id);
  };

  const onOverlayMove = (e: React.PointerEvent) => {
    if (tool && pending.length > 0) setHover(pointFromEvent(e));
  };

  const pickTool = (next: DrawingTool | null) => {
    setPending([]);
    setHover(null);
    setSelected(null);
    setTool(next === tool ? null : next);
  };

  // ---- rendering ----
  const colors = {
    line: cssVar('--accent-text', '#A8C2E8'),
    fib: cssVar('--warning', '#D9BE6C'),
    pos: cssVar('--positive', '#6CB4E4'),
    neg: cssVar('--negative', '#E8A27C'),
    text: cssVar('--text-strong', '#FFFFFF'),
  };
  let W = wrapRef.current?.clientWidth ?? 0;
  let H = wrapRef.current?.clientHeight ?? 0;
  if (api) {
    try {
      const ps = api.chart.paneSize(0);
      W = ps.width;
      H = ps.height;
    } catch {
      /* fall back to wrapper size */
    }
  }

  const renderDrawing = (d: Drawing, preview = false) => {
    const sel = d.id === selected;
    const sw = sel ? 2.5 : 1.5;
    const opacity = preview ? 0.6 : 1;
    const hit = {
      pointerEvents: preview || tool ? ('none' as const) : ('stroke' as const),
      cursor: 'pointer',
    };
    const onSel = (ev: React.PointerEvent) => {
      if (tool || preview) return;
      ev.stopPropagation();
      setSelected(d.id);
    };
    const ys = d.points.map((p) => yOf(p.price));
    const xs = d.points.map((p) => xOf(p.ts));
    const g = (children: ReactNode) => (
      <g key={d.id + (preview ? '-p' : '')} opacity={opacity} onPointerDown={onSel} style={hit}>
        {children}
      </g>
    );
    if (d.tool === 'hline') {
      if (ys[0] === null) return null;
      return g(
        <>
          <line x1={0} x2={W} y1={ys[0]} y2={ys[0]} stroke={colors.line} strokeWidth={sw} strokeDasharray="6 3" />
          <line x1={0} x2={W} y1={ys[0]} y2={ys[0]} stroke="transparent" strokeWidth={14} />
          <text x={6} y={ys[0] - 4} fontSize={10} fill={colors.line}>{fmtPrice(d.points[0].price)}</text>
        </>
      );
    }
    if (xs.some((x) => x === null) || ys.some((y) => y === null)) return null;
    const [x1, x2] = xs as number[];
    const [y1, y2] = ys as number[];
    if (d.tool === 'text') {
      return g(
        <>
          <circle cx={x1} cy={y1} r={3} fill={colors.line} />
          <text x={x1 + 6} y={y1 - 6} fontSize={12} fill={colors.text} stroke={sel ? colors.line : 'none'} strokeWidth={sel ? 0.5 : 0} style={{ pointerEvents: 'all' }}>
            {d.text}
          </text>
        </>
      );
    }
    if (d.tool === 'trend') {
      return g(
        <>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={colors.line} strokeWidth={sw} />
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={14} />
          <circle cx={x1} cy={y1} r={sel ? 4 : 2.5} fill={colors.line} />
          <circle cx={x2} cy={y2} r={sel ? 4 : 2.5} fill={colors.line} />
        </>
      );
    }
    if (d.tool === 'zone') {
      return g(
        <rect
          x={Math.min(x1, x2)}
          y={Math.min(y1, y2)}
          width={Math.abs(x2 - x1)}
          height={Math.abs(y2 - y1)}
          fill={colors.line}
          fillOpacity={0.14}
          stroke={colors.line}
          strokeWidth={sw}
          style={{ pointerEvents: 'all' }}
        />
      );
    }
    // fib
    const levels = fibLevels(d.points[0].price, d.points[1].price);
    const left = Math.min(x1, x2);
    return g(
      <>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={colors.fib} strokeWidth={1} strokeDasharray="3 3" />
        {levels.map((lv) => {
          const y = yOf(lv.price);
          if (y === null) return null;
          return (
            <g key={lv.ratio}>
              <line x1={left} x2={W} y1={y} y2={y} stroke={colors.fib} strokeWidth={sel ? 2 : 1} opacity={0.85} />
              <line x1={left} x2={W} y1={y} y2={y} stroke="transparent" strokeWidth={10} />
              <text x={left + 4} y={y - 3} fontSize={10} fill={colors.fib}>
                {`${+(lv.ratio * 100).toFixed(1)}% · ${fmtPrice(lv.price)}`}
              </text>
            </g>
          );
        })}
      </>
    );
  };

  const previewDrawing: Drawing | null =
    tool && pending.length > 0 && hover && TOOL_POINT_COUNT[tool] === 2
      ? { id: 'preview', tool, points: [pending[0], hover] }
      : null;

  const pendingDot = pending.length > 0 && tool ? { x: xOf(pending[0].ts), y: yOf(pending[0].price) } : null;

  const infoPatterns = info ? info.kinds : [];
  const hasSelected = selected !== null && drawings.some((d) => d.id === selected);
  const hint = tool ? (pending.length > 0 ? t('dw.hint.second') : t('dw.hint.first')) : null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 border-b border-[var(--border)]" role="toolbar" aria-label={t('dw.toolbar.aria')}>
        <button type="button" className={`${btn} ${tool === null ? btnOn : btnIdle}`} title={t('dw.tool.select')} aria-label={t('dw.tool.select')} aria-pressed={tool === null} onClick={() => pickTool(null)}>
          <MousePointer2 size={15} />
        </button>
        {TOOL_ICONS.map(({ tool: tl, Icon }) => (
          <button key={tl} type="button" className={`${btn} ${tool === tl ? btnOn : btnIdle}`} title={t(`dw.tool.${tl}`)} aria-label={t(`dw.tool.${tl}`)} aria-pressed={tool === tl} onClick={() => pickTool(tl)}>
            <Icon size={15} />
          </button>
        ))}
        <span className="w-px h-5 bg-[var(--border)] mx-0.5" aria-hidden="true" />
        <button type="button" className={`${btn} ${btnIdle}`} title={t('dw.delete')} aria-label={t('dw.delete')} disabled={!hasSelected} onClick={() => { commit(drawings.filter((d) => d.id !== selected)); setSelected(null); }}>
          <Trash2 size={15} />
        </button>
        <button
          type="button"
          className={`${btn} ${btnIdle}`}
          title={t('dw.clear')}
          aria-label={t('dw.clear')}
          disabled={drawings.length === 0}
          onClick={() => {
            if (typeof window === 'undefined' || window.confirm(t('dw.clear.confirm'))) {
              commit([]);
              setSelected(null);
            }
          }}
        >
          <Eraser size={15} />
        </button>
        <span className="w-px h-5 bg-[var(--border)] mx-0.5" aria-hidden="true" />
        <label className={`${btn} gap-1.5 cursor-pointer ${showPatterns && isD1 ? btnOn : btnIdle} ${!isD1 ? 'opacity-40 cursor-not-allowed' : ''}`} title={isD1 ? undefined : t('dw.onlyD1')}>
          <input type="checkbox" className="accent-[var(--accent)]" checked={showPatterns && isD1} disabled={!isD1} onChange={(e) => setShowPatterns(e.target.checked)} />
          {t('dw.patterns')}
        </label>
        <label className={`${btn} gap-1.5 cursor-pointer ${showZones && isD1 ? btnOn : btnIdle} ${!isD1 ? 'opacity-40 cursor-not-allowed' : ''}`} title={isD1 ? undefined : t('dw.onlyD1')}>
          <input type="checkbox" className="accent-[var(--accent)]" checked={showZones && isD1} disabled={!isD1} onChange={(e) => setShowZones(e.target.checked)} />
          {t('dw.zones')}
        </label>
        {hint && <span className="text-[11px] text-[var(--accent-text)] ml-1" role="status">{hint}</span>}
      </div>

      <div ref={wrapRef} className="relative">
        {children}
        {api && W > 0 && (
          <svg
            className="absolute left-0 top-0 z-[5]"
            width={W}
            height={H}
            style={{ pointerEvents: 'none', overflow: 'hidden' }}
            data-testid="chart-annotations"
          >
            {zones.map((z, i) => {
              const yTop = yOf(z.high);
              const yBot = yOf(z.low);
              if (yTop === null || yBot === null) return null;
              const col = z.kind === 'support' ? colors.pos : colors.neg;
              const h = Math.max(2, yBot - yTop);
              return (
                <g key={`z${i}`}>
                  <rect x={0} y={yTop} width={W} height={h} fill={col} fillOpacity={0.12} stroke={col} strokeOpacity={0.5} strokeDasharray="4 3" />
                  <text x={W - 6} y={yTop + 11} fontSize={10} textAnchor="end" fill={col}>{t(`dw.zone.${z.kind}`, { n: z.touches })}</text>
                </g>
              );
            })}
            {drawings.map((d) => renderDrawing(d))}
            {previewDrawing && renderDrawing(previewDrawing, true)}
            {pendingDot && pendingDot.x !== null && pendingDot.y !== null && <circle cx={pendingDot.x} cy={pendingDot.y} r={4} fill={colors.line} />}
          </svg>
        )}
        {api && tool && (
          <div
            className="absolute left-0 top-0 z-[6] cursor-crosshair"
            style={{ width: W, height: H, touchAction: 'none' }}
            onPointerDown={onOverlayDown}
            onPointerMove={onOverlayMove}
            data-testid="chart-draw-capture"
          />
        )}
      </div>

      {info && infoPatterns.length > 0 && (
        <div className="px-3 py-2 border-t border-[var(--border)] bg-[var(--surface-2)] text-xs text-[var(--text)]" data-testid="pattern-info">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1.5">
              <div className="text-[var(--text-strong)] font-medium">
                {candles[info.index]?.timestamp.slice(0, 10)}
              </div>
              {infoPatterns.map((k) => (
                <p key={k}>
                  <span className="text-[var(--text-strong)] font-medium">{t(`dw.p.${k}.name`)}.</span> {t(`dw.p.${k}.desc`)}
                </p>
              ))}
              <button type="button" className="inline-flex items-center gap-1 text-[var(--accent-text)] hover:underline" title={t('dw.lesson.name')} onClick={() => setActiveModule('learn')}>
                <BookOpen size={13} /> {t('dw.lesson.open')}
              </button>
            </div>
            <button type="button" className={`${btn} ${btnIdle} h-6 min-w-6 px-1`} aria-label={t('dw.info.close')} onClick={() => setInfo(null)}>
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      <div className="px-3 py-1.5 border-t border-[var(--border)] text-[11px] text-[var(--text)]/60 space-y-0.5">
        {showPatterns && isD1 && !info && <p>{t('dw.info.hint')}</p>}
        <p>{t('dw.footnote')}</p>
        <p>{t('dw.saved')}</p>
      </div>
    </div>
  );
}

export default ChartAnnotations;
