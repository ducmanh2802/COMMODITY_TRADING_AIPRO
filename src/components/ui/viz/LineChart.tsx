/** Minimal responsive line chart (SVG, no deps) with area fill and min/max labels. */
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

export function LineChart({ points, ariaLabel, color = '#A5B4FC', height = 160, formatValue = (v) => String(v), className = '' }: LineChartProps) {
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
  return (
    <div className={className}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={ariaLabel} preserveAspectRatio="none" style={{ height }}>
        <path d={area} fill={color} opacity="0.14" />
        <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-sm text-[var(--muted)] mt-1">
        <span>{formatValue(min)}</span>
        <span>{formatValue(max)}</span>
      </div>
    </div>
  );
}
