import { useMemo, useState } from 'react';
import { fmtDate, useT } from '../../../i18n';
import { summarizeSession } from './paperMath';
import type { PaperSession, PaperState, TradePatch } from './paperModel';
import { SessionReport, type NoteOption } from './SessionReport';
import { PnlBars, Stat, cardCls, fmtPct, fmtVnd, pnlColor, signedVnd } from './paperUi';

interface Props {
  state: PaperState;
  notes: NoteOption[];
  instrumentName: (id: string) => string;
  onUpdateTrade: (id: string, patch: TradePatch) => void;
  onDeleteSession: (s: PaperSession) => void;
  onRenameSession: (s: PaperSession, name: string) => void;
}

/** List of all practice sessions with results, a P&L-per-session comparison chart and a per-session drill-down. */
export function SessionHistory({ state, notes, instrumentName, onUpdateTrade, onDeleteSession, onRenameSession }: Props) {
  const t = useT();
  const [openId, setOpenId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  const rows = useMemo(
    () =>
      [...state.sessions]
        .sort((a, b) => b.createdAtMs - a.createdAtMs)
        .map((s) => {
          const trades = state.trades.filter((x) => x.sessionId === s.id);
          // Closed: stored final equity. Active: cash balance (open positions are not marked to market here).
          const equity = s.status === 'closed' && s.finalEquityVnd !== null ? s.finalEquityVnd : s.balanceVnd;
          return { s, trades, sum: summarizeSession(s.startingCapitalVnd, equity, trades) };
        }),
    [state]
  );

  const open = rows.find((r) => r.s.id === openId) ?? null;

  if (rows.length === 0) {
    return <div className={`${cardCls} text-sm text-[var(--text)]/70`}>{t('pt.hist.none')}</div>;
  }

  return (
    <div className="space-y-4">
      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-[var(--text-strong)] mb-1">{t('pt.hist.compare')}</h3>
        <p className="text-[11px] text-[var(--text)]/55 mb-2">{t('pt.hist.compareNote')}</p>
        <PnlBars items={rows.map((r) => ({ key: r.s.id, label: r.s.name, value: r.sum.pnlVnd }))} label={t('pt.hist.compare')} />
      </div>

      <ul className="space-y-3">
        {rows.map(({ s, sum }) => (
          <li key={s.id} className={`${cardCls} space-y-3`}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {renaming?.id === s.id ? (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (renaming.name.trim()) onRenameSession(s, renaming.name.trim());
                    setRenaming(null);
                  }}
                >
                  <input
                    value={renaming.name}
                    maxLength={80}
                    onChange={(e) => setRenaming({ id: s.id, name: e.target.value })}
                    className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-2 py-1 text-sm text-[var(--text-strong)]"
                    aria-label={t('pt.session.name')}
                  />
                  <button type="submit" className="px-3 py-1 bg-[var(--accent)] text-white text-xs rounded-md">{t('pt.save')}</button>
                </form>
              ) : (
                <h3 className="text-sm font-semibold text-[var(--text-strong)]">{s.name}</h3>
              )}
              <span className={`text-[11px] px-2 py-0.5 rounded-full border ${s.status === 'active' ? 'border-[var(--accent)] text-[var(--accent-text)]' : 'border-[var(--border)] text-[var(--muted)]'}`}>
                {s.status === 'active' ? t('pt.session.active') : t('pt.session.closed')}
              </span>
              <span className="text-[11px] text-[var(--text)]/55">
                {fmtDate(s.createdAtMs)}{s.closedAtMs !== null ? ` → ${fmtDate(s.closedAtMs)}` : ''}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Stat label={t('pt.hist.start')} value={fmtVnd(sum.startingCapitalVnd)} />
              <Stat label={s.status === 'closed' ? t('pt.hist.finalEquity') : t('pt.hist.balanceNow')} value={fmtVnd(sum.finalEquityVnd)} />
              <Stat label={t('pt.hist.pnl')} value={`${signedVnd(sum.pnlVnd)} (${fmtPct(sum.pnlPct, 2)})`} tone={pnlColor(sum.pnlVnd)} />
              <Stat label={t('pt.stats.trades')} value={String(sum.trades)} />
              <Stat label={t('pt.stats.winRate')} value={fmtPct(sum.winRatePct, 0)} />
              <Stat label={t('pt.stats.maxDd')} value={`${fmtVnd(sum.maxDrawdownVnd)} (${fmtPct(sum.maxDrawdownPct)})`} />
              <Stat label={t('pt.hist.best')} value={sum.bestTradeVnd === null ? '—' : signedVnd(sum.bestTradeVnd)} tone={sum.bestTradeVnd === null ? undefined : pnlColor(sum.bestTradeVnd)} />
              <Stat label={t('pt.hist.worst')} value={sum.worstTradeVnd === null ? '—' : signedVnd(sum.worstTradeVnd)} tone={sum.worstTradeVnd === null ? undefined : pnlColor(sum.worstTradeVnd)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="px-4 py-2 bg-[var(--accent)] text-white text-xs font-medium rounded-md" onClick={() => setOpenId(openId === s.id ? null : s.id)}>
                {openId === s.id ? t('pt.hist.hide') : t('pt.hist.open')}
              </button>
              <button type="button" className="px-4 py-2 border border-[var(--border)] text-xs rounded-md" onClick={() => setRenaming({ id: s.id, name: s.name })}>{t('pt.session.rename')}</button>
              <button type="button" className="px-4 py-2 border border-[var(--warning)]/60 text-[var(--warning)] text-xs rounded-md" onClick={() => onDeleteSession(s)}>{t('pt.session.delete')}</button>
            </div>
            {open?.s.id === s.id && (
              <SessionReport
                startingCapitalVnd={s.startingCapitalVnd}
                trades={open.trades}
                notes={notes}
                instrumentName={instrumentName}
                onUpdateTrade={onUpdateTrade}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
