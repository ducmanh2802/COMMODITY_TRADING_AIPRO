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
import { fmtFixed, fmtNum as fmtLocaleNum, useT } from '../../../i18n';
import {
  Notice,
  NumberField,
  Panel,
  SeriesIntegrity,
  SeriesSelect,
  StatusBlock,
  StatusChip,
  defaultAnnualization,
  fmtDate,
  fmtPct,
  latestValue,
  useLoadedSeries,
  useOptionMap,
} from './shared';

const pctFmt = (v: number) => `${fmtFixed(v, 1)}%`;

export function VolatilityTab({ options }: { options: SeriesOption[] }) {
  const t = useT();
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
      r.status === 'OK' ? { name, color, points: r.timestamps.map((ts, i) => ({ t: ts, v: r.values[i] === null ? null : (r.values[i] as number) * 100 })) } : null;
    return [
      mk(t('an.vol.realized'), results.realized, CHART_COLORS[0]),
      mk('Parkinson', results.parkinson, CHART_COLORS[1]),
      mk('Garman–Klass', results.gk, CHART_COLORS[2]),
    ].filter((x): x is ChartLine => x !== null);
  }, [results, t]);

  const atrLines = useMemo<ChartLine[]>(() => {
    if (!results || results.atr.status !== 'OK') return [];
    return [{ name: `ATR% (${atrPeriod})`, color: CHART_COLORS[3], points: results.atr.timestamps.map((ts, i) => ({ t: ts, v: results.atr.values[i] })) }];
  }, [results, atrPeriod]);

  const rows: { label: string; r: SeriesResult; annualized: boolean }[] = results
    ? [
        { label: t('an.vol.realizedLong'), r: results.realized, annualized: true },
        { label: t('an.vol.parkinsonLong'), r: results.parkinson, annualized: true },
        { label: 'Garman–Klass (OHLC)', r: results.gk, annualized: true },
        { label: t('an.vol.atrLong', { n: atrPeriod }), r: results.atr, annualized: false },
      ]
    : [];

  return (
    <div className="space-y-4">
      <Panel title={t('an.vol.title')} subtitle={t('an.vol.subtitle')}>
        <div className="flex flex-wrap items-end gap-4">
          <SeriesSelect id="vol-series" label={t('an.series')} options={options} value={key} onChange={setKey} />
          <NumberField id="vol-window" label={t('an.vol.window')} value={windowLen} onChange={setWindowLen} min={2} />
          <NumberField
            id="vol-af"
            label={t('an.vol.af')}
            value={af}
            onChange={setAf}
            min={1}
            hint={option ? t('an.vol.afHint', { tf: option.timeframe, v: defaultAnnualization(option.timeframe) ?? t('an.vol.afNone') }) : undefined}
          />
          <NumberField id="vol-atr" label={t('an.vol.atrPeriod')} value={atrPeriod} onChange={setAtrPeriod} min={1} />
        </div>
        {option && !Number.isFinite(af) && (
          <Notice tone="warn">{t('an.vol.noAf', { tf: option.timeframe })}</Notice>
        )}
        {loading && <p className="text-xs text-[var(--text)]/55">{t('an.loadingCandles')}</p>}
        {error && <Notice tone="error">{error}</Notice>}
        {s && <SeriesIntegrity s={s} />}
      </Panel>

      {results && (
        <>
          <Panel title={t('an.vol.latest')} subtitle={t('an.vol.latestSub', { w: windowLen, af: Number.isFinite(af) ? af : '—' })}>
            <div className="overflow-x-auto" tabIndex={0}>
              <table className="w-full text-left text-xs min-w-[560px]">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--text)]/60">
                    <th className="py-2 pr-3 font-medium">{t('an.vol.metric')}</th>
                    <th className="py-2 px-3 font-medium">{t('common.status')}</th>
                    <th className="py-2 px-3 font-medium text-right">{t('an.vol.latestCol')}</th>
                    <th className="py-2 px-3 font-medium">{t('an.vol.asOf')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]/70">
                  {rows.map(({ label, r, annualized }) => {
                    const lv = r.status === 'OK' ? latestValue(r.timestamps, r.values) : null;
                    return (
                      <tr key={label}>
                        <td className="py-2 pr-3 text-[var(--text)]/85">
                          {label}
                          <span className="block text-[10px] text-[var(--text)]/45">{annualized ? t('an.vol.annualized', { af: Number.isFinite(af) ? fmtLocaleNum(af) : '—' }) : t('an.vol.notAnnualized')}</span>
                        </td>
                        <td className="py-2 px-3 font-mono">
                          <StatusChip status={r.status} />
                        </td>
                        <td className="py-2 px-3 font-mono text-right tabular-nums text-[var(--text-strong)]">
                          {r.status === 'OK' ? (lv ? (annualized ? fmtPct(lv.v) : `${fmtFixed(lv.v, 2)}%`) : '—') : '—'}
                        </td>
                        <td className="py-2 px-3 font-mono text-[var(--text)]/60">{r.status === 'OK' && lv ? fmtDate(lv.t) : '—'}</td>
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
            <Panel title={t('an.vol.chart')}>
              <TimeSeriesChart lines={volLines} valueFormatter={pctFmt} ariaLabel={t('an.vol.chartAria')} />
            </Panel>
          )}
          {atrLines.length > 0 && (
            <Panel title={t('an.vol.atrChart')}>
              <TimeSeriesChart lines={atrLines} valueFormatter={pctFmt} height={200} ariaLabel={t('an.vol.atrAria')} />
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
