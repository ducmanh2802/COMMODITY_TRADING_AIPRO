/**
 * Drawdown / returns tab: cumulative simple return from the first observation, drawdown series and
 * maximum drawdown with peak / trough / recovery dates. Requires strictly positive prices
 * (see `src/shared/analytics/returns.ts`).
 */
import { useMemo, useState } from 'react';
import type { SeriesOption } from '../../../api/analysisApi';
import { cumulativeReturn, drawdown, totalReturn } from '../../../shared/analytics';
import { CHART_COLORS, type ChartLine, TimeSeriesChart } from './TimeSeriesChart';
import { fmtFixed, fmtInt, useT } from '../../../i18n';
import { Notice, Panel, SeriesIntegrity, SeriesSelect, StatusBlock, fmtDate, fmtNum, fmtPct, useLoadedSeries, useOptionMap } from './shared';

const pctFmt = (v: number) => `${fmtFixed(v, 1)}%`;
const ZERO = [0];

export function DrawdownTab({ options }: { options: SeriesOption[] }) {
  const t = useT();
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
        ? [{ name: t('an.dd.cumulative'), color: CHART_COLORS[1], points: res.cum.timestamps.map((ts, i) => ({ t: ts, v: res.cum.values[i] === null ? null : (res.cum.values[i] as number) * 100 })) }]
        : [],
    [res, t]
  );
  const ddLines = useMemo<ChartLine[]>(
    () =>
      res && res.dd.status === 'OK'
        ? [{ name: t('an.dd.drawdown'), color: CHART_COLORS[6], points: res.dd.timestamps.map((ts, i) => ({ t: ts, v: res.dd.values[i] === null ? null : (res.dd.values[i] as number) * 100 })) }]
        : [],
    [res, t]
  );

  const m = res?.dd.status === 'OK' ? res.dd.max : null;

  return (
    <div className="space-y-4">
      <Panel title={t('an.dd.title')} subtitle={t('an.dd.subtitle')}>
        <div className="flex flex-wrap items-end gap-4">
          <SeriesSelect id="dd-series" label={t('an.series')} options={options} value={key} onChange={setKey} />
        </div>
        {loading && <p className="text-xs text-[var(--text)]/55">{t('an.loadingCandles')}</p>}
        {error && <Notice tone="error">{error}</Notice>}
        {s && <SeriesIntegrity s={s} />}
      </Panel>

      {res && (
        <>
          <Panel title={t('an.summary')}>
            <div className="grid gap-3 md:grid-cols-3">
              <StatusBlock label={t('an.dd.cumulative')} status={res.cum.status} reason={res.cum.reason} warnings={res.cum.warnings} />
              <StatusBlock label={t('an.dd.total')} status={res.total.status} reason={res.total.reason} warnings={res.total.warnings} />
              <StatusBlock label={t('an.dd.drawdown')} status={res.dd.status} reason={res.dd.reason} warnings={res.dd.warnings} />
            </div>
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <Stat label={t('an.dd.total')} value={res.total.status === 'OK' ? fmtPct(res.total.value) : '—'} />
              <Stat label={t('an.dd.observations')} value={res.cum.status === 'OK' ? fmtInt(res.cum.timestamps.length) : '—'} />
              <Stat label={t('an.dd.maxDrawdown')} value={m ? fmtPct(m.maxDrawdown) : '—'} tone={m && m.maxDrawdown < 0 ? 'neg' : undefined} />
              <Stat
                label={t('an.dd.recovered')}
                value={m ? (m.maxDrawdown === 0 ? t('an.dd.noDrawdown') : m.recoveryT ? fmtDate(m.recoveryT) : t('an.dd.notRecovered')) : '—'}
              />
              <Stat label={t('an.dd.peak')} value={m ? `${fmtDate(m.peakT)} @ ${fmtNum(m.peakValue, 4)}` : '—'} />
              <Stat label={t('an.dd.trough')} value={m ? `${fmtDate(m.troughT)} @ ${fmtNum(m.troughValue, 4)}` : '—'} />
            </dl>
          </Panel>
          {cumLines.length > 0 && (
            <Panel title={t('an.dd.cumChart')}>
              <TimeSeriesChart lines={cumLines} valueFormatter={pctFmt} referenceLines={ZERO} ariaLabel={t('an.dd.cumAria')} />
            </Panel>
          )}
          {ddLines.length > 0 && (
            <Panel title={t('an.dd.ddChart')}>
              <TimeSeriesChart lines={ddLines} valueFormatter={pctFmt} height={200} ariaLabel={t('an.dd.ddAria')} />
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'neg' }) {
  return (
    <div className="bg-[var(--bg)] border border-[var(--border)] rounded-md p-2.5">
      <dt className="text-[11px] text-[var(--text)]/55">{label}</dt>
      <dd className={`font-mono tabular-nums mt-0.5 ${tone === 'neg' ? 'text-[var(--negative)]' : 'text-[var(--text-strong)]'}`}>{value}</dd>
    </div>
  );
}
