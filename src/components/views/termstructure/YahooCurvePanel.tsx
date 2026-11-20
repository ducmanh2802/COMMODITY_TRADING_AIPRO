import { useEffect, useState } from 'react';
import { errorMessage, fetchYahooCurve, type YahooCurveResponseDto } from '../../../api/contractsApi';
import { useTerminal } from '../../../contexts/TerminalContext';
import { DataStatusBadge } from '../../common/DataStatusBadge';
import { fmtDate, fmtNum, useT } from '../../../i18n';

type Ok = Exclude<YahooCurveResponseDto, { status: 'UNAVAILABLE' }>;

function CurveBody({ data }: { data: Ok }) {
  const t = useT();
  const result = data.result?.status === 'OK' ? data.result : null;
  return (
    <>
      <p className="text-[11px] font-mono text-[#E5E7EB]/60">
        {t('ts.yc.asOf', {
          date: data.valuationDate ? fmtDate(data.valuationDate) : '-',
          fetched: `${data.fetchedAt.slice(0, 16).replace('T', ' ')}Z`,
        })}{' '}
        · {data.unit}
        {result ? ` · ${result.shape}` : ''}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-[#263244] text-[#E5E7EB]/65">
              <th className="py-1.5 pr-3 font-medium">{t('ts.contract')}</th>
              <th className="py-1.5 pr-3 font-medium">{t('ts.yc.symbol')}</th>
              <th className="py-1.5 pr-3 font-medium text-right">{t('ts.close')}</th>
              <th className="py-1.5 pr-3 font-medium">{t('ts.ltd')}</th>
              <th className="py-1.5 font-medium text-right">{t('ts.days')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#263244]/60 font-mono tabular-nums">
            {data.contracts.map((c) => (
              <tr key={c.contract} title={c.asOf}>
                <td className="py-1.5 pr-3 text-white">{c.contract}</td>
                <td className="py-1.5 pr-3 text-[#E5E7EB]/60">{c.yahooSymbol}</td>
                <td className="py-1.5 pr-3 text-right">{fmtNum(c.price)}</td>
                <td className="py-1.5 pr-3">{fmtDate(c.lastTradingDay)}</td>
                <td className="py-1.5 text-right">{result?.points.find((p) => p.contract === c.contract)?.daysToExpiry ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result && (
        <ul className="text-[11px] font-mono text-[#E5E7EB]/70">
          {result.spreads.map((s) => (
            <li key={`${s.near}-${s.far}`}>
              {s.near}/{s.far}: {fmtNum(Number(s.spread.toFixed(6)), { maximumFractionDigits: 6 })} ·{' '}
              {s.annualizedRollYield === null ? '-' : `${(s.annualizedRollYield * 100).toFixed(2)}%`} · {s.direction}
            </li>
          ))}
        </ul>
      )}
      {data.excluded.length > 0 && (
        <ul className="text-[11px] font-mono text-[#F59E0B]/85 list-disc pl-4">
          {data.excluded.map((e) => (
            <li key={e.contract}>
              {e.contract} — {e.reason}
            </li>
          ))}
        </ul>
      )}
      <ul className="text-[11px] text-[#E5E7EB]/45 list-disc pl-4">
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
    { s: 'loading' } | { s: 'error'; message: string } | { s: 'ok'; data: YahooCurveResponseDto }
  >({ s: 'loading' });

  useEffect(() => {
    const ctl = new AbortController();
    setState({ s: 'loading' });
    fetchYahooCurve(instrumentId, 8, ctl.signal)
      .then((data) => setState({ s: 'ok', data }))
      .catch((err) => {
        if (!ctl.signal.aborted) setState({ s: 'error', message: errorMessage(err) });
      });
    return () => ctl.abort();
  }, [instrumentId]);

  return (
    <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-2">
      <h2 className="text-sm font-semibold text-white">{t('ts.yc.title')}</h2>
      <p className="text-[11px] text-[#E5E7EB]/55">{t('ts.yc.note')}</p>
      {state.s === 'loading' && <p className="text-xs text-[#E5E7EB]/55">{t('ts.yc.loading')}</p>}
      {state.s === 'error' && <p className="text-xs font-mono text-[#EF4444]">{state.message}</p>}
      {state.s === 'ok' && state.data.status === 'UNAVAILABLE' && (
        <div className="flex items-start gap-2 text-xs">
          <DataStatusBadge status="UNAVAILABLE" />
          <span className="text-[#F59E0B]/90 font-mono">{state.data.reason}</span>
        </div>
      )}
      {state.s === 'ok' && state.data.status !== 'UNAVAILABLE' && <CurveBody data={state.data} />}
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] text-[#E5E7EB]/50">{t('ts.yc.csvHint')}</p>
        <button
          type="button"
          onClick={() => setActiveModule('data-import')}
          className="text-[11px] font-medium text-[#38BDF8] hover:underline whitespace-nowrap"
        >
          {t('ts.yc.importCsv')}
        </button>
      </div>
    </section>
  );
}
