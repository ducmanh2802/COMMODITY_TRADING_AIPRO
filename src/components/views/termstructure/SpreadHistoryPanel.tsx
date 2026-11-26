import { ErrorNote } from '../../common/ErrorNote';
import { toUserError, type UserError } from '../../common/friendlyError';
import { useEffect, useMemo, useState } from 'react';
import { fetchCandles, type CandlesResponse } from '../../../api/contractsApi';
import { calendarSpread, spreadZScore, type SeriesPoint } from '../../../shared/analytics';
import type { InstrumentDefinition } from '../../../shared/types/instrument';
import { CURVE_TIMEFRAME, type ContractDataset } from './curveData';
import { LineChartSvg } from './LineChartSvg';
import { fmtDate as fmtDisplayDate, fmtFixed, fmtInt, tr, useT } from '../../../i18n';

const selectClass =
  'bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-xs text-[var(--text)] font-mono focus:outline-none focus:border-[var(--accent)]';

type LegsState =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ok'; near: CandlesResponse; far: CandlesResponse }
  | { state: 'error'; error: UserError };

const toSeries = (r: CandlesResponse): SeriesPoint[] => r.candles.map((c) => ({ t: c.timestamp, v: c.close }));
const fmtDate = (ms: number) => fmtDisplayDate(new Date(ms).toISOString().slice(0, 10));

export function SpreadHistoryPanel({
  instrument,
  contracts,
}: {
  instrument: InstrumentDefinition;
  contracts: ContractDataset[];
}) {
  const t = useT();
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
        if (!ctl.signal.aborted) setLegs({ state: 'error', error: toUserError(err) });
      });
    return () => ctl.abort();
  }, [instrument.id, nearCode, farCode]);

  const computed = useMemo(() => {
    if (legs.state !== 'ok') return null;
    const warnings: string[] = [];
    if (legs.near.priceUnit && legs.far.priceUnit && legs.near.priceUnit !== legs.far.priceUnit) {
      return { ok: false as const, error: tr('ts.sp.unitsDiffer', { near: legs.near.priceUnit, far: legs.far.priceUnit }) };
    }
    if (legs.near.truncated || legs.far.truncated) warnings.push(tr('ts.sp.truncated'));
    const spread = calendarSpread(toSeries(legs.near), toSeries(legs.far));
    if (spread.status !== 'OK') return { ok: false as const, error: tr('ts.sp.spreadStatus', { status: spread.status, reason: spread.reason ?? '' }) };
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
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-3" aria-labelledby="spread-hist-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="spread-hist-title" className="text-sm font-semibold text-[var(--text-strong)]">
            {t('ts.sp.title')}
          </h2>
          <p className="text-xs text-[var(--text)]/55">
            {t('ts.sp.subtitle', { tf: CURVE_TIMEFRAME })}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2 text-xs text-[var(--text)]/65">
          <label className="space-y-1">
            <span className="block">{t('ts.sp.near')}</span>
            <select value={nearCode} onChange={(e) => setNearCode(e.target.value)} className={selectClass}>
              {contracts.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block">{t('ts.sp.far')}</span>
            <select value={farCode} onChange={(e) => setFarCode(e.target.value)} className={selectClass}>
              {contracts.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block">{t('ts.sp.zWindow')}</span>
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
        <p className="text-xs font-mono text-[var(--warning)]">{t('ts.sp.needTwo', { tf: CURVE_TIMEFRAME })}</p>
      ) : nearCode === farCode ? (
        <p className="text-xs font-mono text-[var(--warning)]">{t('ts.sp.pickTwo')}</p>
      ) : legs.state === 'loading' || legs.state === 'idle' ? (
        <p className="text-xs text-[var(--text)]/55">{t('ts.sp.loadingLegs')}</p>
      ) : legs.state === 'error' ? (
        <ErrorNote error={legs.error} className="text-xs" />
      ) : !computed || !computed.ok ? (
        <p className="text-xs font-mono text-[var(--warning)]">{computed && !computed.ok ? computed.error : t('ts.sp.unavailable')}</p>
      ) : (
        <div className="space-y-3">
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <dt className="text-[var(--text)]/55">{t('ts.sp.commonDates')}</dt>
              <dd className="font-mono tabular-nums text-[var(--text-strong)]">{fmtInt(computed.spreadSeries.length)}</dd>
            </div>
            <div>
              <dt className="text-[var(--text)]/55">{t('ts.sp.lastSpread', { date: last ? fmtDisplayDate(last.t.slice(0, 10)) : '—' })}</dt>
              <dd className="font-mono tabular-nums text-[var(--text-strong)]">
                {last ? fmtFixed(last.v, 4) : '—'} <span className="text-[var(--text)]/50">{computed.unit ?? ''}</span>
              </dd>
            </div>
            <div>
              <dt className="text-[var(--text)]/55">{t('ts.sp.lastZ')}</dt>
              <dd className="font-mono tabular-nums text-[var(--text-strong)]">
                {computed.z.status !== 'OK' ? (
                  <span className="text-[var(--warning)]">{computed.z.status}</span>
                ) : lastZ === null ? (
                  t('ts.undefined')
                ) : (
                  fmtFixed(lastZ, 2)
                )}
              </dd>
            </div>
          </dl>
          <LineChartSvg
            ariaLabel={t('ts.sp.aria', { near: nearCode, far: farCode })}
            series={[
              {
                name: `${nearCode} − ${farCode}`,
                color: 'var(--series-1)',
                points: computed.spreadSeries.map((p) => ({ x: Date.parse(p.t), y: p.v })),
                showDots: computed.spreadSeries.length <= 40,
              },
            ]}
            refLines={[{ y: 0, label: '0' }]}
            xLabel={t('common.date')}
            yLabel={t('ts.sp.yLabel', { unit: computed.unit ?? t('ts.priceUnits') })}
            formatX={fmtDate}
            formatY={(y) => fmtFixed(y, 2)}
            height={240}
          />
          {computed.z.status === 'OK' ? (
            <LineChartSvg
              ariaLabel={t('ts.sp.zAria', { near: nearCode, far: farCode })}
              series={[
                {
                  name: `z-score (${zWindow})`,
                  color: 'var(--series-3)',
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
              xLabel={t('common.date')}
              yLabel="z"
              formatX={fmtDate}
              height={200}
            />
          ) : (
            <p className="text-xs font-mono text-[var(--warning)]">
              {t('ts.sp.zStatus', { status: computed.z.status, reason: computed.z.reason })}
            </p>
          )}
          {computed.warnings.length > 0 && (
            <ul className="text-[11px] font-mono text-[var(--warning)]/85 list-disc pl-4 space-y-0.5">
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
