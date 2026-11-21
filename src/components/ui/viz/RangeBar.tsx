/** Horizontal "where is the price inside its range" bar (e.g. 52 weeks). Pure SVG/CSS. */
export interface RangeBarProps {
  low: number;
  high: number;
  current: number;
  lowLabel: string;
  highLabel: string;
  /** Text for screen readers. */
  ariaLabel: string;
  className?: string;
}

export function rangePosition(low: number, high: number, current: number): number | null {
  if (![low, high, current].every(Number.isFinite) || high <= low) return null;
  return Math.min(100, Math.max(0, ((current - low) / (high - low)) * 100));
}

export function RangeBar({ low, high, current, lowLabel, highLabel, ariaLabel, className = '' }: RangeBarProps) {
  const pos = rangePosition(low, high, current);
  if (pos === null) return null;
  return (
    <div className={className} role="img" aria-label={ariaLabel}>
      <div className="relative h-5 mt-3 mb-2">
        <div
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-3 rounded-full"
          style={{ background: 'linear-gradient(90deg,var(--positive) 0%,var(--warning) 50%,var(--negative) 100%)' }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-white border-4 border-[var(--bg)] shadow"
          style={{ left: `${pos}%` }}
        />
      </div>
      <div className="flex justify-between gap-3 text-sm sm:text-base text-[var(--text)]">
        <span>{lowLabel}</span>
        <span className="text-right">{highLabel}</span>
      </div>
    </div>
  );
}
