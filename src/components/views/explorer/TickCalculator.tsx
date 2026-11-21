import { useMemo, useState } from 'react';
import type { ContractSpecification } from '../../../shared/types/instrument';
import { computeTickPnl } from './tickMath';
import { fmtFixed, useT } from '../../../i18n';

const inputClass =
  'w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-xs font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]';

function fmt(n: number, digits = 2): string {
  return fmtFixed(n, digits);
}

export function TickCalculator({ spec }: { spec: ContractSpecification }) {
  const t = useT();
  const [move, setMove] = useState('');
  const [contracts, setContracts] = useState('1');
  const [fx, setFx] = useState('');

  const result = useMemo(() => {
    if (move.trim() === '') return null;
    return computeTickPnl(spec, Number(move), Number(contracts));
  }, [spec, move, contracts]);

  const fxRate = fx.trim() === '' ? null : Number(fx);
  const fxValid = fxRate !== null && Number.isFinite(fxRate) && fxRate > 0;
  const canConvertVnd = spec.tradingCurrency === 'USD';

  return (
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-3" aria-labelledby="tick-calc-title">
      <h2 id="tick-calc-title" className="text-sm font-semibold text-[var(--text-strong)]">
        {t('exp.tick.title')}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="space-y-1 text-xs text-[var(--text)]/65">
          <span>{t('exp.tick.move', { unit: spec.quotationUnit || t('exp.tick.quotationUnits') })}</span>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            value={move}
            onChange={(e) => setMove(e.target.value)}
            placeholder={spec.minimumTickSize !== null ? t('exp.tick.eg', { v: spec.minimumTickSize * 4 }) : t('exp.na')}
            className={inputClass}
          />
        </label>
        <label className="space-y-1 text-xs text-[var(--text)]/65">
          <span>{t('exp.tick.contracts')}</span>
          <input
            type="number"
            min={1}
            step={1}
            value={contracts}
            onChange={(e) => setContracts(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="space-y-1 text-xs text-[var(--text)]/65">
          <span>{t('exp.tick.fx')}</span>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            min={0}
            value={fx}
            onChange={(e) => setFx(e.target.value)}
            placeholder={t('exp.tick.fxPlaceholder')}
            disabled={!canConvertVnd}
            className={`${inputClass} disabled:opacity-40`}
          />
        </label>
      </div>

      {result === null ? (
        <p className="text-xs text-[var(--text)]/50">{t('exp.tick.enterMove')}</p>
      ) : !result.ok ? (
        <p role="alert" className="text-xs font-mono text-[var(--warning)]">
          {result.reason}
        </p>
      ) : (
        <div className="space-y-2">
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <dt className="text-[var(--text)]/55">{t('exp.tick.ticks')}</dt>
              <dd className="font-mono tabular-nums text-[var(--text-strong)]">{fmt(result.ticks, 4)}</dd>
            </div>
            <div>
              <dt className="text-[var(--text)]/55">{t('exp.tick.pnlPer')}</dt>
              <dd className={`font-mono tabular-nums ${result.pnlPerContract < 0 ? 'text-[var(--negative)]' : 'text-[var(--positive)]'}`}>
                {fmt(result.pnlPerContract)} {result.currency}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--text)]/55">{t('exp.tick.pnlTotal')}</dt>
              <dd className={`font-mono tabular-nums ${result.pnl < 0 ? 'text-[var(--negative)]' : 'text-[var(--positive)]'}`}>
                {fmt(result.pnl)} {result.currency}
              </dd>
            </div>
            {canConvertVnd && fxValid && (
              <div>
                <dt className="text-[var(--text)]/55">{t('exp.tick.pnlVnd')}</dt>
                <dd className="font-mono tabular-nums text-[var(--text)]">{fmt(result.pnl * (fxRate as number), 0)} VND</dd>
              </div>
            )}
          </dl>
          {result.fractionalTicks && (
            <p className="text-xs font-mono text-[var(--warning)]">
              {t('exp.tick.fractional', { tick: spec.minimumTickSize })}
            </p>
          )}
          {fx.trim() !== '' && !fxValid && (
            <p className="text-xs font-mono text-[var(--warning)]">{t('exp.tick.fxInvalid')}</p>
          )}
          <p className="text-[11px] font-mono text-[var(--text)]/45">{result.formula}</p>
          {canConvertVnd && fxValid && (
            <p className="text-[11px] text-[var(--text)]/45">
              {t('exp.tick.fxNote', { fx })}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
