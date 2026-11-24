import { useEffect, useMemo, useState } from 'react';
import { useTerminal } from '../../../contexts/TerminalContext';
import { errorMessage, fetchDatasets, type DatasetSummary } from '../../../api/contractsApi';
import { ROLL_YIELD_FORMULA, type CurveShape } from '../../../shared/contracts/termStructure';
import { DataStatusBadge } from '../../common/DataStatusBadge';
import { CURVE_TIMEFRAME, groupContractDatasets, loadCurveSnapshot, type CurveSnapshot } from './curveData';
import { LineChartSvg, type ChartSeries } from './LineChartSvg';
import { SpreadHistoryPanel } from './SpreadHistoryPanel';
import { YahooCurvePanel } from './YahooCurvePanel';
import { FuturesChainPanel } from './FuturesChainPanel';
import { VolumeProfilePanel } from './VolumeProfilePanel';
import { fmtDate, fmtFixed, fmtNum, tr, useT, type TFunction } from '../../../i18n';

type Loadable<T> = { state: 'idle' } | { state: 'loading' } | { state: 'ok'; data: T } | { state: 'error'; message: string };

const inputClass =
  'bg-[var(--surface)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]';

const SHAPE_COLOR: Record<CurveShape, string> = {
  CONTANGO: 'text-[var(--warning)] border-[var(--warning)]/40 bg-[var(--warning)]/10',
  BACKWARDATION: 'text-[var(--positive)] border-[var(--positive)]/40 bg-[var(--positive)]/10',
  MIXED: 'text-[var(--accent-text)] border-[var(--accent-text)]/40 bg-[var(--accent-text)]/10',
  FLAT: 'text-[var(--text)] border-[var(--text)]/30 bg-[var(--text)]/5',
};

function pct(x: number | null): string {
  return x === null ? tr('ts.undefined') : `${fmtFixed(x * 100, 2)}%`;
}

/** Vietnamese label + short explanation for a curve shape / spread direction code. */
function shapeLabel(t: TFunction, shape: CurveShape): { label: string; desc: string } {
  if (shape === 'FLAT') return { label: t('ts.curve.FLAT'), desc: t('ts.curve.FLAT.desc') };
  return { label: t(`curve.${shape}`), desc: t(`curve.${shape}.desc`) };
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
  const t = useT();
  const r = snap.result;
  return (
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--text-strong)]">
          {title} <span className="font-mono text-[var(--text)]/60">{fmtDate(snap.asOf)}</span>
        </h2>
        {r?.status === 'OK' ? (
          <span
            className={`px-2 py-0.5 rounded border font-mono text-xs font-semibold ${SHAPE_COLOR[r.shape]}`}
            title={shapeLabel(t, r.shape).desc}
          >
            {shapeLabel(t, r.shape).label === r.shape ? r.shape : `${shapeLabel(t, r.shape).label} (${r.shape})`}
          </span>
        ) : (
          <DataStatusBadge status="UNAVAILABLE" />
        )}
      </div>

      {snap.unavailableReason && <p className="text-xs font-mono text-[var(--warning)]">{snap.unavailableReason}</p>}
      {r?.status === 'INVALID_INPUT' && (
        <ul className="text-xs font-mono text-[var(--negative)] list-disc pl-4">
          {r.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      {r?.status === 'OK' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="overflow-x-auto" tabIndex={0}>
            <table className="w-full text-left text-xs border-collapse">
              <caption className="text-left text-[var(--text)]/55 pb-1">{t('ts.curvePoints', { date: fmtDate(r.valuationDate) })}</caption>
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--text)]/65">
                  <th className="py-1.5 pr-3 font-medium">{t('ts.contract')}</th>
                  <th className="py-1.5 pr-3 font-medium text-right">{t('ts.close')}</th>
                  <th className="py-1.5 pr-3 font-medium" title={t('term.lastTradingDay')}>
                    {t('ts.ltd')}
                  </th>
                  <th className="py-1.5 font-medium text-right">{t('ts.days')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]/60 font-mono tabular-nums">
                {r.points.map((p) => (
                  <tr key={p.contract}>
                    <td className="py-1.5 pr-3 text-[var(--text-strong)]">{p.contract}</td>
                    <td className="py-1.5 pr-3 text-right">{fmtNum(p.price)}</td>
                    <td className="py-1.5 pr-3">{fmtDate(p.lastTradingDay)}</td>
                    <td className="py-1.5 text-right">{p.daysToExpiry}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="overflow-x-auto" tabIndex={0}>
            <table className="w-full text-left text-xs border-collapse">
              <caption className="text-left text-[var(--text)]/55 pb-1">{t('ts.adjacentSpreads')}</caption>
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--text)]/65">
                  <th className="py-1.5 pr-3 font-medium">{t('ts.pair')}</th>
                  <th className="py-1.5 pr-3 font-medium text-right">{t('term.spread')}</th>
                  <th className="py-1.5 pr-3 font-medium text-right">{t('ts.rollYield')}</th>
                  <th className="py-1.5 font-medium">{t('ts.direction')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]/60 font-mono tabular-nums">
                {r.spreads.map((s) => (
                  <tr key={`${s.near}-${s.far}`}>
                    <td className="py-1.5 pr-3 text-[var(--text-strong)] whitespace-nowrap">
                      {s.near}/{s.far}
                    </td>
                    <td className="py-1.5 pr-3 text-right">{fmtNum(Number(s.spread.toFixed(6)), { maximumFractionDigits: 6 })}</td>
                    <td className="py-1.5 pr-3 text-right">{pct(s.annualizedRollYield)}</td>
                    <td className="py-1.5" title={shapeLabel(t, s.direction).desc}>
                      {shapeLabel(t, s.direction).label}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] font-mono text-[var(--text)]/45 mt-1">{t('ts.formulaNote', { formula: ROLL_YIELD_FORMULA })}</p>
          </div>
        </div>
      )}

      {r?.status === 'OK' && r.warnings.length > 0 && (
        <ul className="text-[11px] font-mono text-[var(--warning)]/85 list-disc pl-4">
          {r.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      {snap.excluded.length > 0 && (
        <div>
          <p className="text-xs text-[var(--text)]/65 mb-1">{t('ts.excluded')}</p>
          <ul className="text-[11px] font-mono text-[var(--text)]/70 space-y-0.5">
            {snap.excluded.map((e) => (
              <li key={e.contract}>
                <span className="text-[var(--text-strong)]">{e.contract}</span> — <span className="text-[var(--warning)]/90">{e.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(snap.calendarStatus === 'UNVERIFIED' || snap.chainWarnings.length > 0) && (
        <ul className="text-[11px] font-mono text-[var(--warning)]/80 list-disc pl-4">
          {snap.calendarStatus === 'UNVERIFIED' && <li>{t('ts.calendarUnverified')}</li>}
          {snap.chainWarnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      {snap.included.length > 0 && (
        <p className="text-[11px] text-[var(--text)]/45">
          {t('ts.pricesNote', {
            tf: CURVE_TIMEFRAME,
            sources: [...new Set(snap.included.map((i) => i.datasetSource))].join('; '),
          })}
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
  const t = useT();
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
      name: t('ts.seriesAsOf', { date: fmtDate(primary.data.asOf) }),
      color: 'var(--series-1)',
      showDots: true,
      points: primary.data.result.points.map((p) => ({ x: p.daysToExpiry, y: p.price, label: p.contract })),
    });
  }
  if (compareOn && secondary.state === 'ok' && secondary.data.result?.status === 'OK') {
    chartSeries.push({
      name: t('ts.seriesAsOf', { date: fmtDate(secondary.data.asOf) }),
      color: 'var(--series-3)',
      dashed: true,
      showDots: true,
      points: secondary.data.result.points.map((p) => ({ x: p.daysToExpiry, y: p.price, label: p.contract })),
    });
  }
  const unit = primary.state === 'ok' ? primary.data.priceUnits[0] : undefined;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-[var(--text-strong)] tracking-tight">{t('ts.title')}</h2>
        <p className="text-sm text-[var(--text)]/65 mt-1">
          {t('ts.subtitle', { tf: CURVE_TIMEFRAME })}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 text-xs text-[var(--text)]/65">
        <label className="space-y-1">
          <span className="block">{t('ts.instrument')}</span>
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
          <span className="block">{t('ts.asOf')}</span>
          <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className={inputClass} />
        </label>
        <label className="inline-flex items-center gap-1.5 pb-1.5">
          <input type="checkbox" checked={compareOn} onChange={(e) => setCompareOn(e.target.checked)} className="accent-[var(--accent)]" />
          {t('ts.compareWith')}
        </label>
        <label className="space-y-1">
          <span className="block">{t('ts.secondAsOf')}</span>
          <input
            type="date"
            value={compareAsOf}
            onChange={(e) => setCompareAsOf(e.target.value)}
            disabled={!compareOn}
            className={`${inputClass} disabled:opacity-40`}
          />
        </label>
        <span className="pb-1.5 font-mono text-[var(--text)]/50">
          {datasets.state === 'ok'
            ? t('ts.datasetCount', { n: contracts.length, tf: CURVE_TIMEFRAME })
            : datasets.state === 'loading'
              ? t('ts.loadingDatasets')
              : ''}
        </span>
      </div>

      {instrument && <YahooCurvePanel instrumentId={instrument.id} />}
      {instrument && <FuturesChainPanel instrumentId={instrument.id} />}
      {instrument && <VolumeProfilePanel instrumentId={instrument.id} />}

      {datasets.state === 'error' ? (
        <p className="text-xs font-mono text-[var(--negative)]">{datasets.message}</p>
      ) : (
        <>
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-2">
            <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('ts.curveTitle')}</h2>
            {primary.state === 'loading' ? (
              <p className="text-xs text-[var(--text)]/55">{t('ts.loadingCurve')}</p>
            ) : primary.state === 'error' ? (
              <p className="text-xs font-mono text-[var(--negative)]">{primary.message}</p>
            ) : chartSeries.length === 0 ? (
              <div className="flex items-center gap-2 text-xs">
                <DataStatusBadge status="UNAVAILABLE" />
                <span className="text-[var(--text)]/60">{t('ts.noCurve')}</span>
              </div>
            ) : (
              <LineChartSvg
                ariaLabel={t('ts.chartAria')}
                series={chartSeries}
                xLabel={t('ts.xLabel')}
                yLabel={t('ts.yLabel', { unit: unit ?? t('ts.priceUnits') })}
                formatY={(y) => (Math.abs(y) >= 100 ? fmtFixed(y, 1) : fmtFixed(y, 3))}
              />
            )}
          </section>

          {primary.state === 'ok' && <SnapshotDetails snap={primary.data} title={t('ts.curveAsOf')} />}
          {compareOn && secondary.state === 'ok' && <SnapshotDetails snap={secondary.data} title={t('ts.compareCurveAsOf')} />}
          {compareOn && secondary.state === 'error' && <p role="alert" className="text-xs font-mono text-[var(--negative)]">{secondary.message}</p>}

          {instrument && datasets.state === 'ok' && <SpreadHistoryPanel instrument={instrument} contracts={contracts} />}
        </>
      )}
    </div>
  );
}
