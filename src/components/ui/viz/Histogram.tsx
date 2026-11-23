import { ChartTooltip, useChartTooltip } from './ChartTooltip';

export interface HistogramBin {
  from: number;
  to: number;
  count: number;
}

/** Equal-width histogram (series-1 bars, a marker bin shown in series-2 for a reference value). */
export function Histogram({
  bins,
  ariaLabel,
  format,
  marker,
  className = 'h-32',
}: {
  bins: HistogramBin[];
  ariaLabel: string;
  format: (v: number) => string;
  /** Value (e.g. 0 = break-even) whose bin is highlighted. */
  marker?: number;
  className?: string;
}) {
  const { wrapRef, tip, showAt, hide } = useChartTooltip();
  if (bins.length === 0) return null;
  const max = Math.max(...bins.map((b) => b.count), 1);
  return (
    <div>
      <div ref={wrapRef} className={`relative flex items-end gap-px ${className}`} role="img" aria-label={ariaLabel}>
        {bins.map((b, i) => {
          const isMarker = marker !== undefined && marker >= b.from && (marker < b.to || (i === bins.length - 1 && marker <= b.to));
          return (
            <div
              key={i}
              className="flex-1 min-w-0 rounded-t-[2px]"
              style={{
                height: `${Math.max(2, (b.count / max) * 100)}%`,
                background: isMarker ? 'var(--series-2)' : 'var(--series-1)',
                opacity: b.count === 0 ? 0.2 : 1,
              }}
              onPointerEnter={(e) => showAt(e.currentTarget, `${format(b.from)} .. ${format(b.to)}`, [{ label: '', value: String(b.count) }])}
              onPointerLeave={hide}
            />
          );
        })}
        <ChartTooltip tip={tip} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-[var(--muted)]">
        <span>{format(bins[0].from)}</span>
        <span>{format(bins[bins.length - 1].to)}</span>
      </div>
    </div>
  );
}
