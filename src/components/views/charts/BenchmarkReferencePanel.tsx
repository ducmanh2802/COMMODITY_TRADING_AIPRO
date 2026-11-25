import { useEffect, useRef, useState } from 'react';
import { LineSeries, createChart, type UTCTimestamp } from 'lightweight-charts';
import { ArrowRight, ExternalLink, Info } from 'lucide-react';
import { fmtDate, fmtFixed, useT } from '../../../i18n';
import { LINE_WIDTH, lwBase, seriesColor } from '../../../shared/theme/chartTheme';
import { SessionHistoryTable } from '../../common/SessionHistoryTable';
import { SourceChip } from '../../common/SourceChip';

/** T76: reference (benchmark) line chart for instruments with no futures history. Never a contract price. */
interface BenchmarkItem {
  instrumentId: string;
  symbol: string;
  label: string;
  frequency: 'daily' | 'monthly';
}
interface BenchmarkSeries {
  instrumentId: string;
  label: string;
  frequency: 'daily' | 'monthly';
  unit: string;
  nativeUnit: string;
  conversionNote: string | null;
  source: string;
  sourceUrl: string;
  points: { date: string; value: number }[];
  lastUpdated: string | null;
  reason: string | null;
}

function BenchmarkLine({ points, unit, ariaLabel }: { points: BenchmarkSeries['points']; unit: string; ariaLabel: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [themeKey, setThemeKey] = useState(0);

  // Re-colour the chart when the user flips data-theme.
  useEffect(() => {
    const mo = new MutationObserver(() => setThemeKey((k) => k + 1));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || points.length === 0) return;
    const chart = createChart(el, {
      ...lwBase(),
      autoSize: false,
      height: 340,
      width: el.clientWidth,
      localization: { priceFormatter: (v: number) => fmtFixed(v, 2) },
    });
    const s = chart.addSeries(LineSeries, {
      color: seriesColor(0),
      lineWidth: LINE_WIDTH,
      title: unit,
      priceLineVisible: false,
    });
    s.setData(points.map((p) => ({ time: (Date.parse(`${p.date}T00:00:00Z`) / 1000) as UTCTimestamp, value: p.value })));
    chart.timeScale().fitContent();
    const ro = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth }));
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [points, unit, themeKey]);

  return <div ref={ref} role="img" aria-label={ariaLabel} className="w-full h-[340px]" data-testid="benchmark-chart" />;
}

export function BenchmarkReferencePanel() {
  const t = useT();
  const [items, setItems] = useState<BenchmarkItem[]>([]);
  const [selected, setSelected] = useState('');
  const [series, setSeries] = useState<BenchmarkSeries | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch('/api/benchmarks', { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { items: BenchmarkItem[] }) => {
        setItems(j.items);
        setSelected((cur) => cur || j.items[0]?.instrumentId || '');
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : String(e));
      });
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    if (!selected) return;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/benchmarks/${encodeURIComponent(selected)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: BenchmarkSeries) => setSeries(j))
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) {
          setSeries(null);
          setError(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [selected]);

  const freqLabel = (f: 'daily' | 'monthly') => t(f === 'daily' ? 'bm.freq.daily' : 'bm.freq.monthly');

  return (
    <section aria-label={t('bm.title')} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-[var(--text-strong)]">{t('bm.title')}</h2>
        <p className="text-xs text-[var(--text)]/65 mt-1 max-w-3xl">{t('bm.introShort')}</p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="bm-instrument" className="block text-xs font-medium text-[var(--text)]/75 mb-1">
            {t('bm.instrument')}
          </label>
          <select
            id="bm-instrument"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-2 text-xs text-[var(--text)] min-w-[200px] focus:outline-none focus:border-[var(--accent)]"
          >
            {items.map((i) => (
              <option key={i.instrumentId} value={i.instrumentId}>
                {i.instrumentId} ({freqLabel(i.frequency)})
              </option>
            ))}
          </select>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[var(--warning)]/50 bg-[var(--warning)]/10 text-xs font-medium text-[var(--warning)]">
          <Info className="w-3.5 h-3.5" aria-hidden="true" />
          {t('bm.badge')}
        </span>
      </div>

      {error && <p role="alert" className="text-xs text-[var(--warning)]">{t('bm.error', { msg: error })}</p>}

      {loading ? (
        <p className="h-[340px] flex items-center justify-center text-xs text-[var(--text)]/55">{t('bm.loading')}</p>
      ) : series && series.points.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {series.unit !== series.nativeUnit ? (
              <span
                className="inline-flex min-h-9 items-center gap-1 rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2.5 font-mono text-[var(--text-strong)] break-all"
                aria-label={t('bm.unitConvertedAria', { native: series.nativeUnit, unit: series.unit })}
              >
                <span className="text-[var(--muted)]">{series.nativeUnit}</span>
                <ArrowRight className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span>{series.unit}</span>
              </span>
            ) : (
              <span
                className="inline-flex min-h-9 items-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 font-mono text-[var(--text-strong)] break-all"
                aria-label={t('bm.unitPillAria', { unit: series.unit })}
              >
                {series.unit}
              </span>
            )}
            <SourceChip sources={[series.source, series.sourceUrl]}>{series.source}</SourceChip>
            <span className="inline-flex min-h-9 items-center rounded-full border border-[var(--border)] px-2.5 text-[var(--text)]/80">
              {freqLabel(series.frequency)} · {series.lastUpdated ? fmtDate(series.lastUpdated) : t('common.na')}
            </span>
          </div>
          <BenchmarkLine points={series.points} unit={series.unit} ariaLabel={t('bm.chartLabel', { label: series.label })} />
          <details className="text-xs text-[var(--text)]/80">
            <summary className="cursor-pointer select-none min-h-9 flex items-center text-[var(--text)]/70">{t('bm.details')}</summary>
            <div className="mt-2 space-y-2">
              <p className="text-[var(--text)]/70">{t('bm.intro')}</p>
              <dl className="flex flex-wrap gap-x-6 gap-y-1">
                <div>
                  <dt className="inline text-[var(--text)]/55">{t('bm.source')}: </dt>
                  <dd className="inline text-[var(--text-strong)]">{series.source}</dd>
                </div>
                <div>
                  <dt className="inline text-[var(--text)]/55">{t('bm.frequency')}: </dt>
                  <dd className="inline text-[var(--text-strong)]">{freqLabel(series.frequency)}</dd>
                </div>
                <div>
                  <dt className="inline text-[var(--text)]/55">{t('bm.lastDate')}: </dt>
                  <dd className="inline text-[var(--text-strong)]">{series.lastUpdated ? fmtDate(series.lastUpdated) : t('common.na')}</dd>
                </div>
                <div>
                  <dt className="inline text-[var(--text)]/55">{t('bm.unit')}: </dt>
                  <dd className="inline font-mono text-[var(--text-strong)]">{series.unit}</dd>
                </div>
                <div className="text-[var(--text)]/55">{t('bm.points', { n: series.points.length })}</div>
              </dl>
              <p>{series.label}</p>
              <p className="text-[11px] text-[var(--text)]/60">
                {series.unit !== series.nativeUnit && <>{t('bm.nativeUnit', { unit: series.nativeUnit })} {series.conversionNote} </>}
                {t('bm.unitNote')}
              </p>
              <a
                href={series.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-[var(--accent-text)] hover:underline"
              >
                {t('bm.openSource')}
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
            </div>
          </details>
          <SessionHistoryTable
            mode="benchmark"
            points={series.points}
            frequency={series.frequency}
            unit={series.unit}
            sourceLabel={series.source}
          />
        </>
      ) : (
        !error && (
          <div className="h-[200px] flex flex-col items-center justify-center text-center gap-1">
            <p className="text-sm text-[var(--text-strong)]">{t('bm.empty')}</p>
            {series?.reason && <p className="text-xs text-[var(--text)]/60 max-w-md">{series.reason}</p>}
          </div>
        )
      )}
    </section>
  );
}
