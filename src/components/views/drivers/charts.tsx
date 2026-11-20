import type { DriverPart, DriverPartId } from '../../../shared/types/drivers';

const COLORS: Record<DriverPartId, string> = {
  group: 'var(--accent)',
  usd: 'var(--warning)',
  rates: 'var(--positive)',
  own: 'var(--muted)',
};
const f1 = (n: number) => n.toFixed(2);

/** Diverging stacked bar: positive contributions stack right of zero, negative left. Units: percentage points. */
export function AttributionBar({ parts, total, labels, ariaLabel }: { parts: DriverPart[]; total: number; labels: Record<DriverPartId, string>; ariaLabel: string }) {
  const W = 320;
  const pos = parts.filter((p) => p.pct > 0);
  const neg = parts.filter((p) => p.pct < 0);
  const posSum = pos.reduce((s, p) => s + p.pct, 0);
  const negSum = neg.reduce((s, p) => s + p.pct, 0);
  const span = Math.max(posSum - negSum, 1e-9);
  const x0 = (-negSum / span) * W;
  const rects: { p: DriverPart; x: number; w: number }[] = [];
  let cx = x0;
  for (const p of pos) {
    const w = (p.pct / span) * W;
    rects.push({ p, x: cx, w });
    cx += w;
  }
  cx = x0;
  for (const p of neg) {
    const w = (-p.pct / span) * W;
    cx -= w;
    rects.push({ p, x: cx, w });
  }
  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${W} 34`} className="w-full h-9" role="img" aria-label={ariaLabel}>
        {rects.map(({ p, x, w }) => (
          <rect key={p.id} x={x} y={4} width={Math.max(w, 0.5)} height={22} fill={COLORS[p.id]}>
            <title>{`${labels[p.id]}: ${f1(p.pct)} pp`}</title>
          </rect>
        ))}
        <line x1={x0} x2={x0} y1={0} y2={30} stroke="currentColor" strokeWidth="1" className="text-[var(--muted)]" />
        <text x={x0 + 3} y={33} fontSize="8" fill="currentColor" className="text-[var(--muted)]">
          {`Σ ${total > 0 ? '+' : ''}${f1(total)}%`}
        </text>
      </svg>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--muted)]">
        {parts.map((p) => (
          <li key={p.id} className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: COLORS[p.id] }} aria-hidden="true" />
            {labels[p.id]} <span className="tabular-nums">{p.pct > 0 ? '+' : ''}{f1(p.pct)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Last ~3 months of closes with the parametric 50%/80% cone extended 21 sessions. */
export function ConeChart({
  recent,
  path,
  ariaLabel,
}: {
  recent: { date: string; close: number }[];
  path: { d: number; lo50: number; hi50: number; lo80: number; hi80: number }[];
  ariaLabel: string;
}) {
  if (recent.length < 2 || path.length < 2) return null;
  const W = 360;
  const H = 130;
  const total = recent.length - 1 + (path.length - 1);
  const ys = [...recent.map((r) => r.close), ...path.flatMap((p) => [p.lo80, p.hi80])];
  const min = Math.min(...ys);
  const span = Math.max(...ys) - min || 1;
  const X = (i: number) => (i / total) * W;
  const Y = (v: number) => H - 6 - ((v - min) / span) * (H - 12);
  const base = recent.length - 1;
  const line = recent.map((r, i) => `${i === 0 ? 'M' : 'L'}${X(i).toFixed(1)},${Y(r.close).toFixed(1)}`).join(' ');
  const poly = (lo: 'lo50' | 'lo80', hi: 'hi50' | 'hi80') =>
    [...path.map((p) => `${X(base + p.d).toFixed(1)},${Y(p[hi]).toFixed(1)}`), ...[...path].reverse().map((p) => `${X(base + p.d).toFixed(1)},${Y(p[lo]).toFixed(1)}`)].join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-32 text-[var(--accent)]" role="img" aria-label={ariaLabel}>
      <polygon points={poly('lo80', 'hi80')} fill="currentColor" opacity="0.12" />
      <polygon points={poly('lo50', 'hi50')} fill="currentColor" opacity="0.22" />
      <line x1={X(base)} x2={X(base)} y1={0} y2={H} stroke="currentColor" strokeDasharray="3 3" opacity="0.4" />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

/** Per-year return bars (percent) for the coming calendar month; up years above the axis. */
export function SeasonBars({ samples, hitLabel }: { samples: { year: number; ret: number }[]; hitLabel: string }) {
  if (samples.length === 0) return null;
  const W = 320;
  const H = 90;
  const max = Math.max(...samples.map((s) => Math.abs(s.ret)), 0.01);
  const bw = W / samples.length;
  const mid = H / 2;
  return (
    <div className="space-y-1">
      <svg viewBox={`0 0 ${W} ${H + 12}`} className="w-full h-24" role="img" aria-label={hitLabel}>
        <line x1={0} x2={W} y1={mid} y2={mid} stroke="currentColor" className="text-[var(--muted)]" strokeWidth="0.5" />
        {samples.map((s, i) => {
          const h = (Math.abs(s.ret) / max) * (mid - 4);
          return (
            <g key={s.year}>
              <rect x={i * bw + 1} width={Math.max(bw - 2, 1)} y={s.ret >= 0 ? mid - h : mid} height={h} fill={s.ret >= 0 ? 'var(--positive)' : 'var(--negative)'}>
                <title>{`${s.year}: ${s.ret.toFixed(1)}%`}</title>
              </rect>
              <text x={i * bw + bw / 2} y={H + 9} fontSize="6" textAnchor="middle" fill="currentColor" className="text-[var(--faint)]">
                {String(s.year).slice(2)}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="text-xs text-[var(--text)]">{hitLabel}</p>
    </div>
  );
}
