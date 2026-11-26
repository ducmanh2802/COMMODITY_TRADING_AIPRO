import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { useT } from '../../i18n';
import type { TrendCounts, TrendFilter } from '../../shared/utils/trendDirection';

interface TrendDirectionFilterProps {
  value: TrendFilter;
  onChange: (next: TrendFilter) => void;
  counts?: TrendCounts;
  className?: string;
}

/**
 * Segmented filter bar allowing users to toggle visibility of bullish (`up`),
 * bearish (`down`), or sideways (`flat`) instruments using calm color-blind safe tokens.
 * Clicking an active direction option toggles back to `ALL`.
 */
export function TrendDirectionFilter({
  value,
  onChange,
  counts,
  className = '',
}: TrendDirectionFilterProps) {
  const t = useT();

  const toggle = (target: TrendFilter) => {
    if (target === 'ALL') {
      onChange('ALL');
      return;
    }
    onChange(value === target ? 'ALL' : target);
  };

  return (
    <div
      role="group"
      aria-label={t('hc.cw.trendFilterLabel')}
      className={`inline-flex flex-wrap items-center gap-1 p-1 rounded-md border border-[var(--border)] bg-[var(--bg)] ${className}`}
    >
      <button
        type="button"
        aria-pressed={value === 'ALL'}
        onClick={() => toggle('ALL')}
        className={`px-2.5 min-h-8 rounded text-xs font-medium tabular-nums transition-colors whitespace-nowrap ${
          value === 'ALL'
            ? 'bg-[var(--accent)] text-white'
            : 'text-[var(--muted)] hover:text-[var(--text-strong)] hover:bg-[var(--surface-2)]'
        }`}
      >
        {t('hc.cw.trendAll')}
        {counts ? ` (${counts.all})` : ''}
      </button>

      <button
        type="button"
        aria-pressed={value === 'up'}
        onClick={() => toggle('up')}
        data-trend-filter="up"
        className={`inline-flex items-center gap-1.5 px-2.5 min-h-8 rounded text-xs font-medium tabular-nums transition-colors whitespace-nowrap ${
          value === 'up'
            ? 'bg-[var(--positive)]/18 text-[var(--positive)] ring-1 ring-[var(--positive)]/50'
            : 'text-[var(--muted)] hover:text-[var(--text-strong)] hover:bg-[var(--surface-2)]'
        }`}
      >
        <TrendingUp className="w-3.5 h-3.5 text-[var(--positive)] shrink-0" aria-hidden="true" />
        <span>{t('hc.cw.trendUp')}</span>
        {counts ? <span className="opacity-80">({counts.up})</span> : null}
      </button>

      <button
        type="button"
        aria-pressed={value === 'down'}
        onClick={() => toggle('down')}
        data-trend-filter="down"
        className={`inline-flex items-center gap-1.5 px-2.5 min-h-8 rounded text-xs font-medium tabular-nums transition-colors whitespace-nowrap ${
          value === 'down'
            ? 'bg-[var(--negative)]/18 text-[var(--negative)] ring-1 ring-[var(--negative)]/50'
            : 'text-[var(--muted)] hover:text-[var(--text-strong)] hover:bg-[var(--surface-2)]'
        }`}
      >
        <TrendingDown className="w-3.5 h-3.5 text-[var(--negative)] shrink-0" aria-hidden="true" />
        <span>{t('hc.cw.trendDown')}</span>
        {counts ? <span className="opacity-80">({counts.down})</span> : null}
      </button>

      <button
        type="button"
        aria-pressed={value === 'flat'}
        onClick={() => toggle('flat')}
        data-trend-filter="flat"
        className={`inline-flex items-center gap-1.5 px-2.5 min-h-8 rounded text-xs font-medium tabular-nums transition-colors whitespace-nowrap ${
          value === 'flat'
            ? 'bg-[var(--surface-2)] text-[var(--text-strong)] ring-1 ring-[var(--border)]'
            : 'text-[var(--muted)] hover:text-[var(--text-strong)] hover:bg-[var(--surface-2)]'
        }`}
      >
        <Minus className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" aria-hidden="true" />
        <span>{t('hc.cw.trendFlat')}</span>
        {counts ? <span className="opacity-80">({counts.flat})</span> : null}
      </button>
    </div>
  );
}
