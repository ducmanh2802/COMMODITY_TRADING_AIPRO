import type { DataQualityStatus } from '../../shared/types/market';
import { useT } from '../../i18n';

interface DataStatusBadgeProps {
  status: DataQualityStatus;
  /** Kept for API compatibility; the pill is always text-xs (labels are friendly, never raw codes). */
  compact?: boolean;
  /** Optional source quality (e.g. 'UNOFFICIAL'); shown as an extra tag when not official/licensed. */
  sourceQuality?: string;
  /** Optional declared source delay in minutes, used in the DELAYED label ("Giá trễ ~N phút"). */
  delayMinutes?: number | null;
  /** 'BENCHMARK' = monthly/daily reference series, never a futures price: gets its own label. */
  kind?: 'FUTURES' | 'BENCHMARK';
}

/** Shared pill base: small, rounded, bordered. Colours come only from CSS variables. */
const PILL = 'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap';

/** Technical code (shown only in the tooltip) and pill style per status. */
const STATUS_META: Record<DataQualityStatus, { code: string; cls: string }> = {
  CURRENT: { code: 'CURRENT', cls: 'text-[var(--muted)] border-[var(--border)]' },
  DELAYED: { code: 'DELAYED', cls: 'text-[var(--accent-text)] bg-[var(--accent-soft)] border-[var(--accent)]/30' },
  HISTORICAL: { code: 'HISTORICAL', cls: 'text-[var(--muted)] border-[var(--border)]' },
  STALE: { code: 'STALE', cls: 'text-[var(--warning)] border-[var(--warning)]/40' },
  UNAVAILABLE: { code: 'DATA_UNAVAILABLE', cls: 'text-[var(--faint)] border-[var(--border)]' },
  INVALID: { code: 'INVALID', cls: 'text-[var(--warning)] border-[var(--warning)]/40' },
};

const UNOFFICIAL_CLS = 'text-[var(--accent-text)] bg-[var(--accent-soft)] border-[var(--accent)]/30';

/**
 * Canonical data-status pill: one plain-language label; a one-sentence explanation and the raw
 * technical code live in the tooltip. UNOFFICIAL sources always get a visible second pill.
 */
export function DataStatusBadge({ status, sourceQuality, delayMinutes, kind }: DataStatusBadgeProps) {
  const t = useT();
  const key = STATUS_META[status] ? status : 'UNAVAILABLE';
  const meta = STATUS_META[key];
  const hasDelay = key === 'DELAYED' && typeof delayMinutes === 'number' && delayMinutes > 0;
  const isBench = kind === 'BENCHMARK';
  const label = isBench ? t('fr.status.BENCHMARK') : hasDelay ? t('fr.status.DELAYED.n', { n: delayMinutes }) : t(`fr.status.${key}`);
  const desc = isBench ? t('fr.status.BENCHMARK.desc') : t(`fr.status.${key}.desc`);
  const showQuality = sourceQuality === 'UNOFFICIAL';
  const title = `${desc}${showQuality ? ` ${t('fr.unofficial.desc')}` : ''} (${t('fr.status.code', { code: meta.code })})`;

  return (
    <span className="inline-flex flex-wrap items-center gap-1" title={title}>
      <span className={`${PILL} ${meta.cls}`}>{label}</span>
      {showQuality && (
        <span className={`${PILL} ${UNOFFICIAL_CLS}`} title={t('fr.unofficial.desc')}>
          {t('fr.unofficial')}
        </span>
      )}
    </span>
  );
}
