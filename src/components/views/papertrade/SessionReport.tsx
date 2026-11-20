import { useMemo, useState } from 'react';
import { fmtDateTime, fmtFixed, useT, type TKey } from '../../../i18n';
import { breakdownByInstrument, computeStats, type PnlBreakdown } from './paperMath';
import { PAPER_LIMITS, type PaperTrade, type TradePatch } from './paperModel';
import { EquityCurve, PnlBars, Stat, cardCls, fmtPct, fmtVnd, inputCls, pnlColor, signedVnd } from './paperUi';

export interface NoteOption {
  id: string;
  title: string;
  instrumentId: string;
}

interface Props {
  startingCapitalVnd: number;
  trades: PaperTrade[];
  /** Live P&L split (active session only). */
  breakdown?: PnlBreakdown | null;
  notes: NoteOption[];
  instrumentName: (id: string) => string;
  onUpdateTrade: (id: string, patch: TradePatch) => void;
}

/** Stats, equity curve, per-commodity breakdown and closed-trade list (with journal notes) of one session. */
export function SessionReport({ startingCapitalVnd, trades, breakdown, notes, instrumentName, onUpdateTrade }: Props) {
  const t = useT();
  const stats = useMemo(() => computeStats(trades.map((x) => ({ pnlVnd: x.pnlVnd, rMultiple: x.rMultiple, closedAtMs: x.closedAtMs })), startingCapitalVnd), [trades, startingCapitalVnd]);
  const byInstrument = useMemo(
    () => breakdownByInstrument(trades.map((x) => ({ instrumentId: x.instrumentId, pnlVnd: x.pnlVnd, feesVnd: x.feesVnd, rMultiple: x.rMultiple, closedAtMs: x.closedAtMs }))),
    [trades]
  );
  const sorted = useMemo(() => [...trades].sort((a, b) => b.closedAtMs - a.closedAtMs), [trades]);
  const [editing, setEditing] = useState<{ id: string; journal: string; noteId: string } | null>(null);

  return (
    <div className="space-y-4">
      {breakdown && (
        <div className={cardCls}>
          <h3 className="text-sm font-semibold text-white mb-2">{t('pt.pnl.title')}</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <Stat label={t('pt.pnl.realised')} value={signedVnd(breakdown.realisedVnd)} tone={pnlColor(breakdown.realisedVnd)} hint={t('pt.pnl.realisedHint')} />
            <Stat label={t('pt.pnl.unrealised')} value={signedVnd(breakdown.unrealisedVnd)} tone={pnlColor(breakdown.unrealisedVnd)} hint={t('pt.pnl.unrealisedHint')} />
            <Stat label={t('pt.pnl.openFees')} value={fmtVnd(-breakdown.openFeesVnd)} hint={t('pt.pnl.openFeesHint')} />
            <Stat label={t('pt.pnl.total')} value={signedVnd(breakdown.totalVnd)} tone={pnlColor(breakdown.totalVnd)} />
            <Stat label={t('pt.pnl.totalPct')} value={fmtPct(breakdown.totalPct, 2)} tone={pnlColor(breakdown.totalVnd)} />
          </div>
          <p className="text-[11px] text-[#E5E7EB]/55 mt-2">{t('pt.pnl.note', { fees: fmtVnd(breakdown.tradeFeesVnd) })}</p>
        </div>
      )}

      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-white mb-2">{t('pt.stats.title')}</h3>
        {stats.trades === 0 ? (
          <p className="text-xs text-[#E5E7EB]/60">{t('pt.stats.none')}</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Stat label={t('pt.stats.trades')} value={String(stats.trades)} />
            <Stat label={t('pt.stats.winRate')} value={fmtPct(stats.winRatePct, 0)} />
            <Stat label={t('pt.stats.avgWin')} value={fmtVnd(stats.avgWinVnd)} tone="text-[#4ADE80]" />
            <Stat label={t('pt.stats.avgLoss')} value={fmtVnd(stats.avgLossVnd)} tone="text-[#F87171]" />
            <Stat label={t('pt.stats.profitFactor')} value={stats.profitFactor === null ? '—' : fmtFixed(stats.profitFactor, 2)} hint={t('pt.stats.profitFactorHint')} />
            <Stat label={t('pt.stats.avgR')} value={stats.avgR === null ? '—' : `${stats.avgR}R`} hint={t('pt.stats.avgRHint')} />
            <Stat label={t('pt.stats.maxDd')} value={`${fmtVnd(stats.maxDrawdownVnd)} (${fmtPct(stats.maxDrawdownPct)})`} hint={t('pt.stats.maxDdHint')} />
            <Stat label={t('pt.stats.realisedTotal')} value={signedVnd(stats.totalPnlVnd)} tone={pnlColor(stats.totalPnlVnd)} />
          </div>
        )}
        <div className="mt-3">
          <p className="text-[11px] text-[#E5E7EB]/55 mb-1">{t('pt.stats.curve')}</p>
          <EquityCurve points={stats.curve} baseline={startingCapitalVnd} label={t('pt.stats.curve')} />
        </div>
      </div>

      {byInstrument.length > 0 && (
        <div className={cardCls}>
          <h3 className="text-sm font-semibold text-white mb-2">{t('pt.by.title')}</h3>
          <PnlBars items={byInstrument.map((b) => ({ key: b.instrumentId, label: instrumentName(b.instrumentId), value: b.pnlVnd }))} label={t('pt.by.title')} />
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[#E5E7EB]/55">
                  <th className="py-1 pr-3">{t('pt.col.instrument')}</th>
                  <th className="pr-3">{t('pt.stats.trades')}</th>
                  <th className="pr-3">{t('pt.stats.winRate')}</th>
                  <th className="pr-3">{t('pt.stats.avgR')}</th>
                  <th className="pr-3">{t('pt.col.fees')}</th>
                  <th>{t('pt.col.pnl')}</th>
                </tr>
              </thead>
              <tbody>
                {byInstrument.map((b) => (
                  <tr key={b.instrumentId} className="border-t border-[#263244]">
                    <td className="py-1 pr-3 text-white">{instrumentName(b.instrumentId)}</td>
                    <td className="pr-3">{b.trades}</td>
                    <td className="pr-3">{fmtPct(b.winRatePct, 0)}</td>
                    <td className="pr-3">{b.avgR === null ? '—' : `${b.avgR}R`}</td>
                    <td className="pr-3 font-mono">{fmtVnd(b.feesVnd)}</td>
                    <td className={`font-mono ${pnlColor(b.pnlVnd)}`}>{signedVnd(b.pnlVnd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-white mb-2">{t('pt.trades.title')}</h3>
        {sorted.length === 0 ? (
          <p className="text-xs text-[#E5E7EB]/60">{t('pt.trades.none')}</p>
        ) : (
          <ul className="space-y-3">
            {sorted.map((x) => {
              const isEditing = editing?.id === x.id;
              const instNotes = notes.filter((n) => n.instrumentId === x.instrumentId || n.id === x.researchNoteId);
              return (
                <li key={x.id} className="border border-[#263244] rounded-md p-3 text-xs space-y-1.5">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="text-white font-semibold">{instrumentName(x.instrumentId)}</span>
                    <span className={x.side === 'LONG' ? 'text-[#4ADE80]' : 'text-[#F87171]'}>{x.side === 'LONG' ? t('pt.side.long') : t('pt.side.short')} × {x.contracts}</span>
                    <span className="font-mono">{fmtFixed(x.entryPrice, 2)} → {fmtFixed(x.exitPrice, 2)}</span>
                    <span className={`font-mono font-semibold ${pnlColor(x.pnlVnd)}`}>{signedVnd(x.pnlVnd)}</span>
                    <span className="font-mono text-[#E5E7EB]/70">{x.rMultiple === null ? t('pt.trades.noR') : `${x.rMultiple}R`}</span>
                    <span className="text-[#E5E7EB]/60">{t(`pt.reason.${x.closeReason}` as TKey)}</span>
                  </div>
                  <div className="text-[#E5E7EB]/55">
                    {fmtDateTime(x.openedAtMs)} → {fmtDateTime(x.closedAtMs)} · {t('pt.col.fees')} {fmtVnd(x.feesVnd)} · USD {fmtFixed(x.pnlUsd, 2)} @ {fmtVnd(x.fxRate)}
                  </div>
                  {isEditing ? (
                    <div className="space-y-2">
                      <textarea
                        value={editing.journal}
                        maxLength={PAPER_LIMITS.journalMax}
                        onChange={(e) => setEditing({ ...editing, journal: e.target.value })}
                        className={`${inputCls} h-20`}
                        placeholder={t('pt.journal.placeholder')}
                        aria-label={t('pt.journal.title')}
                      />
                      {instNotes.length > 0 && (
                        <select value={editing.noteId} onChange={(e) => setEditing({ ...editing, noteId: e.target.value })} className={inputCls} aria-label={t('pt.journal.link')}>
                          <option value="">{t('pt.journal.noLink')}</option>
                          {instNotes.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}
                        </select>
                      )}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="px-3 py-1.5 bg-[#6366F1] text-white rounded-md"
                          onClick={() => {
                            onUpdateTrade(x.id, { journal: editing.journal, researchNoteId: editing.noteId });
                            setEditing(null);
                          }}
                        >
                          {t('pt.save')}
                        </button>
                        <button type="button" className="px-3 py-1.5 border border-[#263244] rounded-md" onClick={() => setEditing(null)}>{t('pt.cancel')}</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-start gap-2">
                      <p className="flex-1 min-w-[12rem] text-[#E5E7EB]/80 whitespace-pre-wrap">
                        {x.journal || <span className="text-[#E5E7EB]/40">{t('pt.journal.empty')}</span>}
                        {x.researchNoteId && <span className="block text-[#A5B4FC]">{t('pt.journal.linked', { title: notes.find((n) => n.id === x.researchNoteId)?.title ?? x.researchNoteId })}</span>}
                      </p>
                      <button type="button" className="px-3 py-1.5 border border-[#263244] rounded-md" onClick={() => setEditing({ id: x.id, journal: x.journal, noteId: x.researchNoteId })}>
                        {t('pt.journal.edit')}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
