import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, NotebookPen, RefreshCw } from 'lucide-react';
import { chartToPendingContext, setPendingNoteContext } from '../journal/researchNotes';
import {
  ApiError,
  fetchCandles,
  fetchDatasets,
  formatStoredTimestamp,
  type CandlesResponse,
  type DatasetRecord,
} from '../../../api/dataApi';
import { useTerminal } from '../../../contexts/TerminalContext';
import {
  atr,
  bollingerBands,
  candlesToCloseSeries,
  ema,
  macd,
  rsi,
  sma,
  type SeriesResult,
} from '../../../shared/analytics';
import type { MarketCandle } from '../../../shared/types/market';
import { DataStatusBadge } from '../../common/DataStatusBadge';
import { fmtDate, fmtInt, useT } from '../../../i18n';
import { BenchmarkReferencePanel } from './BenchmarkReferencePanel';
import { CandleChart, type LineSpec, type LowerPaneSpec } from './CandleChart';

type LowerIndicator = 'NONE' | 'RSI' | 'MACD' | 'ATR';

interface IndicatorSettings {
  smaOn: boolean;
  smaPeriod: number;
  emaOn: boolean;
  emaPeriod: number;
  bbOn: boolean;
  bbPeriod: number;
  bbK: number;
  lower: LowerIndicator;
  rsiPeriod: number;
  atrPeriod: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
}

const DEFAULT_SETTINGS: IndicatorSettings = {
  smaOn: true,
  smaPeriod: 20,
  emaOn: false,
  emaPeriod: 50,
  bbOn: false,
  bbPeriod: 20,
  bbK: 2,
  lower: 'NONE',
  rsiPeriod: 14,
  atrPeriod: 14,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
};

interface IndicatorReport {
  name: string;
  status: SeriesResult<unknown>['status'];
  reason?: string;
  warnings: string[];
}

const selectCls =
  'bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-2 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)] disabled:opacity-50';
const numCls =
  'w-16 bg-[var(--bg)] border border-[var(--border)] rounded-md px-2 py-1 text-xs font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]';

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

function report(name: string, r: SeriesResult<unknown>): IndicatorReport {
  return { name, status: r.status, reason: r.reason, warnings: r.warnings };
}

function NumInput({
  label,
  value,
  onChange,
  min = 1,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-[var(--text)]/65">
      {label}
      <input
        type="number"
        min={min}
        step={step}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
        className={numCls}
      />
    </label>
  );
}

export function ChartsView() {
  const { instruments, setActiveModule } = useTerminal();
  const t = useT();
  const [datasets, setDatasets] = useState<DatasetRecord[]>([]);
  const [datasetsError, setDatasetsError] = useState<string | null>(null);
  const [datasetsLoading, setDatasetsLoading] = useState(true);
  const [instrumentId, setInstrumentId] = useState('');
  const [contractCode, setContractCode] = useState('');
  const [timeframe, setTimeframe] = useState('');
  const [data, setData] = useState<CandlesResponse | null>(null);
  const [candlesError, setCandlesError] = useState<string | null>(null);
  const [candlesLoading, setCandlesLoading] = useState(false);
  const [settings, setSettings] = useState<IndicatorSettings>(DEFAULT_SETTINGS);
  const [reloadKey, setReloadKey] = useState(0);

  const set = <K extends keyof IndicatorSettings>(k: K, v: IndicatorSettings[K]) => setSettings((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    const ctrl = new AbortController();
    setDatasetsLoading(true);
    setDatasetsError(null);
    fetchDatasets(ctrl.signal)
      .then(setDatasets)
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted) setDatasetsError(err instanceof Error ? err.message : t('chart.err.datasets'));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setDatasetsLoading(false);
      });
    return () => ctrl.abort();
  }, [reloadKey]);

  const instrumentOptions = useMemo(() => uniq(datasets.map((d) => d.instrumentId)).sort(), [datasets]);
  const contractOptions = useMemo(
    () => uniq(datasets.filter((d) => d.instrumentId === instrumentId).map((d) => d.contractCode)).sort(),
    [datasets, instrumentId]
  );
  const timeframeOptions = useMemo(
    () =>
      uniq(
        datasets.filter((d) => d.instrumentId === instrumentId && d.contractCode === contractCode).map((d) => d.timeframe)
      ),
    [datasets, instrumentId, contractCode]
  );

  // Keep selections valid as option lists change (auto-select the first available).
  useEffect(() => {
    if (!instrumentOptions.includes(instrumentId)) setInstrumentId(instrumentOptions[0] ?? '');
  }, [instrumentOptions, instrumentId]);
  useEffect(() => {
    if (!contractOptions.includes(contractCode)) setContractCode(contractOptions[0] ?? '');
  }, [contractOptions, contractCode]);
  useEffect(() => {
    if (!timeframeOptions.includes(timeframe)) setTimeframe(timeframeOptions[0] ?? '');
  }, [timeframeOptions, timeframe]);

  useEffect(() => {
    setData(null);
    setCandlesError(null);
    if (!instrumentId || !contractCode || !timeframe) return;
    const ctrl = new AbortController();
    setCandlesLoading(true);
    fetchCandles({ instrumentId, contractCode, timeframe }, ctrl.signal)
      .then(setData)
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setCandlesError(err instanceof ApiError || err instanceof Error ? err.message : t('chart.err.candles'));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setCandlesLoading(false);
      });
    return () => ctrl.abort();
  }, [instrumentId, contractCode, timeframe, reloadKey]);

  const candles: MarketCandle[] = useMemo(
    () => (data?.status === 'HISTORICAL' ? data.candles.filter((c) => c.isComplete !== false) : []),
    [data]
  );
  const incompleteDropped = data?.status === 'HISTORICAL' ? data.candles.length - candles.length : 0;

  const computed = useMemo(() => {
    const overlays: LineSpec[] = [];
    const reports: IndicatorReport[] = [];
    let lowerPane: LowerPaneSpec | null = null;
    if (candles.length === 0) return { overlays, reports, lowerPane };
    const { series } = candlesToCloseSeries(candles);
    const s = settings;

    if (s.smaOn) {
      const r = sma(series, s.smaPeriod);
      reports.push(report(`SMA(${s.smaPeriod})`, r));
      if (r.status === 'OK') overlays.push({ id: 'sma', label: `SMA ${s.smaPeriod}`, color: '#F59E0B', timestamps: r.timestamps, values: r.values, lineWidth: 2 });
    }
    if (s.emaOn) {
      const r = ema(series, s.emaPeriod);
      reports.push(report(`EMA(${s.emaPeriod})`, r));
      if (r.status === 'OK') overlays.push({ id: 'ema', label: `EMA ${s.emaPeriod}`, color: '#38BDF8', timestamps: r.timestamps, values: r.values, lineWidth: 2 });
    }
    if (s.bbOn) {
      const r = bollingerBands(series, { period: s.bbPeriod, k: s.bbK });
      reports.push(report(`Bollinger(${s.bbPeriod}, ${s.bbK})`, r));
      if (r.status === 'OK') {
        const pick = (k: 'upper' | 'middle' | 'lower') => r.values.map((v) => (v ? v[k] : null));
        overlays.push({ id: 'bb-u', label: 'BB up', color: 'rgba(167, 139, 250, 0.9)', timestamps: r.timestamps, values: pick('upper') });
        overlays.push({ id: 'bb-m', label: 'BB mid', color: 'rgba(167, 139, 250, 0.5)', timestamps: r.timestamps, values: pick('middle') });
        overlays.push({ id: 'bb-l', label: 'BB low', color: 'rgba(167, 139, 250, 0.9)', timestamps: r.timestamps, values: pick('lower') });
      }
    }
    if (s.lower === 'RSI') {
      const r = rsi(series, s.rsiPeriod);
      reports.push(report(`RSI(${s.rsiPeriod})`, r));
      if (r.status === 'OK') {
        lowerPane = {
          title: `RSI ${s.rsiPeriod}`,
          lines: [{ id: 'rsi', label: `RSI ${s.rsiPeriod}`, color: '#A78BFA', timestamps: r.timestamps, values: r.values, lineWidth: 2 }],
          histograms: [],
          levels: [70, 30],
        };
      }
    } else if (s.lower === 'MACD') {
      const r = macd(series, { fast: s.macdFast, slow: s.macdSlow, signal: s.macdSignal });
      reports.push(report(`MACD(${s.macdFast}, ${s.macdSlow}, ${s.macdSignal})`, r));
      if (r.status === 'OK') {
        lowerPane = {
          title: 'MACD',
          lines: [
            { id: 'macd', label: 'MACD', color: '#38BDF8', timestamps: r.timestamps, values: r.values.map((v) => v?.macd ?? null), lineWidth: 2 },
            { id: 'signal', label: 'Signal', color: '#F59E0B', timestamps: r.timestamps, values: r.values.map((v) => v?.signal ?? null) },
          ],
          histograms: [
            {
              id: 'hist',
              label: 'Hist',
              timestamps: r.timestamps,
              values: r.values.map((v) => v?.histogram ?? null),
              positiveColor: 'rgba(34, 197, 94, 0.55)',
              negativeColor: 'rgba(239, 68, 68, 0.55)',
            },
          ],
          levels: [],
        };
      }
    } else if (s.lower === 'ATR') {
      const r = atr(candles, s.atrPeriod);
      reports.push(report(`ATR(${s.atrPeriod})`, r));
      if (r.status === 'OK') {
        lowerPane = {
          title: `ATR ${s.atrPeriod}`,
          lines: [{ id: 'atr', label: `ATR ${s.atrPeriod}`, color: '#F472B6', timestamps: r.timestamps, values: r.values, lineWidth: 2 }],
          histograms: [],
          levels: [],
        };
      }
    }
    return { overlays, reports, lowerPane };
  }, [candles, settings]);

  const showVolume = candles.some((c) => c.volume !== null);
  const instrumentLabel = (id: string) => {
    const inst = instruments.find((i) => i.id === id);
    return inst ? `${id} — ${inst.productName}` : id;
  };
  const unavailable = !candlesLoading && !candlesError && (data === null || data.status === 'UNAVAILABLE');

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-strong)] tracking-tight">{t('chart.title')}</h1>
          <p className="text-sm text-[var(--text)]/65 mt-1">
            {t('chart.subtitle')}
          </p>
        </div>
        <div className="flex gap-2">
        <button
          type="button"
          disabled={!instrumentId}
          title={t('nb.addFromChartTitle')}
          onClick={() => {
            // T18: hand the current chart selection to the Research Notebook and open it.
            setPendingNoteContext(
              chartToPendingContext({
                instrumentId,
                contractCode,
                timeframe: data?.timeframe ?? timeframe,
                firstTimestamp: candles[0]?.timestamp ?? null,
                lastTimestamp: candles[candles.length - 1]?.timestamp ?? null,
              })
            );
            setActiveModule('journal');
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-[var(--border)] text-[var(--text)]/80 hover:text-[var(--text-strong)] hover:bg-[var(--surface-2)] w-fit disabled:opacity-40"
        >
          <NotebookPen className="w-3.5 h-3.5" aria-hidden="true" />
          {t('nb.addFromChart')}
        </button>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-[var(--border)] text-[var(--text)]/80 hover:text-[var(--text-strong)] hover:bg-[var(--surface-2)] w-fit"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${datasetsLoading || candlesLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
          {t('chart.reload')}
        </button>
        </div>
      </div>

      {/* Series pickers */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="ch-instrument" className="block text-xs font-medium text-[var(--text)]/75 mb-1">
            {t('chart.instrument')}
          </label>
          <select
            id="ch-instrument"
            value={instrumentId}
            onChange={(e) => setInstrumentId(e.target.value)}
            disabled={instrumentOptions.length === 0}
            className={`${selectCls} min-w-[220px]`}
          >
            {instrumentOptions.length === 0 && <option value="">{t('chart.noImported')}</option>}
            {instrumentOptions.map((id) => (
              <option key={id} value={id}>
                {instrumentLabel(id)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ch-contract" className="block text-xs font-medium text-[var(--text)]/75 mb-1">
            {t('term.contract')}
          </label>
          <select
            id="ch-contract"
            value={contractCode}
            onChange={(e) => setContractCode(e.target.value)}
            disabled={contractOptions.length === 0}
            className={`${selectCls} font-mono`}
          >
            {contractOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ch-tf" className="block text-xs font-medium text-[var(--text)]/75 mb-1">
            {t('chart.timeframe')}
          </label>
          <select
            id="ch-tf"
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
            disabled={timeframeOptions.length === 0}
            className={`${selectCls} font-mono`}
          >
            {timeframeOptions.map((tf) => (
              <option key={tf} value={tf}>
                {tf}
              </option>
            ))}
          </select>
        </div>
        <div className="ml-auto">
          <DataStatusBadge status={data?.status === 'HISTORICAL' ? 'HISTORICAL' : 'UNAVAILABLE'} />
        </div>
      </div>

      {datasetsError && <p className="text-xs text-[var(--negative)]">{datasetsError}</p>}
      {candlesError && <p className="text-xs text-[var(--negative)]">{candlesError}</p>}

      {/* Provenance banner */}
      {data?.status === 'HISTORICAL' && (
        <div className="bg-[var(--accent)]/10 border border-[var(--accent)]/35 rounded-lg px-4 py-3 text-xs text-[var(--text)]/85 space-y-1.5">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-[var(--accent)] shrink-0 mt-px" aria-hidden="true" />
            <div className="space-y-1">
              <p>
                <span className="font-semibold text-[var(--text-strong)]">{t('chart.histNotLive')}</span>{' '}
                {t('chart.bars', { n: fmtInt(data.count) })}
                {data.truncated && ` ${t('chart.truncated', { n: fmtInt(data.totalInRange) })}`} · {t('common.unit').toLowerCase()}{' '}
                <span className="font-mono text-[var(--text-strong)]">{data.priceUnit ?? 'UNKNOWN'}</span>
                {data.continuousAdjustment && data.continuousAdjustment !== 'NONE' && (
                  <>
                    {' '}
                    · {t('chart.adjustment')} <span className="font-mono text-[var(--text-strong)]">{data.continuousAdjustment}</span>
                  </>
                )}
                {incompleteDropped > 0 && ` · ${t('chart.incompleteHidden', { n: incompleteDropped })}`}
              </p>
              {data.provenance.map((p) => (
                <p key={p.datasetId} className="font-mono text-[11px] text-[var(--text)]/70">
                  {t('common.source')} “{p.sourceLabel}” ·{' '}
                  <span className="text-[var(--warning)]" title={p.sourceQuality === 'UNOFFICIAL' ? t('quality.UNOFFICIAL.desc') : undefined}>
                    {p.sourceQuality}
                    {p.sourceQuality === 'UNOFFICIAL' ? ` (${t('quality.UNOFFICIAL')})` : ''}
                  </span>{' '}
                  · {t('chart.sourceTz')} {p.timezone} ·{' '}
                  {formatStoredTimestamp(p.firstTimestamp, data.timeframe)} → {formatStoredTimestamp(p.lastTimestamp, data.timeframe)} · sha256{' '}
                  {p.checksum.slice(0, 12)}… · {t('chart.importedOn')} {fmtDate(p.importedAt.slice(0, 10))}
                </p>
              ))}
              <p className="text-[11px] text-[var(--text)]/55">
                {t('chart.timestamps')}: {data.timestampConvention}{' '}
                {data.timeframe === 'D1' || data.timeframe === 'W1'
                  ? t('chart.tsSession')
                  : t('chart.tsUtc')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Indicator controls */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <label className="inline-flex items-center gap-2 text-xs text-[var(--text)]/85">
          <input type="checkbox" checked={settings.smaOn} onChange={(e) => set('smaOn', e.target.checked)} className="accent-[var(--warning)]" />
          SMA
        </label>
        <NumInput label={t('chart.period')} value={settings.smaPeriod} onChange={(v) => set('smaPeriod', v)} />
        <label className="inline-flex items-center gap-2 text-xs text-[var(--text)]/85">
          <input type="checkbox" checked={settings.emaOn} onChange={(e) => set('emaOn', e.target.checked)} className="accent-[var(--accent-text)]" />
          EMA
        </label>
        <NumInput label={t('chart.period')} value={settings.emaPeriod} onChange={(v) => set('emaPeriod', v)} />
        <label className="inline-flex items-center gap-2 text-xs text-[var(--text)]/85">
          <input type="checkbox" checked={settings.bbOn} onChange={(e) => set('bbOn', e.target.checked)} className="accent-[#A78BFA]" />
          Bollinger
        </label>
        <NumInput label={t('chart.period')} value={settings.bbPeriod} onChange={(v) => set('bbPeriod', v)} />
        <NumInput label="k" value={settings.bbK} step={0.5} min={0.5} onChange={(v) => set('bbK', v)} />
        <span className="hidden md:block w-px h-6 bg-[var(--border)]" aria-hidden="true" />
        <label className="inline-flex items-center gap-2 text-xs text-[var(--text)]/85">
          {t('chart.lowerPane')}
          <select
            value={settings.lower}
            onChange={(e) => set('lower', e.target.value as LowerIndicator)}
            className={`${selectCls} py-1`}
          >
            <option value="NONE">{t('common.none')}</option>
            <option value="RSI">RSI</option>
            <option value="MACD">MACD</option>
            <option value="ATR">ATR</option>
          </select>
        </label>
        {settings.lower === 'RSI' && <NumInput label={t('chart.period')} value={settings.rsiPeriod} onChange={(v) => set('rsiPeriod', v)} />}
        {settings.lower === 'ATR' && <NumInput label={t('chart.period')} value={settings.atrPeriod} onChange={(v) => set('atrPeriod', v)} />}
        {settings.lower === 'MACD' && (
          <>
            <NumInput label={t('chart.fast')} value={settings.macdFast} onChange={(v) => set('macdFast', v)} />
            <NumInput label={t('chart.slow')} value={settings.macdSlow} onChange={(v) => set('macdSlow', v)} />
            <NumInput label={t('chart.signal')} value={settings.macdSignal} onChange={(v) => set('macdSignal', v)} />
          </>
        )}
      </div>

      {/* Indicator status: never draw a failed indicator */}
      {computed.reports.length > 0 && (
        <ul className="space-y-1" aria-label={t('chart.indicatorStatus')}>
          {computed.reports.map((r) => (
              <li key={r.name} className="flex items-start gap-2 text-xs">
                {r.status === 'OK' && r.warnings.length === 0 ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-[var(--positive)] shrink-0 mt-px" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-[var(--warning)] shrink-0 mt-px" aria-hidden="true" />
                )}
                <span className="font-mono text-[var(--text-strong)]">{r.name}</span>
                <span className={`font-mono ${r.status === 'OK' ? 'text-[var(--positive)]' : 'text-[var(--warning)]'}`}>{r.status}</span>
                <span className="text-[var(--text)]/70">
                  {r.status !== 'OK' ? `${r.reason ?? ''} — ${t('chart.notDrawn')}` : ''} {r.warnings.join('; ')}
                </span>
              </li>
            ))}
        </ul>
      )}

      {/* Chart / empty state */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
        {candles.length > 0 ? (
          <CandleChart
            candles={candles}
            timeframe={data?.timeframe ?? timeframe}
            overlays={computed.overlays}
            lowerPane={computed.lowerPane}
            showVolume={showVolume}
          />
        ) : (
          <div className="h-[460px] flex flex-col items-center justify-center gap-3 text-center px-6">
            {candlesLoading || datasetsLoading ? (
              <p className="text-xs text-[var(--text)]/55">{t('common.loading')}</p>
            ) : (
              <>
                <DataStatusBadge status="UNAVAILABLE" />
                <p className="text-sm text-[var(--text-strong)]">{t('chart.noCandles')}</p>
                <p className="text-xs text-[var(--text)]/55 max-w-md">
                  {unavailable && data?.reason
                    ? data.reason
                    : datasets.length === 0
                      ? t('chart.noDatasets')
                      : t('chart.selectSeries')}
                </p>
              </>
            )}
          </div>
        )}
      </div>

      <BenchmarkReferencePanel />
    </div>
  );
}

export default ChartsView;
