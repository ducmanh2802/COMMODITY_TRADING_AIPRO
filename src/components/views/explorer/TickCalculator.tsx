import { useMemo, useState } from 'react';
import type { ContractSpecification } from '../../../shared/types/instrument';
import { computeTickPnl } from './tickMath';

const inputClass =
  'w-full bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-1.5 text-xs font-mono text-[#E5E7EB] focus:outline-none focus:border-[#6366F1]';

function fmt(n: number, digits = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function TickCalculator({ spec }: { spec: ContractSpecification }) {
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
    <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-3" aria-labelledby="tick-calc-title">
      <h2 id="tick-calc-title" className="text-sm font-semibold text-white">
        Tick Calculator
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="space-y-1 text-xs text-[#E5E7EB]/65">
          <span>Price move ({spec.quotationUnit || 'quotation units'})</span>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            value={move}
            onChange={(e) => setMove(e.target.value)}
            placeholder={spec.minimumTickSize !== null ? `e.g. ${spec.minimumTickSize * 4}` : 'n/a'}
            className={inputClass}
          />
        </label>
        <label className="space-y-1 text-xs text-[#E5E7EB]/65">
          <span>Contracts</span>
          <input
            type="number"
            min={1}
            step={1}
            value={contracts}
            onChange={(e) => setContracts(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="space-y-1 text-xs text-[#E5E7EB]/65">
          <span>USD→VND rate (user-provided, optional)</span>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            min={0}
            value={fx}
            onChange={(e) => setFx(e.target.value)}
            placeholder="leave blank to skip"
            disabled={!canConvertVnd}
            className={`${inputClass} disabled:opacity-40`}
          />
        </label>
      </div>

      {result === null ? (
        <p className="text-xs text-[#E5E7EB]/50">Enter a price move to compute ticks and P&L.</p>
      ) : !result.ok ? (
        <p role="alert" className="text-xs font-mono text-[#F59E0B]">
          {result.reason}
        </p>
      ) : (
        <div className="space-y-2">
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <dt className="text-[#E5E7EB]/55">Ticks</dt>
              <dd className="font-mono tabular-nums text-white">{fmt(result.ticks, 4)}</dd>
            </div>
            <div>
              <dt className="text-[#E5E7EB]/55">P&L / contract</dt>
              <dd className={`font-mono tabular-nums ${result.pnlPerContract < 0 ? 'text-[#EF4444]' : 'text-[#22C55E]'}`}>
                {fmt(result.pnlPerContract)} {result.currency}
              </dd>
            </div>
            <div>
              <dt className="text-[#E5E7EB]/55">P&L total</dt>
              <dd className={`font-mono tabular-nums ${result.pnl < 0 ? 'text-[#EF4444]' : 'text-[#22C55E]'}`}>
                {fmt(result.pnl)} {result.currency}
              </dd>
            </div>
            {canConvertVnd && fxValid && (
              <div>
                <dt className="text-[#E5E7EB]/55">P&L total in VND (user-provided rate)</dt>
                <dd className="font-mono tabular-nums text-[#E5E7EB]">{fmt(result.pnl * (fxRate as number), 0)} VND</dd>
              </div>
            )}
          </dl>
          {result.fractionalTicks && (
            <p className="text-xs font-mono text-[#F59E0B]">
              Warning: the move is not a whole multiple of the minimum tick ({spec.minimumTickSize}); prices can only move in whole ticks.
            </p>
          )}
          {fx.trim() !== '' && !fxValid && (
            <p className="text-xs font-mono text-[#F59E0B]">FX rate must be a positive number; VND conversion skipped.</p>
          )}
          <p className="text-[11px] font-mono text-[#E5E7EB]/45">{result.formula}</p>
          {canConvertVnd && fxValid && (
            <p className="text-[11px] text-[#E5E7EB]/45">
              VND figure uses the rate you typed ({fx}); it is not a verified market FX rate.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
