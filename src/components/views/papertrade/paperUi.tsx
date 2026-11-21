import { fmtInt } from '../../../i18n';

export const inputCls = 'w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-2 text-sm text-[var(--text-strong)]';
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

/** Equity curve as an inline SVG polyline (VND). Baseline = starting capital. */
export function EquityCurve({ points, baseline, label }: { points: { t: number; equityVnd: number }[]; baseline: number; label: string }) {
  const W = 600;
  const H = 160;
  const pad = 8;
  const ys = points.map((p) => p.equityVnd).concat(baseline);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const span = hi - lo || 1;
  const x = (i: number) => pad + (points.length <= 1 ? 0 : (i / (points.length - 1)) * (W - 2 * pad));
  const y = (v: number) => H - pad - ((v - lo) / span) * (H - 2 * pad);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.equityVnd).toFixed(1)}`).join(' ');
  const last = points[points.length - 1]?.equityVnd ?? baseline;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-40" role="img" aria-label={label}>
      <line x1={pad} x2={W - pad} y1={y(baseline)} y2={y(baseline)} stroke="#263244" strokeDasharray="4 4" />
      {points.length > 1 ? (
        <path d={d} fill="none" stroke={last >= baseline ? 'var(--positive)' : 'var(--negative)'} strokeWidth={2} />
      ) : (
        <circle cx={x(0)} cy={y(last)} r={3} fill="#6366F1" />
      )}
      <text x={pad} y={12} fontSize={10} fill="#9CA3AF">{fmtInt(hi)}</text>
      <text x={pad} y={H - 2} fontSize={10} fill="#9CA3AF">{fmtInt(lo)}</text>
    </svg>
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
      <line x1={mid} x2={mid} y1={0} y2={H} stroke="#263244" />
      {items.map((it, i) => {
        const w = Math.abs(it.value) * scale;
        const yy = i * rowH + 4;
        return (
          <g key={it.key}>
            <text x={4} y={yy + 13} fontSize={11} fill="#E5E7EB">{it.label.length > 28 ? `${it.label.slice(0, 27)}…` : it.label}</text>
            <rect x={it.value >= 0 ? mid : mid - w} y={yy} width={Math.max(1, w)} height={18} rx={2} fill={it.value >= 0 ? 'var(--positive)' : 'var(--negative)'} />
            <text x={it.value >= 0 ? mid + w + 4 : mid - w - 4} y={yy + 13} fontSize={10} fill="#9CA3AF" textAnchor={it.value >= 0 ? 'start' : 'end'} >{fmtInt(it.value)}</text>
          </g>
        );
      })}
    </svg>
  );
}
