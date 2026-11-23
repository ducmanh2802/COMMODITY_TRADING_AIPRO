import { useState } from 'react';
import { ChartTooltip, useChartTooltip } from './ChartTooltip';

export interface BandPoint {
  label: string;
  lo: number;
  mid: number;
  hi: number;
}

/**
 * Percentile fan: shaded lo..hi band (series-1 wash), 2px median line, solid baseline hairline,
 * hover crosshair + tooltip (P5 / P50 / P95), min/max labels in text tokens.
 */
export function BandChart({
  points,
  baseline,
  ariaLabel,
  format,
  seriesLabels,
  className = 'h-44',
}: {
  points: BandPoint[];
  baseline: number;
  ariaLabel: string;
  format: (v: number) => string;
  seriesLabels: { lo: string; mid: string; hi: string };
  className?: string;
}) {
  const { wrapRef, tip, show, hide } = useChartTooltip();
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return null;
  const W = 600;
  const H = 170;
  const padX = 8;
  const padT = 14;
  const padB = 14;
  const lo = Math.min(baseline, ...points.map((p) => p.lo));
  const hi = Math.max(baseline, ...points.map((p) => p.hi));
  const span = hi - lo || 1;
  const x = (i: number) => padX + (i / (points.length - 1)) * (W - 2 * padX);
  const y = (v: number) => H - padB - ((v - lo) / span) * (H - padT - padB);
  const upper = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.hi).toFixed(1)}`).join(' ');
  const lower = [...points].reverse().map((p, k) => `L${x(points.length - 1 - k).toFixed(1)},${y(p.lo).toFixed(1)}`).join(' ');
  const mid = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.mid).toFixed(1)}`).join(' ');
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const i = Math.round(frac * (points.length - 1));
    setHover(i);
    show(e, points[i].label, [
      { label: seriesLabels.hi, value: format(points[i].hi), color: 'var(--series-1)' },
      { label: seriesLabels.mid, value: format(points[i].mid), color: 'var(--series-1)' },
      { label: seriesLabels.lo, value: format(points[i].lo), color: 'var(--series-1)' },
    ]);
  };
  return (
    <div ref={wrapRef} className={`relative ${className}`} onPointerMove={onMove} onPointerLeave={() => { setHover(null); hide(); }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="none" role="img" aria-label={ariaLabel}>
        <line x1={padX} x2={W - padX} y1={y(baseline)} y2={y(baseline)} stroke="var(--chart-axis)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <path d={`${upper} ${lower} Z`} fill="var(--series-1)" opacity={0.16} />
        <path d={mid} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} stroke="var(--chart-crosshair)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
      </svg>
      <span className="pointer-events-none absolute left-1 top-0 text-[10px] tabular-nums text-[var(--muted)]">{format(hi)}</span>
      <span className="pointer-events-none absolute bottom-0 left-1 text-[10px] tabular-nums text-[var(--muted)]">{format(lo)}</span>
      <ChartTooltip tip={tip} />
    </div>
  );
}
