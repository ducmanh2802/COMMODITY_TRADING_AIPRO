/**
 * Drawdown / returns tab: cumulative simple return from the first observation, drawdown series and
 * maximum drawdown with peak / trough / recovery dates. Requires strictly positive prices
 * (see `src/shared/analytics/returns.ts`).
 */
import { useMemo, useState } from 'react';
import type { SeriesOption } from '../../../api/analysisApi';
import { cumulativeReturn, drawdown, totalReturn } from '../../../shared/analytics';
import { CHART_COLORS, type ChartLine, TimeSeriesChart } from './TimeSeriesChart';
import { Notice, Panel, SeriesIntegrity, SeriesSelect, StatusBlock, fmtDate, fmtNum, fmtPct, useLoadedSeries, useOptionMap } from './shared';

const pctFmt = (v: number) => `${v.toFixed(1)}%`;
const ZERO = [0];

export function DrawdownTab({ options }: { options: SeriesOption[] }) {
  const byKey = useOptionMap(options);
  const [key, setKey] = useState('');
  const option = byKey.get(key);
  const selected = useMemo(() => (option ? [option] : []), [option]);
  const { data, loading, error } = useLoadedSeries(selected);
  const s = data[0];

  const res = useMemo(() => {
    if (!s) return null;
    return { cum: cumulativeReturn(s.closes), dd: drawdown(s.closes), total: totalReturn(s.closes) };
  }, [s]);

  const cumLines = useMemo<ChartLine[]>(
    () =>
      res && res.cum.status === 'OK'
        ? [{ name: 'Cumulative return', color: CHART_COLORS[1], points: res.cum.timestamps.map((t, i) => ({ t, v: res.cum.values[i] === null ? null : (res.cum.values[i] as number) * 100 })) }]
        : [],
    [res]
  );
  const ddLines = useMemo<ChartLine[]>(
    () =>
      res && res.dd.status === 'OK'
        ? [{ name: 'Drawdown', color: CHART_COLORS[6], points: res.dd.timestamps.map((t, i) => ({ t, v: res.dd.values[i] === null ? null : (res.dd.values[i] as number) * 100 })) }]
        : [],
    [res]
  );

  const m = res?.dd.status === 'OK' ? res.dd.max : null;

  return (
    <div className="space-y-4">
      <Panel title="Returns & drawdown" subtitle="Cumulative return c[i] = p[i]/p[0] − 1; drawdown dd[i] = p[i]/max(p[0..i]) − 1. Gaps are not filled.">
        <div className="flex flex-wrap items-end gap-4">
          <SeriesSelect id="dd-series" label="Series" options={options} value={key} onChange={setKey} />
        </div>
        {loading && <p className="text-xs text-[#E5E7EB]/55">Loading candles…</p>}
        {error && <Notice tone="error">{error}</Notice>}
        {s && <SeriesIntegrity s={s} />}
      </Panel>

      {res && (
        <>
          <Panel title="Summary">
            <div className="grid gap-3 md:grid-cols-3">
              <StatusBlock label="Cumulative return" status={res.cum.status} reason={res.cum.reason} warnings={res.cum.warnings} />
              <StatusBlock label="Total return" status={res.total.status} reason={res.total.reason} warnings={res.total.warnings} />
              <StatusBlock label="Drawdown" status={res.dd.status} reason={res.dd.reason} warnings={res.dd.warnings} />
            </div>
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <Stat label="Total return" value={res.total.status === 'OK' ? fmtPct(res.total.value) : '—'} />
              <Stat label="Observations" value={res.cum.status === 'OK' ? String(res.cum.timestamps.length) : '—'} />
              <Stat label="Max drawdown" value={m ? fmtPct(m.maxDrawdown) : '—'} tone={m && m.maxDrawdown < 0 ? 'neg' : undefined} />
              <Stat label="Recovered" value={m ? (m.maxDrawdown === 0 ? 'n/a (no drawdown)' : m.recoveryT ? fmtDate(m.recoveryT) : 'not recovered') : '—'} />
              <Stat label="Peak" value={m ? `${fmtDate(m.peakT)} @ ${fmtNum(m.peakValue, 4)}` : '—'} />
              <Stat label="Trough" value={m ? `${fmtDate(m.troughT)} @ ${fmtNum(m.troughValue, 4)}` : '—'} />
            </dl>
          </Panel>
          {cumLines.length > 0 && (
            <Panel title="Cumulative return (%)">
              <TimeSeriesChart lines={cumLines} valueFormatter={pctFmt} referenceLines={ZERO} ariaLabel="Cumulative return chart" />
            </Panel>
          )}
          {ddLines.length > 0 && (
            <Panel title="Drawdown (%)">
              <TimeSeriesChart lines={ddLines} valueFormatter={pctFmt} height={200} ariaLabel="Drawdown chart" />
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'neg' }) {
  return (
    <div className="bg-[#0B0E14] border border-[#263244] rounded-md p-2.5">
      <dt className="text-[11px] text-[#E5E7EB]/55">{label}</dt>
      <dd className={`font-mono tabular-nums mt-0.5 ${tone === 'neg' ? 'text-[#EF4444]' : 'text-white'}`}>{value}</dd>
    </div>
  );
}
