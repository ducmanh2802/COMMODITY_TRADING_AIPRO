import { onTablistKeyDown, tablistRef } from '../../../shared/hooks/tablistKeys';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CrosshairMode, LineSeries, createChart, type IChartApi, type ISeriesApi, type Time } from 'lightweight-charts';
import { X } from 'lucide-react';
import { fetchCandles, fetchDatasets, type DatasetRecord } from '../../../api/dataApi';
import { useTerminal } from '../../../contexts/TerminalContext';
import { useT } from '../../../i18n';
import { LINE_WIDTH, lwBase, seriesColor, seriesVar } from '../../../shared/theme/chartTheme';
import type { MarketCandle } from '../../../shared/types/market';
import { CandleChart } from './CandleChart';
import {
  CHART_LAYOUTS,
  COMPARE_WINDOWS,
  MAX_COMPARE,
  MIN_COMPARE,
  layoutCount,
  normalizeSeries,
  parseLayout,
  presetIds,
  type ChartLayout,
  type CompareWindow,
} from './compareMath';

const LS_LAYOUT = 'cta.charts.layout';
const LS_PANES = 'cta.charts.panes';
const LS_CMP = 'cta.charts.compare';

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

interface D1Ref {
  instrumentId: string;
  contractCode: string;
}

/** One D1 dataset per instrument (first contract code alphabetically). */
function d1Index(datasets: DatasetRecord[]): Map<string, D1Ref> {
  const m = new Map<string, D1Ref>();
  for (const d of [...datasets].sort((a, b) => a.contractCode.localeCompare(b.contractCode))) {
    if (d.timeframe !== 'D1' || d.rowCount <= 0) continue;
    if (!m.has(d.instrumentId)) m.set(d.instrumentId, { instrumentId: d.instrumentId, contractCode: d.contractCode });
  }
  return m;
}

const PRESETS: { key: 'grains' | 'coffee' | 'metals' | 'oil'; ids: string[] }[] = [
  { key: 'grains', ids: ['CBOT:ZC', 'CBOT:ZW', 'CBOT:ZS'] },
  { key: 'coffee', ids: ['ICE:KC', 'ICE:RC'] },
  { key: 'metals', ids: ['COMEX:GC', 'COMEX:SI'] },
  { key: 'oil', ids: ['NYMEX:CL', 'ICE:BRN'] },
];

const btn =
  'px-3 py-1.5 text-xs rounded-md border border-[var(--border)] text-[var(--text)]/80 hover:text-[var(--text-strong)] hover:bg-[var(--surface-2)]';
const btnOn = 'px-3 py-1.5 text-xs rounded-md border border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]';
const selectCls =
  'bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-2 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]';

function useThemeKey(): string {
  const [k, setK] = useState(() => document.documentElement.getAttribute('data-theme') ?? 'dark');
  useEffect(() => {
    const mo = new MutationObserver(() => setK(document.documentElement.getAttribute('data-theme') ?? 'dark'));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);
  return k;
}

/** Loads D1 candles for instruments, cached per instrument id. */
function useD1Candles(ids: string[], index: Map<string, D1Ref>) {
  const [cache, setCache] = useState<Record<string, MarketCandle[] | 'error'>>({});
  const inflight = useRef(new Set<string>());
  useEffect(() => {
    for (const id of ids) {
      const ref = index.get(id);
      if (!ref || cache[id] || inflight.current.has(id)) continue;
      inflight.current.add(id);
      fetchCandles({ instrumentId: id, contractCode: ref.contractCode, timeframe: 'D1' })
        .then((r) =>
          setCache((c) => ({ ...c, [id]: r.status === 'HISTORICAL' ? r.candles.filter((x) => x.isComplete !== false) : 'error' }))
        )
        .catch(() => setCache((c) => ({ ...c, [id]: 'error' })))
        .finally(() => inflight.current.delete(id));
    }
  }, [ids, index, cache]);
  return cache;
}

type Hover = { date: string; values: Record<string, number | null> } | null;

function CompareChart({
  dates,
  series,
  colors,
  onHover,
}: {
  dates: string[];
  series: { id: string; values: (number | null)[] }[];
  colors: string[];
  onHover: (h: Hover) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const theme = useThemeKey();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart: IChartApi = createChart(el, {
      ...lwBase(),
      crosshair: { ...lwBase().crosshair, mode: CrosshairMode.Magnet },
    });
    const apis = new Map<string, ISeriesApi<'Line'>>();
    series.forEach((s, i) => {
      const line = chart.addSeries(LineSeries, {
        color: colors[i] ?? '#888888',
        lineWidth: LINE_WIDTH,
        priceLineVisible: false,
        priceFormat: { type: 'custom', formatter: (p: number) => `${p.toFixed(2)}%`, minMove: 0.01 },
      });
      const data: { time: Time; value: number }[] = [];
      s.values.forEach((v, k) => {
        if (v !== null) data.push({ time: dates[k] as Time, value: v });
      });
      line.setData(data);
      apis.set(s.id, line);
    });
    chart.timeScale().fitContent();
    chart.subscribeCrosshairMove((p) => {
      if (!p.time || p.seriesData.size === 0) return onHover(null);
      const values: Record<string, number | null> = {};
      for (const [id, api] of apis) {
        const d = p.seriesData.get(api) as { value?: number } | undefined;
        values[id] = d?.value ?? null;
      }
      onHover({ date: String(p.time), values });
    });
    return () => chart.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dates, series, colors, theme]);
  return <div ref={ref} className="w-full h-[320px] md:h-[400px]" />;
}

function loadSaved(): { ids: string[]; w: CompareWindow } {
  try {
    const raw = JSON.parse(lsGet(LS_CMP) ?? 'null') as { ids?: unknown; w?: unknown } | null;
    const ids = Array.isArray(raw?.ids) ? raw.ids.map(String).slice(0, MAX_COMPARE) : [];
    const w = COMPARE_WINDOWS.find((x) => x === raw?.w) ?? '1Y';
    return { ids, w };
  } catch {
    return { ids: [], w: '1Y' };
  }
}

function PerformanceCompare({ index, label }: { index: Map<string, D1Ref>; label: (id: string) => string }) {
  const t = useT();
  const theme = useThemeKey();
  const available = useMemo(() => [...index.keys()].sort(), [index]);
  const [selected, setSelected] = useState<string[]>(() => loadSaved().ids);
  const [win, setWin] = useState<CompareWindow>(() => loadSaved().w);
  const [query, setQuery] = useState('');
  const [hover, setHover] = useState<Hover>(null);

  useEffect(() => lsSet(LS_CMP, JSON.stringify({ ids: selected, w: win })), [selected, win]);

  const valid = useMemo(() => selected.filter((id) => index.has(id)), [selected, index]);
  const cache = useD1Candles(valid, index);
  const loading = valid.some((id) => !cache[id]);

  const normalized = useMemo(() => {
    const input = valid
      .map((id) => ({ id, c: cache[id] }))
      .filter((x): x is { id: string; c: MarketCandle[] } => Array.isArray(x.c))
      .map((x) => ({ id: x.id, points: x.c.map((c) => ({ date: c.timestamp.slice(0, 10), close: c.close })) }));
    return normalizeSeries(input, win);
  }, [valid, cache, win]);

  // Colour follows the entity: a slot is claimed once and kept while the entity stays selected (removing one never repaints the rest).
  const slotMap = useRef(new Map<string, number>());
  for (const id of [...slotMap.current.keys()]) if (!valid.includes(id)) slotMap.current.delete(id);
  for (const id of valid) {
    if (!slotMap.current.has(id)) {
      const used = new Set(slotMap.current.values());
      let k = 0;
      while (used.has(k)) k++;
      slotMap.current.set(id, k);
    }
  }
  const slotOf = (id: string) => (slotMap.current.get(id) ?? 0) + 1;
  const slotKey = valid.map((id) => `${id}:${slotOf(id)}`).join('|');
  const colors = useMemo(
    () => normalized.series.map((s) => seriesColor(slotOf(s.id) - 1)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [normalized, slotKey, theme]
  );
  const failed = valid.filter((id) => cache[id] === 'error');
  const q = query.trim().toLowerCase();
  const options = available.filter((id) => !valid.includes(id) && label(id).toLowerCase().includes(q));

  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--text)]/65">{t('cmp.intro')}</p>
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-[var(--text)]/65">{t('cmp.presets')}</span>
        {PRESETS.map((p) => {
          const ids = presetIds(p.ids, available);
          const ok = ids.length >= MIN_COMPARE;
          return (
            <button
              key={p.key}
              type="button"
              className={`${btn} disabled:opacity-40`}
              disabled={!ok}
              title={ok ? undefined : t('cmp.presetMissing')}
              onClick={() => setSelected(ids)}
            >
              {t(`cmp.p.${p.key}` as 'cmp.p.grains')}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-[var(--text)]/50">{t('cmp.presetNote')}</p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('cmp.window')}>
          {COMPARE_WINDOWS.map((w) => (
            <button key={w} type="button" className={w === win ? btnOn : btn} aria-pressed={w === win} onClick={() => setWin(w)}>
              {t(`cmp.w.${w}` as 'cmp.w.1M')}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('cmp.search')}
          aria-label={t('cmp.search')}
          className={`${selectCls} w-40`}
        />
        <select
          aria-label={t('cmp.add')}
          value=""
          disabled={valid.length >= MAX_COMPARE || options.length === 0}
          onChange={(e) => e.target.value && setSelected([...valid, e.target.value])}
          className={`${selectCls} min-w-[180px]`}
        >
          <option value="">{t('cmp.add')}</option>
          {options.map((id) => (
            <option key={id} value={id}>
              {label(id)}
            </option>
          ))}
        </select>
      </div>

      {available.length === 0 ? (
        <p className="text-sm text-[var(--text)]/65">{t('cmp.noData')}</p>
      ) : valid.length < MIN_COMPARE ? (
        <p className="text-sm text-[var(--text)]/65">{t('cmp.needTwo')}</p>
      ) : (
        <>
          {failed.map((id) => (
            <p key={id} className="text-xs text-[var(--negative)]">
              {t('cmp.err', { name: label(id) })}
            </p>
          ))}
          {loading && <p className="text-xs text-[var(--text)]/55">{t('cmp.loading')}</p>}
          {normalized.series.length >= 1 && (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-2">
              <CompareChart dates={normalized.dates} series={normalized.series} colors={colors} onHover={setHover} />
            </div>
          )}
          <div className="text-[11px] text-[var(--text)]/55 space-y-0.5">
            {normalized.startDate && <p>{t('cmp.start', { date: normalized.startDate })}</p>}
            <p>{t('cmp.gapNote')}</p>
          </div>
        </>
      )}

      {valid.length > 0 && (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2" aria-label={t('cmp.legend')}>
          {valid.map((id) => {
            const s = normalized.series.find((x) => x.id === id);
            const v = hover ? (hover.values[id] ?? null) : (s?.finalPct ?? null);
            return (
              <li key={id} className="flex items-center gap-2 bg-[var(--surface)] border border-[var(--border)] rounded-md px-3 py-2 text-xs">
                <span className="w-3 h-0.5 rounded-full shrink-0" style={{ background: seriesVar(slotOf(id) - 1) }} aria-hidden="true" />
                <span className="text-[var(--text-strong)] truncate flex-1">{label(id)}</span>
                <span
                  className="font-mono tabular-nums"
                  style={{ color: v === null ? 'var(--faint)' : 'var(--text-strong)' }}
                  title={hover ? t('cmp.asOf', { date: hover.date }) : t('cmp.final')}
                >
                  {v === null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`}
                </span>
                <button
                  type="button"
                  aria-label={t('cmp.remove', { name: label(id) })}
                  onClick={() => setSelected(valid.filter((x) => x !== id))}
                  className="text-[var(--text)]/55 hover:text-[var(--text-strong)]"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ChartPane({
  n,
  value,
  onChange,
  index,
  options,
  label,
}: {
  n: number;
  value: string;
  onChange: (v: string) => void;
  index: Map<string, D1Ref>;
  options: string[];
  label: (id: string) => string;
}) {
  const t = useT();
  const ids = useMemo(() => (value ? [value] : []), [value]);
  const cache = useD1Candles(ids, index);
  const raw = value ? cache[value] : undefined;
  const candles = Array.isArray(raw) ? raw : [];
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 min-w-0 space-y-2">
      <select
        aria-label={t('cmp.multi.instrument', { n })}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${selectCls} w-full`}
      >
        <option value="">{t('cmp.multi.none')}</option>
        {options.map((id) => (
          <option key={id} value={id}>
            {label(id)}
          </option>
        ))}
      </select>
      {candles.length > 0 ? (
        <CandleChart key={value} candles={candles} timeframe="D1" overlays={[]} lowerPane={null} showVolume={false} annotations={false} />
      ) : (
        <p className="text-xs text-[var(--text)]/55 py-10 text-center">{value && !raw ? t('cmp.loading') : t('cmp.multi.empty')}</p>
      )}
    </div>
  );
}

function MultiChart({ index, label }: { index: Map<string, D1Ref>; label: (id: string) => string }) {
  const t = useT();
  const options = useMemo(() => [...index.keys()].sort(), [index]);
  const [layout, setLayout] = useState<ChartLayout>(() => parseLayout(lsGet(LS_LAYOUT)));
  const [panes, setPanes] = useState<string[]>(() => {
    try {
      const v: unknown = JSON.parse(lsGet(LS_PANES) ?? '[]');
      return Array.isArray(v) ? v.map(String).slice(0, 4) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => lsSet(LS_LAYOUT, layout), [layout]);
  useEffect(() => lsSet(LS_PANES, JSON.stringify(panes)), [panes]);

  const count = layoutCount(layout);
  const slot = (i: number) => (panes[i] && index.has(panes[i]) ? panes[i] : (options[i] ?? ''));
  const grid = layout === '1x1' ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-[var(--text)]/65">{t('cmp.multi.layout')}</span>
        {CHART_LAYOUTS.map((l) => (
          <button key={l} type="button" className={l === layout ? btnOn : btn} aria-pressed={l === layout} onClick={() => setLayout(l)}>
            {t(`cmp.multi.l.${l}` as 'cmp.multi.l.1x1')}
          </button>
        ))}
      </div>
      <div className={`grid gap-3 ${grid}`}>
        {Array.from({ length: count }, (_, i) => (
          <ChartPane
            key={i}
            n={i + 1}
            value={slot(i)}
            options={options}
            index={index}
            label={label}
            onChange={(v) => setPanes(Array.from({ length: 4 }, (_, k) => (k === i ? v : slot(k))))}
          />
        ))}
      </div>
    </div>
  );
}

export function ChartCompareSection() {
  const t = useT();
  const { instruments } = useTerminal();
  const [tab, setTab] = useState<'compare' | 'multi'>('compare');
  const [datasets, setDatasets] = useState<DatasetRecord[]>([]);
  useEffect(() => {
    const ctrl = new AbortController();
    fetchDatasets(ctrl.signal)
      .then(setDatasets)
      .catch(() => undefined);
    return () => ctrl.abort();
  }, []);
  const index = useMemo(() => d1Index(datasets), [datasets]);
  const label = (id: string) => {
    const inst = instruments.find((i) => i.id === id);
    return inst ? `${id} — ${inst.commodityProfile?.vietnameseName ?? inst.productName}` : id;
  };
  return (
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-4">
      <div className="flex gap-2" role="tablist" ref={tablistRef} onKeyDown={onTablistKeyDown}>
        {(['compare', 'multi'] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? btnOn : btn} onClick={() => setTab(k)}>
            {t(k === 'compare' ? 'cmp.tab.compare' : 'cmp.tab.multi')}
          </button>
        ))}
      </div>
      {tab === 'compare' ? <PerformanceCompare index={index} label={label} /> : <MultiChart index={index} label={label} />}
    </section>
  );
}
