import { useMemo } from 'react';
import { fmtFixed, fmtInt, useT } from '../../../i18n';
import { EquityChart } from '../../ui/viz/EquityChart';
import type { PaperTrade } from './paperModel';
import { MIN_TRADES_TO_CONCLUDE, computePerformance, planTakeaway, type CurvePoint, type Drawdown, type GroupStats } from './paperStats';
import { Stat, cardCls, fmtPct, fmtVnd, pnlColor, signedVnd } from './paperUi';

const rText = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtFixed(Math.abs(v), 1)}R`);

/** Equity curve (theme tokens only) with the max-drawdown span shaded. */
function StatsCurve({ curve, dd, baseline, label, ddLabel }: { curve: CurvePoint[]; dd: Drawdown; baseline: number; label: string; ddLabel: string }) {
  const hasDd = dd.vnd > 0;
  return (
    <figure>
      <EquityChart
        points={curve.map((p, i) => ({ label: `#${i + 1}`, v: p.equityVnd }))}
        baseline={baseline}
        ariaLabel={label}
        format={fmtInt}
        drawdown={hasDd ? { peakIndex: dd.peakIndex, troughIndex: dd.troughIndex } : null}
        className="h-44"
      />
      <figcaption className="mt-1 flex flex-wrap items-center gap-x-4 text-[11px] text-[var(--muted)]">
        <span>{label}</span>
        {hasDd && (
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-[var(--negative)] opacity-30" aria-hidden="true" />
            {ddLabel}
          </span>
        )}
      </figcaption>
    </figure>
  );
}

function GroupTable({ rows, nameOf }: { rows: GroupStats[]; nameOf: (k: string) => string }) {
  const t = useT();
  return (
    <div className="overflow-x-auto" tabIndex={0}>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[var(--text)]/55">
            <th className="py-1 pr-3">{t('ps.col.name')}</th>
            <th className="pr-3">{t('ps.col.trades')}</th>
            <th className="pr-3">{t('ps.col.win')}</th>
            <th className="pr-3">{t('ps.col.avgR')}</th>
            <th>{t('ps.col.pnl')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.key} className="border-t border-[var(--border)]">
              <td className="py-1 pr-3 text-[var(--text-strong)]">{nameOf(g.key)}</td>
              <td className="pr-3">{g.trades}</td>
              <td className="pr-3">{fmtPct(g.winRatePct, 0)}</td>
              <td className="pr-3 font-mono">{rText(g.avgR)}</td>
              <td className={`font-mono ${pnlColor(g.pnlVnd)}`}>{signedVnd(g.pnlVnd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface Props {
  startingCapitalVnd: number;
  trades: PaperTrade[];
  instrumentName: (id: string) => string;
}

/** "Thống kê" tab: KPIs, equity curve with max drawdown, breakdown by commodity and by plan adherence. */
export function PaperStatsPanel({ startingCapitalVnd, trades, instrumentName }: Props) {
  const t = useT();
  const s = useMemo(
    () => computePerformance(trades.map((x) => ({ instrumentId: x.instrumentId, pnlVnd: x.pnlVnd, feesVnd: x.feesVnd, rMultiple: x.rMultiple, closedAtMs: x.closedAtMs, onPlan: x.plan?.onPlan })), startingCapitalVnd),
    [trades, startingCapitalVnd]
  );
  const take = planTakeaway(s);

  if (s.trades === 0) {
    return (
      <div className={cardCls}>
        <h2 className="text-sm font-semibold text-[var(--text-strong)] mb-2">{t('ps.title')}</h2>
        <p className="text-xs text-[var(--text)]/65">{t('ps.empty')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={cardCls}>
        <h2 className="text-sm font-semibold text-[var(--text-strong)] mb-2">{t('ps.title')}</h2>
        <p className={`text-xs mb-3 ${s.tooFew ? 'text-[var(--warning)]' : 'text-[var(--text)]/60'}`} role={s.tooFew ? 'status' : undefined}>
          {s.tooFew ? t('ps.tooFew', { n: s.trades, min: MIN_TRADES_TO_CONCLUDE }) : t('ps.enough', { n: s.trades })}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Stat label={t('ps.k.total')} value={signedVnd(s.totalPnlVnd)} tone={pnlColor(s.totalPnlVnd)} />
          <Stat label={t('ps.k.winRate')} value={`${fmtPct(s.winRatePct, 0)} (${s.wins}/${s.trades})`} />
          <Stat label={t('ps.k.avgWin')} value={s.avgWinVnd === null ? '—' : fmtVnd(s.avgWinVnd)} tone="text-[var(--positive)]" />
          <Stat label={t('ps.k.avgLoss')} value={s.avgLossVnd === null ? '—' : fmtVnd(s.avgLossVnd)} tone="text-[var(--negative)]" />
          <Stat label={t('ps.k.expectancy')} value={rText(s.expectancyR)} tone={s.expectancyR === null ? undefined : pnlColor(s.expectancyR)} hint={t('ps.k.expectancyHint')} />
          <Stat label={t('ps.k.pf')} value={s.profitFactor === null ? '—' : fmtFixed(s.profitFactor, 2)} hint={t('ps.k.pfHint')} />
          <Stat label={t('ps.k.dd')} value={`${fmtVnd(s.maxDrawdown.vnd)} (${fmtPct(s.maxDrawdown.pct, 1)})`} hint={t('ps.k.ddHint')} />
          <Stat label={t('ps.k.streak')} value={t('ps.k.streakUnit', { n: s.longestLossStreak })} />
        </div>
        <div className="mt-3">
          <StatsCurve curve={s.curve} dd={s.maxDrawdown} baseline={startingCapitalVnd} label={t('ps.curve')} ddLabel={t('ps.curve.dd')} />
        </div>
      </div>

      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-[var(--text-strong)] mb-2">{t('ps.by.instrument')}</h3>
        <GroupTable rows={s.byInstrument} nameOf={instrumentName} />
      </div>

      {(s.onPlan || s.offPlan) && (
        <div className={cardCls}>
          <h3 className="text-sm font-semibold text-[var(--text-strong)] mb-2">{t('ps.by.plan')}</h3>
          <GroupTable rows={[s.onPlan, s.offPlan].filter((g): g is GroupStats => g !== null)} nameOf={(k) => t(k === 'onPlan' ? 'ps.plan.on' : 'ps.plan.off')} />
          <p className="text-xs text-[var(--text-strong)] mt-2">
            {take ? (
              <>
                {t('ps.take.on', { on: rText(take.on).replace('R', ''), off: rText(take.off).replace('R', '') })}{' '}
                <span className="text-[var(--text)]/75">{t(take.better === 'on' ? 'ps.take.onBetter' : take.better === 'off' ? 'ps.take.offBetter' : 'ps.take.same')}</span>
              </>
            ) : (
              <span className="text-[var(--text)]/65">{t('ps.noR')}</span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
