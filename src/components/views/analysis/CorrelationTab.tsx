/**
 * Correlation tab: correlation matrix of RETURNS (never price levels) for 2..8 series aligned on the
 * common timestamp intersection, plus rolling correlation and rolling beta for one pair.
 * Alignment drops and observation counts are always shown. See `src/shared/analytics/correlation.ts`.
 */
import { useMemo, useState } from 'react';
import type { SeriesOption } from '../../../api/analysisApi';
import { type ReturnKind, correlationMatrix, rollingBeta, rollingCorrelation } from '../../../shared/analytics';
import { CHART_COLORS, type ChartLine, TimeSeriesChart } from './TimeSeriesChart';
import {
  Notice,
  NumberField,
  Panel,
  SeriesIntegrity,
  StatusBlock,
  fmtDate,
  fmtNum,
  inputClass,
  labelClass,
  latestValue,
  useLoadedSeries,
  useOptionMap,
} from './shared';
import { fmtFixed, fmtInt, useT } from '../../../i18n';
import { divergingFill } from '../../../shared/theme/chartScale';
import { ScaleLegend } from '../../ui/viz/ScaleLegend';

const MAX_SERIES = 8;
const ZERO_LINE = [0];
const numFmt = (v: number) => fmtFixed(v, 2);

/** Diverging cell colour: --positive <-> neutral gray <-> --negative (|r| = intensity). */
const heatColor = (r: number) => divergingFill(r, 1);

export function CorrelationTab({ options }: { options: SeriesOption[] }) {
  const t = useT();
  const byKey = useOptionMap(options);
  const [keys, setKeys] = useState<string[]>([]);
  const [kind, setKind] = useState<ReturnKind>('log');
  const [minObs, setMinObs] = useState(20);
  const [pairA, setPairA] = useState('');
  const [pairB, setPairB] = useState('');
  const [rollWindow, setRollWindow] = useState(20);

  const selected = useMemo(() => keys.map((k) => byKey.get(k)).filter((o): o is SeriesOption => !!o), [keys, byKey]);
  const { data, loading, error } = useLoadedSeries(selected);

  const toggle = (k: string) =>
    setKeys((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : prev.length >= MAX_SERIES ? prev : [...prev, k]));

  const matrix = useMemo(() => {
    if (data.length < 2) return null;
    const input: Record<string, { t: string; v: number }[]> = {};
    for (const s of data) input[s.option.label] = s.closes;
    return correlationMatrix(input, { returns: kind, minObservations: minObs });
  }, [data, kind, minObs]);

  const a = data.find((s) => s.option.key === pairA);
  const b = data.find((s) => s.option.key === pairB);
  const pair = useMemo(() => {
    if (!a || !b || a === b) return null;
    return {
      corr: rollingCorrelation(a.closes, b.closes, { window: rollWindow, returns: kind }),
      beta: rollingBeta(a.closes, b.closes, { window: rollWindow, returns: kind }),
    };
  }, [a, b, rollWindow, kind]);

  const corrLines = useMemo<ChartLine[]>(
    () =>
      pair && pair.corr.status === 'OK'
        ? [{ name: t('an.corr.rollingCorr', { n: rollWindow }), color: CHART_COLORS[0], points: pair.corr.timestamps.map((ts, i) => ({ t: ts, v: pair.corr.values[i] })) }]
        : [],
    [pair, rollWindow, t]
  );
  const betaLines = useMemo<ChartLine[]>(
    () =>
      pair && pair.beta.status === 'OK'
        ? [{ name: t('an.corr.rollingBetaName', { n: rollWindow }), color: CHART_COLORS[2], points: pair.beta.timestamps.map((ts, i) => ({ t: ts, v: pair.beta.values[i] })) }]
        : [],
    [pair, rollWindow, t]
  );

  return (
    <div className="space-y-4">
      <Panel
        title={t('an.corr.title')}
        subtitle={t('an.corr.subtitle')}
      >
        <fieldset>
          <legend className={labelClass}>
            {t('an.corr.seriesLegend', { n: keys.length, max: MAX_SERIES })}
          </legend>
          {options.length === 0 ? (
            <p className="text-xs text-[var(--text)]/55">{t('an.corr.noDatasets')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {options.map((o) => {
                const checked = keys.includes(o.key);
                const disabled = !checked && keys.length >= MAX_SERIES;
                return (
                  <label
                    key={o.key}
                    className={`inline-flex items-center gap-1.5 border rounded px-2 py-1 text-[11px] font-mono cursor-pointer ${
                      checked ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--text-strong)]' : 'border-[var(--border)] text-[var(--text)]/75'
                    } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <input type="checkbox" className="accent-[var(--accent)]" checked={checked} disabled={disabled} onChange={() => toggle(o.key)} />
                    {o.label}
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="corr-kind" className={labelClass}>
              {t('an.corr.returns')}
            </label>
            <select id="corr-kind" className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as ReturnKind)}>
              <option value="log">{t('an.corr.log')}</option>
              <option value="simple">{t('an.corr.simple')}</option>
            </select>
          </div>
          <NumberField id="corr-minobs" label={t('an.corr.minObs')} value={minObs} onChange={setMinObs} min={2} />
        </div>
        {loading && <p className="text-xs text-[var(--text)]/55">{t('an.loadingCandles')}</p>}
        {error && <Notice tone="error">{error}</Notice>}
        {data.map((s) => (
          <SeriesIntegrity key={s.option.key} s={s} />
        ))}
        {keys.length === 1 && <Notice tone="info">{t('an.corr.selectTwo')}</Notice>}
      </Panel>

      {matrix && (
        <Panel title={t('an.corr.matrix')} subtitle={t('an.corr.matrixSub', { kind: kind === 'log' ? t('an.corr.log') : t('an.corr.simple') })}>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs font-mono text-[var(--text)]/80">
            <span>
              {t('an.corr.observations')} <span className="text-[var(--text-strong)]">{fmtInt(matrix.n)}</span>
            </span>
            <span>{t('an.corr.commonTs', { n: fmtInt(matrix.timestamps.length) })}</span>
            <span>
              {t('an.corr.dropped')}{' '}
              {Object.keys(matrix.dropped).length === 0
                ? '—'
                : Object.entries(matrix.dropped)
                    .map(([k, n]) => `${k}=${n}`)
                    .join(', ')}
            </span>
          </div>
          <StatusBlock label={t('an.corr.matrixLabel')} status={matrix.status} reason={matrix.reason} warnings={matrix.warnings} />
          {matrix.status === 'OK' && (
            <div className="overflow-x-auto">
              <table className="text-xs font-mono border-collapse">
                <thead>
                  <tr>
                    <th className="p-2" />
                    {matrix.labels.map((l) => (
                      <th key={l} className="p-2 text-[var(--text)]/65 font-medium text-[10px] max-w-[120px] align-bottom">
                        {l}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.labels.map((row, i) => (
                    <tr key={row}>
                      <th className="p-2 text-left text-[var(--text)]/65 font-medium text-[10px] whitespace-nowrap">{row}</th>
                      {matrix.matrix[i].map((v, j) => (
                        <td
                          key={j}
                          className="p-2 text-center tabular-nums text-[var(--text-strong)] border border-[var(--bg)] min-w-[64px]"
                          style={{ backgroundColor: v === null ? 'transparent' : heatColor(v) }}
                          title={v === null ? t('an.corr.zeroVar') : `${row} / ${matrix.labels[j]}: ${fmtFixed(v, 4)}`}
                        >
                          {v === null ? t('exp.na') : fmtFixed(v, 2)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <ScaleLegend kind="diverging" low="-1" mid="0" high="+1" />
                <p className="text-[11px] text-[var(--muted)]">{t('an.corr.legend')}</p>
              </div>
            </div>
          )}
        </Panel>
      )}

      {data.length >= 2 && (
        <Panel title={t('an.corr.pair')} subtitle={t('an.corr.pairSub')}>
          <div className="flex flex-wrap items-end gap-4">
            {(['A', 'B'] as const).map((side) => (
              <div key={side}>
                <label htmlFor={`pair-${side}`} className={labelClass}>
                  {side === 'A' ? t('an.corr.sideA') : t('an.corr.sideB')}
                </label>
                <select
                  id={`pair-${side}`}
                  className={`${inputClass} font-mono`}
                  value={side === 'A' ? pairA : pairB}
                  onChange={(e) => (side === 'A' ? setPairA(e.target.value) : setPairB(e.target.value))}
                >
                  <option value="">{t('an.corr.select')}</option>
                  {data.map((s) => (
                    <option key={s.option.key} value={s.option.key}>
                      {s.option.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <NumberField id="pair-window" label={t('an.corr.windowReturns')} value={rollWindow} onChange={setRollWindow} min={2} />
          </div>
          {pairA && pairA === pairB && <Notice tone="warn">{t('an.corr.pickDifferent')}</Notice>}
          {pair && (
            <>
              {pair.corr.status !== 'INVALID_INPUT' && <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs font-mono text-[var(--text)]/80">
                <span>{t('an.corr.aligned', { n: fmtInt(pair.corr.timestamps.length) })}</span>
                <span>{t('an.corr.returnPairs', { n: fmtInt(Math.max(0, pair.corr.timestamps.length - 1)) })}</span>
                <span>
                  {t('an.corr.droppedAB', { a: pair.corr.droppedA, b: pair.corr.droppedB })}
                </span>
              </div>}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <StatusBlock label={t('an.corr.rollingCorrelation')} status={pair.corr.status} reason={pair.corr.reason} warnings={pair.corr.warnings} />
                  {pair.corr.status === 'OK' && (
                    <LatestLine r={latestValue(pair.corr.timestamps, pair.corr.values)} />
                  )}
                </div>
                <div className="space-y-1">
                  <StatusBlock label={t('an.corr.rollingBeta')} status={pair.beta.status} reason={pair.beta.reason} warnings={pair.beta.warnings} />
                  {pair.beta.status === 'OK' && <LatestLine r={latestValue(pair.beta.timestamps, pair.beta.values)} />}
                </div>
              </div>
              {corrLines.length > 0 && (
                <TimeSeriesChart lines={corrLines} valueFormatter={numFmt} referenceLines={ZERO_LINE} height={220} ariaLabel={t('an.corr.corrAria')} />
              )}
              {betaLines.length > 0 && (
                <TimeSeriesChart lines={betaLines} valueFormatter={numFmt} referenceLines={ZERO_LINE} height={220} ariaLabel={t('an.corr.betaAria')} />
              )}
            </>
          )}
        </Panel>
      )}
    </div>
  );
}

function LatestLine({ r }: { r: { t: string; v: number } | null }) {
  const t = useT();
  return (
    <p className="text-xs font-mono text-[var(--text)]/80">
      {t('an.corr.latest')} <span className="text-[var(--text-strong)]">{fmtNum(r?.v ?? null, 3)}</span> @ {fmtDate(r?.t)}
    </p>
  );
}
