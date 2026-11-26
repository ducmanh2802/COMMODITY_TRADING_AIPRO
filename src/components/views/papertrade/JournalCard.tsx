import { useMemo } from 'react';
import { fmtFixed, fmtInt, useT } from '../../../i18n';
import { Fold } from '../pulse/tileBits';
import type { PaperTrade } from './paperModel';
import { buildJournalCsv } from './journalCsv';
import { computeJournalStats } from './journalStats';
import { cardCls, fmtPct, fmtVnd } from './paperUi';

/** Small bars of cumulative P&L (theme tokens; blue = above zero, apricot = below). */
function CumBars({ values, label }: { values: number[]; label: string }) {
  const shown = values.slice(-40);
  const W = 240;
  const H = 40;
  const max = Math.max(1, ...shown.map((v) => Math.abs(v)));
  const bw = W / shown.length;
  const mid = H / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-10 w-full" preserveAspectRatio="none" role="img" aria-label={label}>
      <line x1={0} x2={W} y1={mid} y2={mid} stroke="var(--chart-axis)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      {shown.map((v, i) => {
        const h = Math.max(1, (Math.abs(v) / max) * (mid - 1));
        return <rect key={i} x={i * bw + 0.5} y={v >= 0 ? mid - h : mid} width={Math.max(1, bw - 1)} height={h} fill={v >= 0 ? 'var(--positive)' : 'var(--negative)'} />;
      })}
    </svg>
  );
}

function download(content: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Practice-journal summary + CSV export. Works on whatever the store holds (local or signed-in). */
export function JournalCard({ trades, instrumentName }: { trades: PaperTrade[]; instrumentName: (id: string) => string }) {
  const t = useT();
  const s = useMemo(() => computeJournalStats(trades.map((x) => ({ pnlVnd: x.pnlVnd, closedAtMs: x.closedAtMs, stopLoss: x.stopLoss, rMultiple: x.rMultiple }))), [trades]);

  const exportCsv = () => {
    const csv = buildJournalCsv(
      trades.map((x) => ({
        openedAtMs: x.openedAtMs,
        closedAtMs: x.closedAtMs,
        instrumentName: instrumentName(x.instrumentId),
        side: x.side,
        contracts: x.contracts,
        entryPrice: x.entryPrice,
        exitPrice: x.exitPrice,
        stopLoss: x.stopLoss,
        pnlVnd: x.pnlVnd,
        rMultiple: x.rMultiple,
        tags: x.mistakeTags,
        note: [x.journal, x.mistakeNote].filter(Boolean).join(' | '),
      }))
    );
    download(csv, `nhat-ky-giao-dich-gia-lap-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const rText = s.avgR === null ? '—' : `${s.avgR > 0 ? '+' : s.avgR < 0 ? '−' : ''}${fmtFixed(Math.abs(s.avgR), 1)}R`;

  return (
    <div className={`${cardCls} space-y-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('jr.title')}</h2>
        <button
          type="button"
          onClick={exportCsv}
          disabled={trades.length === 0}
          className="min-h-10 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--text-strong)] disabled:opacity-40"
        >
          {t('jr.export')}
        </button>
      </div>
      <p className="text-[11px] text-[var(--warning)]">{t('jr.practice')}</p>
      {!s.enough ? (
        <p className="text-xs text-[var(--text)]/70" role="status">{t('jr.tooFew', { n: s.trades, min: 5 })}</p>
      ) : (
        <>
          <p className="text-xs text-[var(--text-strong)]">
            {t('jr.line', { n: s.trades, win: fmtPct(s.winRatePct, 0), r: rText })}
          </p>
          <CumBars values={s.cumulative} label={t('jr.bars')} />
          <Fold summary={t('jr.explain')}>
            <p>{t('jr.d.count', { n: s.trades })}</p>
            <p>{t('jr.d.win', { v: fmtPct(s.winRatePct, 0) })}</p>
            <p>{t('jr.d.avgWin', { v: s.avgWinVnd === null ? '—' : fmtVnd(s.avgWinVnd) })}</p>
            <p>{t('jr.d.avgLoss', { v: s.avgLossVnd === null ? '—' : fmtVnd(s.avgLossVnd) })}</p>
            <p>{t('jr.d.avgR', { v: rText, n: s.rCount })}</p>
            <p>{t('jr.d.dd', { v: `${fmtInt(s.maxDrawdownVnd)} đ` })}</p>
            <p>{t('jr.d.streak', { n: s.longestLossStreak })}</p>
            <p>{t('jr.d.bars')}</p>
          </Fold>
        </>
      )}
    </div>
  );
}
