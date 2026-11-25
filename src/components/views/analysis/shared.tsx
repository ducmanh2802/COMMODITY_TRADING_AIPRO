/**
 * Shared building blocks for the Analysis module tabs.
 *
 * Display rules (fail-closed, mirrors `src/shared/analytics/core.ts`):
 * - Every analytics result is shown with its `status`, `reason` and full `warnings` list.
 * - Numbers are shown only when `status === 'OK'`; otherwise the status panel replaces them.
 * - A series containing a non-positive price (e.g. a back-adjusted continuous series) gets an explicit
 *   warning that return-based metrics are invalid for it (the library also rejects it as INVALID_INPUT).
 */
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import {
  type CandlesResponse,
  type SeriesOption,
  fetchCandles,
  fetchSeriesOptions,
} from '../../../api/analysisApi';
import type { AnalyticsStatus, OhlcBar, SeriesPoint } from '../../../shared/analytics';
import { fmtDate as fmtDisplayDate, fmtFixed, fmtInt, hasKey, tr, useT } from '../../../i18n';

// ------------------------------------------------------------------------------------------------
// Formatting
// ------------------------------------------------------------------------------------------------

export function fmtPct(x: number | null | undefined, digits = 2): string {
  return x === null || x === undefined || !Number.isFinite(x) ? '—' : `${fmtFixed(x * 100, digits)}%`;
}

export function fmtNum(x: number | null | undefined, digits = 4): string {
  return x === null || x === undefined || !Number.isFinite(x) ? '—' : fmtFixed(x, digits);
}

export function fmtDate(t: string | null | undefined): string {
  if (!t) return '—';
  return t.length >= 10 ? fmtDisplayDate(t.slice(0, 10)) : t;
}

/** Latest non-null value of an index-aligned series, with its timestamp. */
export function latestValue(timestamps: string[], values: (number | null)[]): { t: string; v: number } | null {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (v !== null && Number.isFinite(v)) return { t: timestamps[i], v };
  }
  return null;
}

// ------------------------------------------------------------------------------------------------
// UI primitives (terminal dark style)
// ------------------------------------------------------------------------------------------------

export const panelClass = 'bg-[var(--surface)] border border-[var(--border)] rounded-lg';
export const inputClass =
  'bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)] disabled:opacity-50';
export const labelClass = 'block text-[11px] text-[var(--text)]/60 mb-1';

export function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section aria-label={title} className={`${panelClass} overflow-hidden`}>
      <div className="px-4 py-3 border-b border-[var(--border)]">
        <h2 className="text-sm font-semibold text-[var(--text-strong)]">{title}</h2>
        {subtitle && <p className="text-xs text-[var(--text)]/55 mt-0.5">{subtitle}</p>}
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </section>
  );
}

const STATUS_STYLE: Record<string, { cls: string; Icon: typeof CheckCircle2 }> = {
  OK: { cls: 'text-[var(--positive)] border-[var(--positive)]/40 bg-[var(--positive)]/10', Icon: CheckCircle2 },
  INSUFFICIENT_DATA: { cls: 'text-[var(--warning)] border-[var(--warning)]/40 bg-[var(--warning)]/10', Icon: AlertTriangle },
  INVALID_INPUT: { cls: 'text-[var(--negative)] border-[var(--negative)]/40 bg-[var(--negative)]/10', Icon: XCircle },
};

export function StatusChip({ status }: { status: AnalyticsStatus | string }) {
  const t = useT();
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.INVALID_INPUT;
  const Icon = s.Icon;
  const key = `an.status.${status}`;
  const label = hasKey(key) ? t(key) : status;
  return (
    <span
      className={`inline-flex items-center gap-1.5 border rounded px-2 py-0.5 font-mono text-[11px] font-medium ${s.cls}`}
      title={status}
    >
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      {label === status ? status : `${label} (${status})`}
    </span>
  );
}

/** Status + reason + warnings for one analytics result. */
export function StatusBlock({
  label,
  status,
  reason,
  warnings,
}: {
  label: string;
  status: AnalyticsStatus | string;
  reason?: string;
  warnings: string[];
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? warnings : warnings.slice(0, 5);
  return (
    <div className="text-xs space-y-1" data-testid={`status-${label}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[var(--text)]/80 font-medium">{label}</span>
        <StatusChip status={status} />
      </div>
      {status !== 'OK' && reason && <p className="font-mono text-[11px] text-[var(--text)]/75">{t('an.reason', { reason })}</p>}
      {warnings.length > 0 && (
        <ul className="list-disc pl-5 text-[11px] text-[var(--warning)]/90 space-y-0.5">
          {shown.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
          {warnings.length > 5 && (
            <li className="list-none -ml-5">
              <button type="button" className="underline text-[var(--text)]/60" onClick={() => setExpanded((e) => !e)}>
                {expanded ? t('an.showFewer') : t('an.showAll', { n: warnings.length })}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export function Notice({ tone, children }: { tone: 'warn' | 'error' | 'info'; children: ReactNode }) {
  const cls =
    tone === 'error'
      ? 'border-[var(--negative)]/50 bg-[var(--negative)]/10 text-[var(--negative)]'
      : tone === 'warn'
        ? 'border-[var(--warning)]/50 bg-[var(--warning)]/10 text-[var(--warning)]'
        : 'border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent-text)]';
  const Icon = tone === 'info' ? Info : AlertTriangle;
  return (
    <div role={tone === 'info' ? 'note' : 'alert'} className={`flex gap-2 border rounded-md px-3 py-2 text-xs ${cls}`}>
      <Icon className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
      <div className="space-y-1">{children}</div>
    </div>
  );
}

export function NumberField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step,
  hint,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        className={`${inputClass} w-28 font-mono`}
        value={Number.isFinite(value) ? value : ''}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
      />
      {hint && <p className="text-[10px] text-[var(--text)]/45 mt-0.5">{hint}</p>}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// Data hooks
// ------------------------------------------------------------------------------------------------

export interface LoadedSeries {
  option: SeriesOption;
  response: CandlesResponse;
  /** Complete candles only (incomplete candles are excluded; the count is reported). */
  bars: OhlcBar[];
  closes: SeriesPoint[];
  excludedIncomplete: number;
  /** Number of candles with any O/H/L/C <= 0 (e.g. back-adjusted continuous series). */
  nonPositiveCount: number;
}

const candleCache = new Map<string, Promise<LoadedSeries>>();

function loadSeries(option: SeriesOption): Promise<LoadedSeries> {
  const cached = candleCache.get(option.key);
  if (cached) return cached;
  const p = fetchCandles({ instrumentId: option.instrumentId, contractCode: option.contractCode, timeframe: option.timeframe }).then(
    (response) => {
      const complete = response.candles.filter((c) => c.isComplete !== false);
      const bars: OhlcBar[] = complete.map((c) => ({
        timestamp: c.timestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }));
      return {
        option,
        response,
        bars,
        closes: complete.map((c) => ({ t: c.timestamp, v: c.close })),
        excludedIncomplete: response.candles.length - complete.length,
        nonPositiveCount: complete.filter((c) => c.open <= 0 || c.high <= 0 || c.low <= 0 || c.close <= 0).length,
      };
    }
  );
  candleCache.set(option.key, p);
  p.catch(() => candleCache.delete(option.key));
  return p;
}

/** Clears cached candles (used by the Reload button). */
export function clearCandleCache(): void {
  candleCache.clear();
}

export function useSeriesOptions(reloadToken: number) {
  const [options, setOptions] = useState<SeriesOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    fetchSeriesOptions(ac.signal)
      .then((o) => setOptions(o))
      .catch((e: unknown) => {
        if (!ac.signal.aborted) setError(e instanceof Error ? e.message : tr('an.loadDatasetsFailed'));
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [reloadToken]);
  return { options, loading, error };
}

/** Loads candles for every selected series (cached per series key). */
export function useLoadedSeries(selected: SeriesOption[]) {
  const [state, setState] = useState<{ data: LoadedSeries[]; loading: boolean; error: string | null }>({
    data: [],
    loading: false,
    error: null,
  });
  const keys = selected.map((s) => s.key).join(',');
  useEffect(() => {
    let cancelled = false;
    if (selected.length === 0) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.all(selected.map(loadSeries))
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((e: unknown) => {
        if (!cancelled) setState({ data: [], loading: false, error: e instanceof Error ? e.message : tr('an.loadCandlesFailed') });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);
  return state;
}

/** Default bars-per-year for annualization; null when it cannot be inferred safely (intraday). */
export function defaultAnnualization(timeframe: string): number | null {
  if (timeframe === 'D1') return 252;
  if (timeframe === 'W1') return 52;
  return null;
}

// ------------------------------------------------------------------------------------------------
// Series picker & integrity notices
// ------------------------------------------------------------------------------------------------

export function SeriesSelect({
  id,
  label,
  options,
  value,
  onChange,
}: {
  id: string;
  label: string;
  options: SeriesOption[];
  value: string;
  onChange: (key: string) => void;
}) {
  const t = useT();
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <select id={id} className={`${inputClass} min-w-[240px] font-mono`} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t('an.selectSeries')}</option>
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label} ({o.priceUnit})
          </option>
        ))}
      </select>
    </div>
  );
}

const STALE_BAR_DAYS = 7;

/** Data-integrity notices for one loaded series (shown above any computed numbers). */
export function SeriesIntegrity({ s, returnBased = true }: { s: LoadedSeries; returnBased?: boolean }) {
  const t = useT();
  const r = s.response;
  const prov = r.provenance;
  const lastBarTs = s.closes.length > 0 ? s.closes[s.closes.length - 1].t : null;
  const lastBarMs = lastBarTs ? Date.parse(lastBarTs) : NaN;
  // Same rule as server classifyHistoricalSeriesFreshness: D1 bars older than 7 calendar days are STALE.
  const lastBarAgeDays = Number.isFinite(lastBarMs) ? (Date.now() - lastBarMs) / 86_400_000 : null;
  return (
    <div className="space-y-2">
      {r.status === 'UNAVAILABLE' && <Notice tone="warn">{r.reason ?? t('an.noCandles')}</Notice>}
      {s.nonPositiveCount > 0 && (
        <Notice tone="error">
          <p className="font-semibold">
            {t('an.nonPositive', { label: s.option.label, n: fmtInt(s.nonPositiveCount) })}
          </p>
          {returnBased && (
            <p>{t('an.nonPositiveBody')}</p>
          )}
        </Notice>
      )}
      {s.option.continuousAdjustment === 'BACK_ADJUSTED' && s.nonPositiveCount === 0 && returnBased && (
        <Notice tone="warn">
          {t('an.backAdjusted', { label: s.option.label })}
        </Notice>
      )}
      {r.truncated && (
        <Notice tone="warn">
          {t('an.truncated', { count: fmtInt(r.count), total: fmtInt(r.totalInRange) })}
        </Notice>
      )}
      {s.excludedIncomplete > 0 && <Notice tone="info">{t('an.incompleteExcluded', { n: fmtInt(s.excludedIncomplete) })}</Notice>}
      {lastBarAgeDays !== null && lastBarAgeDays > STALE_BAR_DAYS ? (
        <Notice tone="warn">{t('hon.staleBar', { date: fmtDate(lastBarTs), n: fmtInt(Math.floor(lastBarAgeDays)) })}</Notice>
      ) : lastBarTs ? (
        <p className="text-[11px] text-[var(--text)]/50 font-mono">{t('hon.asOfBar', { date: fmtDate(lastBarTs) })}</p>
      ) : null}
      {prov.length > 0 && (
        <p className="text-[11px] text-[var(--text)]/50 font-mono">
          {t('an.provenance', {
            label: s.option.label,
            count: fmtInt(r.count),
            unit: r.priceUnit ?? '—',
            adj: r.continuousAdjustment ?? '—',
            sources: prov.map((p) => `${p.sourceLabel} [${p.sourceQuality}]`).join('; '),
          })}
        </p>
      )}
    </div>
  );
}

/** Convenience: map series key → option. */
export function useOptionMap(options: SeriesOption[]) {
  return useMemo(() => new Map(options.map((o) => [o.key, o])), [options]);
}
