import { useEffect, useMemo, useState } from 'react';
import { useTerminal } from '../../../contexts/TerminalContext';
import { errorMessage, fetchDatasets, type DatasetSummary } from '../../../api/contractsApi';
import { ROLL_YIELD_FORMULA, type CurveShape } from '../../../shared/contracts/termStructure';
import { DataStatusBadge } from '../../common/DataStatusBadge';
import { CURVE_TIMEFRAME, groupContractDatasets, loadCurveSnapshot, type CurveSnapshot } from './curveData';
import { LineChartSvg, type ChartSeries } from './LineChartSvg';
import { SpreadHistoryPanel } from './SpreadHistoryPanel';

type Loadable<T> = { state: 'idle' } | { state: 'loading' } | { state: 'ok'; data: T } | { state: 'error'; message: string };

const inputClass =
  'bg-[#111622] border border-[#263244] rounded-md px-2.5 py-1.5 text-xs text-[#E5E7EB] focus:outline-none focus:border-[#6366F1]';

const SHAPE_COLOR: Record<CurveShape, string> = {
  CONTANGO: 'text-[#F59E0B] border-[#F59E0B]/40 bg-[#F59E0B]/10',
  BACKWARDATION: 'text-[#22C55E] border-[#22C55E]/40 bg-[#22C55E]/10',
  MIXED: 'text-[#818CF8] border-[#818CF8]/40 bg-[#818CF8]/10',
  FLAT: 'text-[#E5E7EB] border-[#E5E7EB]/30 bg-[#E5E7EB]/5',
};

function pct(x: number | null): string {
  return x === null ? 'undefined' : `${(x * 100).toFixed(2)}%`;
}

function useSnapshot(instrumentKey: string | null, datasets: DatasetSummary[] | null, asOf: string, enabled: boolean) {
  const { instruments } = useTerminal();
  const [snap, setSnap] = useState<Loadable<CurveSnapshot>>({ state: 'idle' });
  useEffect(() => {
    const inst = instruments.find((i) => i.id === instrumentKey);
    if (!enabled || !inst || !datasets || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
      setSnap({ state: 'idle' });
      return;
    }
    const ctl = new AbortController();
    setSnap({ state: 'loading' });
    loadCurveSnapshot(inst, datasets, asOf, ctl.signal)
      .then((data) => setSnap({ state: 'ok', data }))
      .catch((err) => {
        if (!ctl.signal.aborted) setSnap({ state: 'error', message: errorMessage(err) });
      });
    return () => ctl.abort();
  }, [instruments, instrumentKey, datasets, asOf, enabled]);
  return snap;
}

function SnapshotDetails({ snap, title }: { snap: CurveSnapshot; title: string }) {
  const r = snap.result;
  return (
    <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-white">
          {title} <span className="font-mono text-[#E5E7EB]/60">{snap.asOf}</span>
        </h2>
        {r?.status === 'OK' ? (
          <span className={`px-2 py-0.5 rounded border font-mono text-xs font-semibold ${SHAPE_COLOR[r.shape]}`}>{r.shape}</span>
        ) : (
          <DataStatusBadge status="UNAVAILABLE" />
        )}
      </div>

      {snap.unavailableReason && <p className="text-xs font-mono text-[#F59E0B]">{snap.unavailableReason}</p>}
      {r?.status === 'INVALID_INPUT' && (
        <ul className="text-xs font-mono text-[#EF4444] list-disc pl-4">
          {r.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      {r?.status === 'OK' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <caption className="text-left text-[#E5E7EB]/55 pb-1">Curve points (close on {r.valuationDate})</caption>
              <thead>
                <tr className="border-b border-[#263244] text-[#E5E7EB]/65">
                  <th className="py-1.5 pr-3 font-medium">Contract</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Close</th>
                  <th className="py-1.5 pr-3 font-medium">LTD</th>
                  <th className="py-1.5 font-medium text-right">Days</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#263244]/60 font-mono tabular-nums">
                {r.points.map((p) => (
                  <tr key={p.contract}>
                    <td className="py-1.5 pr-3 text-white">{p.contract}</td>
                    <td className="py-1.5 pr-3 text-right">{p.price}</td>
                    <td className="py-1.5 pr-3">{p.lastTradingDay}</td>
                    <td className="py-1.5 text-right">{p.daysToExpiry}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <caption className="text-left text-[#E5E7EB]/55 pb-1">Adjacent calendar spreads (near − far)</caption>
              <thead>
                <tr className="border-b border-[#263244] text-[#E5E7EB]/65">
                  <th className="py-1.5 pr-3 font-medium">Pair</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Spread</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Roll yield (ann.)</th>
                  <th className="py-1.5 font-medium">Direction</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#263244]/60 font-mono tabular-nums">
                {r.spreads.map((s) => (
                  <tr key={`${s.near}-${s.far}`}>
                    <td className="py-1.5 pr-3 text-white whitespace-nowrap">
                      {s.near}/{s.far}
                    </td>
                    <td className="py-1.5 pr-3 text-right">{Number(s.spread.toFixed(6))}</td>
                    <td className="py-1.5 pr-3 text-right">{pct(s.annualizedRollYield)}</td>
                    <td className="py-1.5">{s.direction}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] font-mono text-[#E5E7EB]/45 mt-1">{ROLL_YIELD_FORMULA} (calendar days, 365-day basis)</p>
          </div>
        </div>
      )}

      {r?.status === 'OK' && r.warnings.length > 0 && (
        <ul className="text-[11px] font-mono text-[#F59E0B]/85 list-disc pl-4">
          {r.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      {snap.excluded.length > 0 && (
        <div>
          <p className="text-xs text-[#E5E7EB]/65 mb-1">Excluded contracts</p>
          <ul className="text-[11px] font-mono text-[#E5E7EB]/70 space-y-0.5">
            {snap.excluded.map((e) => (
              <li key={e.contract}>
                <span className="text-white">{e.contract}</span> — <span className="text-[#F59E0B]/90">{e.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(snap.calendarStatus === 'UNVERIFIED' || snap.chainWarnings.length > 0) && (
        <ul className="text-[11px] font-mono text-[#F59E0B]/80 list-disc pl-4">
          {snap.calendarStatus === 'UNVERIFIED' && <li>Expiry calendar is UNVERIFIED — days to expiry are indicative only.</li>}
          {snap.chainWarnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      {snap.included.length > 0 && (
        <p className="text-[11px] text-[#E5E7EB]/45">
          Prices: imported {CURVE_TIMEFRAME} closes ({[...new Set(snap.included.map((i) => i.datasetSource))].join('; ')}). Expiry dates
          ignore exchange holidays (Mon–Fri business days).
        </p>
      )}
    </section>
  );
}

function daysAgo(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function TermStructureView() {
  const { instruments, loading } = useTerminal();
  const [instrumentId, setInstrumentId] = useState<string | null>(null);
  const [asOf, setAsOf] = useState('');
  const [compareOn, setCompareOn] = useState(false);
  const [compareAsOf, setCompareAsOf] = useState('');
  const [datasets, setDatasets] = useState<Loadable<DatasetSummary[]>>({ state: 'idle' });

  const instrument = instruments.find((i) => i.id === instrumentId) ?? instruments[0] ?? null;

  useEffect(() => {
    if (!instrument) return;
    const ctl = new AbortController();
    setDatasets({ state: 'loading' });
    fetchDatasets(instrument.id, ctl.signal)
      .then((data) => setDatasets({ state: 'ok', data }))
      .catch((err) => {
        if (!ctl.signal.aborted) setDatasets({ state: 'error', message: errorMessage(err) });
      });
    return () => ctl.abort();
  }, [instrument?.id]);

  const dsList = datasets.state === 'ok' ? datasets.data : null;
  const contracts = useMemo(() => {
    if (!instrument || !dsList) return [];
    return groupContractDatasets(instrument, dsList, Number((asOf || new Date().toISOString()).slice(0, 4))).contracts;
  }, [instrument, dsList, asOf]);

  // Default as-of = most recent last bar across this instrument's contract datasets (no guessing beyond the data).
  useEffect(() => {
    if (!dsList) return;
    const lastDates = contracts.flatMap((c) => c.datasets.map((d) => d.lastTimestamp.slice(0, 10))).sort();
    const latest = lastDates[lastDates.length - 1] ?? new Date().toISOString().slice(0, 10);
    setAsOf(latest);
    setCompareAsOf(daysAgo(latest, 7));
  }, [dsList]);

  const primary = useSnapshot(instrument?.id ?? null, dsList, asOf, true);
  const secondary = useSnapshot(instrument?.id ?? null, dsList, compareAsOf, compareOn);

  const chartSeries: ChartSeries[] = [];
  if (primary.state === 'ok' && primary.data.result?.status === 'OK') {
    chartSeries.push({
      name: `As of ${primary.data.asOf}`,
      color: '#818CF8',
      showDots: true,
      points: primary.data.result.points.map((p) => ({ x: p.daysToExpiry, y: p.price, label: p.contract })),
    });
  }
  if (compareOn && secondary.state === 'ok' && secondary.data.result?.status === 'OK') {
    chartSeries.push({
      name: `As of ${secondary.data.asOf}`,
      color: '#F59E0B',
      dashed: true,
      showDots: true,
      points: secondary.data.result.points.map((p) => ({ x: p.daysToExpiry, y: p.price, label: p.contract })),
    });
  }
  const unit = primary.state === 'ok' ? primary.data.priceUnits[0] : undefined;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-white tracking-tight">Term Structure</h1>
        <p className="text-sm text-[#E5E7EB]/65 mt-1">
          Futures curve from imported per-contract {CURVE_TIMEFRAME} closes on an exact date, with adjacent calendar spreads and annualized roll yield.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 text-xs text-[#E5E7EB]/65">
        <label className="space-y-1">
          <span className="block">Instrument</span>
          <select
            value={instrument?.id ?? ''}
            onChange={(e) => setInstrumentId(e.target.value)}
            className={inputClass}
            disabled={loading || instruments.length === 0}
          >
            {instruments.map((i) => (
              <option key={i.id} value={i.id}>
                {i.id} — {i.productName}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block">As of</span>
          <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className={inputClass} />
        </label>
        <label className="inline-flex items-center gap-1.5 pb-1.5">
          <input type="checkbox" checked={compareOn} onChange={(e) => setCompareOn(e.target.checked)} className="accent-[#6366F1]" />
          Compare with
        </label>
        <label className="space-y-1">
          <span className="block">Second as-of</span>
          <input
            type="date"
            value={compareAsOf}
            onChange={(e) => setCompareAsOf(e.target.value)}
            disabled={!compareOn}
            className={`${inputClass} disabled:opacity-40`}
          />
        </label>
        <span className="pb-1.5 font-mono text-[#E5E7EB]/50">
          {datasets.state === 'ok' ? `${contracts.length} contract dataset(s) (${CURVE_TIMEFRAME})` : datasets.state === 'loading' ? 'Loading datasets...' : ''}
        </span>
      </div>

      {datasets.state === 'error' ? (
        <p className="text-xs font-mono text-[#EF4444]">{datasets.message}</p>
      ) : (
        <>
          <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-2">
            <h2 className="text-sm font-semibold text-white">Curve — price vs calendar days to last trading day</h2>
            {primary.state === 'loading' ? (
              <p className="text-xs text-[#E5E7EB]/55">Loading curve...</p>
            ) : primary.state === 'error' ? (
              <p className="text-xs font-mono text-[#EF4444]">{primary.message}</p>
            ) : chartSeries.length === 0 ? (
              <div className="flex items-center gap-2 text-xs">
                <DataStatusBadge status="UNAVAILABLE" />
                <span className="text-[#E5E7EB]/60">No curve to plot for the selected date — see details below.</span>
              </div>
            ) : (
              <LineChartSvg
                ariaLabel="Futures term structure curve"
                series={chartSeries}
                xLabel="Calendar days to last trading day"
                yLabel={`Close (${unit ?? 'price units'})`}
                formatY={(y) => (Math.abs(y) >= 100 ? y.toFixed(1) : y.toFixed(3))}
              />
            )}
          </section>

          {primary.state === 'ok' && <SnapshotDetails snap={primary.data} title="Curve as of" />}
          {compareOn && secondary.state === 'ok' && <SnapshotDetails snap={secondary.data} title="Comparison curve as of" />}
          {compareOn && secondary.state === 'error' && <p className="text-xs font-mono text-[#EF4444]">{secondary.message}</p>}

          {instrument && datasets.state === 'ok' && <SpreadHistoryPanel instrument={instrument} contracts={contracts} />}
        </>
      )}
    </div>
  );
}
