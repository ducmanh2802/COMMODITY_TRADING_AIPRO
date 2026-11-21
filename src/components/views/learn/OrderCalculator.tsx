import { useEffect, useMemo, useState } from 'react';
import type { InstrumentDefinition } from '../../../shared/types/instrument';
import { calcOrder, rRatioBand, type Direction, type OrderField } from '../../../shared/calc/orderCalc';
import { useT } from '../../../i18n';

const fld =
  'w-full bg-[var(--bg)] border rounded-md px-2.5 py-2 text-sm text-[var(--text-strong)] font-mono focus:outline-none focus:border-[var(--accent)]';
const fmt = (v: number, d = 0) => v.toLocaleString('vi-VN', { maximumFractionDigits: d });
const signed = (v: number, d = 0) => `${v > 0 ? '+' : ''}${fmt(v, d)}`;
const tone = (v: number) => (v > 0 ? 'text-[var(--positive)]' : v < 0 ? 'text-[var(--negative)]' : 'text-[var(--text-strong)]');

/** USD/VND from the app's macro FX endpoint (Vietcombank posted, unofficial). null when unavailable. */
function useUsdVnd(): number | null {
  const [rate, setRate] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/macro/fx');
        if (!res.ok) return;
        const json = (await res.json()) as { items?: { id: string; value: number | null; status: string }[] };
        const it = json.items?.find((i) => i.id === 'USDVND_VCB');
        if (alive && it && typeof it.value === 'number' && it.value > 0 && it.status !== 'UNAVAILABLE' && it.status !== 'INVALID') setRate(it.value);
      } catch {
        /* user types it */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return rate;
}

function Field({ id, label, value, onChange, error, hint }: { id: string; label: string; value: string; onChange: (v: string) => void; error?: string; hint?: string }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs text-[var(--text)]/70">{label}</label>
      <input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        className={`${fld} ${error ? 'border-[var(--negative)]' : 'border-[var(--border)]'}`}
      />
      {error && <p className="text-[11px] text-[var(--negative)]" role="alert">{error}</p>}
      {!error && hint && <p className="text-[11px] text-[var(--text)]/50">{hint}</p>}
    </div>
  );
}

function Tile({ label, value, sub, valueClass = 'text-[var(--text-strong)]' }: { label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3">
      <p className="text-[11px] text-[var(--text)]/60">{label}</p>
      <p className={`text-lg sm:text-xl font-semibold font-mono break-words ${valueClass}`}>{value}</p>
      {sub && <p className="text-[11px] text-[var(--text)]/55 mt-0.5">{sub}</p>}
    </div>
  );
}

const num = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(/\s/g, '').replace(',', '.')));

export function OrderCalculator({
  instruments,
  initialInstrumentId,
  initialEntry,
}: {
  instruments: InstrumentDefinition[];
  initialInstrumentId?: string;
  initialEntry?: number | null;
}) {
  const t = useT();
  const [instId, setInstId] = useState(initialInstrumentId ?? 'CBOT:ZC');
  const [dir, setDir] = useState<Direction>('LONG');
  const [capital, setCapital] = useState('1000000000');
  const [fx, setFx] = useState('');
  const [fxTouched, setFxTouched] = useState(false);
  const [risk, setRisk] = useState('1');
  const [entry, setEntry] = useState(initialEntry != null && initialEntry > 0 ? String(initialEntry) : '');
  const [stop, setStop] = useState('');
  const [target, setTarget] = useState('');
  const [cost, setCost] = useState('10');
  const [margin, setMargin] = useState('');

  const auto = useUsdVnd();
  useEffect(() => {
    if (auto && !fxTouched) setFx(String(Math.round(auto)));
  }, [auto, fxTouched]);
  useEffect(() => {
    if (instruments.length && !instruments.some((i) => i.id === instId)) setInstId(instruments[0].id);
  }, [instruments, instId]);

  const inst = instruments.find((i) => i.id === instId) ?? null;
  const spec = inst?.specification ?? null;
  const marginNum = margin.trim() === '' ? null : num(margin);
  const r = useMemo(
    () => calcOrder({ spec, direction: dir, capitalVnd: num(capital), usdVnd: num(fx), riskPct: num(risk), entry: num(entry), stop: num(stop), target: num(target), costUsd: num(cost), marginUsd: marginNum }),
    [spec, dir, capital, fx, risk, entry, stop, target, cost, marginNum],
  );
  // Only show errors for fields the user has filled (or that are direction conflicts), never on an untouched form.
  const err = (k: OrderField): string | undefined => {
    if (r.ok) return undefined;
    const raw = { entry, stop, target }[k as 'entry' | 'stop' | 'target'];
    if ((k === 'entry' || k === 'stop' || k === 'target') && raw.trim() === '') return undefined;
    return r.errors[k];
  };

  if (!instruments.length) {
    return <p className="text-xs text-[var(--warning)] bg-[var(--warning)]/10 border border-[var(--warning)]/30 rounded-md p-2">{t('oc.noInstruments')}</p>;
  }

  const dirBtn = (d: Direction, label: string) => (
    <button
      type="button"
      aria-pressed={dir === d}
      onClick={() => setDir(d)}
      className={`py-2 rounded-md border text-sm font-semibold ${dir === d ? 'bg-[var(--accent)] border-[var(--accent)] text-[var(--bg)]' : 'border-[var(--border)] text-[var(--text)] bg-[var(--surface)]'}`}
    >
      {label}
    </button>
  );

  const band = r.ok ? rRatioBand(r.rRatio) : null;
  const bandCls = band === 'good' ? 'text-[var(--positive)]' : band === 'warn' ? 'text-[var(--warning)]' : 'text-[var(--negative)]';

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-[var(--text)]/60">{t('oc.note')}</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1 sm:col-span-2">
          <label htmlFor="oc-inst" className="block text-xs text-[var(--text)]/70">{t('oc.instrument')}</label>
          <select id="oc-inst" value={instId} onChange={(e) => setInstId(e.target.value)} className={`${fld} border-[var(--border)]`}>
            {instruments.map((i) => (
              <option key={i.id} value={i.id}>{i.productName} · {i.exchangeSymbol}</option>
            ))}
          </select>
          {r.ok ? (
            <p className="text-[11px] text-[var(--text)]/50">{t('oc.unitHint', { unit: spec?.quotationUnit ?? '', usd: fmt(r.usdPerUnit, 4) })}</p>
          ) : (
            r.errors.spec && <p className="text-[11px] text-[var(--warning)]" role="alert">{r.errors.spec}</p>
          )}
        </div>
        <div className="sm:col-span-2 space-y-1">
          <span className="block text-xs text-[var(--text)]/70">{t('oc.direction')}</span>
          <div className="grid grid-cols-2 gap-2">
            {dirBtn('LONG', t('oc.long'))}
            {dirBtn('SHORT', t('oc.short'))}
          </div>
        </div>
        <Field id="oc-cap" label={t('oc.capital')} value={capital} onChange={setCapital} error={err('capital')} />
        <Field id="oc-fx" label={t('oc.fx')} value={fx} onChange={(v) => { setFx(v); setFxTouched(true); }} error={err('fx')} hint={auto && !fxTouched ? t('oc.fxAuto') : !auto ? t('oc.fxManual') : undefined} />
        <Field id="oc-risk" label={t('oc.risk')} value={risk} onChange={setRisk} error={err('risk')} />
        <Field id="oc-cost" label={t('oc.cost')} value={cost} onChange={setCost} error={err('cost')} />
        <Field id="oc-entry" label={t('oc.entry')} value={entry} onChange={setEntry} error={err('entry')} hint={initialEntry ? t('oc.res.fromPrice') : undefined} />
        <Field id="oc-stop" label={t('oc.stop')} value={stop} onChange={setStop} error={err('stop')} />
        <Field id="oc-target" label={t('oc.target')} value={target} onChange={setTarget} error={err('target')} />
        <Field id="oc-margin" label={t('oc.margin')} value={margin} onChange={setMargin} error={err('margin')} hint={t('oc.marginHint')} />
      </div>

      {!r.ok ? (
        <p className="text-xs text-[var(--text)]/60 bg-[var(--surface-2)] border border-[var(--border)] rounded-md p-3">{t('oc.res.fixErrors')}</p>
      ) : (
        <div className="space-y-3" aria-live="polite">
          <div className={`rounded-lg border p-4 ${r.tooSmall ? 'border-[var(--warning)] bg-[var(--warning)]/10' : 'border-[var(--accent)] bg-[var(--surface-2)]'}`}>
            <p className="text-xs text-[var(--text)]/70">{t('oc.res.maxContracts')}</p>
            <p className={`text-4xl font-bold font-mono ${r.tooSmall ? 'text-[var(--warning)]' : 'text-[var(--accent-text)]'}`}>
              {fmt(r.maxContracts)} <span className="text-base font-normal text-[var(--text)]/60">{t('oc.res.contractsUnit')}</span>
            </p>
            {r.tooSmall && <p className="mt-2 text-sm text-[var(--warning)]" role="alert">{t('oc.res.zero')}</p>}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <Tile label={t('oc.res.budget')} value={`${fmt(r.riskBudgetUsd, 2)} USD`} sub={`≈ ${fmt(r.riskBudgetVnd)} VND`} />
            <Tile
              label={t('oc.res.riskPer')}
              value={`${fmt(r.riskPerContractUsd, 2)} USD`}
              sub={t('oc.res.riskPerNote', { dist: fmt(r.stopDistance, 4), ticks: fmt(r.stopTicks, 2), loss: fmt(r.lossPerContractUsd, 2), cost: fmt(num(cost), 2) })}
            />
            <Tile label={t('oc.res.pnlStop')} value={`${signed(r.pnlAtStopUsd, 2)} USD`} sub={`${signed(r.pnlAtStopVnd)} VND`} valueClass={tone(r.pnlAtStopUsd)} />
            <Tile label={t('oc.res.pnlTarget')} value={`${signed(r.pnlAtTargetUsd, 2)} USD`} sub={`${signed(r.pnlAtTargetVnd)} VND`} valueClass={tone(r.pnlAtTargetUsd)} />
            <Tile
              label={t('oc.res.r')}
              value={`${fmt(r.rRatio, 2)} : 1`}
              sub={band === 'good' ? t('oc.res.rGood') : t('oc.res.rWarn')}
              valueClass={bandCls}
            />
            <Tile label={t('oc.res.notional')} value={`${fmt(r.notionalUsd)} USD`} sub={`${t('oc.res.leverage', { x: fmt(r.leverage, 2) })} · ≈ ${fmt(r.notionalVnd)} VND`} />
            {r.marginUsedPct !== null && r.marginUsedUsd !== null && (
              <Tile label={t('oc.res.marginUsed')} value={`${fmt(r.marginUsedPct, 1)}%`} sub={t('oc.res.marginUsedNote', { pct: fmt(r.marginUsedPct, 1), usd: fmt(r.marginUsedUsd) })} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
