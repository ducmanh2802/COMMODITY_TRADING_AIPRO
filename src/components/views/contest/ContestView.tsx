import { useCallback, useEffect, useMemo, useState } from 'react';
import { LogIn, Trophy } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useTerminal } from '../../../contexts/TerminalContext';
import { fmtInt, useT, type TKey } from '../../../i18n';
import { validateSpec } from '../papertrade/paperMath';
import { Stat, bigBtn, cardCls, fmtPct, fmtVnd, inputCls, labelCls, pnlColor } from '../papertrade/paperUi';

interface SeasonInfo {
  season: string;
  capitalVnd: number;
}
interface LbRow {
  rank: number;
  tag: string;
  name: string;
  returnPct: number;
  discipline: number;
  combined: number;
  maxDdPct: number;
  badges: string[];
  isMe: boolean;
}
interface PositionDto {
  id: string;
  instrumentId: string;
  side: 'LONG' | 'SHORT';
  contracts: number;
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  status: 'OPEN' | 'CLOSED';
  lastMark: number | null;
  pnlVnd: number | null;
  closeReason: string | null;
}
interface MeDto {
  joined: boolean;
  balanceVnd?: number;
  equityVnd?: number;
  returnPct?: number;
  score?: { rank: number; discipline: number; combined: number } | null;
  positions?: PositionDto[];
  leaderboard?: LbRow[];
}

const KNOWN_ERRORS = new Set(['STOP_REQUIRED', 'BAD_STOP', 'BAD_TP', 'NO_FREE_MARGIN', 'NOT_JOINED', 'AUTH_REQUIRED', 'AUTH_INVALID', 'AUTH_UNAVAILABLE', 'FX_UNAVAILABLE']);
const numOrNull = (s: string): number | null => {
  const n = Number(s.trim().replace(',', '.'));
  return s.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null;
};

/** T63 "Cuộc đua": monthly paper-trading contest. All fills/scores happen on the server; this view only displays them. */
export function ContestView() {
  const t = useT();
  const { user, signInWithGoogle } = useAuth();
  const { instruments } = useTerminal();
  const [season, setSeason] = useState<SeasonInfo | null>(null);
  const [me, setMe] = useState<MeDto | null>(null);
  const [publicRows, setPublicRows] = useState<LbRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [instId, setInstId] = useState('');
  const [side, setSide] = useState<'LONG' | 'SHORT'>('LONG');
  const [contracts, setContracts] = useState('1');
  const [stop, setStop] = useState('');
  const [target, setTarget] = useState('');
  const [checklist, setChecklist] = useState(false);

  const eligible = useMemo(() => instruments.filter((i) => i.enabled && validateSpec(i.specification).ok), [instruments]);
  const nameOf = useCallback((id: string) => instruments.find((i) => i.id === id)?.productName ?? id, [instruments]);
  useEffect(() => {
    if (!instId && eligible.length > 0) setInstId(eligible[0].id);
  }, [eligible, instId]);

  const errText = useCallback(
    (code: string) => (KNOWN_ERRORS.has(code) ? t(`ct.err.${code}` as TKey) : t('ct.err.generic', { code })),
    [t],
  );

  const api = useCallback(
    async (path: string, init?: { method?: string; body?: unknown }) => {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (user) headers.authorization = `Bearer ${await user.getIdToken()}`;
      const res = await fetch(`/api/contest${path}`, {
        method: init?.method ?? 'GET',
        headers,
        body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) throw new Error(String(json.error ?? res.status));
      return json;
    },
    [user],
  );

  const load = useCallback(async () => {
    try {
      setSeason((await api('/season')) as unknown as SeasonInfo);
      if (user) setMe((await api('/me')) as unknown as MeDto);
      else setPublicRows(((await api('/leaderboard')) as { rows: LbRow[] }).rows);
    } catch (e) {
      setMsg(errText((e as Error).message));
    }
  }, [api, user, errText]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  const act = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    setMsg(null);
    try {
      setMsg(await fn());
      await load();
    } catch (e) {
      setMsg(errText((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const join = () => act(async () => {
    await api('/join', { method: 'POST', body: displayName.trim() ? { displayName: displayName.trim() } : {} });
    return null;
  });

  const submit = () => act(async () => {
    const n = Number(contracts);
    const r = (await api('/orders', {
      method: 'POST',
      body: {
        instrumentId: instId,
        side,
        contracts: Number.isInteger(n) ? n : 0,
        stop: numOrNull(stop),
        target: numOrNull(target),
        checklistDone: checklist,
      },
    })) as { order: { fillPrice: number; contracts: number; side: string } };
    setStop('');
    setTarget('');
    return t('ct.ticket.ok', { side: r.order.side, n: r.order.contracts, price: r.order.fillPrice });
  });

  const close = (id: string) => {
    if (!window.confirm(t('ct.pos.closeConfirm'))) return;
    void act(async () => {
      await api(`/positions/${id}/close`, { method: 'POST', body: {} });
      return null;
    });
  };

  const rows = me?.leaderboard ?? publicRows;

  return (
    <div className="space-y-4">
      <div role="note" className="flex gap-2 items-start bg-[var(--warning)]/10 border border-[var(--warning)]/40 rounded-lg p-3 text-xs text-[var(--warning)]">
        <Trophy className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
        <span>{t('ct.rules.banner')}</span>
      </div>

      <h2 className="text-base font-semibold text-[var(--text-strong)]">{t('ct.title', { season: season?.season ?? '…' })}</h2>
      {msg && <p className="text-xs text-[var(--accent-text)]" role="status">{msg}</p>}

      {!user ? (
        <div className={`${cardCls} space-y-3`}>
          <p className="text-sm text-[var(--text)]/80">{t('ct.signin')}</p>
          <button type="button" onClick={() => void signInWithGoogle()} className={`${bigBtn} bg-[var(--accent)] text-white`}>
            <LogIn className="w-4 h-4" aria-hidden /> Google
          </button>
        </div>
      ) : !me ? (
        <p className="text-sm text-[var(--text)]/60">{t('ct.loading')}</p>
      ) : !me.joined ? (
        <div className={`${cardCls} space-y-3`}>
          <h3 className="text-sm font-semibold text-[var(--text-strong)]">{t('ct.join.title')}</h3>
          <div>
            <label className={labelCls} htmlFor="ct-name">{t('ct.join.name')}</label>
            <input id="ct-name" className={inputCls} maxLength={24} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <button type="button" disabled={busy} onClick={() => void join()} className={`${bigBtn} bg-[var(--accent)] text-white`}>{t('ct.join.btn')}</button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <Stat label={t('ct.me.equity')} value={fmtVnd(me.equityVnd)} />
            <Stat label={t('ct.me.balance')} value={fmtVnd(me.balanceVnd)} />
            <Stat label={t('ct.me.return')} value={fmtPct(me.returnPct ?? 0, 2)} tone={pnlColor(me.returnPct ?? 0)} />
            <Stat label={t('ct.me.discipline')} value={me.score ? String(me.score.discipline) : '—'} />
            <Stat label={t('ct.me.rank')} value={me.score ? `#${me.score.rank}` : '—'} />
          </div>

          <div className={`${cardCls} space-y-3`}>
            <h3 className="text-sm font-semibold text-[var(--text-strong)]">{t('ct.ticket.title')}</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="col-span-2 md:col-span-2">
                <label className={labelCls} htmlFor="ct-inst">{t('ct.ticket.instrument')}</label>
                <select id="ct-inst" className={inputCls} value={instId} onChange={(e) => setInstId(e.target.value)}>
                  {eligible.map((i) => <option key={i.id} value={i.id}>{i.productName} · {i.exchangeSymbol}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="ct-side">{t('ct.ticket.side')}</label>
                <select id="ct-side" className={inputCls} value={side} onChange={(e) => setSide(e.target.value as 'LONG' | 'SHORT')}>
                  <option value="LONG">{t('ct.ticket.long')}</option>
                  <option value="SHORT">{t('ct.ticket.short')}</option>
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="ct-qty">{t('ct.ticket.contracts')}</label>
                <input id="ct-qty" inputMode="numeric" className={inputCls} value={contracts} onChange={(e) => setContracts(e.target.value)} />
              </div>
              <div>
                <label className={labelCls} htmlFor="ct-stop">{t('ct.ticket.stop')}</label>
                <input id="ct-stop" inputMode="decimal" className={inputCls} value={stop} onChange={(e) => setStop(e.target.value)} />
              </div>
              <div>
                <label className={labelCls} htmlFor="ct-tp">{t('ct.ticket.target')}</label>
                <input id="ct-tp" inputMode="decimal" className={inputCls} value={target} onChange={(e) => setTarget(e.target.value)} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-[var(--text)]/80">
              <input type="checkbox" checked={checklist} onChange={(e) => setChecklist(e.target.checked)} /> {t('ct.ticket.checklist')}
            </label>
            <button type="button" disabled={busy || !instId || numOrNull(stop) === null} onClick={() => void submit()} className={`${bigBtn} bg-[var(--accent)] text-white`}>
              {t('ct.ticket.submit')}
            </button>
          </div>

          <div className={`${cardCls} space-y-2`}>
            <h3 className="text-sm font-semibold text-[var(--text-strong)]">{t('ct.pos.title')}</h3>
            {(me.positions ?? []).length === 0 ? (
              <p className="text-xs text-[var(--text)]/60">{t('ct.pos.empty')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <tbody>
                    {[...(me.positions ?? [])].reverse().map((p) => (
                      <tr key={p.id} className="border-t border-[var(--border)]">
                        <td className="py-1.5 pr-2 text-[var(--text-strong)] font-semibold">{nameOf(p.instrumentId)}</td>
                        <td className="pr-2">{p.side} × {p.contracts}</td>
                        <td className="pr-2 font-mono">{t('ct.pos.entry')} {p.entryPrice}</td>
                        <td className="pr-2 font-mono">{t('ct.pos.stop')} {p.stopLoss ?? '—'}</td>
                        <td className="pr-2 font-mono">{t('ct.pos.target')} {p.takeProfit ?? '—'}</td>
                        <td className="pr-2 font-mono">{t('ct.pos.mark')} {p.lastMark ?? '—'}</td>
                        <td className={`pr-2 font-mono ${pnlColor(p.pnlVnd ?? 0)}`}>{p.pnlVnd === null ? t('ct.pos.status.OPEN') : `${t('ct.pos.status.CLOSED')} ${fmtVnd(p.pnlVnd)}`}</td>
                        <td className="text-right">
                          {p.status === 'OPEN' && (
                            <button type="button" disabled={busy} onClick={() => close(p.id)} className="px-2 py-1 rounded-md border border-[var(--border)] text-[var(--text)]/80">{t('ct.pos.close')}</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <div className={`${cardCls} space-y-2`}>
        <h3 className="text-sm font-semibold text-[var(--text-strong)]">{t('ct.lb.title')}</h3>
        {rows.length === 0 ? (
          <p className="text-xs text-[var(--text)]/60">{t('ct.lb.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[var(--text)]/55">
                  <th className="py-1 pr-2">{t('ct.lb.rank')}</th>
                  <th className="pr-2">{t('ct.lb.name')}</th>
                  <th className="pr-2">{t('ct.lb.return')}</th>
                  <th className="pr-2">{t('ct.lb.discipline')}</th>
                  <th className="pr-2">{t('ct.lb.dd')}</th>
                  <th className="pr-2">{t('ct.lb.combined')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.tag} className={`border-t border-[var(--border)] ${r.isMe ? 'bg-[var(--accent)]/10' : ''}`}>
                    <td className="py-1.5 pr-2 font-mono">#{r.rank}</td>
                    <td className="pr-2 text-[var(--text-strong)]">
                      {r.name}{r.isMe ? ` (${t('ct.lb.me')})` : ''}
                      {r.badges.map((b) => (
                        <span key={b} className="ml-1.5 px-1.5 py-0.5 rounded border border-[var(--border)] text-[10px] text-[var(--muted)]">{t(`ct.badge.${b}` as TKey)}</span>
                      ))}
                    </td>
                    <td className={`pr-2 font-mono ${pnlColor(r.returnPct)}`}>{fmtPct(r.returnPct, 2)}</td>
                    <td className="pr-2 font-mono">{r.discipline}</td>
                    <td className="pr-2 font-mono">{fmtPct(r.maxDdPct, 1)}</td>
                    <td className="pr-2 font-mono font-semibold">{r.combined}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={`${cardCls} space-y-1`}>
        <h3 className="text-sm font-semibold text-[var(--text-strong)]">{t('ct.rules.title')}</h3>
        <p className="text-xs font-semibold text-[var(--warning)]">{t('ct.rules.banner')}</p>
        <ul className="list-disc pl-5 text-xs text-[var(--text)]/75 space-y-0.5">
          <li>{t('ct.rules.r1', { capital: fmtInt(season?.capitalVnd ?? 500_000_000) })}</li>
          <li>{t('ct.rules.r2')}</li>
          <li>{t('ct.rules.r3')}</li>
          <li>{t('ct.rules.r4')}</li>
          <li>{t('ct.rules.r5')}</li>
        </ul>
      </div>
    </div>
  );
}
