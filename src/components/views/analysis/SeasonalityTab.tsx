import { ErrorNote } from '../../common/ErrorNote';
/**
 * Seasonality tab: monthly return statistics and the average-year path for one DAILY series.
 * Conventions (minYears, final-month exclusion, leap-calendar path) are in
 * `src/shared/analytics/seasonality.ts`. Statistics are shown only when status is OK; per-year
 * coverage counts are always shown so the user can see why minYears is not met.
 */
import { useMemo, useState } from 'react';
import type { SeriesOption } from '../../../api/analysisApi';
import { type PathPoint, seasonality } from '../../../shared/analytics';
import {
  Notice,
  NumberField,
  Panel,
  SeriesIntegrity,
  SeriesSelect,
  StatusBlock,
  fmtPct,
  inputClass,
  labelClass,
  useLoadedSeries,
  useOptionMap,
} from './shared';
import { fmtFixed, fmtInt, useT } from '../../../i18n';
import { SeasonalWindowCard } from './SeasonalWindowCard';
import { ChartTooltip, useChartTooltip } from '../../ui/viz/ChartTooltip';

const MONTH_NUMS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
const MONTH_START_IDX = [1, 32, 61, 92, 122, 153, 183, 214, 245, 275, 306, 336];

function PathChart({ path }: { path: PathPoint[] }) {
  const t = useT();
  const { wrapRef, tip, show, hide } = useChartTooltip();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const pts = path.filter((p) => p.mean !== null) as (PathPoint & { mean: number })[];
  if (pts.length < 2) return <p className="text-xs text-[var(--text)]/55">{t('an.seas.notEnough')}</p>;
  const W = 800;
  const H = 240;
  const pad = { l: 44, r: 10, t: 10, b: 24 };
  const ys = pts.map((p) => p.mean);
  const yMin = Math.min(...ys, 100);
  const yMax = Math.max(...ys, 100);
  const span = yMax - yMin || 1;
  const x = (d: number) => pad.l + ((d - 1) / 365) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - yMin) / span) * (H - pad.t - pad.b);
  // Break the line where a day has no contributing year (no interpolation across missing days).
  let d = '';
  let prev: number | null = null;
  for (const p of pts) {
    d += `${prev !== null && p.dayIndex === prev + 1 ? 'L' : 'M'}${x(p.dayIndex).toFixed(1)},${y(p.mean).toFixed(1)} `;
    prev = p.dayIndex;
  }
  // Isolated days (weekends break daily continuity) — also draw as dots so sparse paths stay visible.
  const ticks = [yMin, (yMin + yMax) / 2, yMax];
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / r.width) * W;
    let best = pts[0];
    for (const p of pts) if (Math.abs(x(p.dayIndex) - vx) < Math.abs(x(best.dayIndex) - vx)) best = p;
    setHoverIdx(best.dayIndex);
    show(e, t('an.seas.dayN', { n: best.dayIndex }), [{ label: '', value: fmtFixed(best.mean, 1), color: 'var(--series-1)' }]);
  };
  const hp = hoverIdx === null ? null : pts.find((p) => p.dayIndex === hoverIdx) ?? null;
  return (
    <div ref={wrapRef} className="relative" onPointerMove={onMove} onPointerLeave={() => { setHoverIdx(null); hide(); }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={t('an.seas.pathAria')}>
        {ticks.map((tk) => (
          <g key={tk}>
            <line x1={pad.l} x2={W - pad.r} y1={y(tk)} y2={y(tk)} stroke="var(--chart-grid)" strokeWidth={1} />
            <text x={pad.l - 4} y={y(tk) + 3} fontSize={10} textAnchor="end" fill="var(--muted)">
              {fmtFixed(tk, 1)}
            </text>
          </g>
        ))}
        <line x1={pad.l} x2={W - pad.r} y1={y(100)} y2={y(100)} stroke="var(--chart-axis)" strokeWidth={1} />
        {MONTH_START_IDX.map((idx, i) => (
          <text key={idx} x={x(idx)} y={H - 6} fontSize={10} fill="var(--muted)">
            {t(`an.month.${MONTH_NUMS[i]}`)}
          </text>
        ))}
        <path d={d} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hp && (
          <>
            <line x1={x(hp.dayIndex)} x2={x(hp.dayIndex)} y1={pad.t} y2={H - pad.b} stroke="var(--chart-crosshair)" strokeWidth={1} />
            <circle cx={x(hp.dayIndex)} cy={y(hp.mean)} r={4} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />
          </>
        )}
      </svg>
      <ChartTooltip tip={tip} />
    </div>
  );
}

export function SeasonalityTab({ options }: { options: SeriesOption[] }) {
  const t = useT();
  const byKey = useOptionMap(options);
  const [key, setKey] = useState('');
  const [minYears, setMinYears] = useState(5);
  const [includeFinalMonth, setIncludeFinalMonth] = useState(false);
  const [pathFill, setPathFill] = useState<'none' | 'carryForward'>('none');
  const option = byKey.get(key);
  const selected = useMemo(() => (option ? [option] : []), [option]);
  const { data, loading, error } = useLoadedSeries(selected);
  const s = data[0];

  const res = useMemo(() => (s ? seasonality(s.closes, { minYears, includeFinalMonth, pathFill }) : null), [s, minYears, includeFinalMonth, pathFill]);

  return (
    <div className="space-y-4">
      <Panel
        title={t('an.seas.title')}
        subtitle={t('an.seas.subtitle')}
      >
        <div className="flex flex-wrap items-end gap-4">
          <SeriesSelect id="seas-series" label={t('an.seas.series')} options={options} value={key} onChange={setKey} />
          <NumberField id="seas-minyears" label={t('an.seas.minYears')} value={minYears} onChange={setMinYears} min={1} />
          <div>
            <label htmlFor="seas-fill" className={labelClass}>
              {t('an.seas.pathFill')}
            </label>
            <select id="seas-fill" className={inputClass} value={pathFill} onChange={(e) => setPathFill(e.target.value as 'none' | 'carryForward')}>
              <option value="none">{t('an.seas.fillNone')}</option>
              <option value="carryForward">{t('an.seas.fillCarry')}</option>
            </select>
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-[var(--text)]/80 pb-1.5">
            <input type="checkbox" className="accent-[var(--accent)]" checked={includeFinalMonth} onChange={(e) => setIncludeFinalMonth(e.target.checked)} />
            {t('an.seas.includeFinal')}
          </label>
        </div>
        {option && option.timeframe !== 'D1' && <Notice tone="warn">{t('an.seas.needD1', { tf: option.timeframe })}</Notice>}
        {loading && <p className="text-xs text-[var(--text)]/55">{t('an.loadingCandles')}</p>}
        {error && <Notice tone="error"><ErrorNote error={error} className="text-inherit" /></Notice>}
        {s && <SeriesIntegrity s={s} />}
      </Panel>

      {s && option?.timeframe === 'D1' && <SeasonalWindowCard closes={s.closes} />}

      {res && (
        <>
          <Panel title={t('an.seas.coverage')} subtitle={t('an.seas.requirement', { n: Number.isFinite(minYears) ? minYears : '—' })}>
            <StatusBlock label={t('an.seas.title')} status={res.status} reason={res.reason} warnings={res.warnings} />
            {res.status !== 'INVALID_INPUT' && (
              <>
                <p className="text-xs font-mono text-[var(--text)]/80">
                  {t('an.seas.yearsCovered')} <span className="text-[var(--text-strong)]">{res.yearsCovered}</span>{' '}
                  {t('an.seas.required', { n: Number.isFinite(minYears) ? minYears : '—' })}
                </p>
                <div className="overflow-x-auto" tabIndex={0}>
                  <table className="text-xs font-mono min-w-[420px]">
                    <thead>
                      <tr className="text-[var(--text)]/60 border-b border-[var(--border)]">
                        <th className="py-1.5 pr-4 text-left font-medium">{t('an.seas.year')}</th>
                        <th className="py-1.5 px-3 text-right font-medium">{t('an.seas.observations')}</th>
                        <th className="py-1.5 px-3 text-right font-medium">{t('an.seas.monthlyReturns')}</th>
                        <th className="py-1.5 px-3 text-left font-medium">{t('an.seas.inPath')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]/70">
                      {res.years.map((y) => (
                        <tr key={y.year}>
                          <td className="py-1.5 pr-4 text-[var(--text-strong)]">{y.year}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums">{fmtInt(y.observations)}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums">{y.monthlyReturns}</td>
                          <td className="py-1.5 px-3">{y.includedInPath ? t('an.seas.yes') : t('an.seas.noNeeds')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Panel>

          {res.status === 'OK' && (
            <>
              <Panel title={t('an.seas.stats')}>
                <div className="overflow-x-auto" tabIndex={0}>
                  <table className="w-full text-xs font-mono min-w-[640px]">
                    <thead>
                      <tr className="text-[var(--text)]/60 border-b border-[var(--border)]">
                        <th className="py-1.5 pr-3 text-left font-medium">{t('an.seas.month')}</th>
                        <th className="py-1.5 px-3 text-right font-medium">n</th>
                        <th className="py-1.5 px-3 text-right font-medium">{t('an.seas.mean')}</th>
                        <th className="py-1.5 px-3 text-right font-medium">{t('an.seas.median')}</th>
                        <th className="py-1.5 px-3 text-right font-medium">{t('an.seas.pctPositive')}</th>
                        <th className="py-1.5 px-3 text-right font-medium">{t('an.seas.min')}</th>
                        <th className="py-1.5 px-3 text-right font-medium">{t('an.seas.max')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]/70">
                      {res.months.map((m) => (
                        <tr key={m.month} className={m.count < minYears ? 'text-[var(--text)]/45' : 'text-[var(--text)]/90'}>
                          <td className="py-1.5 pr-3">
                            {MONTH_NUMS[m.month - 1] ? t(`an.month.${MONTH_NUMS[m.month - 1]}`) : m.month}
                            {m.count < minYears && <span className="text-[var(--warning)] ml-1" title={t('an.seas.fewerTitle')}>*</span>}
                          </td>
                          <td className="py-1.5 px-3 text-right tabular-nums">{m.count}</td>
                          <td className={`py-1.5 px-3 text-right tabular-nums ${m.mean !== null && m.mean < 0 ? 'text-[var(--negative)]' : ''}`}>{fmtPct(m.mean)}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums">{fmtPct(m.median)}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums">{fmtPct(m.pctPositive, 0)}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums">{fmtPct(m.min)}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums">{fmtPct(m.max)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-[10px] text-[var(--text)]/45 mt-1">{t('an.seas.fewerNote')}</p>
                </div>
              </Panel>
              <Panel title={t('an.seas.avgPath')} subtitle={t('an.seas.avgPathSub')}>
                <PathChart path={res.path} />
              </Panel>
            </>
          )}
        </>
      )}
    </div>
  );
}
