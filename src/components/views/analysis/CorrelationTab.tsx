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

const MAX_SERIES = 8;
const ZERO_LINE = [0];
const numFmt = (v: number) => v.toFixed(2);

/** Diverging cell color: blue for negative, red for positive correlation. */
function heatColor(r: number): string {
  const a = Math.min(1, Math.abs(r));
  return r >= 0 ? `rgba(239, 68, 68, ${0.12 + 0.6 * a})` : `rgba(59, 130, 246, ${0.12 + 0.6 * a})`;
}

export function CorrelationTab({ options }: { options: SeriesOption[] }) {
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
        ? [{ name: `Rolling corr (${rollWindow})`, color: CHART_COLORS[0], points: pair.corr.timestamps.map((t, i) => ({ t, v: pair.corr.values[i] })) }]
        : [],
    [pair, rollWindow]
  );
  const betaLines = useMemo<ChartLine[]>(
    () =>
      pair && pair.beta.status === 'OK'
        ? [{ name: `Rolling beta A on B (${rollWindow})`, color: CHART_COLORS[2], points: pair.beta.timestamps.map((t, i) => ({ t, v: pair.beta.values[i] })) }]
        : [],
    [pair, rollWindow]
  );

  return (
    <div className="space-y-4">
      <Panel
        title="Correlation of returns"
        subtitle="Series are inner-joined on common timestamps (no fill); returns are computed after alignment. Correlation is never computed on price levels."
      >
        <fieldset>
          <legend className={labelClass}>
            Series ({keys.length}/{MAX_SERIES}, pick 2–{MAX_SERIES})
          </legend>
          {options.length === 0 ? (
            <p className="text-xs text-[#E5E7EB]/55">No imported datasets.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {options.map((o) => {
                const checked = keys.includes(o.key);
                const disabled = !checked && keys.length >= MAX_SERIES;
                return (
                  <label
                    key={o.key}
                    className={`inline-flex items-center gap-1.5 border rounded px-2 py-1 text-[11px] font-mono cursor-pointer ${
                      checked ? 'border-[#6366F1] bg-[#6366F1]/15 text-white' : 'border-[#263244] text-[#E5E7EB]/75'
                    } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <input type="checkbox" className="accent-[#6366F1]" checked={checked} disabled={disabled} onChange={() => toggle(o.key)} />
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
              Returns
            </label>
            <select id="corr-kind" className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as ReturnKind)}>
              <option value="log">log</option>
              <option value="simple">simple</option>
            </select>
          </div>
          <NumberField id="corr-minobs" label="Min observations" value={minObs} onChange={setMinObs} min={2} />
        </div>
        {loading && <p className="text-xs text-[#E5E7EB]/55">Loading candles…</p>}
        {error && <Notice tone="error">{error}</Notice>}
        {data.map((s) => (
          <SeriesIntegrity key={s.option.key} s={s} />
        ))}
        {keys.length === 1 && <Notice tone="info">Select at least 2 series.</Notice>}
      </Panel>

      {matrix && (
        <Panel title="Correlation matrix" subtitle={`${kind} returns · common-intersection alignment`}>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs font-mono text-[#E5E7EB]/80">
            <span>
              Observations (return pairs): <span className="text-white">{matrix.n}</span>
            </span>
            <span>Common timestamps: {matrix.timestamps.length}</span>
            <span>
              Dropped in alignment:{' '}
              {Object.keys(matrix.dropped).length === 0
                ? '—'
                : Object.entries(matrix.dropped)
                    .map(([k, n]) => `${k}=${n}`)
                    .join(', ')}
            </span>
          </div>
          <StatusBlock label="Matrix" status={matrix.status} reason={matrix.reason} warnings={matrix.warnings} />
          {matrix.status === 'OK' && (
            <div className="overflow-x-auto">
              <table className="text-xs font-mono border-collapse">
                <thead>
                  <tr>
                    <th className="p-2" />
                    {matrix.labels.map((l) => (
                      <th key={l} className="p-2 text-[#E5E7EB]/65 font-medium text-[10px] max-w-[120px] align-bottom">
                        {l}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.labels.map((row, i) => (
                    <tr key={row}>
                      <th className="p-2 text-left text-[#E5E7EB]/65 font-medium text-[10px] whitespace-nowrap">{row}</th>
                      {matrix.matrix[i].map((v, j) => (
                        <td
                          key={j}
                          className="p-2 text-center tabular-nums text-white border border-[#0B0E14] min-w-[64px]"
                          style={{ backgroundColor: v === null ? 'transparent' : heatColor(v) }}
                          title={v === null ? 'undefined (zero variance)' : `${row} / ${matrix.labels[j]}: ${v.toFixed(4)}`}
                        >
                          {v === null ? 'n/a' : v.toFixed(2)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-[#E5E7EB]/45 mt-1">Red = positive, blue = negative; intensity = |r|.</p>
            </div>
          )}
        </Panel>
      )}

      {data.length >= 2 && (
        <Panel title="Rolling pair" subtitle="Rolling Pearson correlation of returns and OLS beta of A's returns on B's returns.">
          <div className="flex flex-wrap items-end gap-4">
            {(['A', 'B'] as const).map((side) => (
              <div key={side}>
                <label htmlFor={`pair-${side}`} className={labelClass}>
                  {side === 'A' ? 'A (asset)' : 'B (benchmark)'}
                </label>
                <select
                  id={`pair-${side}`}
                  className={`${inputClass} font-mono`}
                  value={side === 'A' ? pairA : pairB}
                  onChange={(e) => (side === 'A' ? setPairA(e.target.value) : setPairB(e.target.value))}
                >
                  <option value="">— select —</option>
                  {data.map((s) => (
                    <option key={s.option.key} value={s.option.key}>
                      {s.option.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <NumberField id="pair-window" label="Window (returns)" value={rollWindow} onChange={setRollWindow} min={2} />
          </div>
          {pairA && pairA === pairB && <Notice tone="warn">Pick two different series.</Notice>}
          {pair && (
            <>
              {pair.corr.status !== 'INVALID_INPUT' && <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs font-mono text-[#E5E7EB]/80">
                <span>Aligned points: {pair.corr.timestamps.length}</span>
                <span>Return pairs: {Math.max(0, pair.corr.timestamps.length - 1)}</span>
                <span>
                  Dropped: A={pair.corr.droppedA}, B={pair.corr.droppedB}
                </span>
              </div>}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <StatusBlock label="Rolling correlation" status={pair.corr.status} reason={pair.corr.reason} warnings={pair.corr.warnings} />
                  {pair.corr.status === 'OK' && (
                    <LatestLine r={latestValue(pair.corr.timestamps, pair.corr.values)} />
                  )}
                </div>
                <div className="space-y-1">
                  <StatusBlock label="Rolling beta" status={pair.beta.status} reason={pair.beta.reason} warnings={pair.beta.warnings} />
                  {pair.beta.status === 'OK' && <LatestLine r={latestValue(pair.beta.timestamps, pair.beta.values)} />}
                </div>
              </div>
              {corrLines.length > 0 && (
                <TimeSeriesChart lines={corrLines} valueFormatter={numFmt} referenceLines={ZERO_LINE} height={220} ariaLabel="Rolling correlation chart" />
              )}
              {betaLines.length > 0 && (
                <TimeSeriesChart lines={betaLines} valueFormatter={numFmt} referenceLines={ZERO_LINE} height={220} ariaLabel="Rolling beta chart" />
              )}
            </>
          )}
        </Panel>
      )}
    </div>
  );
}

function LatestLine({ r }: { r: { t: string; v: number } | null }) {
  return (
    <p className="text-xs font-mono text-[#E5E7EB]/80">
      Latest: <span className="text-white">{fmtNum(r?.v ?? null, 3)}</span> @ {fmtDate(r?.t)}
    </p>
  );
}
