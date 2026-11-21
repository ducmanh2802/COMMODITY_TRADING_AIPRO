import { useState } from 'react';
import { ChartTooltip, useChartTooltip } from './ChartTooltip';

export interface EquityPoint {
  /** Tooltip title (date / trade #). */
  label?: string;
  v: number;
}

/**
 * Single-series line over a baseline (equity curve): 2px series-1 line, solid hairline baseline,
 * optional shaded drawdown span, hover crosshair + tooltip, min/max labels in text tokens.
 */
export function EquityChart({
  points,
  baseline,
  ariaLabel,
  format,
  baselineLabel,
  drawdown,
  className = 'h-40',
}: {
  points: EquityPoint[];
  baseline: number;
  ariaLabel: string;
  format: (v: number) => string;
  baselineLabel?: string;
  /** Peak/trough indices of the max drawdown to shade. */
  drawdown?: { peakIndex: number; troughIndex: number } | null;
  className?: string;
}) {
  const { wrapRef, tip, show, hide } = useChartTooltip();
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const H = 170;
  const padX = 8;
  const padT = 14;
  const padB = 14;
  const ys = points.map((p) => p.v).concat(baseline);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const span = hi - lo || 1;
  const x = (i: number) => padX + (points.length <= 1 ? 0 : (i / (points.length - 1)) * (W - 2 * padX));
  const y = (v: number) => H - padB - ((v - lo) / span) * (H - padT - padB);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (points.length === 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(Math.min(1, Math.max(0, ((e.clientX - r.left) / r.width) * (W / (W - 2 * padX)) - padX / (W - 2 * padX))) * (points.length - 1));
    setHover(i);
    show(e, points[i].label, [{ label: '', value: format(points[i].v), color: 'var(--series-1)' }]);
  };
  const end = points.length - 1;
  const active = hover ?? end;
  return (
    <div ref={wrapRef} className={`relative ${className}`} onPointerMove={onMove} onPointerLeave={() => { setHover(null); hide(); }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="none" role="img" aria-label={ariaLabel}>
        <line x1={padX} x2={W - padX} y1={y(baseline)} y2={y(baseline)} stroke="var(--chart-axis)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {drawdown && points[drawdown.peakIndex] && points[drawdown.troughIndex] && (
          <rect x={x(drawdown.peakIndex)} y={padT} width={Math.max(2, x(drawdown.troughIndex) - x(drawdown.peakIndex))} height={H - padT - padB} fill="var(--negative)" opacity={0.12} />
        )}
        {points.length > 1 && <path d={d} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} stroke="var(--chart-crosshair)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
      </svg>
      {points.length > 0 && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute box-content h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--surface)] bg-[var(--series-1)]"
          style={{ left: `${(x(active) / W) * 100}%`, top: `${(y(points[active].v) / H) * 100}%` }}
        />
      )}
      <span className="pointer-events-none absolute left-1 top-0 text-[10px] tabular-nums text-[var(--muted)]">{format(hi)}</span>
      <span className="pointer-events-none absolute bottom-0 left-1 text-[10px] tabular-nums text-[var(--muted)]">{format(lo)}</span>
      {baselineLabel && (
        <span className="pointer-events-none absolute right-1 text-[10px] text-[var(--muted)]" style={{ top: `calc(${(y(baseline) / H) * 100}% - 14px)` }}>
          {baselineLabel}
        </span>
      )}
      <ChartTooltip tip={tip} />
    </div>
  );
}
