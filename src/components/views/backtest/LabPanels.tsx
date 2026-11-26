import { ErrorNote } from '../../common/ErrorNote';
import { toUserError, type UserError } from '../../common/friendlyError';
import { useMemo, useState } from 'react';
import { FlaskConical, Shuffle } from 'lucide-react';
import { fmtFixed, fmtNum, useT } from '../../../i18n';
import { EquityChart } from '../../ui/viz/EquityChart';
import { BandChart } from '../../ui/viz/BandChart';
import { Histogram } from '../../ui/viz/Histogram';
import { ChartLegend } from '../../ui/viz/ChartLegend';
import { buildGrid, countCombos, MAX_GRID_COMBOS, type ParamDef } from './labGrid';

const inputCls =
  'w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-2 text-xs font-mono text-[var(--text-strong)]';
const cardCls = 'bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-4 min-w-0';
const btnCls =
  'inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-white text-xs font-medium rounded-md disabled:opacity-50';

async function postLab<T>(url: string, payload: Record<string, unknown>, fallbackMsg: string): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const details = Array.isArray(json.details) ? json.details.map((d: unknown) => (typeof d === 'string' ? d : (d as { message?: string })?.message ?? '')).filter(Boolean).join(' ') : '';
    throw new Error([json.message, details].filter(Boolean).join(' ') || fallbackMsg);
  }
  return json as T;
}

// ---------------------------------------------------------------------------------------------
// Strategy parameters
// ---------------------------------------------------------------------------------------------

export function StrategyParamsPanel({
  schema,
  values,
  onChange,
  onReset,
}: {
  schema: ParamDef[];
  values: Record<string, string>;
  onChange: (key: string, v: string) => void;
  onReset: () => void;
}) {
  const t = useT();
  if (schema.length === 0) return null;
  return (
    <fieldset className="sm:col-span-2 lg:col-span-4 border border-[var(--border)] rounded-md p-3 min-w-0">
      <legend className="px-1.5 text-xs font-semibold text-[var(--text-strong)]">{t('lab.params.title')}</legend>
      <p className="text-[11px] text-[var(--muted)] mb-3">{t('lab.params.hint')}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {schema.map((d) => {
          const raw = values[d.key] ?? String(d.default);
          const n = Number(raw);
          const bad = raw.trim() === '' || !Number.isFinite(n) || n < d.min || n > d.max;
          return (
            <div key={d.key} className="min-w-0">
              <label htmlFor={`bt-p-${d.key}`} className="block text-xs text-[var(--text)]/65 mb-1">
                {d.label}
              </label>
              <input
                id={`bt-p-${d.key}`}
                type="number"
                min={d.min}
                max={d.max}
                step={d.step}
                value={raw}
                aria-invalid={bad}
                aria-describedby={`bt-p-${d.key}-h`}
                onChange={(e) => onChange(d.key, e.target.value)}
                className={`${inputCls} ${bad ? 'border-[var(--warning)]' : ''}`}
              />
              <p id={`bt-p-${d.key}-h`} className={`mt-1 text-[11px] leading-snug ${bad ? 'text-[var(--warning)]' : 'text-[var(--muted)]'}`}>
                {bad ? t('lab.params.invalid', { min: d.min, max: d.max }) : `${t('lab.params.range', { min: d.min, max: d.max })}. ${d.hint}`}
              </p>
            </div>
          );
        })}
      </div>
      <button type="button" onClick={onReset} className="mt-3 text-[11px] text-[var(--muted)] underline underline-offset-2 hover:text-[var(--text)]">
        {t('lab.params.reset')}
      </button>
    </fieldset>
  );
}

// ---------------------------------------------------------------------------------------------
// Walk-forward
// ---------------------------------------------------------------------------------------------

interface FoldMetrics {
  netProfit: number;
  returnPct: number;
  tradeCount: number;
  maxDrawdownPct: number;
}

interface WalkForwardResponse {
  valid: boolean;
  error?: string;
  mode: 'ROLLING' | 'ANCHORED';
  oosBars: number;
  isBars: number;
  combosPerFold: number;
  barsUsed: number;
  barsCapped: boolean;
  folds: Array<{
    fold: number;
    isRange: { from: string; to: string; bars: number };
    oosRange: { from: string; to: string; bars: number };
    bestParams: Record<string, number>;
    inSample: FoldMetrics;
    outOfSample: FoldMetrics;
  }>;
  stitchedOosEquity: Array<{ timestamp: string; equity: number }>;
  stitchedOos: { netProfit: number; returnPct: number; maxDrawdownPct: number; tradeCount: number };
  overfit: {
    level: 'LOW' | 'MEDIUM' | 'HIGH' | 'INSUFFICIENT' | 'NO_EDGE';
    isReturnPctPerOosWindow: number;
    oosReturnPct: number;
    oosProfitableFolds: number;
    folds: number;
  } | null;
  disclaimer: string;
}

const day = (ts: string) => ts.slice(0, 10);

export function WalkForwardSection({
  buildPayload,
  schema,
  values,
  initialEquity,
  disabled,
}: {
  buildPayload: () => Record<string, unknown> | null;
  schema: ParamDef[];
  values: Record<string, number>;
  initialEquity: number;
  disabled: boolean;
}) {
  const t = useT();
  const [folds, setFolds] = useState('4');
  const [mode, setMode] = useState<'ROLLING' | 'ANCHORED'>('ROLLING');
  const [scan, setScan] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<UserError | null>(null);
  const [res, setRes] = useState<WalkForwardResponse | null>(null);
  const [scanned, setScanned] = useState<string[]>([]);

  const grid = useMemo(() => buildGrid(schema, values, scan), [schema, values, scan]);
  const combos = countCombos(grid);
  const tooMany = combos > MAX_GRID_COMBOS;

  const toggle = (key: string) => setScan((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));

  const run = async () => {
    const base = buildPayload();
    if (!base || tooMany) return;
    setLoading(true);
    setError(null);
    try {
      const json = await postLab<WalkForwardResponse>(
        '/api/backtest/walk-forward',
        { ...base, folds: Number(folds), mode, grid: Object.keys(grid).length > 0 ? grid : undefined },
        t('lab.error')
      );
      setScanned(Object.keys(grid));
      setRes(json);
    } catch (e) {
      setError(toUserError(e, t('lab.error')));
    } finally {
      setLoading(false);
    }
  };

  const of = res?.overfit ?? null;
  const warn = of?.level === 'HIGH' || of?.level === 'MEDIUM';

  return (
    <section className={cardCls} aria-labelledby="lab-wf-title">
      <div>
        <h2 id="lab-wf-title" className="text-sm font-semibold text-[var(--text-strong)]">
          {t('lab.wf.title')}
        </h2>
        <p className="mt-1 text-xs text-[var(--text)]/65 leading-relaxed">{t('lab.wf.explain')}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
        <div>
          <label htmlFor="wf-folds" className="block text-xs text-[var(--text)]/65 mb-1">
            {t('lab.wf.folds')}
          </label>
          <select id="wf-folds" value={folds} onChange={(e) => setFolds(e.target.value)} className={inputCls}>
            {[3, 4, 5, 6, 8].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="wf-mode" className="block text-xs text-[var(--text)]/65 mb-1">
            {t('lab.wf.mode')}
          </label>
          <select id="wf-mode" value={mode} onChange={(e) => setMode(e.target.value as 'ROLLING' | 'ANCHORED')} className={inputCls}>
            <option value="ROLLING">{t('lab.wf.rolling')}</option>
            <option value="ANCHORED">{t('lab.wf.anchored')}</option>
          </select>
        </div>
        <div className="col-span-2">
          <button type="button" onClick={() => void run()} disabled={disabled || loading || tooMany} className={`${btnCls} w-full sm:w-auto`}>
            <FlaskConical className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{loading ? t('lab.running') : t('lab.wf.run')}</span>
          </button>
        </div>
      </div>

      <fieldset className="min-w-0">
        <legend className="text-xs text-[var(--text)]/65 mb-1.5">{t('lab.wf.optimize')}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {schema.map((d) => (
            <label key={d.key} className="inline-flex items-center gap-1.5 text-xs text-[var(--text)]">
              <input type="checkbox" checked={scan.includes(d.key)} onChange={() => toggle(d.key)} className="accent-[var(--accent)]" />
              <span>{d.label}</span>
            </label>
          ))}
        </div>
        <p className={`mt-1.5 text-[11px] ${tooMany ? 'text-[var(--warning)]' : 'text-[var(--muted)]'}`}>
          {tooMany ? t('lab.wf.tooMany', { n: combos }) : scan.length === 0 ? t('lab.wf.noneChecked') : t('lab.wf.combos', { n: combos })}
        </p>
      </fieldset>

      {error && <ErrorNote error={error} className="text-xs text-[var(--warning)] break-words" />}

      {res && !res.valid && <p role="alert" className="text-xs text-[var(--warning)]">{res.error}</p>}

      {res && res.valid && of && (
        <div className="space-y-4">
          <div
            role={warn ? 'alert' : 'status'}
            className={`rounded-md border p-3 text-xs leading-relaxed ${warn ? 'border-[var(--warning)]/50' : 'border-[var(--border)]'}`}
          >
            <p className={`font-semibold ${warn ? 'text-[var(--warning)]' : 'text-[var(--text-strong)]'}`}>{t(`lab.wf.of.${of.level}` as never)}</p>
            <p className="mt-1 font-mono text-[11px] text-[var(--muted)] tabular-nums">
              {t('lab.wf.of.stats', {
                is: fmtFixed(of.isReturnPctPerOosWindow, 2),
                oos: fmtFixed(of.oosReturnPct, 2),
                p: of.oosProfitableFolds,
                n: of.folds,
              })}
            </p>
          </div>

          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h3 className="text-xs font-semibold text-[var(--text-strong)]">{t('lab.wf.stitched')}</h3>
              <span className="font-mono text-[11px] text-[var(--text)]/70 tabular-nums">
                {t('lab.wf.summary', {
                  ret: fmtFixed(res.stitchedOos.returnPct, 2),
                  dd: fmtFixed(res.stitchedOos.maxDrawdownPct, 2),
                  n: res.stitchedOos.tradeCount,
                })}
              </span>
            </div>
            <div className="mt-2 bg-[var(--bg)] border border-[var(--border)] rounded-md p-2">
              <EquityChart
                points={res.stitchedOosEquity.map((p) => ({ label: day(p.timestamp), v: p.equity }))}
                baseline={initialEquity}
                ariaLabel={t('lab.wf.stitchedAria')}
                format={(v) => fmtNum(v, { maximumFractionDigits: 0 })}
                className="h-44"
              />
            </div>
            {res.barsCapped && <p className="mt-1 text-[11px] text-[var(--muted)]">{t('lab.wf.capped', { n: res.barsUsed })}</p>}
          </div>

          <div className="overflow-x-auto rounded-md border border-[var(--border)]">
            <table className="w-full text-left border-collapse min-w-[640px]">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]/50 text-xs text-[var(--text)]/65">
                  <th scope="col" className="py-2 px-3">{t('lab.wf.col.fold')}</th>
                  <th scope="col" className="py-2 px-3">{t('lab.wf.col.window')}</th>
                  <th scope="col" className="py-2 px-3 text-right">{t('lab.wf.col.is')}</th>
                  <th scope="col" className="py-2 px-3 text-right">{t('lab.wf.col.oos')}</th>
                  <th scope="col" className="py-2 px-3">{t('lab.wf.col.params')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]/70 text-xs font-mono tabular-nums">
                {res.folds.map((f) => (
                  <tr key={f.fold}>
                    <td className="py-2 px-3 text-[var(--text)]/60">{f.fold}</td>
                    <td className="py-2 px-3 text-[var(--text)]/70 whitespace-nowrap">
                      {day(f.oosRange.from)} .. {day(f.oosRange.to)}
                    </td>
                    <td className="py-2 px-3 text-right whitespace-nowrap">
                      <span className={f.inSample.returnPct >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}>{fmtFixed(f.inSample.returnPct, 2)}%</span>
                      <span className="text-[var(--muted)]"> / {f.inSample.tradeCount}</span>
                    </td>
                    <td className="py-2 px-3 text-right whitespace-nowrap">
                      <span className={f.outOfSample.returnPct >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}>{fmtFixed(f.outOfSample.returnPct, 2)}%</span>
                      <span className="text-[var(--muted)]"> / {f.outOfSample.tradeCount}</span>
                    </td>
                    <td className="py-2 px-3 text-[var(--text)]/75">
                      {scanned.length === 0
                        ? '-'
                        : scanned.map((k) => `${schema.find((d) => d.key === k)?.label ?? k}: ${f.bestParams[k]}`).join(' · ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-[var(--muted)] leading-relaxed">{t('lab.disclaimer')}</p>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Monte Carlo
// ---------------------------------------------------------------------------------------------

interface Band {
  p5: number;
  p50: number;
  p95: number;
  mean: number;
}

interface MonteCarloResponse {
  valid: boolean;
  error?: string;
  runs: number;
  seed: number;
  tradeCount: number;
  tradesCapped: boolean;
  initialEquity: number;
  drawdownThresholdPct: number;
  finalReturnPct: Band;
  maxDrawdownPct: Band;
  expectancy: Band;
  probDrawdownAbove: number;
  probLoss: number;
  histogram: Array<{ from: number; to: number; count: number }>;
  equityBands: Array<{ trade: number; p5: number; p50: number; p95: number }>;
}

export function MonteCarloSection({
  buildPayload,
  initialEquity,
  disabled,
}: {
  buildPayload: () => Record<string, unknown> | null;
  initialEquity: number;
  disabled: boolean;
}) {
  const t = useT();
  const [runs, setRuns] = useState('1000');
  const [ddThreshold, setDdThreshold] = useState('20');
  const [seed, setSeed] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<UserError | null>(null);
  const [res, setRes] = useState<MonteCarloResponse | null>(null);

  const run = async () => {
    const base = buildPayload();
    if (!base) return;
    setLoading(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        ...base,
        runs: Number(runs),
        drawdownThresholdPct: Number(ddThreshold) || 20,
      };
      if (seed.trim() !== '' && Number.isInteger(Number(seed)) && Number(seed) >= 0) payload.seed = Number(seed);
      setRes(await postLab<MonteCarloResponse>('/api/backtest/monte-carlo', payload, t('lab.error')));
    } catch (e) {
      setError(toUserError(e, t('lab.error')));
    } finally {
      setLoading(false);
    }
  };

  const rows: Array<{ label: string; band: Band; digits: number }> = res?.valid
    ? [
        { label: t('lab.mc.finalReturn'), band: res.finalReturnPct, digits: 2 },
        { label: t('lab.mc.maxDd'), band: res.maxDrawdownPct, digits: 2 },
        { label: t('lab.mc.expectancy'), band: res.expectancy, digits: 2 },
      ]
    : [];

  return (
    <section className={cardCls} aria-labelledby="lab-mc-title">
      <div>
        <h2 id="lab-mc-title" className="text-sm font-semibold text-[var(--text-strong)]">
          {t('lab.mc.title')}
        </h2>
        <p className="mt-1 text-xs text-[var(--text)]/65 leading-relaxed">{t('lab.mc.explain')}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
        <div>
          <label htmlFor="mc-runs" className="block text-xs text-[var(--text)]/65 mb-1">{t('lab.mc.runs')}</label>
          <select id="mc-runs" value={runs} onChange={(e) => setRuns(e.target.value)} className={inputCls}>
            {[500, 1000, 2000].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="mc-dd" className="block text-xs text-[var(--text)]/65 mb-1">{t('lab.mc.dd')}</label>
          <input id="mc-dd" type="number" min="1" max="100" value={ddThreshold} onChange={(e) => setDdThreshold(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label htmlFor="mc-seed" className="block text-xs text-[var(--text)]/65 mb-1">{t('lab.mc.seed')}</label>
          <input id="mc-seed" type="number" min="0" placeholder="20260101" value={seed} onChange={(e) => setSeed(e.target.value)} className={inputCls} />
        </div>
        <button type="button" onClick={() => void run()} disabled={disabled || loading} className={btnCls}>
          <Shuffle className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{loading ? t('lab.running') : t('lab.mc.run')}</span>
        </button>
      </div>

      {error && <ErrorNote error={error} className="text-xs text-[var(--warning)] break-words" />}
      {res && !res.valid && <p role="alert" className="text-xs text-[var(--warning)]">{t('lab.mc.tooFew')}</p>}

      {res && res.valid && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-xs font-mono tabular-nums">
            <div className="bg-[var(--bg)] border border-[var(--border)] rounded-md p-3">
              <span className="text-[var(--text)]/55 font-sans block">{t('lab.mc.probDd', { x: res.drawdownThresholdPct })}</span>
              <span className="text-base font-bold text-[var(--text-strong)]">{fmtFixed(res.probDrawdownAbove * 100, 1)}%</span>
            </div>
            <div className="bg-[var(--bg)] border border-[var(--border)] rounded-md p-3">
              <span className="text-[var(--text)]/55 font-sans block">{t('lab.mc.probLoss')}</span>
              <span className="text-base font-bold text-[var(--text-strong)]">{fmtFixed(res.probLoss * 100, 1)}%</span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border border-[var(--border)]">
            <table className="w-full text-left border-collapse min-w-[420px]">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]/50 text-xs text-[var(--text)]/65">
                  <th scope="col" className="py-2 px-3">{t('lab.mc.metric')}</th>
                  <th scope="col" className="py-2 px-3 text-right">{t('lab.mc.p5')}</th>
                  <th scope="col" className="py-2 px-3 text-right">{t('lab.mc.p50')}</th>
                  <th scope="col" className="py-2 px-3 text-right">{t('lab.mc.p95')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]/70 text-xs font-mono tabular-nums">
                {rows.map((r) => (
                  <tr key={r.label}>
                    <th scope="row" className="py-2 px-3 font-sans font-normal text-[var(--text)]/80">{r.label}</th>
                    <td className="py-2 px-3 text-right text-[var(--text-strong)]">{fmtFixed(r.band.p5, r.digits)}</td>
                    <td className="py-2 px-3 text-right text-[var(--text-strong)]">{fmtFixed(r.band.p50, r.digits)}</td>
                    <td className="py-2 px-3 text-right text-[var(--text-strong)]">{fmtFixed(r.band.p95, r.digits)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-[var(--text-strong)]">{t('lab.mc.fan')}</h3>
            <div className="mt-2 bg-[var(--bg)] border border-[var(--border)] rounded-md p-2">
              <BandChart
                points={res.equityBands.map((b) => ({ label: t('lab.mc.trade', { n: b.trade }), lo: b.p5, mid: b.p50, hi: b.p95 }))}
                baseline={initialEquity}
                ariaLabel={t('lab.mc.fanAria')}
                format={(v) => fmtNum(v, { maximumFractionDigits: 0 })}
                seriesLabels={{ lo: t('lab.mc.p5'), mid: t('lab.mc.p50'), hi: t('lab.mc.p95') }}
              />
            </div>
            <ChartLegend
              className="mt-1"
              items={[
                { id: 'band', label: `${t('lab.mc.p5')} - ${t('lab.mc.p95')}`, color: 'var(--series-1)', shape: 'rect' },
                { id: 'mid', label: t('lab.mc.p50'), color: 'var(--series-1)' },
              ]}
            />
          </div>

          <div>
            <h3 className="text-xs font-semibold text-[var(--text-strong)]">{t('lab.mc.hist')}</h3>
            <div className="mt-2">
              <Histogram bins={res.histogram} marker={0} ariaLabel={t('lab.mc.histAria')} format={(v) => `${fmtFixed(v, 1)}%`} />
            </div>
          </div>

          <p className="text-[11px] text-[var(--muted)] leading-relaxed">
            {t('lab.mc.method', { runs: res.runs, n: res.tradeCount, seed: res.seed })} {res.tradesCapped ? t('lab.mc.capped', { n: res.tradeCount }) : ''} {t('lab.disclaimer')}
          </p>
        </div>
      )}
    </section>
  );
}
