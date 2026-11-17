/**
 * Volatility tab: close-to-close realized vol, Parkinson, Garman–Klass (all annualized by the shown
 * factor) and ATR% (not annualized) for one series. See `src/shared/analytics/volatility.ts`.
 */
import { useEffect, useMemo, useState } from 'react';
import type { SeriesOption } from '../../../api/analysisApi';
import {
  type SeriesResult,
  atrPercent,
  garmanKlassVolatility,
  parkinsonVolatility,
  realizedVolatility,
} from '../../../shared/analytics';
import { CHART_COLORS, type ChartLine, TimeSeriesChart } from './TimeSeriesChart';
import {
  Notice,
  NumberField,
  Panel,
  SeriesIntegrity,
  SeriesSelect,
  StatusBlock,
  defaultAnnualization,
  fmtDate,
  fmtPct,
  latestValue,
  useLoadedSeries,
  useOptionMap,
} from './shared';

const pctFmt = (v: number) => `${v.toFixed(1)}%`;

export function VolatilityTab({ options }: { options: SeriesOption[] }) {
  const byKey = useOptionMap(options);
  const [key, setKey] = useState('');
  const [windowLen, setWindowLen] = useState(20);
  const [af, setAf] = useState<number>(NaN);
  const [atrPeriod, setAtrPeriod] = useState(14);
  const option = byKey.get(key);
  const selected = useMemo(() => (option ? [option] : []), [option]);
  const { data, loading, error } = useLoadedSeries(selected);
  const s = data[0];

  // Reset annualization to the timeframe default whenever the series changes.
  useEffect(() => {
    setAf(option ? (defaultAnnualization(option.timeframe) ?? NaN) : NaN);
  }, [option]);

  const results = useMemo(() => {
    if (!s) return null;
    const o = { window: windowLen, annualizationFactor: af };
    return {
      realized: realizedVolatility(s.closes, o),
      parkinson: parkinsonVolatility(s.bars, o),
      gk: garmanKlassVolatility(s.bars, o),
      atr: atrPercent(s.bars, atrPeriod),
    };
  }, [s, windowLen, af, atrPeriod]);

  const volLines = useMemo<ChartLine[]>(() => {
    if (!results) return [];
    const mk = (name: string, r: SeriesResult, color: string): ChartLine | null =>
      r.status === 'OK' ? { name, color, points: r.timestamps.map((t, i) => ({ t, v: r.values[i] === null ? null : (r.values[i] as number) * 100 })) } : null;
    return [
      mk('Realized (close-close)', results.realized, CHART_COLORS[0]),
      mk('Parkinson', results.parkinson, CHART_COLORS[1]),
      mk('Garman–Klass', results.gk, CHART_COLORS[2]),
    ].filter((x): x is ChartLine => x !== null);
  }, [results]);

  const atrLines = useMemo<ChartLine[]>(() => {
    if (!results || results.atr.status !== 'OK') return [];
    return [{ name: `ATR% (${atrPeriod})`, color: CHART_COLORS[3], points: results.atr.timestamps.map((t, i) => ({ t, v: results.atr.values[i] })) }];
  }, [results, atrPeriod]);

  const rows: { label: string; r: SeriesResult; annualized: boolean }[] = results
    ? [
        { label: 'Realized vol (close-to-close, sample σ of log returns)', r: results.realized, annualized: true },
        { label: 'Parkinson (high-low)', r: results.parkinson, annualized: true },
        { label: 'Garman–Klass (OHLC)', r: results.gk, annualized: true },
        { label: `ATR% (Wilder, period ${atrPeriod})`, r: results.atr, annualized: false },
      ]
    : [];

  return (
    <div className="space-y-4">
      <Panel title="Volatility" subtitle="Annualized σ = σ per bar × √(annualization factor). ATR% is not annualized.">
        <div className="flex flex-wrap items-end gap-4">
          <SeriesSelect id="vol-series" label="Series" options={options} value={key} onChange={setKey} />
          <NumberField id="vol-window" label="Window (bars)" value={windowLen} onChange={setWindowLen} min={2} />
          <NumberField
            id="vol-af"
            label="Annualization factor"
            value={af}
            onChange={setAf}
            min={1}
            hint={option ? `default for ${option.timeframe}: ${defaultAnnualization(option.timeframe) ?? 'none — enter bars/year'}` : undefined}
          />
          <NumberField id="vol-atr" label="ATR period" value={atrPeriod} onChange={setAtrPeriod} min={1} />
        </div>
        {option && !Number.isFinite(af) && (
          <Notice tone="warn">No safe default annualization for timeframe {option.timeframe}: enter the number of bars per year.</Notice>
        )}
        {loading && <p className="text-xs text-[#E5E7EB]/55">Loading candles…</p>}
        {error && <Notice tone="error">{error}</Notice>}
        {s && <SeriesIntegrity s={s} />}
      </Panel>

      {results && (
        <>
          <Panel title="Latest values" subtitle={`Window ${windowLen} · annualization factor ${Number.isFinite(af) ? af : '—'}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[560px]">
                <thead>
                  <tr className="border-b border-[#263244] text-[#E5E7EB]/60">
                    <th className="py-2 pr-3 font-medium">Metric</th>
                    <th className="py-2 px-3 font-medium">Status</th>
                    <th className="py-2 px-3 font-medium text-right">Latest</th>
                    <th className="py-2 px-3 font-medium">As of</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#263244]/70">
                  {rows.map(({ label, r, annualized }) => {
                    const lv = r.status === 'OK' ? latestValue(r.timestamps, r.values) : null;
                    return (
                      <tr key={label}>
                        <td className="py-2 pr-3 text-[#E5E7EB]/85">
                          {label}
                          <span className="block text-[10px] text-[#E5E7EB]/45">{annualized ? `annualized ×√${Number.isFinite(af) ? af : '—'}` : 'not annualized'}</span>
                        </td>
                        <td className="py-2 px-3 font-mono">{r.status}</td>
                        <td className="py-2 px-3 font-mono text-right tabular-nums text-white">
                          {r.status === 'OK' ? (lv ? (annualized ? fmtPct(lv.v) : `${lv.v.toFixed(2)}%`) : '—') : '—'}
                        </td>
                        <td className="py-2 px-3 font-mono text-[#E5E7EB]/60">{r.status === 'OK' && lv ? fmtDate(lv.t) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {rows.map(({ label, r }) => (
                <StatusBlock key={label} label={label} status={r.status} reason={r.reason} warnings={r.warnings} />
              ))}
            </div>
          </Panel>

          {volLines.length > 0 && (
            <Panel title="Annualized volatility (%)">
              <TimeSeriesChart lines={volLines} valueFormatter={pctFmt} ariaLabel="Annualized volatility chart" />
            </Panel>
          )}
          {atrLines.length > 0 && (
            <Panel title="ATR % of close">
              <TimeSeriesChart lines={atrLines} valueFormatter={pctFmt} height={200} ariaLabel="ATR percent chart" />
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
