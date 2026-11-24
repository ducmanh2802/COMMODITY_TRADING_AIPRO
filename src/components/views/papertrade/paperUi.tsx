import { fmtInt } from '../../../i18n';
import { EquityChart } from '../../ui/viz/EquityChart';

export const inputCls = 'w-full bg-[var(--bg)] border border-[var(--border)] aria-[invalid=true]:border-[var(--negative)] rounded-md px-2.5 py-2 text-sm text-[var(--text-strong)]';
export const labelCls = 'block text-xs text-[var(--text)]/65 mb-1';
export const cardCls = 'bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4';
export const bigBtn = 'inline-flex items-center justify-center gap-1.5 px-5 py-3 text-sm font-semibold rounded-md disabled:opacity-40';

export const fmtVnd = (v: number | null | undefined): string => (v === null || v === undefined ? '—' : `${fmtInt(v)} đ`);
export const fmtPct = (v: number | null | undefined, digits = 1): string =>
  v === null || v === undefined ? '—' : `${v >= 0 ? '' : '-'}${Math.abs(v).toFixed(digits)}%`;
export const signedVnd = (v: number): string => `${v > 0 ? '+' : ''}${fmtInt(v)} đ`;
export const pnlColor = (v: number): string => (v > 0 ? 'text-[var(--positive)]' : v < 0 ? 'text-[var(--negative)]' : 'text-[var(--text)]/80');

export function Stat({ label, value, tone, hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    <div className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-2" title={hint}>
      <p className="text-[11px] text-[var(--text)]/55">{label}</p>
      <p className={`text-sm font-mono font-semibold mt-0.5 ${tone ?? 'text-[var(--text-strong)]'}`}>{value}</p>
    </div>
  );
}

/** Equity curve (VND). Baseline = starting capital. */
export function EquityCurve({ points, baseline, label }: { points: { t: number; equityVnd: number }[]; baseline: number; label: string }) {
  return (
    <EquityChart
      points={points.map((p, i) => ({ label: `#${i + 1}`, v: p.equityVnd }))}
      baseline={baseline}
      ariaLabel={label}
      format={fmtInt}
      className="h-40"
    />
  );
}

/** Horizontal-axis bar chart of one value per item (P&L per session / per commodity). */
export function PnlBars({ items, label }: { items: { key: string; label: string; value: number }[]; label: string }) {
  const W = 600;
  const rowH = 26;
  const H = Math.max(rowH, items.length * rowH) + 4;
  const max = Math.max(1, ...items.map((i) => Math.abs(i.value)));
  const mid = W * 0.62;
  const scale = (W * 0.26) / max;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} role="img" aria-label={label}>
      <line x1={mid} x2={mid} y1={0} y2={H} stroke="var(--chart-axis)" />
      {items.map((it, i) => {
        const w = Math.abs(it.value) * scale;
        const yy = i * rowH + 4;
        return (
          <g key={it.key}>
            <text x={4} y={yy + 13} fontSize={11} fill="var(--text)">{it.label.length > 28 ? `${it.label.slice(0, 27)}…` : it.label}</text>
            <rect x={it.value >= 0 ? mid : mid - w} y={yy} width={Math.max(1, w)} height={16} rx={4} fill={it.value >= 0 ? 'var(--positive)' : 'var(--negative)'} />
            <text x={it.value >= 0 ? mid + w + 4 : mid - w - 4} y={yy + 13} fontSize={10} fill="var(--muted)" textAnchor={it.value >= 0 ? 'start' : 'end'} >{fmtInt(it.value)}</text>
          </g>
        );
      })}
    </svg>
  );
}
