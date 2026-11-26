import { useState } from 'react';
import { useT, fmtFixed, fmtInt, type TKey } from '../../../i18n';
import { Fold } from '../pulse/tileBits';
import { riskSizing } from './riskSizing';
import type { Side, ValidSpec } from './paperMath';
import { bigBtn, fmtVnd, inputCls, labelCls } from './paperUi';

/** Practice-only sizing helper under the order inputs: entry = expected fill, stop = the stop-loss field. */
export function RiskSizingCard(p: { spec: ValidSpec; side: Side; entry: number; stop: number | null; equityVnd: number; fx: number | null; onUse: (n: number) => void }) {
  const t = useT();
  const [pctText, setPctText] = useState('1');
  const pct = Number(pctText.replace(',', '.'));
  const res = p.stop !== null && p.fx ? riskSizing({ spec: p.spec, side: p.side, entry: p.entry, stop: p.stop, equityVnd: p.equityVnd, riskPct: pct, fx: p.fx }) : null;
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 space-y-2 text-xs" data-testid="risk-sizing">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[var(--text-strong)] font-medium">{t('rsz.title')}</p>
        <span className="text-[10px] text-[var(--warning)]">{t('rsz.badge')}</span>
      </div>
      <div className="max-w-[12rem]">
        <label htmlFor="pt-rsz-pct" className={labelCls}>{t('rsz.maxRisk')}</label>
        <input id="pt-rsz-pct" inputMode="decimal" value={pctText} onChange={(e) => setPctText(e.target.value)} className={`${inputCls} font-mono`} />
      </div>
      {!res ? (
        <p className="text-[var(--muted)]">{t('rsz.hint')}</p>
      ) : !res.ok ? (
        <p className="text-[var(--warning)]">{t(`rsz.err.${res.reason}` as TKey)}</p>
      ) : (
        <div className="space-y-1">
          <p className="text-[var(--text)]">{t('rsz.perContract', { usd: fmtFixed(res.riskPerContractUsd, 2), vnd: fmtVnd(res.riskPerContractVnd), ticks: fmtInt(res.stopTicks) })}</p>
          <p className="text-[var(--text)]">{t('rsz.budget', { vnd: fmtVnd(res.maxRiskVnd) })}</p>
          {res.contracts > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[var(--text-strong)]" data-testid="rsz-result">{t('rsz.result', { n: res.contracts })}</p>
              <button type="button" className={`${bigBtn} border border-[var(--border)] text-[var(--accent-text)]`} onClick={() => p.onUse(res.contracts)}>{t('rsz.use')}</button>
            </div>
          ) : (
            <p className="text-[var(--warning)]" data-testid="rsz-zero">{t('rsz.zero')}</p>
          )}
        </div>
      )}
      <Fold summary={t('rsz.explain')}>{t('rsz.explainBody')}</Fold>
    </div>
  );
}
