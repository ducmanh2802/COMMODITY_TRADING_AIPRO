import { useState } from 'react';
import { useT } from '../../../../i18n';
import { simulateMarginCall, type MarginStatus } from './marginCall';

const inputClass = 'w-full min-h-[40px] rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 text-sm text-[var(--text-strong)]';
const num = (s: string) => (s.trim() === '' ? Number.NaN : Number(s));
const usd = (v: number) => Math.round(v).toLocaleString('vi-VN');
const STATUS_COLOR: Record<MarginStatus, string> = { ok: 'var(--positive)', call: 'var(--warning)', liquidate: 'var(--negative)' };

function Field({ label, value, onChange, id }: { label: string; value: string; onChange: (v: string) => void; id: string }) {
  return (
    <label className="block text-xs space-y-1" htmlFor={id}>
      <span className="text-[var(--muted)]">{label}</span>
      <input id={id} data-testid={id} className={inputClass} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** Interactive margin-call / forced-liquidation simulator. Illustrative numbers only. */
export function MarginCallSim() {
  const t = useT();
  const [equity, setEquity] = useState('3000');
  const [contracts, setContracts] = useState('2');
  const [initial, setInitial] = useState('1500');
  const [maint, setMaint] = useState('1200');
  const [tickValue, setTickValue] = useState('12.5');
  const [liq, setLiq] = useState('50');
  const [ticks, setTicks] = useState(20);

  const r = simulateMarginCall({
    equity: num(equity),
    contracts: num(contracts),
    initialPerContract: num(initial),
    maintPerContract: num(maint),
    tickValue: num(tickValue),
    adverseTicks: ticks,
    liquidationShare: num(liq) / 100,
  });

  const W = 320;
  const H = 120;
  let chart = null;
  if (r.ok) {
    const eq = r.path.map((p) => p.equity);
    const hi = Math.max(...eq, r.maintReq) * 1.05;
    const lo = Math.min(...eq, r.liquidationLevel, 0);
    const span = hi - lo || 1;
    const y = (v: number) => 6 + ((hi - v) * (H - 12)) / span;
    const x = (i: number) => 6 + (i * (W - 12)) / Math.max(1, r.path.length - 1);
    chart = (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-md" role="img" aria-label={t('mcs.chartLabel')}>
        <line x1="6" x2={W - 6} y1={y(r.maintReq)} y2={y(r.maintReq)} stroke="var(--warning)" strokeDasharray="4 3" strokeWidth="1.5" />
        <line x1="6" x2={W - 6} y1={y(r.liquidationLevel)} y2={y(r.liquidationLevel)} stroke="var(--negative)" strokeDasharray="4 3" strokeWidth="1.5" />
        <polyline points={r.path.map((p, i) => `${x(i)},${y(p.equity)}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
        <circle cx={x(r.path.length - 1)} cy={y(r.finalEquity)} r="4" fill={STATUS_COLOR[r.finalStatus]} stroke="var(--surface)" strokeWidth="2" />
      </svg>
    );
  }

  return (
    <div className="space-y-3" data-testid="margin-sim">
      <p className="text-xs font-semibold text-[var(--text-strong)]">{t('mcs.title')}</p>
      <p className="text-xs text-[var(--warning)]">{t('mcs.note')}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Field id="mcs-equity" label={t('mcs.equity')} value={equity} onChange={setEquity} />
        <Field id="mcs-contracts" label={t('mcs.contracts')} value={contracts} onChange={setContracts} />
        <Field id="mcs-initial" label={t('mcs.initial')} value={initial} onChange={setInitial} />
        <Field id="mcs-maint" label={t('mcs.maint')} value={maint} onChange={setMaint} />
        <Field id="mcs-tick" label={t('mcs.tickValue')} value={tickValue} onChange={setTickValue} />
        <Field id="mcs-liq" label={t('mcs.liqShare')} value={liq} onChange={setLiq} />
      </div>
      <label className="block text-xs space-y-1" htmlFor="mcs-ticks">
        <span className="text-[var(--muted)]">{t('mcs.ticks')}: <b className="text-[var(--text-strong)]">{ticks}</b></span>
        <input id="mcs-ticks" data-testid="mcs-ticks" type="range" min={0} max={150} step={1} value={ticks} onChange={(e) => setTicks(Number(e.target.value))} className="w-full min-h-[40px] accent-[var(--accent)]" />
      </label>
      {r.ok ? (
        <div className="space-y-2" aria-live="polite">
          <p className="text-[11px] text-[var(--muted)]">{t('mcs.reqs', { initial: usd(r.initialReq), maint: usd(r.maintReq), loss: usd(r.lossPerTick) })}</p>
          {chart}
          <div className="flex flex-wrap gap-3 text-[11px] text-[var(--muted)]">
            <span><span style={{ color: 'var(--warning)' }}>--</span> {t('mcs.legendMaint')}</span>
            <span><span style={{ color: 'var(--negative)' }}>--</span> {t('mcs.legendLiq')}</span>
          </div>
          <p className="text-xs text-[var(--text)]">{t('mcs.equityNow', { n: ticks, v: usd(r.finalEquity) })}</p>
          <p className="text-xs" data-testid="mcs-status" data-status={r.finalStatus} style={{ color: STATUS_COLOR[r.finalStatus] }}>
            {r.finalStatus === 'ok' && t('mcs.statusOk')}
            {r.finalStatus === 'call' && t('mcs.statusCall', { topUp: usd(r.topUp) })}
            {r.finalStatus === 'liquidate' && t('mcs.statusLiq', { loss: usd(Math.max(0, num(equity) - Math.max(r.finalEquity, 0))) })}
          </p>
          <p className="text-xs text-[var(--text)]">{r.callTick === null ? t('mcs.noCall') : t('mcs.callAt', { n: r.callTick })}</p>
          <p className="text-xs text-[var(--text)]">{r.liquidationTick === null ? t('mcs.noLiq') : t('mcs.liqAt', { n: r.liquidationTick })}</p>
        </div>
      ) : (
        <p className="text-xs text-[var(--warning)] bg-[var(--warning)]/10 border border-[var(--warning)]/30 rounded-md p-2">{r.reason}</p>
      )}
      <details className="text-xs text-[var(--text)]">
        <summary className="cursor-pointer min-h-[40px] flex items-center text-[var(--accent-text)]">{t('mcs.details')}</summary>
        <ul className="list-disc pl-4 space-y-1">
          {(['mcs.d1', 'mcs.d2', 'mcs.d3', 'mcs.d4', 'mcs.d5'] as const).map((k) => (
            <li key={k}>{t(k)}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
