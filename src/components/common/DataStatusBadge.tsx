import { AlertCircle, CheckCircle2, Clock, Database, ShieldAlert, XCircle } from 'lucide-react';
import type { DataQualityStatus } from '../../shared/types/market';
import { useT } from '../../i18n';

interface DataStatusBadgeProps {
  status: DataQualityStatus;
  compact?: boolean;
  /** Optional source quality (e.g. 'UNOFFICIAL'); shown as an extra label when not official/licensed. */
  sourceQuality?: string;
  /** Optional declared source delay in minutes, shown next to the source-quality label. */
  delayMinutes?: number | null;
}

const STATUS_META: Record<DataQualityStatus, { code: string; colorClass: string; Icon: typeof CheckCircle2 }> = {
  CURRENT: { code: 'CURRENT', colorClass: 'text-[#22C55E]', Icon: CheckCircle2 },
  DELAYED: { code: 'DELAYED', colorClass: 'text-[#F59E0B]', Icon: Clock },
  HISTORICAL: { code: 'HISTORICAL', colorClass: 'text-[#6366F1]', Icon: Database },
  STALE: { code: 'STALE', colorClass: 'text-[#F59E0B]', Icon: AlertCircle },
  UNAVAILABLE: { code: 'DATA_UNAVAILABLE', colorClass: 'text-[#F59E0B]', Icon: ShieldAlert },
  INVALID: { code: 'INVALID', colorClass: 'text-[#EF4444]', Icon: XCircle },
};

export function DataStatusBadge({ status, compact = false, sourceQuality, delayMinutes }: DataStatusBadgeProps) {
  const t = useT();
  const key = STATUS_META[status] ? status : 'UNAVAILABLE';
  const meta = STATUS_META[key];
  const Icon = meta.Icon;
  const label = t(`status.${key}`);
  const desc = t(`status.${key}.desc`);
  const showQuality = sourceQuality === 'UNOFFICIAL';
  const delayLabel = typeof delayMinutes === 'number' && delayMinutes > 0 ? t('status.delay', { n: delayMinutes }) : null;

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-xs font-medium whitespace-nowrap ${meta.colorClass}`}
      title={`${t('status.tooltip', { code: meta.code, label, desc })}${
        showQuality ? ` · ${t('status.source', { q: `${sourceQuality} (${t('quality.UNOFFICIAL')})` })}` : ''
      }${delayLabel ? ` · ${delayLabel}` : ''}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{compact ? label : `${label} · ${meta.code}`}</span>
      {showQuality && (
        <span
          className="px-1 py-px rounded border border-[#F59E0B]/50 text-[10px] text-[#F59E0B]"
          title={t('quality.UNOFFICIAL.desc')}
        >
          {t('quality.UNOFFICIAL')}
          {delayLabel ? ` · ${delayLabel}` : ''}
        </span>
      )}
    </span>
  );
}
