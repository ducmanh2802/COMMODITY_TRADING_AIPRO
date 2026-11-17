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

const CATEGORY_LABEL: Record<CotCategory, string> = {
  producerMerchant: 'Producer/Merchant',
  swapDealers: 'Swap Dealers',
  managedMoney: 'Managed Money',
  otherReportables: 'Other Reportables',
  nonReportables: 'Non-Reportables',
  nonCommercial: 'Non-Commercial',
  commercial: 'Commercial',
};

const RECENT_WEEKS = 12;
const ZERO = [0];
const INDEX_BANDS = [20, 80];
const intFmt = (v: number) => Math.round(v).toLocaleString('en-US');
const pctFmt = (v: number) => `${v.toFixed(1)}%`;
const idxFmt = (v: number) => v.toFixed(0);

function fmtInt(x: number | null | undefined): string {
  return x === null || x === undefined ? '—' : Math.round(x).toLocaleString('en-US');
}
function fmtSigned(x: number | null | undefined): string {
  if (x === null || x === undefined) return '—';
  const s = Math.round(x).toLocaleString('en-US');
  return x > 0 ? `+${s}` : s;
}

export default function CotView() {
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
        if (!ac.signal.aborted) setMarketsError(e instanceof Error ? e.message : 'Failed to load COT markets.');
      });
    return () => ac.abort();
  }, []);

  const mapping = markets.find((m) => m.instrumentId === instrumentId) ?? null;

  useEffect(() => {
    if (mapping && mapping.reportTypes.length > 0 && !mapping.reportTypes.includes(reportType)) setReportType(mapping.reportTypes[0]);
  }, [mapping, reportType]);

  const paramError =
    !Number.isInteger(lookback) || lookback < MIN_COT_LOOKBACK_WEEKS || lookback > MAX_COT_LOOKBACK_WEEKS
      ? `Lookback must be an integer between ${MIN_COT_LOOKBACK_WEEKS} and ${MAX_COT_LOOKBACK_WEEKS} weeks.`
      : !Number.isInteger(maxMissing) || maxMissing < 0 || maxMissing > 52 || maxMissing >= lookback
        ? 'Max missing weeks must be an integer in [0, 52] and below the lookback.'
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
        setError(e instanceof ApiError ? `${e.code} (HTTP ${e.httpStatus}): ${e.message}` : e instanceof Error ? e.message : 'Failed to load COT data.');
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
          <h1 className="text-xl font-semibold text-white tracking-tight">Commitments of Traders</h1>
          <p className="text-sm text-[#E5E7EB]/65 mt-1">
            CFTC futures-only positioning by trader category: net positions, net % of open interest and COT Index. Weekly gaps are never
            interpolated.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setReloadToken((t) => t + 1)}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#172033] hover:bg-[#172033]/80 border border-[#263244] rounded-md text-xs font-medium text-white disabled:opacity-50 whitespace-nowrap self-start"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          <span>Reload</span>
        </button>
      </div>

      {marketsError && <Notice tone="error">Could not load COT markets: {marketsError}</Notice>}

      <Panel title="Selection">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="cot-instrument" className={labelClass}>
              Instrument
            </label>
            <select id="cot-instrument" className={`${inputClass} font-mono min-w-[220px]`} value={instrumentId} onChange={(e) => setInstrumentId(e.target.value)}>
              {reported.map((m) => (
                <option key={m.instrumentId} value={m.instrumentId}>
                  {m.instrumentId} · {m.cftcContractMarketCode}
                </option>
              ))}
              {notReported.length > 0 && (
                <optgroup label="Not in CFTC COT reports">
                  {notReported.map((m) => (
                    <option key={m.instrumentId} value={m.instrumentId} disabled title={m.notes ?? 'NOT_REPORTED'}>
                      {m.instrumentId} — NOT_REPORTED
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          <div>
            <span className={labelClass}>Report type</span>
            <div className="flex gap-1 bg-[#0B0E14] border border-[#263244] rounded-md p-1" role="group" aria-label="Report type">
              {(['DISAGGREGATED', 'LEGACY'] as const).map((rt) => {
                const available = mapping?.reportTypes.includes(rt) ?? false;
                return (
                  <button
                    key={rt}
                    type="button"
                    aria-pressed={reportType === rt}
                    disabled={!available}
                    onClick={() => setReportType(rt)}
                    className={`px-2.5 py-1 text-[11px] font-mono rounded ${
                      reportType === rt ? 'bg-[#6366F1] text-white' : 'text-[#E5E7EB]/70 hover:text-white'
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
            label="COT Index lookback (weeks)"
            value={lookback}
            onChange={setLookback}
            min={MIN_COT_LOOKBACK_WEEKS}
            max={MAX_COT_LOOKBACK_WEEKS}
            hint={`${MIN_COT_LOOKBACK_WEEKS}–${MAX_COT_LOOKBACK_WEEKS}, default ${DEFAULT_COT_LOOKBACK_WEEKS}`}
          />
          <NumberField id="cot-maxmissing" label="Max missing weeks" value={maxMissing} onChange={setMaxMissing} min={0} max={52} hint="per Index window" />
        </div>
        {paramError && <Notice tone="error">{paramError}</Notice>}
        {mapping?.evidence && (
          <p className="text-[11px] font-mono text-[#E5E7EB]/55">
            CFTC market: {mapping.evidence.marketAndExchangeNames} · code {mapping.cftcContractMarketCode} · mapping checked {mapping.evidence.checkedOn}
          </p>
        )}
        {mapping?.notes && <Notice tone="info">{mapping.notes}</Notice>}
        {notReported.length > 0 && (
          <details className="text-xs text-[#E5E7EB]/70">
            <summary className="cursor-pointer">Instruments not covered by CFTC COT ({notReported.length})</summary>
            <ul className="mt-2 space-y-1.5">
              {notReported.map((m) => (
                <li key={m.instrumentId}>
                  <span className="font-mono text-white">{m.instrumentId}</span>: {m.notes}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Panel>

      {mapping?.status === 'REPORTED' && <SyncPanel instrumentId={mapping.instrumentId} onSynced={() => setReloadToken((t) => t + 1)} />}

      {loading && <p className="text-xs text-[#E5E7EB]/55">Loading COT reports…</p>}
      {error && <Notice tone="error">{error}</Notice>}
      {data && <CotResults data={data} />}
    </div>
  );
}

function SyncPanel({ instrumentId, onSynced }: { instrumentId: string; onSynced: () => void }) {
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
              ? `401 Unauthorized — admin token missing or not accepted. ${e.message}`
              : `403 Forbidden — this token is not allowed to run a sync (or admin sync is disabled on the server). ${e.message}`,
        });
      } else if (e instanceof ApiError) {
        setErr({ tone: 'error', text: `${e.code} (HTTP ${e.httpStatus}): ${e.message}` });
      } else {
        setErr({ tone: 'error', text: e instanceof Error ? e.message : 'Sync failed.' });
      }
    } finally {
      setBusy(false);
    }
  }, [instrumentId, token, from, onSynced]);

  return (
    <Panel title="Sync from CFTC (admin)" subtitle="Fetches reports from the official CFTC source and stores them. The token is kept in this browser tab's sessionStorage only.">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="cot-token" className={labelClass}>
            <KeyRound className="w-3 h-3 inline mr-1" aria-hidden="true" />
            Admin token
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
            From (optional)
          </label>
          <input id="cot-from" type="date" className={`${inputClass} font-mono`} value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#6366F1] hover:bg-[#6366F1]/85 rounded-md text-xs font-medium text-white disabled:opacity-50"
        >
          <UploadCloud className={`w-3.5 h-3.5 ${busy ? 'animate-pulse' : ''}`} aria-hidden="true" />
          {busy ? 'Syncing…' : `Sync ${instrumentId}`}
        </button>
      </div>
      {err && <Notice tone={err.tone}>{err.text}</Notice>}
      {result && (
        <div className="space-y-2 text-xs">
          <p className="font-mono">
            Sync status: <span className={result.status === 'SUCCESS' ? 'text-[#22C55E]' : result.status === 'PARTIAL' ? 'text-[#F59E0B]' : 'text-[#EF4444]'}>{result.status}</span>{' '}
            · code {result.cftcContractMarketCode}
          </p>
          <div className="overflow-x-auto">
            <table className="text-[11px] font-mono min-w-[640px]">
              <thead>
                <tr className="text-[#E5E7EB]/60 border-b border-[#263244]">
                  {['Type', 'Status', 'From', 'Fetched at', 'Received', 'Accepted', 'Rejected', 'Ins/Upd/Same', 'Message'].map((h) => (
                    <th key={h} className="py-1.5 px-2 text-left font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#263244]/70">
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
            <ul className="list-disc pl-5 text-[11px] text-[#F59E0B]/90">
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
  const a = data.analytics;
  const cats = categoriesFor(data.reportType);
  const rows = a.rows;
  const latest = a.latest;
  const showValues = a.status !== 'INVALID_INPUT' && rows.length > 0;

  const netLines = useMemo<ChartLine[]>(
    () =>
      showValues
        ? cats.map((c, i) => ({ name: CATEGORY_LABEL[c], color: CHART_COLORS[i], points: rows.map((r) => ({ t: r.reportDate, v: r.categories[c]?.net ?? null })) }))
        : [],
    [showValues, cats, rows]
  );
  const pctLines = useMemo<ChartLine[]>(
    () =>
      showValues
        ? cats.map((c, i) => ({ name: CATEGORY_LABEL[c], color: CHART_COLORS[i], points: rows.map((r) => ({ t: r.reportDate, v: r.categories[c]?.netPctOi ?? null })) }))
        : [],
    [showValues, cats, rows]
  );
  const idxLines = useMemo<ChartLine[]>(
    () =>
      a.status === 'OK'
        ? cats.map((c, i) => ({ name: CATEGORY_LABEL[c], color: CHART_COLORS[i], points: rows.map((r) => ({ t: r.reportDate, v: r.categories[c]?.cotIndex ?? null })) }))
        : [],
    [a.status, cats, rows]
  );

  const recent = rows.slice(-RECENT_WEEKS).reverse();
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <Panel title="Provenance & timing">
        <dl className="grid gap-2 text-xs md:grid-cols-2">
          <div>
            <dt className="text-[#E5E7EB]/55">Source(s) actually used</dt>
            <dd className="font-mono text-[11px] text-white break-all">
              {data.provenance.sources.length ? data.provenance.sources.map((s) => <div key={s}>{s}</div>) : '— (no stored reports)'}
            </dd>
          </div>
          <div>
            <dt className="text-[#E5E7EB]/55">Fetched at (latest stored fetch)</dt>
            <dd className="font-mono text-white">{data.provenance.fetchedAt ?? '—'}</dd>
            <dt className="text-[#E5E7EB]/55 mt-1">API retrieved at</dt>
            <dd className="font-mono text-white">{data.retrievedAt}</dd>
          </div>
        </dl>
        <Notice tone="warn">
          <p className="font-semibold">Look-ahead notice</p>
          {latest ? (
            <p>
              Latest report as-of <span className="font-mono">{latest.reportDate}</span> (positions at Tuesday close); typical public release{' '}
              <span className="font-mono">{latest.expectedReleaseDate}</span> 15:30 ET (estimate — holidays/shutdowns delay it)
              {latest.expectedReleaseDate > todayIso ? ' — that date is in the future, so this report may not be public yet by the typical schedule.' : '.'}
            </p>
          ) : null}
          <p>{data.timingNotice}</p>
        </Notice>
      </Panel>

      <Panel title="Analytics status" subtitle={`${data.reportType} · ${data.count} stored report(s) · lookback ${a.lookbackWeeks} weeks · max missing ${a.maxMissingWeeks}`}>
        <StatusBlock label="COT analytics" status={a.status} reason={a.reason} warnings={a.warnings} />
        {rows.length === 0 && a.status !== 'INVALID_INPUT' && <Notice tone="info">No reports stored for this market and report type. Run a sync (admin) to fetch them from CFTC.</Notice>}
        {a.gaps.length > 0 && (
          <div>
            <p className="text-xs text-[#F59E0B] font-medium mb-1">Weekly gaps ({a.gaps.length}) — not interpolated</p>
            <div className="overflow-x-auto">
              <table className="text-[11px] font-mono">
                <thead>
                  <tr className="text-[#E5E7EB]/60 border-b border-[#263244]">
                    <th className="py-1 pr-3 text-left font-medium">After</th>
                    <th className="py-1 px-3 text-left font-medium">Before</th>
                    <th className="py-1 px-3 text-right font-medium">Days</th>
                    <th className="py-1 px-3 text-right font-medium">Missing weeks</th>
                    <th className="py-1 px-3 text-left font-medium">Kind</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#263244]/70">
                  {a.gaps.map((g) => (
                    <tr key={`${g.after}-${g.before}`}>
                      <td className="py-1 pr-3">{g.after}</td>
                      <td className="py-1 px-3">{g.before}</td>
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
        <details className="text-[11px] text-[#E5E7EB]/60">
          <summary className="cursor-pointer">Formulas</summary>
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
        <Panel title={`Latest report · ${latest.reportDate}`} subtitle={`Open interest ${fmtInt(latest.openInterest)} contracts`}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono min-w-[720px]">
              <thead>
                <tr className="text-[#E5E7EB]/60 border-b border-[#263244]">
                  {['Category', 'Long', 'Short', 'Spread', 'Net', 'WoW Δ net', 'Net % OI', `COT Index (${a.lookbackWeeks}w)`].map((h) => (
                    <th key={h} className="py-1.5 px-2 text-right first:text-left font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#263244]/70">
                {cats.map((c) => {
                  const v = latest.categories[c];
                  return (
                    <tr key={c}>
                      <td className="py-1.5 px-2 text-white">{CATEGORY_LABEL[c]}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{fmtInt(v?.long)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{fmtInt(v?.short)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{fmtInt(v?.spread)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-white">{fmtSigned(v?.net)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{v?.netChangeWoW === null ? <span title="previous report not exactly 7 days earlier">— (gap)</span> : fmtSigned(v?.netChangeWoW)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{v?.netPctOi === null || v?.netPctOi === undefined ? '—' : `${v.netPctOi.toFixed(1)}%`}</td>
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
          <Panel title="Net positions by category (contracts)">
            <TimeSeriesChart lines={netLines} valueFormatter={intFmt} referenceLines={ZERO} ariaLabel="COT net positions chart" />
          </Panel>
          <Panel title="Net % of open interest">
            <TimeSeriesChart lines={pctLines} valueFormatter={pctFmt} referenceLines={ZERO} height={220} ariaLabel="COT net percent of open interest chart" />
          </Panel>
          <Panel title={`COT Index (${a.lookbackWeeks}-week lookback)`} subtitle="0 = net at the window low, 100 = at the window high. Null where the window is incomplete or flat.">
            {a.status === 'OK' ? (
              <TimeSeriesChart lines={idxLines} valueFormatter={idxFmt} referenceLines={INDEX_BANDS} height={220} ariaLabel="COT Index chart" />
            ) : (
              <Notice tone="warn">
                COT Index not shown — status {a.status}. {a.reason}
              </Notice>
            )}
          </Panel>
          <Panel title={`Recent ${Math.min(RECENT_WEEKS, recent.length)} weeks`} subtitle="Net positions with week-over-week change (— (gap) when the previous report is not exactly 7 days earlier).">
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] font-mono min-w-[860px]">
                <thead>
                  <tr className="text-[#E5E7EB]/60 border-b border-[#263244]">
                    <th className="py-1.5 px-2 text-left font-medium">Report date</th>
                    <th className="py-1.5 px-2 text-left font-medium">Release (est.)</th>
                    <th className="py-1.5 px-2 text-right font-medium">OI</th>
                    {cats.map((c) => (
                      <th key={c} className="py-1.5 px-2 text-right font-medium">
                        {CATEGORY_LABEL[c]} net / Δ
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#263244]/70">
                  {recent.map((r) => (
                    <tr key={r.reportDate}>
                      <td className="py-1.5 px-2 text-white">{r.reportDate}</td>
                      <td className="py-1.5 px-2 text-[#E5E7EB]/60">{r.expectedReleaseDate}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{fmtInt(r.openInterest)}</td>
                      {cats.map((c) => {
                        const v = r.categories[c];
                        const d = v?.netChangeWoW ?? null;
                        return (
                          <td key={c} className="py-1.5 px-2 text-right tabular-nums">
                            <span className="text-white">{fmtSigned(v?.net)}</span>
                            <span className={`ml-1.5 ${d === null ? 'text-[#F59E0B]/80' : d > 0 ? 'text-[#22C55E]' : d < 0 ? 'text-[#EF4444]' : 'text-[#E5E7EB]/60'}`}>
                              {d === null ? '(gap)' : fmtSigned(d)}
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
    </div>
  );
}
