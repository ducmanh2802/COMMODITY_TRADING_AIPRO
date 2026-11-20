import { useEffect, useMemo, useState } from 'react';
import { useTerminal } from '../../../contexts/TerminalContext';
import { useT, fmtInt } from '../../../i18n';
import { fetchContractChain } from '../../../api/contractsApi';
import {
  CROPS, buildScenarios, initialMargin, localBasis, parseNum, pickContractMonth, planContracts, quoteToVndPerKg,
  type HedgeRole,
} from './hedgeMath';
import { SectionHeader } from '../../ui/SectionHeader';
import { Card } from '../../ui/Card';
import { Badge } from '../../ui/Badge';
import { RangeBar } from '../../ui/viz/RangeBar';

const USABLE = new Set(['CURRENT', 'DELAYED', 'HISTORICAL', 'STALE']);

function monthPlus(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function HedgeWizard() {
  const t = useT();
  const { instruments, quotesBySymbol, setActiveModule } = useTerminal();
  const [step, setStep] = useState(1);
  const [symbol, setSymbol] = useState('RC');
  const [role, setRole] = useState<HedgeRole>('seller');
  const [qty, setQty] = useState('5');
  const [unit, setUnit] = useState<'ton' | 'kg'>('ton');
  const [month, setMonth] = useState(monthPlus(4));
  const [manualPrice, setManualPrice] = useState('');
  const [useManual, setUseManual] = useState(false);
  const [fx, setFx] = useState('');
  const [fxFromVcb, setFxFromVcb] = useState(false);
  const [marginPct, setMarginPct] = useState('10');
  const [localPrice, setLocalPrice] = useState('');
  const [basisChg, setBasisChg] = useState('0');
  const [months, setMonths] = useState<string[] | null>(null);

  const crop = CROPS.find((c) => c.symbol === symbol) ?? CROPS[0];
  const instrument = instruments.find((i) => i.exchangeSymbol === symbol);
  const quote = quotesBySymbol[symbol];
  const quoteOk = !!quote && quote.price != null && USABLE.has(quote.status) && !/benchmark/i.test(quote.source ?? '');

  useEffect(() => {
    const ctrl = new AbortController();
    fetch('/api/market/fx/usdvnd', { signal: ctrl.signal })
      .then((r) => r.json())
      .then((j: { status?: string; rate?: number | null }) => {
        if (j.status === 'CURRENT' && typeof j.rate === 'number') {
          setFx((p) => p || String(Math.round(j.rate as number)));
          setFxFromVcb(true);
        }
      })
      .catch(() => undefined);
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    setMonths(null);
    if (!instrument) return;
    const ctrl = new AbortController();
    fetchContractChain(instrument.id, { count: 12 }, ctrl.signal)
      .then((r) => !ctrl.signal.aborted && setMonths(r.status === 'OK' ? r.contracts.map((c) => c.contractMonth) : []))
      .catch(() => !ctrl.signal.aborted && setMonths([]));
    return () => ctrl.abort();
  }, [instrument]);

  const qtyKg = (parseNum(qty) || 0) * (unit === 'ton' ? 1000 : 1);
  const priceQuoted = useManual || !quoteOk ? parseNum(manualPrice) : (quote?.price as number);
  const fxNum = parseNum(fx);
  const entryVndKg = priceQuoted > 0 && fxNum > 0 ? quoteToVndPerKg(priceQuoted, crop, fxNum) : NaN;
  const plan = planContracts(qtyKg, crop.contractKg);
  const rawContracts = qtyKg / crop.contractKg;
  const suggested = months && months.length ? pickContractMonth(months, month) : null;
  const marginAmt = Number.isFinite(entryVndKg) ? initialMargin(plan.hedgedKg, entryVndKg, parseNum(marginPct) || 0) : NaN;
  const localNum = parseNum(localPrice);
  const basis = Number.isFinite(entryVndKg) && localNum > 0 ? localBasis(localNum, entryVndKg) : 0;
  const scenarios = useMemo(
    () =>
      Number.isFinite(entryVndKg)
        ? buildScenarios({ role, quantityKg: qtyKg, hedgedKg: plan.hedgedKg, entryVndKg, basisVndKg: basis, basisChangeVndKg: parseNum(basisChg) || 0 })
        : [],
    [role, qtyKg, plan.hedgedKg, entryVndKg, basis, basisChg]
  );
  const worst = scenarios.length ? (role === 'seller' ? scenarios[scenarios.length - 1] : scenarios[0]) : null;
  const maxBar = Math.max(1, ...scenarios.flatMap((s) => [Math.abs(s.withoutHedge), Math.abs(s.withHedge)]));
  const d = t('hd.dong');
  const f = (v: number) => fmtInt(Math.round(v));

  const applyPreset = () => {
    setSymbol('RC');
    setRole('seller');
    setQty('5');
    setUnit('ton');
    setMonth(monthPlus(4));
    setUseManual(false);
    setStep(1);
  };

  const canNext = step === 1 || (step === 2 && qtyKg > 0 && !!month) || (step === 3 && Number.isFinite(entryVndKg)) || step === 4;

  return (
    <div className="space-y-5 max-w-3xl">
      <SectionHeader
        level={2}
        title={t('hd.title')}
        subtitle={t('hd.intro')}
        actions={
          <button type="button" className="text-xs underline text-[var(--accent-text)]" onClick={applyPreset}>
            {t('hd.preset')}
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-[var(--muted)]">{t('hd.step', { n: step })}</span>
      </div>

      {step === 1 && (
        <section className="space-y-4">
          <h3 className="text-lg text-[var(--text-strong)]">{t('hd.s1.title')}</h3>
          <label className="block space-y-1">
            <span className="text-sm text-[var(--muted)]">{t('hd.s1.crop')}</span>
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3 text-lg text-[var(--text)] font-mono focus:outline-none focus:border-[var(--accent)]"
            >
              {CROPS.map((c) => (
                <option key={c.symbol} value={c.symbol}>
                  {c.vi} ({c.symbol})
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-[var(--faint)]">{t('hd.s1.missing')}</p>
          <div className="space-y-2" role="radiogroup" aria-label={t('hd.s1.role')}>
            {(['seller', 'buyer'] as const).map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={role === r}
                onClick={() => setRole(r)}
                className={`w-full text-left rounded-lg border p-4 ${role === r ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--border)]'}`}
              >
                <div className="text-base text-[var(--text-strong)]">{t(r === 'seller' ? 'hd.s1.seller' : 'hd.s1.buyer')}</div>
                <div className="text-sm text-[var(--muted)]">{t(r === 'seller' ? 'hd.s1.sellerNote' : 'hd.s1.buyerNote')}</div>
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4">
          <h3 className="text-lg text-[var(--text-strong)]">{t('hd.s2.title')}</h3>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-sm text-[var(--muted)]">{t('hd.s2.qty')}</span>
              <input
                inputMode="decimal"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3 text-lg text-[var(--text)] font-mono focus:outline-none focus:border-[var(--accent)]"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-[var(--muted)]">{t('hd.s2.unit')}</span>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as 'ton' | 'kg')}
                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3 text-lg text-[var(--text)] font-mono focus:outline-none focus:border-[var(--accent)]"
              >
                <option value="ton">{t('hd.s2.ton')}</option>
                <option value="kg">{t('hd.s2.kg')}</option>
              </select>
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-sm text-[var(--muted)]">{t('hd.s2.month')}</span>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3 text-lg text-[var(--text)] font-mono focus:outline-none focus:border-[var(--accent)]"
            />
          </label>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-4 text-sm text-[var(--text)]">
          <h3 className="text-lg text-[var(--text-strong)]">{t('hd.s3.title')}</h3>

          <Card className="space-y-2">
            <div className="text-[var(--muted)]">{t('hd.s3.ref')} ({crop.symbol})</div>
            {quoteOk ? (
              <div className="text-lg font-mono text-[var(--text-strong)]">
                {quote?.price} {quote?.unit}
              </div>
            ) : (
              <p className="text-[var(--warning)]">{t('hd.s3.noPrice')}</p>
            )}
            <div className="text-xs text-[var(--faint)]">
              {t('hd.s3.source', { source: quote?.source ?? '—', status: quote?.status ?? t('hd.status.none') })}
            </div>
            {quoteOk && (
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={useManual} onChange={(e) => setUseManual(e.target.checked)} />
                {t('hd.s3.useManual')}
              </label>
            )}
            {(useManual || !quoteOk) && (
              <label className="block space-y-1">
                <span className="text-xs text-[var(--muted)]">{t('hd.s3.manual', { unit: instrument?.specification.quotationUnit ?? '' })}</span>
                <input
                  inputMode="decimal"
                  value={manualPrice}
                  onChange={(e) => setManualPrice(e.target.value)}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3 text-lg text-[var(--text)] font-mono focus:outline-none focus:border-[var(--accent)]"
                />
              </label>
            )}
          </Card>

          <label className="block space-y-1">
            <span className="text-[var(--muted)]">{t('hd.s3.fx')}</span>
            <input
              inputMode="decimal"
              value={fx}
              onChange={(e) => setFx(e.target.value)}
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3 text-lg text-[var(--text)] font-mono focus:outline-none focus:border-[var(--accent)]"
            />
            <span className="text-xs text-[var(--faint)]">{fxFromVcb ? t('hd.s3.fxSrc', { rate: fx }) : t('hd.s3.fxNone')}</span>
          </label>

          {Number.isFinite(entryVndKg) && (
            <Card className="space-y-1">
              <div className="text-[var(--muted)]">{t('hd.s3.vnd')}</div>
              <div className="text-xl font-mono text-[var(--text-strong)]">
                {f(entryVndKg)} {d}/kg
              </div>
              <div className="text-xs text-[var(--faint)]">
                {t('hd.s3.vndFormula', {
                  formula: `${priceQuoted} (${instrument?.specification.quotationUnit ?? crop.quoteUnit}) → USD/kg × ${fx} = ${f(entryVndKg)} ${d}/kg`,
                })}
              </div>
            </Card>
          )}

          <Card className="space-y-1">
            <div className="text-[var(--muted)]">{t('hd.s3.contracts')}</div>
            <div className="text-xl font-mono text-[var(--text-strong)]">{plan.contracts}</div>
            <div className="text-xs text-[var(--faint)]">
              {t('hd.s3.contractsFormula', { qty: f(qtyKg), size: f(crop.contractKg), raw: rawContracts.toFixed(2), n: plan.contracts })}
            </div>
            {plan.contracts === 0 && <p className="text-[var(--warning)]">{t('hd.s3.zero')}</p>}
            {plan.leftoverKg > 0 && plan.contracts > 0 && <p className="text-[var(--warning)]">{t('hd.s3.leftover', { kg: f(plan.leftoverKg) })}</p>}
            {plan.leftoverKg < 0 && <p className="text-[var(--warning)]">{t('hd.s3.over', { kg: f(-plan.leftoverKg) })}</p>}
          </Card>

          <Card className="space-y-1">
            <div className="text-[var(--muted)]">{t('hd.s3.month')}</div>
            <div className="text-lg font-mono text-[var(--text-strong)]">{suggested ?? '—'}</div>
            <div className="text-xs text-[var(--faint)]">{suggested ? t('hd.s3.monthNote') : t('hd.s3.monthNone')}</div>
          </Card>

          <Card className="space-y-2">
            <div className="text-[var(--muted)]">{t('hd.s3.margin')}</div>
            <label className="block space-y-1">
              <span className="text-xs">{t('hd.s3.marginPct')}</span>
              <input
                inputMode="decimal"
                value={marginPct}
                onChange={(e) => setMarginPct(e.target.value)}
                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3 text-lg text-[var(--text)] font-mono focus:outline-none focus:border-[var(--accent)]"
              />
            </label>
            {Number.isFinite(marginAmt) && (
              <div className="text-xl font-mono text-[var(--text-strong)]">
                ≈ {f(marginAmt)} {d}
              </div>
            )}
            <div className="text-xs text-[var(--faint)]">{t('hd.s3.marginNote')}</div>
          </Card>

          <Card className="space-y-2">
            <div className="text-[var(--muted)]">{t('hd.s3.basis')}</div>
            <label className="block space-y-1">
              <span className="text-xs">{t('hd.s3.basisLocal')}</span>
              <input
                inputMode="decimal"
                value={localPrice}
                onChange={(e) => setLocalPrice(e.target.value)}
                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3 text-lg text-[var(--text)] font-mono focus:outline-none focus:border-[var(--accent)]"
              />
            </label>
            {localNum > 0 && Number.isFinite(entryVndKg) && <div className="font-mono text-[var(--text-strong)]">{t('hd.s3.basisIs', { v: f(basis) })}</div>}
            <div className="text-xs text-[var(--faint)]">{t('hd.s3.basisNote')}</div>
          </Card>
        </section>
      )}

      {step === 4 && (
        <section className="space-y-4 text-sm text-[var(--text)]">
          <h3 className="text-lg text-[var(--text-strong)]">{t('hd.s4.title')}</h3>
          <label className="block space-y-1">
            <span className="text-[var(--muted)]">{t('hd.s4.basisChg')}</span>
            <input
              inputMode="decimal"
              value={basisChg}
              onChange={(e) => setBasisChg(e.target.value)}
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3 text-lg text-[var(--text)] font-mono focus:outline-none focus:border-[var(--accent)]"
            />
            <span className="text-xs text-[var(--faint)]">{t('hd.s4.basisChgNote')}</span>
          </label>
          <div className="text-xs text-[var(--faint)]">{t(role === 'seller' ? 'hd.s4.seller' : 'hd.s4.buyer')}</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[var(--faint)]">
                <tr>
                  <th className="text-left p-2">{t('hd.s4.col.change')}</th>
                  <th className="text-right p-2">{t('hd.s4.col.pnl')}</th>
                  <th className="text-right p-2">{t('hd.s4.col.without')}</th>
                  <th className="text-right p-2">{t('hd.s4.col.with')}</th>
                  <th className="text-right p-2">{t('hd.s4.col.cash')}</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {scenarios.map((s) => (
                  <tr key={s.changePct} className="border-t border-[var(--border)]">
                    <td className="p-2">{s.changePct === 0 ? t('hd.s4.flat') : `${s.changePct > 0 ? '+' : ''}${s.changePct}%`}</td>
                    <td className={`p-2 text-right ${s.futuresPnl < 0 ? 'text-[var(--negative)]' : 'text-[var(--positive)]'}`}>{f(s.futuresPnl)}</td>
                    <td className="p-2 text-right">{f(s.withoutHedge)}</td>
                    <td className="p-2 text-right">{f(s.withHedge)}</td>
                    <td className="p-2 text-right">{s.extraCashNeeded > 0 ? f(s.extraCashNeeded) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <figure className="space-y-2" aria-label={t('hd.s4.chart')}>
            {scenarios.map((s) => (
              <div key={s.changePct} className="space-y-0.5">
                <div className="text-xs text-[var(--faint)]">{s.changePct === 0 ? t('hd.s4.flat') : `${s.changePct > 0 ? '+' : ''}${s.changePct}%`}</div>
                <div className="h-3 rounded bg-[var(--surface-2)]" style={{ width: `${Math.max(2, (Math.abs(s.withoutHedge) / maxBar) * 100)}%` }} />
                <div className="h-3 rounded bg-[var(--accent)]" style={{ width: `${Math.max(2, (Math.abs(s.withHedge) / maxBar) * 100)}%` }} />
              </div>
            ))}
            <figcaption className="text-xs text-[var(--faint)]">{t('hd.s4.chart')}</figcaption>
          </figure>
          {worst && worst.extraCashNeeded > 0 && (
            <Card tone="warning" className="space-y-1">
              <div className="font-medium text-[var(--warning)]">{t('hd.s4.callTitle')}</div>
              <p>{t(role === 'seller' ? 'hd.s4.callSeller' : 'hd.s4.callBuyer', { v: f(worst.extraCashNeeded) })}</p>
            </Card>
          )}
          <p className="text-xs text-[var(--faint)]">{t('hd.s4.note')}</p>
        </section>
      )}

      {step === 5 && (
        <section className="space-y-4 text-sm text-[var(--text)]">
          <h3 className="text-lg text-[var(--text-strong)]">{t('hd.s5.title')}</h3>
          <ul className="list-disc pl-5 space-y-2">
            {(['c1', 'c2', 'c3', 'c4', 'c5', 'c6'] as const).map((k) => (
              <li key={k}>{t(`hd.s5.${k}` as const)}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-3">
            <button type="button" className="px-5 py-3 rounded-lg text-base font-medium border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-2)]" onClick={() => setActiveModule('learn')}>
              {t('hd.s5.learn')}
            </button>
            <button type="button" className="px-5 py-3 rounded-lg text-base font-medium border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-2)]" onClick={() => setActiveModule('paper-trade')}>
              {t('hd.s5.paper')}
            </button>
            <button type="button" className="px-5 py-3 rounded-lg text-base font-medium border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-2)]" onClick={() => setStep(1)}>
              {t('hd.restart')}
            </button>
          </div>
        </section>
      )}

      <div className="flex gap-3">
        {step > 1 && (
          <button type="button" className="px-5 py-3 rounded-lg text-base font-medium border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-2)]" onClick={() => setStep(step - 1)}>
            {t('hd.back')}
          </button>
        )}
        {step < 5 && (
          <button
            type="button"
            className="px-5 py-3 rounded-lg text-base font-medium bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 disabled:opacity-40"
            disabled={!canNext}
            onClick={() => setStep(step + 1)}
          >
            {t('hd.next')}
          </button>
        )}
      </div>
    </div>
  );
}
