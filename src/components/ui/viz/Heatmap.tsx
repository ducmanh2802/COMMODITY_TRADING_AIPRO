import { divergingFill } from '../../../shared/theme/chartScale';

/** Tile heatmap of % change. Colour intensity + an explicit signed number (never colour alone). */
export interface HeatTile {
  id: string;
  label: string;
  /** % change; null = no data (grey tile). */
  pct: number | null;
  sub?: string;
}

export function heatColor(pct: number | null, maxAbs = 3): string {
  if (pct === null || !Number.isFinite(pct)) return 'var(--surface-2)';
  return divergingFill(pct, maxAbs);
}

export function Heatmap({
  tiles,
  formatPct,
  noDataLabel,
  ariaLabel,
  className = '',
}: {
  tiles: HeatTile[];
  formatPct: (pct: number) => string;
  noDataLabel: string;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <ul className={`grid grid-cols-2 sm:grid-cols-3 gap-2 ${className}`} aria-label={ariaLabel}>
      {tiles.map((t) => (
        <li key={t.id} className="rounded-lg border border-[var(--border)] p-3 min-h-[72px]" style={{ background: heatColor(t.pct) }}>
          <div className="text-sm font-semibold text-[var(--text-strong)]">{t.label}</div>
          <div className="text-xl font-bold tabular-nums text-[var(--text-strong)]">{t.pct === null ? noDataLabel : formatPct(t.pct)}</div>
          {t.sub && <div className="text-xs text-[var(--text-strong)]/80">{t.sub}</div>}
        </li>
      ))}
    </ul>
  );
}
