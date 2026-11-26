import { ErrorNote } from '../../common/ErrorNote';
import { toUserError, type UserError } from '../../common/friendlyError';
import { useEffect, useState } from 'react';
import { fetchYahooCurve, type YahooCurveResponseDto } from '../../../api/contractsApi';
import { useTerminal } from '../../../contexts/TerminalContext';
import { DataStatusBadge } from '../../common/DataStatusBadge';
import { fmtDate, fmtNum, useT } from '../../../i18n';

type Ok = Exclude<YahooCurveResponseDto, { status: 'UNAVAILABLE' }>;

function CurveBody({ data }: { data: Ok }) {
  const t = useT();
  const result = data.result?.status === 'OK' ? data.result : null;
  return (
    <>
      <p className="text-[11px] font-mono text-[var(--text)]/60">
        {t('ts.yc.asOf', {
          date: data.valuationDate ? fmtDate(data.valuationDate) : '-',
          fetched: `${data.fetchedAt.slice(0, 16).replace('T', ' ')}Z`,
        })}{' '}
        · {data.unit}
        {result ? ` · ${result.shape}` : ''}
      </p>
      <div className="overflow-x-auto" tabIndex={0}>
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-[var(--border)] text-[var(--text)]/65">
              <th className="py-1.5 pr-3 font-medium">{t('ts.contract')}</th>
              <th className="py-1.5 pr-3 font-medium">{t('ts.yc.symbol')}</th>
              <th className="py-1.5 pr-3 font-medium text-right">{t('ts.close')}</th>
              <th className="py-1.5 pr-3 font-medium">{t('ts.ltd')}</th>
              <th className="py-1.5 font-medium text-right">{t('ts.days')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]/60 font-mono tabular-nums">
            {data.contracts.map((c) => (
              <tr key={c.contract} title={c.asOf}>
                <td className="py-1.5 pr-3 text-[var(--text-strong)]">{c.contract}</td>
                <td className="py-1.5 pr-3 text-[var(--text)]/60">{c.yahooSymbol}</td>
                <td className="py-1.5 pr-3 text-right">{fmtNum(c.price)}</td>
                <td className="py-1.5 pr-3">{fmtDate(c.lastTradingDay)}</td>
                <td className="py-1.5 text-right">{result?.points.find((p) => p.contract === c.contract)?.daysToExpiry ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result && (
        <ul className="text-[11px] font-mono text-[var(--text)]/70">
          {result.spreads.map((s) => (
            <li key={`${s.near}-${s.far}`}>
              {s.near}/{s.far}: {fmtNum(Number(s.spread.toFixed(6)), { maximumFractionDigits: 6 })} ·{' '}
              {s.annualizedRollYield === null ? '-' : `${(s.annualizedRollYield * 100).toFixed(2)}%`} · {s.direction}
            </li>
          ))}
        </ul>
      )}
      {data.excluded.length > 0 && (
        <ul className="text-[11px] font-mono text-[var(--warning)]/85 list-disc pl-4">
          {data.excluded.map((e) => (
            <li key={e.contract}>
              {e.contract} — {e.reason}
            </li>
          ))}
        </ul>
      )}
      <ul className="text-[11px] text-[var(--text)]/45 list-disc pl-4">
        {data.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </>
  );
}

/** Live Yahoo per-contract curve (UNOFFICIAL). Labels every point with contract code, Yahoo symbol and bar time. */
export function YahooCurvePanel({ instrumentId }: { instrumentId: string }) {
  const t = useT();
  const { setActiveModule } = useTerminal();
  const [state, setState] = useState<
    { s: 'loading' } | { s: 'error'; error: UserError } | { s: 'ok'; data: YahooCurveResponseDto }
  >({ s: 'loading' });

  useEffect(() => {
    const ctl = new AbortController();
    setState({ s: 'loading' });
    fetchYahooCurve(instrumentId, 8, ctl.signal)
      .then((data) => setState({ s: 'ok', data }))
      .catch((err) => {
        if (!ctl.signal.aborted) setState({ s: 'error', error: toUserError(err) });
      });
    return () => ctl.abort();
  }, [instrumentId]);

  return (
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-2">
      <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('ts.yc.title')}</h2>
      <ul className="flex flex-wrap items-center gap-1.5 text-[11px]" aria-label={t('ts.yc.badgesAria')}>
        <li className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2 py-0.5 font-medium text-[var(--text-strong)]">{t('ts.yc.badgeYahoo')}</li>
        <li className="rounded-full border border-[var(--warning)]/50 bg-[var(--warning)]/10 px-2 py-0.5 font-medium text-[var(--warning)]">{t('ts.yc.badgeUnofficial')}</li>
        <li className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[var(--text)]/75">{t('ts.yc.badgeDelay')}</li>
        <li className="rounded-full border border-[var(--border)] px-2 py-0.5 font-mono text-[var(--text)]/75">D1</li>
      </ul>
      {state.s === 'loading' && <p className="text-xs text-[var(--text)]/55">{t('ts.yc.loading')}</p>}
      {state.s === 'error' && <ErrorNote error={state.error} className="text-xs" />}
      {state.s === 'ok' && state.data.status === 'UNAVAILABLE' && (
        <div className="flex items-start gap-2 text-xs">
          <DataStatusBadge status="UNAVAILABLE" />
          <span className="text-[var(--warning)]/90 font-mono">{state.data.reason}</span>
        </div>
      )}
      {state.s === 'ok' && state.data.status !== 'UNAVAILABLE' && <CurveBody data={state.data} />}
      <details className="text-[11px] text-[var(--text)]/60">
        <summary className="cursor-pointer select-none min-h-9 flex items-center">{t('ts.yc.more')}</summary>
        <div className="mt-1 space-y-2">
          <p>{t('ts.yc.note')}</p>
          <p>{t('ts.yc.csvHint')}</p>
          <button
            type="button"
            onClick={() => setActiveModule('data-import')}
            className="min-h-9 text-[11px] font-medium text-[var(--accent-text)] hover:underline"
          >
            {t('ts.yc.importCsv')}
          </button>
        </div>
      </details>
    </section>
  );
}
