import { useState } from 'react';
import { ChartTooltip, useChartTooltip } from './ChartTooltip';

/** Minimal responsive line chart (SVG, no deps): 2px line, ~10% area wash, min/max labels, hover crosshair + tooltip. */
export interface LinePoint {
  /** ISO date or label. */
  t: string;
  v: number;
}

export interface LineChartProps {
  points: LinePoint[];
  ariaLabel: string;
  color?: string;
  height?: number;
  formatValue?: (v: number) => string;
  className?: string;
}

const W = 320;

export function LineChart({ points, ariaLabel, color = 'var(--series-1)', height = 160, formatValue = (v) => String(v), className = '' }: LineChartProps) {
  const { wrapRef, tip, show, hide } = useChartTooltip();
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return null;
  const vs = points.map((p) => p.v);
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const span = max - min || 1;
  const padY = 14;
  const H = height;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => padY + (1 - (v - min) / span) * (H - padY * 2);
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
  const area = `${line} L ${W} ${H} L 0 ${H} Z`;

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const i = Math.round(frac * (points.length - 1));
    setHover(i);
    show({ clientX: e.clientX, clientY: e.clientY }, points[i].t.slice(0, 10), [{ label: '', value: formatValue(points[i].v), color }]);
  };
  const leave = () => {
    setHover(null);
    hide();
  };

  return (
    <div className={className}>
      <div ref={wrapRef} className="relative" onPointerMove={onMove} onPointerLeave={leave} style={{ height }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={ariaLabel} preserveAspectRatio="none" style={{ height }}>
          <path d={area} fill={color} opacity="0.1" />
          <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {hover !== null && (
            <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} stroke="var(--chart-crosshair)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {hover !== null && (
          <span
           
            aria-hidden="true"
            className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--surface)]"
            style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(points[hover].v) / H) * 100}%`, background: color, boxSizing: 'content-box' }}
          />
        )}
        <ChartTooltip tip={tip} />
      </div>
      <div className="flex justify-between text-sm text-[var(--muted)] mt-1">
        <span>{formatValue(min)}</span>
        <span>{formatValue(max)}</span>
      </div>
    </div>
  );
}
