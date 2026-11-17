import { useEffect, useMemo, useState } from 'react';
import { errorMessage, fetchCandles, type CandlesResponse } from '../../../api/contractsApi';
import { calendarSpread, spreadZScore, type SeriesPoint } from '../../../shared/analytics';
import type { InstrumentDefinition } from '../../../shared/types/instrument';
import { CURVE_TIMEFRAME, type ContractDataset } from './curveData';
import { LineChartSvg } from './LineChartSvg';

const selectClass =
  'bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-1.5 text-xs text-[#E5E7EB] font-mono focus:outline-none focus:border-[#6366F1]';

type LegsState =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ok'; near: CandlesResponse; far: CandlesResponse }
  | { state: 'error'; message: string };

const toSeries = (r: CandlesResponse): SeriesPoint[] => r.candles.map((c) => ({ t: c.timestamp, v: c.close }));
const fmtDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function SpreadHistoryPanel({
  instrument,
  contracts,
}: {
  instrument: InstrumentDefinition;
  contracts: ContractDataset[];
}) {
  const [nearCode, setNearCode] = useState('');
  const [farCode, setFarCode] = useState('');
  const [zWindow, setZWindow] = useState(20);
  const [legs, setLegs] = useState<LegsState>({ state: 'idle' });

  const codesKey = contracts.map((c) => c.code).join(',');
  useEffect(() => {
    setNearCode(contracts[0]?.code ?? '');
    setFarCode(contracts[1]?.code ?? '');
    // Reset only when the set of contract codes changes, not on every new array identity.
  }, [codesKey]);

  useEffect(() => {
    if (!nearCode || !farCode || nearCode === farCode) {
      setLegs({ state: 'idle' });
      return;
    }
    const ctl = new AbortController();
    setLegs({ state: 'loading' });
    const q = (code: string) =>
      fetchCandles({ instrumentId: instrument.id, contractCode: code, timeframe: CURVE_TIMEFRAME, limit: 20000 }, ctl.signal);
    Promise.all([q(nearCode), q(farCode)])
      .then(([near, far]) => setLegs({ state: 'ok', near, far }))
      .catch((err) => {
        if (!ctl.signal.aborted) setLegs({ state: 'error', message: errorMessage(err) });
      });
    return () => ctl.abort();
  }, [instrument.id, nearCode, farCode]);

  const computed = useMemo(() => {
    if (legs.state !== 'ok') return null;
    const warnings: string[] = [];
    if (legs.near.priceUnit && legs.far.priceUnit && legs.near.priceUnit !== legs.far.priceUnit) {
      return { ok: false as const, error: `Price units differ (${legs.near.priceUnit} vs ${legs.far.priceUnit}); spread refused.` };
    }
    if (legs.near.truncated || legs.far.truncated) warnings.push('Candle history truncated to the most recent 20,000 bars.');
    const spread = calendarSpread(toSeries(legs.near), toSeries(legs.far));
    if (spread.status !== 'OK') return { ok: false as const, error: `Spread ${spread.status}: ${spread.reason ?? ''}` };
    const spreadSeries: SeriesPoint[] = [];
    spread.timestamps.forEach((t, i) => {
      const v = spread.values[i];
      if (v) spreadSeries.push({ t, v: v.spread });
    });
    const z = spreadZScore(spreadSeries, { window: zWindow });
    return {
      ok: true as const,
      spreadSeries,
      z,
      warnings: [...warnings, ...spread.warnings, ...z.warnings.slice(0, 5)],
      unit: legs.near.priceUnit,
    };
  }, [legs, zWindow]);

  const last = computed?.ok ? computed.spreadSeries[computed.spreadSeries.length - 1] : null;
  const lastZ = computed?.ok && computed.z.status === 'OK' ? computed.z.values[computed.z.values.length - 1] : null;

  return (
    <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-3" aria-labelledby="spread-hist-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="spread-hist-title" className="text-sm font-semibold text-white">
            Calendar spread history
          </h2>
          <p className="text-xs text-[#E5E7EB]/55">
            spread = near − far on common {CURVE_TIMEFRAME} dates (no fill); rolling z-score uses a sample σ window including the current bar.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2 text-xs text-[#E5E7EB]/65">
          <label className="space-y-1">
            <span className="block">Near</span>
            <select value={nearCode} onChange={(e) => setNearCode(e.target.value)} className={selectClass}>
              {contracts.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block">Far</span>
            <select value={farCode} onChange={(e) => setFarCode(e.target.value)} className={selectClass}>
              {contracts.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block">Z window</span>
            <select value={zWindow} onChange={(e) => setZWindow(Number(e.target.value))} className={selectClass}>
              {[5, 10, 20, 60].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {contracts.length < 2 ? (
        <p className="text-xs font-mono text-[#F59E0B]">DATA_UNAVAILABLE — import at least two individual contracts ({CURVE_TIMEFRAME}) to build a spread.</p>
      ) : nearCode === farCode ? (
        <p className="text-xs font-mono text-[#F59E0B]">Pick two different contracts.</p>
      ) : legs.state === 'loading' || legs.state === 'idle' ? (
        <p className="text-xs text-[#E5E7EB]/55">Loading legs...</p>
      ) : legs.state === 'error' ? (
        <p className="text-xs font-mono text-[#EF4444]">{legs.message}</p>
      ) : !computed || !computed.ok ? (
        <p className="text-xs font-mono text-[#F59E0B]">{computed && !computed.ok ? computed.error : 'Spread unavailable.'}</p>
      ) : (
        <div className="space-y-3">
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <dt className="text-[#E5E7EB]/55">Common dates</dt>
              <dd className="font-mono tabular-nums text-white">{computed.spreadSeries.length}</dd>
            </div>
            <div>
              <dt className="text-[#E5E7EB]/55">Last spread ({last ? last.t.slice(0, 10) : '—'})</dt>
              <dd className="font-mono tabular-nums text-white">
                {last ? last.v.toFixed(4) : '—'} <span className="text-[#E5E7EB]/50">{computed.unit ?? ''}</span>
              </dd>
            </div>
            <div>
              <dt className="text-[#E5E7EB]/55">Last z-score</dt>
              <dd className="font-mono tabular-nums text-white">
                {computed.z.status !== 'OK' ? (
                  <span className="text-[#F59E0B]">{computed.z.status}</span>
                ) : lastZ === null ? (
                  'undefined'
                ) : (
                  lastZ.toFixed(2)
                )}
              </dd>
            </div>
          </dl>
          <LineChartSvg
            ariaLabel={`Calendar spread ${nearCode} minus ${farCode}`}
            series={[
              {
                name: `${nearCode} − ${farCode}`,
                color: '#818CF8',
                points: computed.spreadSeries.map((p) => ({ x: Date.parse(p.t), y: p.v })),
                showDots: computed.spreadSeries.length <= 40,
              },
            ]}
            refLines={[{ y: 0, label: '0' }]}
            xLabel="Date"
            yLabel={`Spread (${computed.unit ?? 'price units'})`}
            formatX={fmtDate}
            formatY={(y) => y.toFixed(2)}
            height={240}
          />
          {computed.z.status === 'OK' ? (
            <LineChartSvg
              ariaLabel={`Rolling z-score of spread ${nearCode} minus ${farCode}`}
              series={[
                {
                  name: `z-score (${zWindow})`,
                  color: '#F59E0B',
                  points: computed.z.timestamps
                    .map((t, i) => ({ x: Date.parse(t), y: computed.z.values[i] }))
                    .filter((p): p is { x: number; y: number } => p.y !== null),
                },
              ]}
              refLines={[
                { y: 0, label: '0' },
                { y: 2, label: '+2σ' },
                { y: -2, label: '−2σ' },
              ]}
              xLabel="Date"
              yLabel="z"
              formatX={fmtDate}
              height={200}
            />
          ) : (
            <p className="text-xs font-mono text-[#F59E0B]">
              Z-score {computed.z.status}: {computed.z.reason}
            </p>
          )}
          {computed.warnings.length > 0 && (
            <ul className="text-[11px] font-mono text-[#F59E0B]/85 list-disc pl-4 space-y-0.5">
              {computed.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
