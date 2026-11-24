import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CandlestickSeries, createChart, type IChartApi, type IPriceLine, type ISeriesApi, type Time } from 'lightweight-charts';
import { Eye, EyeOff, FastForward, Pause, Play, StepForward } from 'lucide-react';
import { useTerminal } from '../../../contexts/TerminalContext';
import { fmtFixed, fmtInt, useT, type TKey } from '../../../i18n';
import { fetchJsonWithRetry } from '../../../shared/utils/http';
import type { MarketCandle } from '../../../shared/types/market';
import { chartPalette, useThemeKey } from '../../../shared/theme/chartColors';
import { lwBase } from '../../../shared/theme/chartTheme';
import { validateSpec } from '../papertrade/paperMath';
import { Stat, bigBtn, cardCls, inputCls, labelCls } from '../papertrade/paperUi';
import {
  HISTORY_BARS,
  MAX_RISK_PCT,
  advance,
  cancelOrder,
  closeNow,
  computeStats,
  createReplay,
  cursorForDate,
  equityUsd,
  finish,
  maxContractsFor,
  openR,
  placeOrder,
  randomCursor,
  type Bar,
  type ReplayState,
  type Side,
} from './replayEngine';

const SPEEDS = [1, 2, 5] as const;
const BASE_MS = 900;

const num = (s: string): number => Number(s.trim().replace(',', '.'));
const fmtR = (r: number): string => `${r > 0 ? '+' : ''}${fmtFixed(r, 2)}`;

/** 2026-03-12 -> 12/03/2026 (leaves anything else untouched). */
function fmtIsoDate(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
}

function toBars(candles: MarketCandle[]): Bar[] {
  const seen = new Set<string>();
  const out: Bar[] = [];
  for (const c of [...candles].sort((a, b) => a.timestamp.localeCompare(b.timestamp))) {
    const d = c.timestamp.slice(0, 10);
    if (seen.has(d) || ![c.open, c.high, c.low, c.close].every((v) => Number.isFinite(v) && v > 0)) continue;
    seen.add(d);
    out.push({ t: d, o: c.open, h: c.high, l: c.low, c: c.close });
  }
  return out;
}

interface Meta {
  name: string;
  hasSpec: boolean;
}

function ReplayChart({ state, blind, revealAll }: { state: ReplayState; blind: boolean; revealAll: boolean }) {
  const t = useT();
  const themeKey = useThemeKey();
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);
  const fittedRef = useRef(false);
  const hideTime = blind && !revealAll;

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const pal = chartPalette();
    const chart = createChart(el, lwBase());
    chart.applyOptions({ timeScale: { visible: !hideTime, rightOffset: 4 } });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: pal.up,
      downColor: pal.down,
      borderUpColor: pal.up,
      borderDownColor: pal.down,
      wickUpColor: pal.up,
      wickDownColor: pal.down,
    });
    chartRef.current = chart;
    seriesRef.current = series;
    linesRef.current = [];
    fittedRef.current = false;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      linesRef.current = [];
    };
  }, [themeKey, hideTime]);

  const { bars, cursor, position, pending, startCursor } = state;
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;
    const last = revealAll ? bars.length - 1 : cursor;
    const first = revealAll ? 0 : Math.max(0, startCursor - HISTORY_BARS + 1);
    series.setData(bars.slice(first, last + 1).map((b) => ({ time: b.t as Time, open: b.o, high: b.h, low: b.l, close: b.c })));
    if (!fittedRef.current || revealAll) {
      chart.timeScale().fitContent();
      fittedRef.current = true;
    } else {
      chart.timeScale().scrollToRealTime();
    }
    for (const l of linesRef.current) series.removePriceLine(l);
    linesRef.current = [];
    const pal = chartPalette();
    const lv = position ?? (pending ? { entry: null, stop: pending.stop, target: pending.target } : null);
    if (lv && !revealAll) {
      if (position) linesRef.current.push(series.createPriceLine({ price: position.entry, color: pal.accent, lineWidth: 1, lineStyle: 0, title: 'E' }));
      linesRef.current.push(series.createPriceLine({ price: lv.stop, color: pal.down, lineWidth: 1, lineStyle: 2, title: 'SL' }));
      linesRef.current.push(series.createPriceLine({ price: lv.target, color: pal.up, lineWidth: 1, lineStyle: 2, title: 'TP' }));
    }
  }, [bars, cursor, startCursor, position, pending, revealAll, themeKey, hideTime]);

  return <div ref={hostRef} role="img" aria-label={t('rp.chart.aria')} className="w-full h-[360px] rounded-md overflow-hidden border border-[var(--border)]" />;
}

export function ReplayView() {
  const t = useT();
  const { instruments } = useTerminal();
  const list = useMemo(() => instruments.filter((i) => i.enabled), [instruments]);
  const [instId, setInstId] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [blind, setBlind] = useState(true);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'nodata' | 'error'>('idle');
  const [state, setState] = useState<ReplayState | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [stop, setStop] = useState('');
  const [target, setTarget] = useState('');
  const [contracts, setContracts] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);

  useEffect(() => {
    if (!instId && list.length) setInstId(list[0].id);
  }, [list, instId]);

  const start = useCallback(async () => {
    const inst = list.find((i) => i.id === instId);
    if (!inst) return;
    setLoadState('loading');
    setState(null);
    setPlaying(false);
    setError(null);
    setNotice(null);
    try {
      const res = await fetchJsonWithRetry<{ candles?: MarketCandle[] }>(`/api/market/candles/${encodeURIComponent(inst.id)}?timeframe=D1`);
      const bars = toBars(Array.isArray(res?.candles) ? res.candles : []);
      const cur = dateStr ? cursorForDate(bars, dateStr) : randomCursor(bars.length);
      if (cur === null) {
        setLoadState('nodata');
        return;
      }
      const spec = validateSpec(inst.specification);
      const pv = spec.ok ? spec.spec.pointValueUsd : 1;
      setMeta({ name: inst.productName, hasSpec: spec.ok });
      setState(createReplay(bars, cur, pv));
      setStop('');
      setTarget('');
      setContracts('1');
      setLoadState('idle');
    } catch {
      setLoadState('error');
    }
  }, [list, instId, dateStr]);

  const eventText = useCallback(
    (s: ReplayState): string | null => {
      const parts: string[] = [];
      for (const e of s.events) {
        if (e.type === 'FILLED') parts.push(t('rp.ev.filled', { side: t(e.side === 'LONG' ? 'rp.long' : 'rp.short'), price: fmtFixed(e.price, 2) }));
        else if (e.type === 'CANCELLED') parts.push(e.reason === 'GAP_INVALID' ? t('rp.ev.cancelled') : '');
        else {
          const key = `rp.ev.${e.trade.reason.toLowerCase()}` as TKey;
          parts.push(t(key, { r: fmtR(e.trade.r) }));
        }
      }
      const txt = parts.filter(Boolean).join(' ');
      return txt || null;
    },
    [t]
  );

  const step = useCallback(() => {
    setState((prev) => {
      if (!prev) return prev;
      const next = advance(prev);
      const txt = eventText(next);
      if (txt) setNotice(txt);
      if (next.finished || next.events.length) setPlaying(false);
      return next;
    });
  }, [eventText]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(step, BASE_MS / speed);
    return () => window.clearInterval(id);
  }, [playing, speed, step]);

  const submit = (side: Side) => {
    if (!state) return;
    setError(null);
    const res = placeOrder(state, { side, stop: num(stop), target: num(target), contracts: num(contracts) });
    if (res.error) {
      setError(t(`rp.err.${res.error}` as TKey));
      return;
    }
    setNotice(null);
    setState(res.state);
  };

  const sPlaying = state && !state.finished;
  const lastClose = state ? state.bars[state.cursor].c : 0;
  const stopN = num(stop);
  const riskPerContract = state && Number.isFinite(stopN) && stopN > 0 ? Math.abs(lastClose - stopN) * state.pointValueUsd : 0;
  const contractsN = num(contracts);
  const riskUsd = Number.isInteger(contractsN) && contractsN > 0 ? riskPerContract * contractsN : 0;
  const riskPct = state ? (riskUsd / state.startEquityUsd) * 100 : 0;
  const maxC = state && riskPerContract > 0 ? maxContractsFor(lastClose, stopN, state.pointValueUsd, state.startEquityUsd) : 0;

  const stats = state ? computeStats(state.closed) : null;
  const sideName = (s: Side) => t(s === 'LONG' ? 'rp.long' : 'rp.short');
  const revealed = !!state?.finished;
  const dateOf = (i: number) => fmtIsoDate(state?.bars[i].t ?? '');

  return (
    <div className="space-y-4">
      <div className={`${cardCls} space-y-3`}>
        <h2 className="text-base font-semibold text-[var(--text-strong)]">{t('rp.title')}</h2>
        <p className="text-sm text-[var(--text)]/80">{t('rp.intro')}</p>
        <details className="text-xs text-[var(--text)]/75">
          <summary className="cursor-pointer text-[var(--accent-text)]">{t('rp.rules.title')}</summary>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            {([1, 2, 3, 4, 5] as const).map((n) => (
              <li key={n}>{t(`rp.rules.${n}` as TKey)}</li>
            ))}
          </ul>
        </details>
      </div>

      {(!state || revealed) && (
        <div className={`${cardCls} space-y-3`}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="rp-inst">{t('rp.setup.instrument')}</label>
              <select id="rp-inst" className={inputCls} value={instId} onChange={(e) => setInstId(e.target.value)}>
                {list.map((i) => (
                  <option key={i.id} value={i.id}>{i.productName} · {i.exchangeSymbol}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="rp-date">{t('rp.setup.date')}</label>
              <input id="rp-date" type="date" className={inputCls} value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
              <p className="text-[11px] text-[var(--text)]/55 mt-1">{t('rp.setup.dateHint')}</p>
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm text-[var(--text)]/85 cursor-pointer">
            <input type="checkbox" className="mt-1" checked={blind} onChange={(e) => setBlind(e.target.checked)} />
            <span>
              {t('rp.setup.blind')}
              <span className="block text-[11px] text-[var(--text)]/55">{t('rp.setup.blindHint')}</span>
            </span>
          </label>
          <div className="flex flex-wrap gap-2 items-center">
            <button type="button" className={`${bigBtn} bg-[var(--accent)] text-white`} disabled={!instId || loadState === 'loading'} onClick={() => void start()}>
              {revealed ? t('rp.end.again') : dateStr ? t('rp.setup.start') : `${t('rp.setup.start')} (${t('rp.setup.random')})`}
            </button>
            {loadState === 'loading' && <span className="text-xs text-[var(--text)]/60">{t('rp.setup.loading')}</span>}
            {loadState === 'nodata' && <span className="text-xs text-[var(--warning)]" role="alert">{t('rp.setup.noData')}</span>}
            {loadState === 'error' && <span className="text-xs text-[var(--warning)]" role="alert">{t('rp.setup.loadErr')}</span>}
          </div>
        </div>
      )}

      {state && meta && (
        <div className={`${cardCls} space-y-3`}>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-2 text-[var(--text-strong)] font-semibold">
              {blind && !revealed ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
              {blind && !revealed ? t('rp.hidden') : meta.name}
              <span className="text-xs font-normal text-[var(--text)]/60">
                {blind && !revealed ? t('rp.hiddenDate') : `${dateOf(state.cursor)}`}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-[var(--text)]/60">
              <span
                role="progressbar"
                aria-label={t('rp.barAria', { n: state.cursor - state.startCursor, total: state.bars.length - 1 - state.startCursor })}
                aria-valuemin={0}
                aria-valuemax={Math.max(1, state.bars.length - 1 - state.startCursor)}
                aria-valuenow={state.cursor - state.startCursor}
                className="hidden sm:block h-1.5 w-24 rounded-full bg-[var(--surface-2)] overflow-hidden"
              >
                <span
                  className="block h-full rounded-full bg-[var(--accent)]"
                  style={{ width: `${Math.min(100, Math.max(0, ((state.cursor - state.startCursor) / Math.max(1, state.bars.length - 1 - state.startCursor)) * 100))}%` }}
                />
              </span>
              <span>{t('rp.bar', { n: state.cursor - state.startCursor, total: state.bars.length - 1 - state.startCursor })}</span>
            </div>
          </div>

          <ReplayChart state={state} blind={blind} revealAll={revealed} />

          {!meta.hasSpec && <p className="text-[11px] text-[var(--warning)]">{t('rp.setup.noSpec')}</p>}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label={t('rp.equity')} value={fmtInt(equityUsd(state))} />
            <Stat label={t('rp.totalR')} value={fmtR(stats?.totalR ?? 0)} />
            <Stat label={t('rp.openR')} value={openR(state) === null ? '—' : fmtR(openR(state) ?? 0)} />
            <Stat label={t('rp.trades')} value={String(stats?.trades ?? 0)} />
          </div>

          {sPlaying && (
            <>
              <p className="text-xs text-[var(--text)]/75" role="status">
                {state.position
                  ? t('rp.position', { side: sideName(state.position.side), n: state.position.contracts, entry: fmtFixed(state.position.entry, 2), stop: fmtFixed(state.position.stop, 2), target: fmtFixed(state.position.target, 2) })
                  : state.pending
                    ? t('rp.pending', { side: sideName(state.pending.side) })
                    : t('rp.flat')}
                {notice && <span className="block text-[var(--accent-text)] mt-1">{notice}</span>}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={`${bigBtn} border border-[var(--border)] text-[var(--text-strong)]`} onClick={step}>
                  <StepForward size={14} aria-hidden /> {t('rp.next')}
                </button>
                <button type="button" className={`${bigBtn} border border-[var(--border)] text-[var(--text-strong)]`} onClick={() => setPlaying((p) => !p)}>
                  {playing ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />} {playing ? t('rp.pause') : t('rp.play')}
                </button>
                <div className="flex items-center gap-1" role="group" aria-label={t('rp.speed')}>
                  <FastForward size={14} aria-hidden className="text-[var(--text)]/60" />
                  {SPEEDS.map((sp) => (
                    <button
                      key={sp}
                      type="button"
                      aria-pressed={speed === sp}
                      onClick={() => setSpeed(sp)}
                      className={`px-2.5 py-1.5 text-xs rounded-md border ${speed === sp ? 'bg-[var(--accent)] border-[var(--accent)] text-white' : 'border-[var(--border)] text-[var(--text)]/80'}`}
                    >
                      {sp}×
                    </button>
                  ))}
                </div>
                <button type="button" className={`${bigBtn} border border-[var(--border)] text-[var(--text)]/80 ml-auto`} onClick={() => { setPlaying(false); setState((s) => (s ? finish(s) : s)); }}>
                  {t('rp.finish')}
                </button>
              </div>

              {!state.position && (
                <div className="space-y-2 border-t border-[var(--border)] pt-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className={labelCls} htmlFor="rp-stop">{t('rp.field.stop')}</label>
                      <input id="rp-stop" inputMode="decimal" className={inputCls} value={stop} onChange={(e) => setStop(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="rp-target">{t('rp.field.target')}</label>
                      <input id="rp-target" inputMode="decimal" className={inputCls} value={target} onChange={(e) => setTarget(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="rp-n">{t('rp.field.contracts')}</label>
                      <input id="rp-n" inputMode="numeric" className={inputCls} value={contracts} onChange={(e) => setContracts(e.target.value)} />
                    </div>
                  </div>
                  {riskUsd > 0 && (
                    <p className={`text-[11px] ${riskPct > MAX_RISK_PCT ? 'text-[var(--warning)]' : 'text-[var(--text)]/65'}`}>
                      {t('rp.risk.preview', { usd: fmtInt(riskUsd), pct: fmtFixed(riskPct, 2), max: maxC })}
                      {riskPct > MAX_RISK_PCT && <span className="block">{t('rp.risk.over')}</span>}
                    </p>
                  )}
                  {error && <p className="text-xs text-[var(--warning)]" role="alert">{error}</p>}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={`${bigBtn} bg-[var(--positive)] text-white`} onClick={() => submit('LONG')}>{t('rp.buy')}</button>
                    <button type="button" className={`${bigBtn} bg-[var(--negative)] text-white`} onClick={() => submit('SHORT')}>{t('rp.sell')}</button>
                    {state.pending && (
                      <button type="button" className={`${bigBtn} border border-[var(--border)]`} onClick={() => setState((s) => (s ? cancelOrder(s) : s))}>{t('rp.cancelOrder')}</button>
                    )}
                  </div>
                </div>
              )}
              {state.position && (
                <button type="button" className={`${bigBtn} border border-[var(--accent)] text-[var(--accent-text)]`} onClick={() => setState((s) => (s ? closeNow(s) : s))}>
                  {t('rp.close')}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {state && revealed && stats && (
        <div className={`${cardCls} space-y-3`}>
          <h3 className="text-sm font-semibold text-[var(--text-strong)]">{t('rp.end.title')}</h3>
          <p className="text-xs text-[var(--text)]/75">
            {t('rp.end.reveal', { name: meta?.name ?? '', from: dateOf(state.startCursor), to: dateOf(state.cursor) })}
          </p>
          {stats.trades === 0 ? (
            <p className="text-sm text-[var(--text)]/75">{t('rp.end.noTrades')}</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <Stat label={t('rp.totalR')} value={fmtR(stats.totalR)} />
                <Stat label={t('rp.end.winRate')} value={`${fmtFixed(stats.winRate ?? 0, 0)}%`} />
                <Stat label={t('rp.trades')} value={String(stats.trades)} />
                <Stat label={t('rp.end.discipline')} value={`${fmtFixed(stats.disciplinePct ?? 0, 0)}%`} hint={t('rp.end.disciplineHint')} />
                <Stat label={t('rp.end.pnl')} value={`${stats.pnlUsd > 0 ? '+' : ''}${fmtInt(stats.pnlUsd)}`} />
              </div>
              <p className="text-[11px] text-[var(--text)]/55">{t('rp.end.disciplineHint')}</p>
              <div className="overflow-x-auto" tabIndex={0}>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[var(--text)]/55">
                      <th className="py-1 pr-2">{t('rp.col.side')}</th>
                      <th className="pr-2">{t('rp.col.entry')}</th>
                      <th className="pr-2">{t('rp.col.exit')}</th>
                      <th className="pr-2">{t('rp.col.reason')}</th>
                      <th className="pr-2">{t('rp.col.r')}</th>
                      <th>{t('rp.col.pnl')}</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono text-[var(--text-strong)]">
                    {state.closed.map((tr, i) => (
                      <tr key={i} className="border-t border-[var(--border)]">
                        <td className="py-1 pr-2">{sideName(tr.side)} x{tr.contracts}</td>
                        <td className="pr-2">{fmtFixed(tr.entry, 2)}</td>
                        <td className="pr-2">{fmtFixed(tr.exit, 2)}</td>
                        <td className="pr-2">{t(`rp.reason.${tr.reason}` as TKey)}</td>
                        <td className="pr-2">{fmtR(tr.r)}</td>
                        <td>{fmtInt(tr.pnlUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <p className="text-[11px] text-[var(--text)]/55">{t('rp.end.disclaimer')}</p>
        </div>
      )}
    </div>
  );
}
