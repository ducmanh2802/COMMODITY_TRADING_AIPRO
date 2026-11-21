import { useState } from 'react';
import { ChartTooltip, useChartTooltip } from './ChartTooltip';

/** Stat-tile sparkline: 2px line in series-1, end dot, hover crosshair + tooltip (nearest point). */
export function Sparkline({
  points,
  format = (v) => String(v),
  className = 'h-8',
}: {
  points: { label?: string; value: number }[];
  format?: (v: number) => string;
  className?: string;
}) {
  const { wrapRef, tip, show, hide } = useChartTooltip();
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return null;
  const W = 120;
  const H = 32;
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals);
  const span = Math.max(...vals) - min || 1;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => H - 3 - ((v - min) / span) * (H - 6);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const active = hover ?? points.length - 1;
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (points.length - 1));
    setHover(i);
    show(e, points[i].label, [{ label: '', value: format(points[i].value), color: 'var(--series-1)' }]);
  };
  return (
    <div ref={wrapRef} className={`relative ${className}`} onPointerMove={onMove} onPointerLeave={() => { setHover(null); hide(); }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full text-[var(--series-1)]" preserveAspectRatio="none" aria-hidden="true">
        <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} stroke="var(--chart-crosshair)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
      </svg>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--surface)] bg-[var(--series-1)] box-content"
        style={{ left: `${(x(active) / W) * 100}%`, top: `${(y(points[active].value) / H) * 100}%` }}
      />
      <ChartTooltip tip={tip} />
    </div>
  );
}
