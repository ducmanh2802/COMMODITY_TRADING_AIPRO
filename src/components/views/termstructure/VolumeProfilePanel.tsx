import { useEffect, useMemo, useState } from 'react';
import { errorMessage, fetchCandles, fetchDatasets, type CandlesResponse, type DatasetSummary } from '../../../api/contractsApi';
import { fmtFixed, fmtInt, useT } from '../../../i18n';
import { computeVolumeProfile, windowStartIso } from './volumeProfile';

const selectClass =
  'bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-xs text-[var(--text)] font-mono focus:outline-none focus:border-[var(--accent)]';
const WINDOWS = [3, 6, 12] as const;

/** T95: volume-by-price histogram from stored D1 candles (approximation), with POC and 70% value area. */
export function VolumeProfilePanel({ instrumentId }: { instrumentId: string }) {
  const t = useT();
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState('');
  const [months, setMonths] = useState<number>(6);
  const [candles, setCandles] = useState<{ s: 'idle' } | { s: 'loading' } | { s: 'ok'; data: CandlesResponse } | { s: 'error'; message: string }>({ s: 'idle' });

  useEffect(() => {
    const ctl = new AbortController();
    setCodes(null);
    fetchDatasets(instrumentId, ctl.signal)
      .then((ds: DatasetSummary[]) => {
        const list = [...new Set(ds.filter((d) => d.timeframe === 'D1').map((d) => d.contractCode))].sort();
        setCodes(list);
        setCode(list.includes('CONTINUOUS') ? 'CONTINUOUS' : (list[0] ?? ''));
      })
      .catch((err) => {
        if (!ctl.signal.aborted) {
          setCodes([]);
          setCandles({ s: 'error', message: errorMessage(err) });
        }
      });
    return () => ctl.abort();
  }, [instrumentId]);

  useEffect(() => {
    if (!code) return;
    const ctl = new AbortController();
    setCandles({ s: 'loading' });
    const from = new Date(Date.now() - 13 * 31 * 86_400_000).toISOString();
    fetchCandles({ instrumentId, contractCode: code, timeframe: 'D1', from, limit: 5000 }, ctl.signal)
      .then((data) => setCandles({ s: 'ok', data }))
      .catch((err) => {
        if (!ctl.signal.aborted) setCandles({ s: 'error', message: errorMessage(err) });
      });
    return () => ctl.abort();
  }, [instrumentId, code]);

  const profile = useMemo(() => {
    if (candles.s !== 'ok' || candles.data.candles.length === 0) return null;
    const all = candles.data.candles;
    const start = windowStartIso(all[all.length - 1].timestamp, months);
    const bars = all.filter((c) => c.timestamp >= start).map((c) => ({ timestamp: c.timestamp, high: c.high, low: c.low, volume: c.volume }));
    return computeVolumeProfile(bars, { buckets: 24 });
  }, [candles, months]);

  const maxVol = profile ? Math.max(...profile.buckets.map((b) => b.volume)) : 0;
  const price = (v: number) => fmtFixed(v, Math.abs(v) >= 100 ? 1 : 3);

  return (
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-2">
      <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('vp.title')}</h2>
      <p className="text-[11px] text-[var(--text)]/55">{t('vp.note')}</p>
      {codes !== null && codes.length === 0 && candles.s !== 'error' && <p className="text-xs text-[var(--text)]/60">{t('vp.noDatasets')}</p>}
      {codes !== null && codes.length > 0 && (
        <div className="flex flex-wrap items-end gap-3 text-xs">
          <label className="space-y-1">
            <span className="block text-[var(--text)]/65">{t('vp.contract')}</span>
            <select className={selectClass} value={code} onChange={(e) => setCode(e.target.value)}>
              {codes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-[var(--text)]/65">{t('vp.window')}</span>
            <select className={selectClass} value={months} onChange={(e) => setMonths(Number(e.target.value))}>
              {WINDOWS.map((m) => (
                <option key={m} value={m}>
                  {t('vp.months', { n: m })}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {candles.s === 'loading' && <p className="text-xs text-[var(--text)]/55">{t('vp.loading')}</p>}
      {candles.s === 'error' && <p role="alert" className="text-xs font-mono text-[var(--negative)]">{candles.message}</p>}
      {candles.s === 'ok' && !profile && <p className="text-xs text-[var(--text)]/60">{t('vp.noVolume')}</p>}
      {profile && candles.s === 'ok' && (
        <>
          <div className="space-y-px" role="img" aria-label={t('vp.aria')}>
            {[...profile.buckets.keys()].reverse().map((i) => {
              const b = profile.buckets[i];
              const inVa = i >= profile.vaLowIndex && i <= profile.vaHighIndex;
              const isPoc = i === profile.pocIndex;
              return (
                <div key={i} className="flex items-center gap-2 text-[10px] font-mono tabular-nums" title={`${price(b.low)} – ${price(b.high)}: ${fmtInt(Math.round(b.volume))}`}>
                  <span className="w-14 text-right text-[var(--text)]/60 shrink-0">{price((b.low + b.high) / 2)}</span>
                  <span className="flex-1 h-2.5">
                    <span
                      className={`block h-full rounded-r-[4px] hover:brightness-125 ${isPoc ? 'bg-[var(--series-1)]' : inVa ? 'bg-[var(--series-1)]/60' : 'bg-[var(--series-1)]/25'}`}
                      style={{ width: `${maxVol > 0 ? Math.max(1, (b.volume / maxVol) * 100) : 0}%` }}
                    />
                  </span>
                </div>
              );
            })}
          </div>
          <ul className="text-[11px] font-mono text-[var(--text)]/75 space-y-0.5">
            <li>
              <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-[2px] bg-[var(--series-1)] align-[-1px]" /> {t('vp.poc', { price: price(profile.poc) })}
            </li>
            <li>
              <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-[2px] bg-[var(--series-1)]/60 align-[-1px]" /> {t('vp.va', { low: price(profile.vaLow), high: price(profile.vaHigh) })}
            </li>
            <li className="text-[var(--text)]/50">{t('vp.bars', { used: profile.usedBars, skipped: profile.skippedBars })}</li>
            {candles.data.provenance[0] && <li className="text-[var(--text)]/50">{t('vp.source', { source: candles.data.provenance[0].sourceLabel })}</li>}
          </ul>
        </>
      )}
    </section>
  );
}
