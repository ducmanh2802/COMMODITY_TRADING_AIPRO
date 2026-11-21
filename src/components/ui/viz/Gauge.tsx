/** Semi-circle gauge with three zones (e.g. Thấp / Vừa / Cao) and a needle. Pure SVG. */
export interface GaugeProps {
  /** 0..100 position of the needle; null = no data (needle hidden). */
  value: number | null;
  labels: [string, string, string];
  /** Text read by screen readers, e.g. "Mức dao động: Vừa". */
  ariaLabel: string;
  /** Colours for the three zones (low -> high). */
  colors?: [string, string, string];
  className?: string;
}

const CX = 100;
const CY = 100;
const R = 80;

function pt(pct: number, radius = R): [number, number] {
  const a = Math.PI * (1 - pct / 100); // 0% = left, 100% = right
  return [CX + radius * Math.cos(a), CY - radius * Math.sin(a)];
}

function arc(from: number, to: number): string {
  const [x1, y1] = pt(from);
  const [x2, y2] = pt(to);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export function Gauge({ value, labels, ariaLabel, colors = ['var(--positive)', 'var(--warning)', 'var(--negative)'], className = '' }: GaugeProps) {
  const v = value === null || !Number.isFinite(value) ? null : Math.min(100, Math.max(0, value));
  const [nx, ny] = pt(v ?? 50, R - 14);
  return (
    <figure className={className} role="img" aria-label={ariaLabel}>
      <svg viewBox="0 0 200 118" className="w-full max-w-[280px] mx-auto" aria-hidden="true">
        <path d={arc(0, 33.2)} stroke={colors[0]} strokeWidth="16" fill="none" />
        <path d={arc(33.8, 66.2)} stroke={colors[1]} strokeWidth="16" fill="none" />
        <path d={arc(66.8, 100)} stroke={colors[2]} strokeWidth="16" fill="none" />
        {v !== null && (
          <>
            <line x1={CX} y1={CY} x2={nx} y2={ny} stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" />
            <circle cx={CX} cy={CY} r="7" fill="#FFFFFF" />
          </>
        )}
      </svg>
      <figcaption className="flex justify-between text-base font-semibold text-[var(--text)] max-w-[280px] mx-auto px-1">
        {labels.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </figcaption>
    </figure>
  );
}
