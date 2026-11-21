/** Minimal dependency-free SVG line chart (multi-series, numeric x). */
import { useState } from 'react';
import { fmtFixed } from '../../../i18n';
import { ChartLegend } from '../../ui/viz/ChartLegend';
import { ChartTable } from '../../ui/viz/ChartTable';
import { ChartTooltip, useChartTooltip } from '../../ui/viz/ChartTooltip';

export interface ChartPoint {
  x: number;
  y: number;
  label?: string;
}

export interface ChartSeries {
  name: string;
  color: string;
  points: ChartPoint[];
  dashed?: boolean;
  showDots?: boolean;
}

interface LineChartSvgProps {
  series: ChartSeries[];
  xLabel: string;
  yLabel: string;
  formatX?: (x: number) => string;
  formatY?: (y: number) => string;
  /** Horizontal reference lines (e.g. 0, ±2 for z-scores). */
  refLines?: { y: number; label?: string }[];
  height?: number;
  ariaLabel: string;
}

const W = 760;
const PAD = { l: 64, r: 16, t: 14, b: 40 };

function ticks(min: number, max: number, n: number): number[] {
  if (min === max) return [min];
  const step = (max - min) / (n - 1);
  return Array.from({ length: n }, (_, i) => min + i * step);
}

export function LineChartSvg({
  series,
  xLabel,
  yLabel,
  formatX = (x) => String(Math.round(x)),
  formatY = (y) => fmtFixed(y, 2),
  refLines = [],
  height = 280,
  ariaLabel,
}: LineChartSvgProps) {
  const { wrapRef, tip, show, hide } = useChartTooltip();
  const [hoverX, setHoverX] = useState<number | null>(null);
  const all = series.flatMap((s) => s.points);
  if (all.length === 0) return null;
  const H = height;
  let xMin = Math.min(...all.map((p) => p.x));
  let xMax = Math.max(...all.map((p) => p.x));
  let yMin = Math.min(...all.map((p) => p.y), ...refLines.map((r) => r.y));
  let yMax = Math.max(...all.map((p) => p.y), ...refLines.map((r) => r.y));
  if (xMin === xMax) {
    xMin -= 1;
    xMax += 1;
  }
  const yPad = (yMax - yMin) * 0.08 || Math.abs(yMax) * 0.05 || 1;
  yMin -= yPad;
  yMax += yPad;

  const sx = (x: number) => PAD.l + ((x - xMin) / (xMax - xMin)) * (W - PAD.l - PAD.r);
  const sy = (y: number) => PAD.t + (1 - (y - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);

  const xs = [...new Set(all.map((p) => p.x))].sort((a, b) => a - b);
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / r.width) * W;
    let best = xs[0];
    for (const x of xs) if (Math.abs(sx(x) - vx) < Math.abs(sx(best) - vx)) best = x;
    setHoverX(best);
    const rows = series.flatMap((s) => {
      const p = s.points.find((q) => q.x === best);
      return p ? [{ label: s.name, value: formatY(p.y), color: s.color }] : [];
    });
    const lbl = series.flatMap((s) => s.points.filter((q) => q.x === best && q.label).map((q) => q.label as string))[0];
    show(e, `${lbl ? `${lbl} · ` : ''}${formatX(best)}`, rows);
  };
  return (
    <div className="w-full overflow-x-auto">
      <div ref={wrapRef} className="relative min-w-[520px]">
      <svg onPointerMove={onMove} onPointerLeave={() => { setHoverX(null); hide(); }} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={ariaLabel}>
        {ticks(yMin, yMax, 5).map((t) => (
          <g key={`y${t}`}>
            <line x1={PAD.l} x2={W - PAD.r} y1={sy(t)} y2={sy(t)} stroke="var(--chart-grid)" strokeWidth={1} />
            <text x={PAD.l - 6} y={sy(t) + 3} textAnchor="end" fontSize={10} fill="var(--muted)" fontFamily="monospace">
              {formatY(t)}
            </text>
          </g>
        ))}
        {ticks(xMin, xMax, 6).map((t) => (
          <text key={`x${t}`} x={sx(t)} y={H - PAD.b + 14} textAnchor="middle" fontSize={10} fill="var(--muted)" fontFamily="monospace">
            {formatX(t)}
          </text>
        ))}
        {refLines.map((r) => (
          <g key={`r${r.y}`}>
            <line x1={PAD.l} x2={W - PAD.r} y1={sy(r.y)} y2={sy(r.y)} stroke="var(--chart-axis)" strokeWidth={1} />
            {r.label && (
              <text x={W - PAD.r - 2} y={sy(r.y) - 3} textAnchor="end" fontSize={9} fill="var(--muted)" fontFamily="monospace">
                {r.label}
              </text>
            )}
          </g>
        ))}
        <text x={(PAD.l + W - PAD.r) / 2} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--muted)">
          {xLabel}
        </text>
        <text x={12} y={(PAD.t + H - PAD.b) / 2} textAnchor="middle" fontSize={10} fill="var(--muted)" transform={`rotate(-90 12 ${(PAD.t + H - PAD.b) / 2})`}>
          {yLabel}
        </text>
        {series.map((s) => {
          const pts = [...s.points].sort((a, b) => a.x - b.x);
          const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
          return (
            <g key={s.name}>
              <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '6 4' : undefined} />
              {hoverX !== null &&
                pts
                  .filter((p) => p.x === hoverX)
                  .map((p) => <circle key={`${s.name}-${p.x}`} cx={sx(p.x)} cy={sy(p.y)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />)}
            </g>
          );
        })}
      {hoverX !== null && <line x1={sx(hoverX)} x2={sx(hoverX)} y1={PAD.t} y2={H - PAD.b} stroke="var(--chart-crosshair)" strokeWidth={1} />}
      </svg>
      <ChartTooltip tip={tip} />
      </div>
      {series.length > 1 && (
        <ChartLegend className="mt-1" items={series.map((x) => ({ id: x.name, label: x.name, color: x.color, dashed: x.dashed }))} />
      )}
      <ChartTable
        columns={[xLabel, ...series.map((x) => x.name)]}
        rows={xs.map((xv) => [formatX(xv), ...series.map((x) => { const p = x.points.find((q) => q.x === xv); return p ? formatY(p.y) : '—'; })])}
      />
    </div>
  );
}
