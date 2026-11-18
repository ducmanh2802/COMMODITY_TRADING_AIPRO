import type { DataQualityStatus } from '../../shared/types/market';
import { useT } from '../../i18n';

interface DataStatusBadgeProps {
  status: DataQualityStatus;
  /** Smaller text; kept for API compatibility (labels are always friendly, never raw codes). */
  compact?: boolean;
  /** Optional source quality (e.g. 'UNOFFICIAL'); shown as an extra tag when not official/licensed. */
  sourceQuality?: string;
  /** Optional declared source delay in minutes, used in the DELAYED label ("Giá trễ ~N phút"). */
  delayMinutes?: number | null;
}

/** Technical code (shown only in the tooltip) and colours per status. */
const STATUS_META: Record<DataQualityStatus, { code: string; text: string; dot: string }> = {
  CURRENT: { code: 'CURRENT', text: 'text-[#4ADE80]', dot: 'bg-[#22C55E]' },
  DELAYED: { code: 'DELAYED', text: 'text-[#FBBF24]', dot: 'bg-[#F59E0B]' },
  HISTORICAL: { code: 'HISTORICAL', text: 'text-[#A5B4FC]', dot: 'bg-[#6366F1]' },
  STALE: { code: 'STALE', text: 'text-[#FDBA74]', dot: 'bg-[#F97316]' },
  UNAVAILABLE: { code: 'DATA_UNAVAILABLE', text: 'text-[#9CA3AF]', dot: 'bg-[#6B7280]' },
  INVALID: { code: 'INVALID', text: 'text-[#F87171]', dot: 'bg-[#EF4444]' },
};

/**
 * Friendly data-quality badge: coloured dot + plain-language label; a one-sentence explanation
 * (and the raw technical code) live in the tooltip. UNOFFICIAL sources always get a visible tag.
 */
export function DataStatusBadge({ status, compact = false, sourceQuality, delayMinutes }: DataStatusBadgeProps) {
  const t = useT();
  const key = STATUS_META[status] ? status : 'UNAVAILABLE';
  const meta = STATUS_META[key];
  const hasDelay = key === 'DELAYED' && typeof delayMinutes === 'number' && delayMinutes > 0;
  const label = hasDelay ? t('fr.status.DELAYED.n', { n: delayMinutes }) : t(`fr.status.${key}`);
  const desc = t(`fr.status.${key}.desc`);
  const showQuality = sourceQuality === 'UNOFFICIAL';
  const title = `${desc}${showQuality ? ` ${t('fr.unofficial.desc')}` : ''} (${t('fr.status.code', { code: meta.code })})`;

  return (
    <span
      className={`inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 font-medium ${compact ? 'text-[11px]' : 'text-xs'} ${meta.text}`}
      title={title}
    >
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dot}`} aria-hidden="true" />
        <span>{label}</span>
      </span>
      {showQuality && (
        <span
          className="px-1.5 py-px rounded-full border border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[10px] font-normal text-[#FCD34D] whitespace-nowrap"
          title={t('fr.unofficial.desc')}
        >
          {t('fr.unofficial')}
        </span>
      )}
    </span>
  );
}
