import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { useI18n } from '../../i18n';
import type { InstrumentTrend } from '../../shared/utils/trendDirection';

interface TrendDirectionIconProps {
  trend: InstrumentTrend;
  size?: 'sm' | 'md';
  showLabel?: boolean;
  showFlat?: boolean;
  className?: string;
}

/**
 * Color-coded trend direction indicator following the app's color-blind safe palette:
 * - up: blue (`--positive`) + TrendingUp icon
 * - down: apricot (`--negative`) + TrendingDown icon
 * - flat: muted (`--muted`) + Minus icon
 * Always pairs color with shape + localized accessible label/title.
 */
export function TrendDirectionIcon({
  trend,
  size = 'sm',
  showLabel = false,
  showFlat = true,
  className = '',
}: TrendDirectionIconProps) {
  const { lang } = useI18n();

  if (trend.direction === 'unavailable') return null;
  if (trend.direction === 'flat' && !showFlat) return null;

  const fullLabel = lang === 'vi' ? trend.labelVi : trend.labelEn;
  const shortLabel = lang === 'vi' ? trend.shortVi : trend.shortEn;
  const iconCls = size === 'md' ? 'w-4 h-4' : 'w-3.5 h-3.5';

  const toneCls =
    trend.direction === 'up'
      ? 'text-[var(--positive)]'
      : trend.direction === 'down'
        ? 'text-[var(--negative)]'
        : 'text-[var(--muted)]';

  const Icon =
    trend.direction === 'up'
      ? TrendingUp
      : trend.direction === 'down'
        ? TrendingDown
        : Minus;

  return (
    <span
      role="img"
      aria-label={fullLabel}
      title={fullLabel}
      data-trend-direction={trend.direction}
      className={`inline-flex items-center gap-1 shrink-0 ${toneCls} ${className}`}
    >
      <Icon className={iconCls} aria-hidden="true" />
      {showLabel && (
        <span className="text-[11px] font-medium whitespace-nowrap">{shortLabel}</span>
      )}
    </span>
  );
}
