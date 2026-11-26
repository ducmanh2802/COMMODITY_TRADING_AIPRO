import { ErrorNote } from '../../common/ErrorNote';
import { toUserError, type UserError } from '../../common/friendlyError';
import { useEffect, useMemo, useState } from 'react';
import { DataStatusBadge } from '../../common/DataStatusBadge';
import { fmtDate, fmtInt, fmtNum, useT } from '../../../i18n';
import { deriveChain, liquidityMovedAway } from './chainMath';

interface ChainRowDto {
  contract: string;
  yahooSymbol: string;
  lastTradingDay: string;
  price: number;
  change: number | null;
  volume: number | null;
  openInterest: number | null;
  asOf: string;
  source: string;
}

type ChainDto =
  | { status: 'OK' | 'PARTIAL'; unit: string; valuationDate: string | null; rows: ChainRowDto[]; notes: string[]; fetchedAt: string }
  | { status: 'UNAVAILABLE'; reason: string; fetchedAt: string };

const MONTH_CODES = 'FGHJKMNQUVXZ';

/** "ZCH27" -> "03/2027" from the trailing month letter + 2-digit year; falls back to the raw code. */
function monthLabel(contract: string): string {
  const m = /([FGHJKMNQUVXZ])(\d{2})$/.exec(contract);
  if (!m) return contract;
  return `${String(MONTH_CODES.indexOf(m[1]) + 1).padStart(2, '0')}/20${m[2]}`;
}

const dash = '—';

function Bar({ share }: { share: number | null }) {
  if (share === null) return null;
  return (
    <span className="block h-1 mt-0.5 bg-[var(--chart-grid)]" aria-hidden="true">
      <span className="block h-1 rounded-r-[4px] bg-[var(--series-1)]" style={{ width: `${Math.max(2, Math.round(share * 100))}%` }} />
    </span>
  );
}

/** T95: per-contract-month chain table (price, change, volume, OI, spread vs nearest) with liquidity hint. */
export function FuturesChainPanel({ instrumentId }: { instrumentId: string }) {
  const t = useT();
  const [state, setState] = useState<{ s: 'loading' } | { s: 'error'; error: UserError } | { s: 'ok'; data: ChainDto }>({ s: 'loading' });

  useEffect(() => {
    const ctl = new AbortController();
    setState({ s: 'loading' });
    fetch(`/api/futures-chain/${encodeURIComponent(instrumentId)}?count=8`, { signal: ctl.signal, headers: { Accept: 'application/json' } })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as (ChainDto & { message?: string }) | null;
        if (!res.ok || !body) throw new Error(body?.message ?? `HTTP ${res.status}`);
        setState({ s: 'ok', data: body });
      })
      .catch((err) => {
        if (!ctl.signal.aborted) setState({ s: 'error', error: toUserError(err) });
      });
    return () => ctl.abort();
  }, [instrumentId]);

  const ok = state.s === 'ok' && state.data.status !== 'UNAVAILABLE' ? state.data : null;
  const derived = useMemo(() => (ok ? deriveChain(ok.rows) : null), [ok]);

  return (
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-2">
      <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('chain.title')}</h2>
      <p className="text-[11px] text-[var(--text)]/55">{t('chain.note')}</p>
      {state.s === 'loading' && <p className="text-xs text-[var(--text)]/55">{t('chain.loading')}</p>}
      {state.s === 'error' && <ErrorNote error={state.error} className="text-xs" />}
      {state.s === 'ok' && state.data.status === 'UNAVAILABLE' && (
        <div className="flex items-start gap-2 text-xs">
          <DataStatusBadge status="UNAVAILABLE" />
          <span className="text-[var(--warning)]/90 font-mono">{state.data.reason || t('chain.unavailable')}</span>
        </div>
      )}
      {ok && derived && (
        <>
          <p className="text-[11px] font-mono text-[var(--text)]/60">
            {t('chain.asOf', {
              date: ok.valuationDate ? fmtDate(ok.valuationDate) : dash,
              fetched: `${ok.fetchedAt.slice(0, 16).replace('T', ' ')}Z`,
            })}{' '}
            · {ok.unit}
          </p>
          {derived.volumeLeader !== null && (
            <p className="text-xs text-[var(--text-strong)]">
              {t(liquidityMovedAway(derived) ? 'chain.hint.moved' : 'chain.hint.near', {
                month: monthLabel(ok.rows[derived.volumeLeader].contract),
              })}
            </p>
          )}
          <div className="overflow-x-auto" tabIndex={0}>
            <table className="w-full min-w-[640px] text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--text)]/65">
                  <th className="py-1.5 pr-3 font-medium">{t('chain.col.symbol')}</th>
                  <th className="py-1.5 pr-3 font-medium">{t('chain.col.month')}</th>
                  <th className="py-1.5 pr-3 font-medium text-right">{t('chain.col.price')}</th>
                  <th className="py-1.5 pr-3 font-medium text-right">{t('chain.col.change')}</th>
                  <th className="py-1.5 pr-3 font-medium text-right">{t('chain.col.volume')}</th>
                  <th className="py-1.5 pr-3 font-medium text-right">{t('chain.col.oi')}</th>
                  <th className="py-1.5 pr-3 font-medium text-right">{t('chain.col.spread')}</th>
                  <th className="py-1.5 font-medium">{t('chain.col.source')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]/60 font-mono tabular-nums">
                {ok.rows.map((r, i) => {
                  const d = derived.rows[i];
                  const leader = i === derived.volumeLeader;
                  return (
                    <tr key={r.contract} className={leader ? 'bg-[var(--accent)]/10' : ''} title={leader ? t('chain.leader') : undefined}>
                      <td className="py-1.5 pr-3 text-[var(--text-strong)]">
                        {r.contract}
                        {leader && <span className="ml-1.5 text-[10px] text-[var(--accent-text)]">{t('chain.leader')}</span>}
                      </td>
                      <td className="py-1.5 pr-3">{monthLabel(r.contract)}</td>
                      <td className="py-1.5 pr-3 text-right">{fmtNum(r.price)}</td>
                      <td
                        className={`py-1.5 pr-3 text-right ${
                          r.change === null ? '' : r.change >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                        }`}
                      >
                        {r.change === null ? dash : `${r.change > 0 ? '+' : ''}${fmtNum(Number(r.change.toFixed(4)))}`}
                      </td>
                      <td className="py-1.5 pr-3 text-right min-w-[84px]">
                        {r.volume === null ? dash : fmtInt(r.volume)}
                        <Bar share={d.volumeShare} />
                      </td>
                      <td className="py-1.5 pr-3 text-right min-w-[64px]">
                        {r.openInterest === null ? dash : fmtInt(r.openInterest)}
                        <Bar share={d.oiShare} />
                      </td>
                      <td className="py-1.5 pr-3 text-right">
                        {d.spreadVsNear === null ? dash : `${d.spreadVsNear > 0 ? '+' : ''}${fmtNum(Number(d.spreadVsNear.toFixed(4)))}`}
                      </td>
                      <td className="py-1.5">
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <DataStatusBadge status="DELAYED" sourceQuality="UNOFFICIAL" compact />
                          <span className="text-[10px] text-[var(--text)]/55" title={r.source}>
                            {r.yahooSymbol} · {r.asOf.slice(0, 10)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {ok.rows.every((r) => r.openInterest === null) && <p className="text-[11px] text-[var(--text)]/50">{t('chain.oiMissing')}</p>}
        </>
      )}
    </section>
  );
}
