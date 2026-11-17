/** Minimal dependency-free SVG line chart (multi-series, numeric x). */
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
  formatY = (y) => y.toFixed(2),
  refLines = [],
  height = 280,
  ariaLabel,
}: LineChartSvgProps) {
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

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[520px] h-auto" role="img" aria-label={ariaLabel}>
        {ticks(yMin, yMax, 5).map((t) => (
          <g key={`y${t}`}>
            <line x1={PAD.l} x2={W - PAD.r} y1={sy(t)} y2={sy(t)} stroke="#263244" strokeWidth={1} />
            <text x={PAD.l - 6} y={sy(t) + 3} textAnchor="end" fontSize={10} fill="#9CA3AF" fontFamily="monospace">
              {formatY(t)}
            </text>
          </g>
        ))}
        {ticks(xMin, xMax, 6).map((t) => (
          <text key={`x${t}`} x={sx(t)} y={H - PAD.b + 14} textAnchor="middle" fontSize={10} fill="#9CA3AF" fontFamily="monospace">
            {formatX(t)}
          </text>
        ))}
        {refLines.map((r) => (
          <g key={`r${r.y}`}>
            <line x1={PAD.l} x2={W - PAD.r} y1={sy(r.y)} y2={sy(r.y)} stroke="#6B7280" strokeDasharray="3 3" strokeWidth={1} />
            {r.label && (
              <text x={W - PAD.r - 2} y={sy(r.y) - 3} textAnchor="end" fontSize={9} fill="#6B7280" fontFamily="monospace">
                {r.label}
              </text>
            )}
          </g>
        ))}
        <text x={(PAD.l + W - PAD.r) / 2} y={H - 6} textAnchor="middle" fontSize={10} fill="#9CA3AF">
          {xLabel}
        </text>
        <text x={12} y={(PAD.t + H - PAD.b) / 2} textAnchor="middle" fontSize={10} fill="#9CA3AF" transform={`rotate(-90 12 ${(PAD.t + H - PAD.b) / 2})`}>
          {yLabel}
        </text>
        {series.map((s) => {
          const pts = [...s.points].sort((a, b) => a.x - b.x);
          const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
          return (
            <g key={s.name}>
              <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '6 4' : undefined} />
              {s.showDots &&
                pts.map((p) => (
                  <g key={`${s.name}-${p.x}`}>
                    <circle cx={sx(p.x)} cy={sy(p.y)} r={3.5} fill={s.color}>
                      <title>{`${p.label ?? ''} ${formatX(p.x)}: ${formatY(p.y)}`}</title>
                    </circle>
                    {p.label && (
                      <text x={sx(p.x)} y={sy(p.y) - 8} textAnchor="middle" fontSize={9} fill={s.color} fontFamily="monospace">
                        {p.label}
                      </text>
                    )}
                  </g>
                ))}
            </g>
          );
        })}
      </svg>
      {series.length > 1 && (
        <div className="flex flex-wrap gap-4 mt-1 text-[11px] font-mono text-[#E5E7EB]/70">
          {series.map((s) => (
            <span key={s.name} className="inline-flex items-center gap-1.5">
              <span className="inline-block w-4 h-0.5" style={{ backgroundColor: s.color }} aria-hidden="true" />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
