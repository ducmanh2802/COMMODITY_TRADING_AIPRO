import { AlertTriangle, CircleCheck, CircleSlash, Clock, History, XCircle, type LucideIcon } from 'lucide-react';
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
  /** 'BENCHMARK' = monthly/daily reference series, never a futures price: gets its own label. */
  kind?: 'FUTURES' | 'BENCHMARK';
}

/** Technical code (shown only in the tooltip) and colours per status. */
const STATUS_META: Record<DataQualityStatus, { code: string; text: string; dot: string; Icon: LucideIcon }> = {
  CURRENT: { code: 'CURRENT', text: 'text-[var(--positive)]', dot: 'bg-[var(--positive)]', Icon: CircleCheck },
  DELAYED: { code: 'DELAYED', text: 'text-[var(--warning)]', dot: 'bg-[var(--warning)]', Icon: Clock },
  HISTORICAL: { code: 'HISTORICAL', text: 'text-[var(--accent-text)]', dot: 'bg-[var(--accent)]', Icon: History },
  STALE: { code: 'STALE', text: 'text-[var(--negative)]', dot: 'bg-[var(--negative)]', Icon: AlertTriangle },
  UNAVAILABLE: { code: 'DATA_UNAVAILABLE', text: 'text-[var(--muted)]', dot: 'bg-[var(--faint)]', Icon: CircleSlash },
  INVALID: { code: 'INVALID', text: 'text-[var(--negative)]', dot: 'bg-[var(--negative)]', Icon: XCircle },
};

/**
 * Friendly data-quality badge: coloured dot + plain-language label; a one-sentence explanation
 * (and the raw technical code) live in the tooltip. UNOFFICIAL sources always get a visible tag.
 */
export function DataStatusBadge({ status, compact = false, sourceQuality, delayMinutes, kind }: DataStatusBadgeProps) {
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
    <span
      className={`inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 font-medium ${compact ? 'text-[11px]' : 'text-xs'} ${meta.text}`}
      title={title}
    >
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <meta.Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </span>
      {showQuality && (
        <span
          className="px-1.5 py-px rounded-full border border-[var(--warning)]/40 bg-[var(--warning)]/10 text-[10px] font-normal text-[var(--warning)] whitespace-nowrap"
          title={t('fr.unofficial.desc')}
        >
          {t('fr.unofficial')}
        </span>
      )}
    </span>
  );
}
