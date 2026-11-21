/**
 * COT module (`cot`): CFTC Commitments of Traders positioning for one instrument.
 *
 * Data: GET /api/cot/markets (picker; NOT_REPORTED instruments are disabled with the reason),
 * GET /api/cot/:id (stored reports + analytics), POST /api/cot/sync (admin token, sessionStorage only).
 *
 * Display rules
 * - The analytics `status`, `reason`, `warnings` and weekly `gaps` are always shown.
 * - Net positions / net % OI are raw report arithmetic and are shown whenever reports exist; the COT
 *   Index (which needs a full lookback window) is shown only when analytics status is OK.
 * - INVALID_INPUT shows no numbers at all.
 * - Look-ahead notice: reportDate is the Tuesday as-of date; the data is typically public only from the
 *   following Friday 15:30 ET (expectedReleaseDate is an estimate).
 * Lazy-loaded from App.tsx (default export).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, RefreshCw, UploadCloud } from 'lucide-react';
import { ApiError } from '../../../api/analysisApi';
import {
  type CotMarketMapping,
  type CotQueryResponse,
  type CotSyncResult,
  CotAuthError,
  fetchCot,
  fetchCotMarkets,
  readAdminToken,
  syncCot,
  writeAdminToken,
} from '../../../api/cotApi';
import {
  type CotCategory,
  type CotReportType,
  DEFAULT_COT_LOOKBACK_WEEKS,
  MAX_COT_LOOKBACK_WEEKS,
  MIN_COT_LOOKBACK_WEEKS,
  categoriesFor,
} from '../../../shared/cot/analytics';
import { CHART_COLORS, type ChartLine, TimeSeriesChart } from '../analysis/TimeSeriesChart';
import { Notice, NumberField, Panel, StatusBlock, inputClass, labelClass } from '../analysis/shared';
import { fmtDate, fmtFixed, fmtInt as fmtIntDisplay, tr, useT } from '../../../i18n';

/** Translated trader-category label (vi/en). */
const categoryLabel = (c: CotCategory): string => tr(`cot.cat.${c}`);

const RECENT_WEEKS = 12;
const ZERO = [0];
const INDEX_BANDS = [20, 80];
const intFmt = (v: number) => fmtIntDisplay(v);
const pctFmt = (v: number) => `${fmtFixed(v, 1)}%`;
const idxFmt = (v: number) => v.toFixed(0);

function fmtInt(x: number | null | undefined): string {
  return x === null || x === undefined ? '—' : fmtIntDisplay(x);
}
function fmtSigned(x: number | null | undefined): string {
  if (x === null || x === undefined) return '—';
  const s = fmtIntDisplay(x);
  return x > 0 ? `+${s}` : s;
}

export default function CotView() {
  const t = useT();
  const [markets, setMarkets] = useState<CotMarketMapping[]>([]);
  const [marketsError, setMarketsError] = useState<string | null>(null);
  const [instrumentId, setInstrumentId] = useState('');
  const [reportType, setReportType] = useState<CotReportType>('DISAGGREGATED');
  const [lookback, setLookback] = useState(DEFAULT_COT_LOOKBACK_WEEKS);
  const [maxMissing, setMaxMissing] = useState(0);
  const [data, setData] = useState<CotQueryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    fetchCotMarkets(ac.signal)
      .then((m) => {
        setMarkets(m);
        const first = m.find((x) => x.status === 'REPORTED');
        if (first) setInstrumentId((cur) => cur || first.instrumentId);
      })
      .catch((e: unknown) => {
        if (!ac.signal.aborted) setMarketsError(e instanceof Error ? e.message : tr('cot.err.markets'));
      });
    return () => ac.abort();
  }, []);

  const mapping = markets.find((m) => m.instrumentId === instrumentId) ?? null;

  useEffect(() => {
    if (mapping && mapping.reportTypes.length > 0 && !mapping.reportTypes.includes(reportType)) setReportType(mapping.reportTypes[0]);
  }, [mapping, reportType]);

  const paramError =
    !Number.isInteger(lookback) || lookback < MIN_COT_LOOKBACK_WEEKS || lookback > MAX_COT_LOOKBACK_WEEKS
      ? t('cot.err.lookback', { min: MIN_COT_LOOKBACK_WEEKS, max: MAX_COT_LOOKBACK_WEEKS })
      : !Number.isInteger(maxMissing) || maxMissing < 0 || maxMissing > 52 || maxMissing >= lookback
        ? t('cot.err.maxMissing')
        : null;

  useEffect(() => {
    if (!mapping || mapping.status !== 'REPORTED' || paramError) {
      setData(null);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    fetchCot(mapping.instrumentId, { reportType, lookbackWeeks: lookback, maxMissingWeeks: maxMissing }, ac.signal)
      .then((d) => setData(d))
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        setData(null);
        setError(e instanceof ApiError ? `${e.code} (HTTP ${e.httpStatus}): ${e.message}` : e instanceof Error ? e.message : tr('cot.err.data'));
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [mapping, reportType, lookback, maxMissing, paramError, reloadToken]);

  const reported = markets.filter((m) => m.status === 'REPORTED');
  const notReported = markets.filter((m) => m.status === 'NOT_REPORTED');

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-strong)] tracking-tight">{t('cot.title')}</h1>
          <p className="text-sm text-[var(--text)]/65 mt-1">
            {t('cot.subtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setReloadToken((t) => t + 1)}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--surface-2)] hover:bg-[var(--surface-2)]/80 border border-[var(--border)] rounded-md text-xs font-medium text-[var(--text-strong)] disabled:opacity-50 whitespace-nowrap self-start"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          <span>{t('cot.reload')}</span>
        </button>
      </div>

      {marketsError && <Notice tone="error">{t('cot.marketsError', { error: marketsError })}</Notice>}

      <Panel title={t('cot.selection')}>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="cot-instrument" className={labelClass}>
              {t('cot.instrument')}
            </label>
            <select id="cot-instrument" className={`${inputClass} font-mono min-w-[220px]`} value={instrumentId} onChange={(e) => setInstrumentId(e.target.value)}>
              {reported.map((m) => (
                <option key={m.instrumentId} value={m.instrumentId}>
                  {m.instrumentId} · {m.cftcContractMarketCode}
                </option>
              ))}
              {notReported.length > 0 && (
                <optgroup label={t('cot.notInCftc')}>
                  {notReported.map((m) => (
                    <option key={m.instrumentId} value={m.instrumentId} disabled title={m.notes ?? 'NOT_REPORTED'}>
                      {m.instrumentId} — {t('cot.notReported')}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          <div>
            <span className={labelClass}>{t('cot.reportType')}</span>
            <div className="flex gap-1 bg-[var(--bg)] border border-[var(--border)] rounded-md p-1" role="group" aria-label={t('cot.reportType')}>
              {(['DISAGGREGATED', 'LEGACY'] as const).map((rt) => {
                const available = mapping?.reportTypes.includes(rt) ?? false;
                return (
                  <button
                    key={rt}
                    type="button"
                    aria-pressed={reportType === rt}
                    disabled={!available}
                    onClick={() => setReportType(rt)}
                    title={t(`cot.rt.${rt}`)}
                    className={`px-2.5 py-1 text-[11px] font-mono rounded ${
                      reportType === rt ? 'bg-[var(--accent)] text-white' : 'text-[var(--text)]/70 hover:text-[var(--text-strong)]'
                    } disabled:opacity-30`}
                  >
                    {rt}
                  </button>
                );
              })}
            </div>
          </div>
          <NumberField
            id="cot-lookback"
            label={t('cot.lookback')}
            value={lookback}
            onChange={setLookback}
            min={MIN_COT_LOOKBACK_WEEKS}
            max={MAX_COT_LOOKBACK_WEEKS}
            hint={t('cot.lookbackHint', { min: MIN_COT_LOOKBACK_WEEKS, max: MAX_COT_LOOKBACK_WEEKS, def: DEFAULT_COT_LOOKBACK_WEEKS })}
          />
          <NumberField id="cot-maxmissing" label={t('cot.maxMissing')} value={maxMissing} onChange={setMaxMissing} min={0} max={52} hint={t('cot.maxMissingHint')} />
        </div>
        {paramError && <Notice tone="error">{paramError}</Notice>}
        {mapping?.evidence && (
          <p className="text-[11px] font-mono text-[var(--text)]/55">
            {t('cot.evidence', {
              names: mapping.evidence.marketAndExchangeNames,
              code: mapping.cftcContractMarketCode,
              checked: fmtDate(mapping.evidence.checkedOn),
            })}
          </p>
        )}
        {mapping?.notes && <Notice tone="info">{mapping.notes}</Notice>}
        {notReported.length > 0 && (
          <details className="text-xs text-[var(--text)]/70">
            <summary className="cursor-pointer">{t('cot.notCovered', { n: notReported.length })}</summary>
            <ul className="mt-2 space-y-1.5">
              {notReported.map((m) => (
                <li key={m.instrumentId}>
                  <span className="font-mono text-[var(--text-strong)]">{m.instrumentId}</span>: {m.notes}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Panel>

      {mapping?.status === 'REPORTED' && <SyncPanel instrumentId={mapping.instrumentId} onSynced={() => setReloadToken((t) => t + 1)} />}

      {loading && <p className="text-xs text-[var(--text)]/55">{t('cot.loading')}</p>}
      {error && <Notice tone="error">{error}</Notice>}
      {data && <CotResults data={data} />}
    </div>
  );
}

function SyncPanel({ instrumentId, onSynced }: { instrumentId: string; onSynced: () => void }) {
  const t = useT();
  const [token, setToken] = useState(readAdminToken);
  const [from, setFrom] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CotSyncResult | null>(null);
  const [err, setErr] = useState<{ tone: 'error' | 'warn'; text: string } | null>(null);

  const run = useCallback(async () => {
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const r = await syncCot(instrumentId, token.trim(), from || undefined);
      setResult(r);
      if (r.status !== 'FAILED') onSynced();
    } catch (e) {
      if (e instanceof CotAuthError) {
        setErr({
          tone: 'warn',
          text:
            e.httpStatus === 401
              ? tr('cot.sync.401', { msg: e.message })
              : tr('cot.sync.403', { msg: e.message }),
        });
      } else if (e instanceof ApiError) {
        setErr({ tone: 'error', text: `${e.code} (HTTP ${e.httpStatus}): ${e.message}` });
      } else {
        setErr({ tone: 'error', text: e instanceof Error ? e.message : tr('cot.sync.failed') });
      }
    } finally {
      setBusy(false);
    }
  }, [instrumentId, token, from, onSynced]);

  return (
    <Panel title={t('cot.sync.title')} subtitle={t('cot.sync.subtitle')}>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="cot-token" className={labelClass}>
            <KeyRound className="w-3 h-3 inline mr-1" aria-hidden="true" />
            {t('cot.sync.token')}
          </label>
          <input
            id="cot-token"
            type="password"
            autoComplete="off"
            className={`${inputClass} w-56 font-mono`}
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              writeAdminToken(e.target.value.trim());
            }}
          />
        </div>
        <div>
          <label htmlFor="cot-from" className={labelClass}>
            {t('cot.sync.from')}
          </label>
          <input id="cot-from" type="date" className={`${inputClass} font-mono`} value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent)]/85 rounded-md text-xs font-medium text-white disabled:opacity-50"
        >
          <UploadCloud className={`w-3.5 h-3.5 ${busy ? 'animate-pulse' : ''}`} aria-hidden="true" />
          {busy ? t('cot.sync.syncing') : t('cot.sync.btn', { id: instrumentId })}
        </button>
      </div>
      {err && <Notice tone={err.tone}>{err.text}</Notice>}
      {result && (
        <div className="space-y-2 text-xs">
          <p className="font-mono">
            {t('cot.sync.status')} <span className={result.status === 'SUCCESS' ? 'text-[var(--positive)]' : result.status === 'PARTIAL' ? 'text-[var(--warning)]' : 'text-[var(--negative)]'}>{result.status}</span>{' '}
            · {t('cot.sync.code', { code: result.cftcContractMarketCode })}
          </p>
          <div className="overflow-x-auto">
            <table className="text-[11px] font-mono min-w-[640px]">
              <thead>
                <tr className="text-[var(--text)]/60 border-b border-[var(--border)]">
                  {[
                    t('cot.sync.h.type'),
                    t('cot.sync.h.status'),
                    t('cot.sync.h.from'),
                    t('cot.sync.h.fetched'),
                    t('cot.sync.h.received'),
                    t('cot.sync.h.accepted'),
                    t('cot.sync.h.rejected'),
                    t('cot.sync.h.ius'),
                    t('cot.sync.h.message'),
                  ].map((h) => (
                    <th key={h} className="py-1.5 px-2 text-left font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]/70">
                {result.results.map((r) => (
                  <tr key={r.reportType}>
                    <td className="py-1.5 px-2">{r.reportType}</td>
                    <td className="py-1.5 px-2">{r.status}</td>
                    <td className="py-1.5 px-2">{r.requestedFrom}</td>
                    <td className="py-1.5 px-2">{r.fetchedAt ?? '—'}</td>
                    <td className="py-1.5 px-2 text-right">{r.rowsReceived}</td>
                    <td className="py-1.5 px-2 text-right">{r.rowsAccepted}</td>
                    <td className="py-1.5 px-2 text-right">{r.rowsRejected}</td>
                    <td className="py-1.5 px-2">
                      {r.inserted}/{r.updated}/{r.unchanged}
                    </td>
                    <td className="py-1.5 px-2 max-w-xs">{r.message ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.results.flatMap((r) => r.warnings.map((w) => `${r.reportType}: ${w}`)).length > 0 && (
            <ul className="list-disc pl-5 text-[11px] text-[var(--warning)]/90">
              {result.results
                .flatMap((r) => r.warnings.map((w) => `${r.reportType}: ${w}`))
                .slice(0, 10)
                .map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
            </ul>
          )}
        </div>
      )}
    </Panel>
  );
}

function CotResults({ data }: { data: CotQueryResponse }) {
  const t = useT();
  const a = data.analytics;
  const cats = categoriesFor(data.reportType);
  const rows = a.rows;
  const latest = a.latest;
  const showValues = a.status !== 'INVALID_INPUT' && rows.length > 0;

  const netLines = useMemo<ChartLine[]>(
    () =>
      showValues
        ? cats.map((c, i) => ({ name: categoryLabel(c), color: CHART_COLORS[i], points: rows.map((r) => ({ t: r.reportDate, v: r.categories[c]?.net ?? null })) }))
        : [],
    [showValues, cats, rows, t]
  );
  const pctLines = useMemo<ChartLine[]>(
    () =>
      showValues
        ? cats.map((c, i) => ({ name: categoryLabel(c), color: CHART_COLORS[i], points: rows.map((r) => ({ t: r.reportDate, v: r.categories[c]?.netPctOi ?? null })) }))
        : [],
    [showValues, cats, rows, t]
  );
  const idxLines = useMemo<ChartLine[]>(
    () =>
      a.status === 'OK'
        ? cats.map((c, i) => ({ name: categoryLabel(c), color: CHART_COLORS[i], points: rows.map((r) => ({ t: r.reportDate, v: r.categories[c]?.cotIndex ?? null })) }))
        : [],
    [a.status, cats, rows, t]
  );

  const recent = rows.slice(-RECENT_WEEKS).reverse();
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <Panel title={t('cot.prov.title')}>
        <dl className="grid gap-2 text-xs md:grid-cols-2">
          <div>
            <dt className="text-[var(--text)]/55">{t('cot.prov.sources')}</dt>
            <dd className="font-mono text-[11px] text-[var(--text-strong)] break-all">
              {data.provenance.sources.length ? data.provenance.sources.map((s) => <div key={s}>{s}</div>) : t('cot.prov.noReports')}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--text)]/55">{t('cot.prov.fetchedAt')}</dt>
            <dd className="font-mono text-[var(--text-strong)]">{data.provenance.fetchedAt ?? '—'}</dd>
            <dt className="text-[var(--text)]/55 mt-1">{t('cot.prov.retrievedAt')}</dt>
            <dd className="font-mono text-[var(--text-strong)]">{data.retrievedAt}</dd>
          </div>
        </dl>
        <Notice tone="warn">
          <p className="font-semibold">{t('cot.lookahead.title')}</p>
          {latest ? (
            <p>
              {t('cot.lookahead.1')} <span className="font-mono">{fmtDate(latest.reportDate)}</span> {t('cot.lookahead.2')}{' '}
              <span className="font-mono">{fmtDate(latest.expectedReleaseDate)}</span> {t('cot.lookahead.3')}
              {latest.expectedReleaseDate > todayIso ? t('cot.lookahead.future') : '.'}
            </p>
          ) : null}
          <p>{data.timingNotice}</p>
        </Notice>
      </Panel>

      <Panel
        title={t('cot.an.title')}
        subtitle={t('cot.an.subtitle', { rt: data.reportType, n: data.count, lb: a.lookbackWeeks, mm: a.maxMissingWeeks })}
      >
        <StatusBlock label={t('cot.an.label')} status={a.status} reason={a.reason} warnings={a.warnings} />
        {rows.length === 0 && a.status !== 'INVALID_INPUT' && <Notice tone="info">{t('cot.an.noReports')}</Notice>}
        {a.gaps.length > 0 && (
          <div>
            <p className="text-xs text-[var(--warning)] font-medium mb-1">{t('cot.gaps.title', { n: a.gaps.length })}</p>
            <div className="overflow-x-auto">
              <table className="text-[11px] font-mono">
                <thead>
                  <tr className="text-[var(--text)]/60 border-b border-[var(--border)]">
                    <th className="py-1 pr-3 text-left font-medium">{t('cot.gaps.after')}</th>
                    <th className="py-1 px-3 text-left font-medium">{t('cot.gaps.before')}</th>
                    <th className="py-1 px-3 text-right font-medium">{t('cot.gaps.days')}</th>
                    <th className="py-1 px-3 text-right font-medium">{t('cot.gaps.missing')}</th>
                    <th className="py-1 px-3 text-left font-medium">{t('cot.gaps.kind')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]/70">
                  {a.gaps.map((g) => (
                    <tr key={`${g.after}-${g.before}`}>
                      <td className="py-1 pr-3">{fmtDate(g.after)}</td>
                      <td className="py-1 px-3">{fmtDate(g.before)}</td>
                      <td className="py-1 px-3 text-right">{g.days}</td>
                      <td className="py-1 px-3 text-right">{g.missingWeeks ?? '—'}</td>
                      <td className="py-1 px-3">{g.kind}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <details className="text-[11px] text-[var(--text)]/60">
          <summary className="cursor-pointer">{t('cot.formulas')}</summary>
          <ul className="mt-1 space-y-0.5 font-mono">
            {Object.entries(a.formula).map(([k, v]) => (
              <li key={k}>
                {k}: {v}
              </li>
            ))}
          </ul>
        </details>
      </Panel>

      {showValues && latest && (
        <Panel
          title={t('cot.latest.title', { date: fmtDate(latest.reportDate) })}
          subtitle={t('cot.latest.subtitle', { oi: fmtInt(latest.openInterest) })}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono min-w-[720px]">
              <thead>
                <tr className="text-[var(--text)]/60 border-b border-[var(--border)]">
                  {[
                    t('cot.col.category'),
                    t('cot.col.long'),
                    t('cot.col.short'),
                    t('cot.col.spread'),
                    t('cot.col.net'),
                    t('cot.col.wow'),
                    t('cot.col.netPct'),
                    t('cot.col.index', { n: a.lookbackWeeks }),
                  ].map((h) => (
                    <th key={h} className="py-1.5 px-2 text-right first:text-left font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]/70">
                {cats.map((c) => {
                  const v = latest.categories[c];
                  return (
                    <tr key={c}>
                      <td className="py-1.5 px-2 text-[var(--text-strong)]">{categoryLabel(c)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{fmtInt(v?.long)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{fmtInt(v?.short)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{fmtInt(v?.spread)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-[var(--text-strong)]">{fmtSigned(v?.net)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{v?.netChangeWoW === null ? <span title={t('cot.gapTitle')}>— {t('cot.gap')}</span> : fmtSigned(v?.netChangeWoW)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{v?.netPctOi === null || v?.netPctOi === undefined ? '—' : `${fmtFixed(v.netPctOi, 1)}%`}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{a.status === 'OK' && v?.cotIndex !== null && v?.cotIndex !== undefined ? v.cotIndex.toFixed(0) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {showValues && (
        <>
          <Panel title={t('cot.chart.net')}>
            <TimeSeriesChart lines={netLines} valueFormatter={intFmt} referenceLines={ZERO} ariaLabel={t('cot.chart.netAria')} />
          </Panel>
          <Panel title={t('cot.chart.pct')}>
            <TimeSeriesChart lines={pctLines} valueFormatter={pctFmt} referenceLines={ZERO} height={220} ariaLabel={t('cot.chart.pctAria')} />
          </Panel>
          <Panel title={t('cot.chart.index', { n: a.lookbackWeeks })} subtitle={t('cot.chart.indexSub')}>
            {a.status === 'OK' ? (
              <TimeSeriesChart lines={idxLines} valueFormatter={idxFmt} referenceLines={INDEX_BANDS} height={220} ariaLabel={t('cot.chart.indexAria')} />
            ) : (
              <Notice tone="warn">
                {t('cot.chart.indexHidden', { status: a.status, reason: a.reason })}
              </Notice>
            )}
          </Panel>
          <Panel title={t('cot.recent.title', { n: Math.min(RECENT_WEEKS, recent.length) })} subtitle={t('cot.recent.subtitle')}>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] font-mono min-w-[860px]">
                <thead>
                  <tr className="text-[var(--text)]/60 border-b border-[var(--border)]">
                    <th className="py-1.5 px-2 text-left font-medium">{t('cot.recent.date')}</th>
                    <th className="py-1.5 px-2 text-left font-medium">{t('cot.recent.release')}</th>
                    <th className="py-1.5 px-2 text-right font-medium" title={t('term.openInterest')}>
                      {t('cot.recent.oi')}
                    </th>
                    {cats.map((c) => (
                      <th key={c} className="py-1.5 px-2 text-right font-medium">
                        {t('cot.recent.netDelta', { cat: categoryLabel(c) })}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]/70">
                  {recent.map((r) => (
                    <tr key={r.reportDate}>
                      <td className="py-1.5 px-2 text-[var(--text-strong)]">{fmtDate(r.reportDate)}</td>
                      <td className="py-1.5 px-2 text-[var(--text)]/60">{fmtDate(r.expectedReleaseDate)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{fmtInt(r.openInterest)}</td>
                      {cats.map((c) => {
                        const v = r.categories[c];
                        const d = v?.netChangeWoW ?? null;
                        return (
                          <td key={c} className="py-1.5 px-2 text-right tabular-nums">
                            <span className="text-[var(--text-strong)]">{fmtSigned(v?.net)}</span>
                            <span className={`ml-1.5 ${d === null ? 'text-[var(--warning)]/80' : d > 0 ? 'text-[var(--positive)]' : d < 0 ? 'text-[var(--negative)]' : 'text-[var(--text)]/60'}`}>
                              {d === null ? t('cot.gap') : fmtSigned(d)}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}

      {showValues && (
        <OpenInterestPanel data={data} />
      )}
    </div>
  );
}

/** T49: weekly total open interest (last 26 reports) with the 4-week change, as an SVG bar chart. */
function OpenInterestPanel({ data }: { data: CotQueryResponse }) {
  const t = useT();
  const rows = data.analytics.rows.slice(-26);
  if (rows.length === 0) return null;
  const latest = rows[rows.length - 1];
  const max = Math.max(...rows.map((r) => r.openInterest), 1);
  const W = 520;
  const H = 120;
  const gap = 2;
  const bw = W / rows.length - gap;
  const ch = latest.openInterestChange4w;
  return (
    <Panel title={t('cot.oi.title')} subtitle={t('cot.oi.subtitle')}>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 mb-3">
        <div>
          <span className="text-[11px] text-[var(--text)]/60">{t('cot.oi.chartTitle')}</span>
          <div className="text-xl font-semibold text-[var(--text-strong)] tabular-nums">{fmtIntDisplay(latest.openInterest)}</div>
          <div className="text-[11px] text-[var(--text)]/50">{fmtDate(latest.reportDate)}</div>
        </div>
        <div>
          <span className="text-[11px] text-[var(--text)]/60">{t('cot.oi.change4w')}</span>
          <div
            className={`text-xl font-semibold tabular-nums ${
              ch === null ? 'text-[var(--text)]/50' : ch > 0 ? 'text-[var(--positive)]' : ch < 0 ? 'text-[var(--negative)]' : 'text-[var(--text)]'
            }`}
          >
            {ch === null ? '—' : `${ch > 0 ? '+' : ''}${fmtIntDisplay(ch)}`}
          </div>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-32" role="img" aria-label={t('cot.oi.chartTitle')}>
        {rows.map((r, i) => {
          const h = Math.max(1, (r.openInterest / max) * (H - 4));
          return (
            <rect
              key={r.reportDate}
              x={i * (bw + gap)}
              y={H - h}
              width={Math.max(1, bw)}
              height={h}
              rx={3}
              className="fill-[var(--series-1)] hover:brightness-125"
            >
              <title>{`${fmtDate(r.reportDate)}: ${fmtIntDisplay(r.openInterest)}`}</title>
            </rect>
          );
        })}
      </svg>
      <p className="mt-2 text-xs text-[var(--text)]/70">{t('cot.oi.explanation')}</p>
    </Panel>
  );
}
